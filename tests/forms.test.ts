import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFString,
  StandardFonts, decodePDFRawStream, degrees,
} from 'pdf-lib';
import type { PDFField } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { inspectForms, recoverOrphanFields } from '../src/pdf-forms';
import { exportPdf } from '../src/pdf-engine';
import type { FormValues, PageModel, Source } from '../src/types';

const fakeText = 'Mario Esempio';
async function fixture() {
  const doc = await PDFDocument.create();
  const p1 = doc.addPage([600, 800]), p2 = doc.addPage([600, 800]);
  p2.setCropBox(15, 20, 560, 760); p2.setRotation(degrees(90));
  const form = doc.getForm();
  const text = form.createTextField('name');
  text.setText('Originale'); text.enableRequired();
  text.addToPage(p1, { x: 35, y: 700, width: 220, height: 25 });
  text.addToPage(p2, { x: 35, y: 700, width: 220, height: 25 });
  const multiline = form.createTextField('notes');
  multiline.enableMultiline();
  multiline.addToPage(p1, { x: 35, y: 600, width: 220, height: 70 });
  const comb = form.createTextField('code');
  comb.setMaxLength(5); comb.enableCombing();
  comb.addToPage(p1, { x: 35, y: 550, width: 120, height: 25 });
  const check = form.createCheckBox('accept');
  check.addToPage(p1, { x: 35, y: 510, width: 18, height: 18 });
  const radio = form.createRadioGroup('choice');
  radio.addOptionToPage('first', p1, { x: 35, y: 460, width: 18, height: 18 });
  radio.addOptionToPage('second', p1, { x: 85, y: 460, width: 18, height: 18 });
  // Real forms can use identical /Opt labels while their widget states differ.
  radio.acroField.dict.set(PDFName.of('Opt'), doc.context.obj([PDFHexString.fromText('Yes'), PDFHexString.fromText('Yes')]));
  const dropdown = form.createDropdown('document');
  dropdown.acroField.setOptions([
    { value: PDFHexString.fromText('identity'), display: PDFHexString.fromText('Carta identita') },
    { value: PDFHexString.fromText('passport'), display: PDFHexString.fromText('Passaporto') },
  ]);
  dropdown.addToPage(p1, { x: 35, y: 400, width: 220, height: 28 });
  const list = form.createOptionList('languages');
  list.acroField.setOptions([
    { value: PDFHexString.fromText('it'), display: PDFHexString.fromText('Italiano') },
    { value: PDFHexString.fromText('en'), display: PDFHexString.fromText('Inglese') },
    { value: PDFHexString.fromText('fr'), display: PDFHexString.fromText('Francese') },
  ]);
  list.enableMultiselect();
  list.addToPage(p1, { x: 300, y: 550, width: 200, height: 90 });
  const locked = form.createTextField('calculated');
  locked.setText('Originale calcolato'); locked.enableReadOnly();
  locked.addToPage(p1, { x: 35, y: 340, width: 220, height: 28 });
  locked.acroField.dict.set(PDFName.of('AA'), doc.context.obj({
    C: { S: 'JavaScript', JS: PDFString.of('event.value = 12345;') },
  }));
  const placeholder = form.createDropdown('signature-area');
  placeholder.enableReadOnly();
  placeholder.addToPage(p2, { x: 35, y: 200, width: 220, height: 40 });
  return { doc, bytes: await doc.save(), radioStates: radio.acroField.getOnValues().map(value => value.decodeText()) };
}

async function sourceFrom(bytes: Uint8Array, id = 'form') {
  const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: true }).promise;
  try {
    const metadata = await inspectForms(await PDFDocument.load(bytes), pdf);
    const source: Source = { id, name: 'synthetic-form.pdf', bytes, pdf, ...metadata };
    const pages: PageModel[] = Array.from({ length: pdf.numPages }, (_, index) => ({ id: 'page-' + index, sourceId: id, index, rotation: 0, marks: [] }));
    return { source, pages, sources: new Map([[id, source]]) };
  } catch (error) { await pdf.destroy(); throw error; }
}

function normalContents(field: PDFField) {
  return field.acroField.getWidgets().map(widget => {
    const normal = widget.getAppearances()?.normal;
    assert.ok(normal instanceof PDFRawStream);
    return Buffer.from(normal.contents).toString('hex');
  });
}

function normalText(field: PDFField) {
  const normal = field.acroField.getWidgets()[0].getAppearances()?.normal;
  assert.ok(normal instanceof PDFRawStream);
  return Buffer.from(decodePDFRawStream(normal).decode()).toString('latin1');
}

function widgets(doc: PDFDocument) {
  return doc.getPages().flatMap(page => {
    const annotations = page.node.Annots();
    return annotations ? Array.from({ length: annotations.size() }, (_, i) => annotations.lookup(i, PDFDict))
      .filter(dict => dict.get(PDFName.of('Subtype')) === PDFName.of('Widget')) : [];
  });
}

test('Standard form round-trip preserves field tree, repeated widgets, exports, radio identity and readonly appearances', async () => {
  const { bytes, radioStates } = await fixture();
  const { source, pages, sources } = await sourceFrom(bytes);
  try {
    assert.equal(source.readOnlyReason, undefined);
    assert.equal(source.formFields?.length, 9);
    assert.equal(source.formWidgets?.length, 11);
    assert.equal(source.formFields?.find(field => field.name === 'signature-area')?.readOnly, true);
    assert.equal(source.formFields?.find(field => field.name === 'code')?.comb, true);
    assert.ok(source.formWarnings?.some(warning => warning.includes('JavaScript')));
    const original = await PDFDocument.load(bytes);
    const originalLocked = normalContents(original.getForm().getField('calculated'));
    const originalPlaceholder = normalContents(original.getForm().getField('signature-area'));
    const selected = radioStates[0];
    const changes: FormValues = { name: fakeText, notes: 'Prima riga\nSeconda riga', code: 'AB123', accept: true, choice: selected, document: 'passport', languages: ['it', 'fr'] };
    pages[1].rotation = 90;
    const savedBytes = await exportPdf(pages, sources, undefined, changes);
    const saved = await PDFDocument.load(savedBytes);
    const form = saved.getForm();
    assert.equal(form.getFields().length, 9);
    assert.equal(widgets(saved).length, 11);
    assert.equal(form.getTextField('name').getText(), fakeText);
    assert.equal(form.getTextField('notes').getText(), 'Prima riga\nSeconda riga');
    assert.equal(form.getTextField('code').getText(), 'AB123');
    assert.equal(form.getCheckBox('accept').isChecked(), true);
    assert.equal(form.getRadioGroup('choice').acroField.getValue().decodeText(), selected);
    const radioWidgets = form.getRadioGroup('choice').acroField.getWidgets();
    assert.equal(radioWidgets[0].getAppearanceState()?.decodeText(), selected);
    assert.equal(radioWidgets[1].getAppearanceState()?.decodeText(), 'Off');
    assert.deepEqual(form.getRadioGroup('choice').acroField.getExportValues()?.map(value => value.decodeText()), ['Yes', 'Yes']);
    assert.deepEqual(form.getDropdown('document').acroField.getValues().map(value => value.decodeText()), ['passport']);
    assert.deepEqual(form.getOptionList('languages').acroField.getValues().map(value => value.decodeText()), ['it', 'fr']);
    assert.equal(form.getOptionList('languages').acroField.dict.lookup(PDFName.of('I'))?.toString(), '[ 0 2 ]');
    assert.ok(normalText(form.getDropdown('document')).toLowerCase().includes(Buffer.from('Passaporto').toString('hex').toLowerCase()), 'Dropdown appearance must use the label, not its export value');
    assert.deepEqual(normalContents(form.getField('calculated')), originalLocked);
    assert.deepEqual(normalContents(form.getField('signature-area')), originalPlaceholder);
    assert.equal(form.getTextField('calculated').getText(), 'Originale calcolato');
    assert.equal(saved.getPage(1).getRotation().angle, 180);
    assert.deepEqual(saved.getPage(1).getCropBox(), original.getPage(1).getCropBox());
    const reopened = await sourceFrom(savedBytes);
    try {
      assert.equal(reopened.source.formFields?.find(field => field.name === 'name')?.value, fakeText);
      assert.equal(reopened.source.formFields?.find(field => field.name === 'choice')?.value, selected);
      assert.equal(reopened.source.formFields?.find(field => field.name === 'document')?.value, 'passport');
      assert.equal(reopened.source.formWidgets?.filter(widget => widget.fieldName === 'name').length, 2);
      const clearedBytes = await exportPdf(reopened.pages, reopened.sources, undefined, { name: '', choice: radioStates[1], accept: false, document: '', languages: [] });
      const cleared = (await PDFDocument.load(clearedBytes)).getForm();
      assert.equal(cleared.getTextField('name').getText() || '', '');
      assert.equal(cleared.getCheckBox('accept').isChecked(), false);
      assert.equal(cleared.getRadioGroup('choice').acroField.getValue().decodeText(), radioStates[1]);
      assert.deepEqual(cleared.getDropdown('document').acroField.getValues(), []);
      assert.deepEqual(cleared.getOptionList('languages').acroField.getValues(), []);
    } finally { await reopened.source.pdf.destroy(); }
  } finally { await source.pdf.destroy(); }
});

test('Saving without edits preserves every existing text/choice appearance and does not execute scripts', async () => {
  const { bytes } = await fixture();
  const original = await PDFDocument.load(bytes);
  original.getForm().acroForm.dict.set(PDFName.of('NeedAppearances'), original.context.obj(true));
  const input = await original.save({ updateFieldAppearances: false });
  const { source, pages, sources } = await sourceFrom(input);
  try {
    const result = await PDFDocument.load(await exportPdf(pages, sources));
    for (const name of ['name', 'notes', 'code', 'document', 'languages', 'calculated', 'signature-area']) {
      assert.deepEqual(normalContents(result.getForm().getField(name)), normalContents(original.getForm().getField(name)), name);
    }
    assert.equal(result.getForm().getTextField('calculated').getText(), 'Originale calcolato');
    assert.equal(result.getForm().getTextField('name').isRequired(), true);
    assert.equal(result.getForm().acroForm.dict.lookup(PDFName.of('NeedAppearances'))?.toString(), 'true');
  } finally { await source.pdf.destroy(); }
});

test('Form export rejects page deletion, duplication, reordering and merging as well as invalid/readonly edits', async () => {
  const { bytes } = await fixture();
  const { source, pages, sources } = await sourceFrom(bytes);
  try {
    for (const invalid of [pages.slice(0, 1), [pages[0], pages[0]], [...pages].reverse()]) {
      await assert.rejects(() => exportPdf(invalid, sources), /campi compilabili/);
    }
    const second = { ...source, id: 'other' };
    await assert.rejects(() => exportPdf([...pages, { ...pages[0], sourceId: second.id }], new Map([...sources, [second.id, second]])), /campi compilabili/);
    for (const edits of [{ calculated: 'cambiato' }, { 'signature-area': 'firma' }, { missing: 'x' }, { code: 'TOOLONG' }, { choice: 'Yes' }, { document: 'nonexistent' }]) {
      await assert.rejects(() => exportPdf(pages, sources, undefined, edits));
    }
  } finally { await source.pdf.destroy(); }
});

function addOrphan(doc: PDFDocument, name: string) {
  const page = doc.getPage(0);
  const dict = doc.context.obj({
    Type: 'Annot', Subtype: 'Widget', FT: 'Tx', T: PDFHexString.fromText(name),
    Rect: [30, 30, 230, 60], DA: PDFString.of('/Helv 12 Tf 0 g'), F: 4, P: page.ref,
  });
  page.node.addAnnot(doc.context.register(dict));
}

test('Recover a real orphan without duplicating names, and save both canonical and widget values', async () => {
  const doc = await PDFDocument.create(); doc.addPage([600, 800]);
  doc.getForm().createTextField('unused-canonical');
  addOrphan(doc, 'orphan');
  const bytes = await doc.save({ updateFieldAppearances: false });
  const { source, pages, sources } = await sourceFrom(bytes);
  try {
    assert.equal(source.formFields?.length, 2);
    assert.equal(source.formWidgets?.length, 1);
    assert.ok(source.formWarnings?.some(warning => warning.includes('recuperato')));
    const result = await PDFDocument.load(await exportPdf(pages, sources, undefined, { orphan: 'Dato fittizio' }));
    const field = result.getForm().getTextField('orphan');
    assert.equal(field.getText(), 'Dato fittizio');
    assert.equal(result.getForm().getFields().length, 2);
    assert.equal(field.acroField.dict, widgets(result)[0]);
    assert.ok(field.acroField.getWidgets()[0].getAppearances()?.normal);
    assert.equal(recoverOrphanFields(result), 0);
  } finally { await source.pdf.destroy(); }
  const ambiguous = await PDFDocument.create(); ambiguous.addPage();
  ambiguous.getForm().createTextField('duplicate');
  addOrphan(ambiguous, 'duplicate');
  assert.throws(() => recoverOrphanFields(ambiguous), /omonimi/);
});

test('Digital signature fields and XFA stay readonly and cannot be exported as editable forms', async () => {
  for (const type of ['signature', 'xfa']) {
    const doc = await PDFDocument.create(); doc.addPage();
    const form = doc.getForm();
    if (type === 'signature') {
      form.acroForm.addField(doc.context.register(doc.context.obj({ FT: 'Sig', T: PDFString.of('digital-signature') })));
    } else {
      form.acroForm.dict.set(PDFName.of('XFA'), doc.context.register(doc.context.flateStream('<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"></xdp:xdp>')));
    }
    const bytes = await doc.save({ updateFieldAppearances: false });
    const { source, pages, sources } = await sourceFrom(bytes);
    try {
      assert.match(source.readOnlyReason || '', type === 'signature' ? /firma digitale/ : /XFA/);
      await assert.rejects(() => exportPdf(pages, sources));
      // The export engine also rejects these independently of loader metadata.
      await assert.rejects(() => exportPdf(pages, new Map([[source.id, { ...source, readOnlyReason: undefined }]])), type === 'signature' ? /firma digitale/ : /XFA/);
    } finally { await source.pdf.destroy(); }
  }
});

test('Local regression fixture keeps 126 widgets and repairs the unique orphan without publishing personal files', { skip: !process.env.JFOLIO_FORM_FIXTURE }, async () => {
  const bytes = new Uint8Array(await fs.readFile(process.env.JFOLIO_FORM_FIXTURE!));
  const original = await PDFDocument.load(bytes);
  const { source, pages, sources } = await sourceFrom(bytes);
  try {
    assert.equal(source.readOnlyReason, undefined);
    assert.equal(source.formFields?.length, 78);
    assert.equal(source.formWidgets?.length, 126);
    assert.equal(source.pdf.numPages, 8);
    assert.ok(source.formWarnings?.some(warning => warning.includes('JavaScript')));
    const radio = source.formFields!.find(field => field.kind === 'radio' && field.options!.length > 1)!;
    const radioValue = radio.options![0].value;
    const changes: FormValues = { c_fisc_iva: 'TEST-SOLO-LOCALE', tipo_doc: 'passport', [radio.name]: radioValue };
    const resultBytes = await exportPdf(pages, sources, undefined, changes);
    const result = await PDFDocument.load(resultBytes);
    assert.equal(result.getPageCount(), 8);
    assert.equal(result.getForm().getFields().length, 78);
    assert.equal(widgets(result).length, 126);
    assert.equal(result.getForm().getTextField('c_fisc_iva').getText(), 'TEST-SOLO-LOCALE');
    assert.deepEqual(result.getForm().getDropdown('tipo_doc').acroField.getValues().map(value => value.decodeText()), ['passport']);
    assert.equal(result.getForm().getRadioGroup(radio.name).acroField.getValue().decodeText(), radioValue);
    for (const name of ['punteggio', 'timbro_firma_az', 'firma_ad', 'firma_que', 'firma_que1', 'firma_pr']) {
      assert.deepEqual(normalContents(result.getForm().getField(name)), normalContents(original.getForm().getField(name)), name);
    }
    const reopened = await sourceFrom(resultBytes);
    try {
      assert.equal(reopened.source.readOnlyReason, undefined);
      assert.equal(reopened.source.formFields?.find(field => field.name === 'c_fisc_iva')?.value, 'TEST-SOLO-LOCALE');
      assert.equal(reopened.source.formWidgets?.length, 126);
    } finally { await reopened.source.pdf.destroy(); }
    if (process.env.JFOLIO_FORM_RESULT) await fs.writeFile(process.env.JFOLIO_FORM_RESULT, resultBytes);
  } finally { await source.pdf.destroy(); }
});
