import {
  PDFCheckBox, PDFDict, PDFDocument, PDFDropdown, PDFHexString, PDFName,
  PDFOptionList, PDFRadioGroup, PDFRef, PDFSignature, PDFString, PDFTextField,
  defaultDropdownAppearanceProvider, defaultOptionListAppearanceProvider,
} from 'pdf-lib';
import type { PDFField, PDFFont } from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { FormField, FormValue, FormValues, FormWidget } from './types';

export const FORM_STRUCTURE_REASON = 'Per conservare i campi compilabili, non è ancora possibile unire, duplicare, eliminare o riordinare le pagine di un modulo. Puoi compilarlo, annotarlo, ruotarlo e salvare una copia.';

export function hasXfaForm(doc: PDFDocument) {
  const acroForm = doc.catalog.lookup(PDFName.of('AcroForm'));
  return acroForm instanceof PDFDict && acroForm.has(PDFName.of('XFA'));
}

/** Repair only unambiguous, self-contained widgets absent from /Fields. Never
 * attach a same-name object over an unrelated canonical field. */
export function recoverOrphanFields(doc: PDFDocument): number {
  if (hasXfaForm(doc)) throw new Error('I moduli XFA non sono ancora supportati.');
  const form = doc.getForm();
  const known = form.getFields();
  const names = new Set(known.map(field => field.getName()));
  const attached = new Set(known.flatMap(field => [field.acroField.dict, ...field.acroField.getWidgets().map(widget => widget.dict)]));
  const recovered = new Set<PDFDict>();
  for (const page of doc.getPages()) {
    const annotations = page.node.Annots();
    if (!annotations) continue;
    for (let i = 0; i < annotations.size(); i++) {
      const ref = annotations.get(i);
      const dict = doc.context.lookup(ref);
      if (!(dict instanceof PDFDict) || dict.get(PDFName.of('Subtype')) !== PDFName.of('Widget') || attached.has(dict) || recovered.has(dict)) continue;
      if (dict.has(PDFName.of('Parent'))) throw new Error('Il modulo contiene campi non collegati correttamente: è disponibile in sola lettura.');
      const name = dict.lookup(PDFName.of('T'));
      if (!(ref instanceof PDFRef) || !(name instanceof PDFString || name instanceof PDFHexString) || !dict.has(PDFName.of('FT'))) throw new Error('Il modulo contiene un campo non riconoscibile: è disponibile in sola lettura.');
      const text = name.decodeText();
      if (names.has(text)) throw new Error('Il modulo contiene campi omonimi non collegati: è disponibile in sola lettura per evitare di alterare i dati.');
      form.acroForm.addField(ref);
      recovered.add(dict); names.add(text);
    }
  }
  return recovered.size;
}

function fieldValue(field: PDFField): FormValue {
  if (field instanceof PDFTextField) return field.getText() || '';
  if (field instanceof PDFCheckBox) return field.isChecked();
  if (field instanceof PDFRadioGroup) {
    const name = field.acroField.getValue().decodeText();
    return name === 'Off' ? '' : name;
  }
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    const values = field.acroField.getValues().map(value => value.decodeText());
    return field.isMultiselect() ? values : values[0] || '';
  }
  return '';
}

function describeField(field: PDFField): FormField | null {
  const common = { name: field.getName(), label: field.getName(), value: fieldValue(field), readOnly: field.isReadOnly(), required: field.isRequired() };
  if (field instanceof PDFTextField) return { ...common, kind: 'text', maxLength: field.getMaxLength(), multiline: field.isMultiline(), comb: field.isCombed(), password: field.isPassword() };
  if (field instanceof PDFCheckBox) return { ...common, kind: 'checkbox' };
  if (field instanceof PDFRadioGroup) {
    const exports = field.acroField.getExportValues();
    return { ...common, kind: 'radio', options: field.acroField.getOnValues().map((value, i) => ({ value: value.decodeText(), label: exports?.[i]?.decodeText() || value.decodeText() })) };
  }
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    const options = field.acroField.getOptions().map(option => ({ value: option.value.decodeText(), label: (option.display || option.value).decodeText() }));
    return { ...common, kind: field instanceof PDFDropdown ? 'dropdown' : 'list', options, editable: field instanceof PDFDropdown && field.isEditable(), multiSelect: field.isMultiselect(), readOnly: common.readOnly || (!options.length && !(field instanceof PDFDropdown && field.isEditable())) };
  }
  return null;
}

export async function inspectForms(doc: PDFDocument, pdf: PDFDocumentProxy): Promise<{ formFields: FormField[]; formWidgets: FormWidget[]; formWarnings: string[]; readOnlyReason?: string }> {
  const empty = { formFields: [] as FormField[], formWidgets: [] as FormWidget[], formWarnings: [] as string[] };
  // getForm() removes XFA in pdf-lib, so inspect the raw catalog first.
  if (hasXfaForm(doc)) return { ...empty, readOnlyReason: 'Questo PDF usa moduli XFA, non ancora supportati. Puoi visualizzarlo e stamparlo senza modificarlo.' };
  const form = doc.getForm();
  const recovered = recoverOrphanFields(doc);
  const fields = form.getFields();
  if (fields.some(field => field instanceof PDFSignature)) return { ...empty, readOnlyReason: 'Questo PDF contiene campi firma digitale: puoi leggerlo e stamparlo. Modificarlo potrebbe invalidare una firma digitale.' };
  const fieldNames = fields.map(field => field.getName());
  if (new Set(fieldNames).size !== fieldNames.length) return { ...empty, readOnlyReason: 'Il modulo contiene campi omonimi non collegati: è disponibile in sola lettura per evitare di alterare i dati.' };
  const described = fields.map(describeField);
  if (described.some(field => !field)) return { ...empty, readOnlyReason: 'Questo PDF contiene un tipo di campo non ancora supportato. Puoi leggerlo e stamparlo senza modificarlo.' };
  const formFields = described as FormField[];
  const byName = new Map(formFields.map(field => [field.name, field]));
  const formWidgets: FormWidget[] = [];
  let hasActions = await pdf.hasJSActions();
  for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex++) {
    const annotations = await (await pdf.getPage(pageIndex + 1)).getAnnotations({ intent: 'any' });
    for (const annotation of annotations) {
      if (annotation.subtype !== 'Widget') continue;
      const field = byName.get(annotation.fieldName);
      if (!field) return { ...empty, readOnlyReason: 'Alcuni campi del modulo non sono collegati correttamente. Puoi leggerlo e stamparlo senza modificarlo.' };
      if (annotation.actions && Object.keys(annotation.actions).length) hasActions = true;
      if (annotation.alternativeText) field.label = annotation.alternativeText;
      const rect = annotation.rect as [number, number, number, number];
      if (!rect || rect.length !== 4 || rect.some(value => !Number.isFinite(value))) return { ...empty, readOnlyReason: 'Un campo del modulo ha coordinate non valide. Puoi leggere e stampare il PDF senza modificarlo.' };
      formWidgets.push({
        id: annotation.id, fieldName: field.name, pageIndex, rect,
        exportValue: field.kind === 'radio' ? annotation.buttonValue : annotation.exportValue,
        rotation: annotation.rotation || 0, fontSize: annotation.defaultAppearanceData?.fontSize,
        textAlign: annotation.textAlignment || 0,
        hidden: !!(annotation.annotationFlags & (1 | 2 | 32)) || !!annotation.hidden || !!annotation.noView,
      });
    }
  }
  const formWarnings: string[] = [];
  if (hasActions) formWarnings.push('Il documento contiene calcoli o automatismi JavaScript: JFolio non li esegue. I campi calcolati mantengono il valore originale; verifica il risultato in un lettore compatibile.');
  if (recovered) formWarnings.push('Un campo del modulo non era collegato al documento: verrà recuperato nella copia salvata, mantenendolo compilabile.');
  return { formFields, formWidgets, formWarnings };
}

/** Changes /V and the widget appearance streams together, preserving the
 * original AcroForm tree, /Opt export values and all unchanged appearances. */
export function applyFormValues(doc: PDFDocument, values: FormValues, font: PDFFont) {
  if (hasXfaForm(doc)) throw new Error('I moduli XFA non sono ancora supportati.');
  const form = doc.getForm();
  recoverOrphanFields(doc);
  const fields = form.getFields();
  if (fields.some(field => field instanceof PDFSignature)) throw new Error('Non è possibile modificare un documento con campi firma digitale.');
  const byName = new Map(fields.map(field => [field.getName(), field]));
  for (const [name, value] of Object.entries(values)) {
    const field = byName.get(name);
    if (!field) throw new Error('Campo del modulo non disponibile: ' + name);
    if (JSON.stringify(fieldValue(field)) === JSON.stringify(value)) continue;
    const descriptor = describeField(field);
    if (!descriptor || descriptor.readOnly) throw new Error('Il campo «' + name + '» è di sola lettura.');
    if (field instanceof PDFTextField) {
      if (typeof value !== 'string') throw new Error('Valore non valido per il campo «' + name + '».');
      if (field.getMaxLength() !== undefined && value.length > field.getMaxLength()!) throw new Error('Il testo del campo «' + name + '» è troppo lungo.');
      field.setText(value);
      field.updateAppearances(font);
    } else if (field instanceof PDFCheckBox) {
      if (typeof value !== 'boolean') throw new Error('Valore non valido per il campo «' + name + '».');
      value ? field.check() : field.uncheck();
      // Existing on/off streams are authoritative; state changes need no redraw.
      if (field.needsAppearancesUpdate()) field.updateAppearances();
    } else if (field instanceof PDFRadioGroup) {
      if (typeof value !== 'string' || (value && !field.acroField.getOnValues().some(option => option.decodeText() === value))) throw new Error('Scelta non valida per il campo «' + name + '».');
      field.acroField.setValue(PDFName.of(value || 'Off'));
      if (field.needsAppearancesUpdate()) field.updateAppearances();
    } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      const selected = typeof value === 'string' ? (value ? [value] : []) : Array.isArray(value) && value.every(item => typeof item === 'string') ? value : null;
      if (!selected || (!field.isMultiselect() && selected.length > 1)) throw new Error('Scelta non valida per il campo «' + name + '».');
      const options = field.acroField.getOptions().map(option => ({ value: option.value.decodeText(), label: (option.display || option.value).decodeText() }));
      if (!(field instanceof PDFDropdown && field.isEditable()) && selected.some(value => !options.some(option => option.value === value))) throw new Error('Scelta non valida per il campo «' + name + '».');
      // pdf-lib's setValues validates against display labels and can write -1
      // indices for export values. Write /V and /I from validated exports.
      const distinct = [...new Set(selected)].sort((a, b) => options.findIndex(option => option.value === a) - options.findIndex(option => option.value === b));
      const encoded = distinct.map(value => PDFHexString.fromText(value));
      if (!encoded.length) field.acroField.dict.delete(PDFName.of('V'));
      else field.acroField.dict.set(PDFName.of('V'), field.isMultiselect() ? doc.context.obj(encoded) : encoded[0]);
      const indices = distinct.map(value => options.findIndex(option => option.value === value));
      if (field.isMultiselect() && indices.length && indices.every(index => index >= 0)) field.acroField.dict.set(PDFName.of('I'), doc.context.obj(indices));
      else field.acroField.dict.delete(PDFName.of('I'));
      // The public select() API uses labels as /V. Preserve the actual export
      // values and substitute labels only while drawing the appearance.
      const proxy = new Proxy(field, { get(target, property, receiver) { return property === 'getSelected' ? () => selected.map(value => options.find(option => option.value === value)?.label || value) : Reflect.get(target, property, receiver); } });
      if (field instanceof PDFDropdown) field.updateAppearances(font, (_field, widget, font) => defaultDropdownAppearanceProvider(proxy as PDFDropdown, widget, font));
      else field.updateAppearances(font, (_field, widget, font) => defaultOptionListAppearanceProvider(proxy as PDFOptionList, widget, font));
    }
    form.markFieldAsClean(field.ref);
  }
  // Existing appearances remain authoritative, including calculated/read-only
  // fields and nonstandard signature placeholders. Never flatten the form.
  // Keep the source's NeedAppearances setting for untouched fields that may
  // lack appearances. Every edited widget above has a complete appearance.
  // We do not use that flag as a substitute for persisting the new appearance.
}
