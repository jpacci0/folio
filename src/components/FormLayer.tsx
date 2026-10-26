import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PageViewport } from 'pdfjs-dist';
import type { FormField, FormValue, FormValues, FormWidget, PageModel, Source } from '../types';
import { normalizeRotation } from '../pdf-engine';
import './FormLayer.css';

type Props = {
  source: Source;
  page: PageModel;
  zoom: number;
  values: FormValues;
  onChange: (name: string, value: FormValue) => void;
  enabled: boolean;
  onError?: (message: string) => void;
};

/** Rotate the entire field layer, including text and controls, just like the PDF. */
function rotationStyle(rotation: number, width: number, height: number) {
  switch (normalizeRotation(rotation)) {
    case 90: return `translate(${height}px, 0) rotate(90deg)`;
    case 180: return `translate(${width}px, ${height}px) rotate(180deg)`;
    case 270: return `translate(0, ${width}px) rotate(270deg)`;
    default: return undefined;
  }
}

function fieldText(value: FormValue) {
  return Array.isArray(value) ? value[0] || '' : typeof value === 'string' ? value : '';
}

function FieldControl({ field, widget, value, width, height, zoom, enabled, onChange }: {
  field: FormField; widget: FormWidget; value: FormValue; width: number; height: number;
  zoom: number; enabled: boolean; onChange: (name: string, value: FormValue) => void;
}) {
  const label = field.label || field.name;
  const optionIndex = field.options?.findIndex(option => option.value === widget.exportValue) ?? -1;
  const option = field.options?.[optionIndex];
  const optionLabel = option && field.options?.filter(item => item.label === option.label).length === 1 ? option.label : 'Opzione ' + (optionIndex + 1);
  const accessibleLabel = field.kind === 'radio' ? `${label}: ${optionLabel || widget.exportValue || 'Opzione'}` : label;
  const text = fieldText(value);
  const fontSize = widget.fontSize && widget.fontSize > 0
    ? Math.max(3, Math.min(widget.fontSize * zoom, height * .88))
    : Math.max(3, Math.min(12 * zoom, height * .74));
  const style: CSSProperties = {
    fontSize,
    textAlign: widget.textAlign === 1 ? 'center' : widget.textAlign === 2 ? 'right' : 'left',
  };
  // A comb field has one character per equal-width box. Monospace tracking keeps
  // the input editable with the normal caret, selection and keyboard shortcuts.
  if (field.comb && field.maxLength && !field.multiline) {
    const cell = width / field.maxLength;
    const combSize = Math.max(3, Math.min(fontSize, cell * 1.3));
    const glyph = combSize * .6;
    Object.assign(style, {
      fontSize: combSize, fontFamily: 'monospace', textAlign: 'left',
      letterSpacing: Math.max(0, cell - glyph), paddingLeft: Math.max(0, (cell - glyph) / 2), paddingRight: 0,
    });
  }
  const common = {
    'aria-label': accessibleLabel,
    'aria-required': field.required || undefined,
    'data-field-name': field.name,
    'data-widget-id': widget.id,
    title: accessibleLabel + (field.required ? ' (obbligatorio)' : ''),
    disabled: !enabled,
    tabIndex: enabled ? 0 : -1,
    style,
  };
  const setValue = (next: FormValue) => onChange(field.name, next);

  if (field.kind === 'checkbox' || field.kind === 'radio') {
    const checked = field.kind === 'checkbox' ? value === true : value === widget.exportValue;
    return <input {...common} className="form-control form-toggle" type={field.kind}
      name={field.kind === 'radio' ? `pdf-field-${field.name}` : undefined}
      checked={checked} value={widget.exportValue || 'Yes'}
      onChange={event => setValue(field.kind === 'checkbox' ? event.target.checked : widget.exportValue || '')} />;
  }
  if (field.kind === 'dropdown' || field.kind === 'list') {
    const options = field.options || [];
    if (field.editable && field.kind === 'dropdown') {
      const listId = `pdf-options-${widget.id}`;
      return <><input {...common} className="form-control" type="text" list={listId} value={text}
        autoComplete="off" spellCheck={false} onChange={event => setValue(event.target.value)} />
        <datalist id={listId}>{options.map((option, index) => <option key={index} value={option.value}>{option.label}</option>)}</datalist></>;
    }
    const multi = field.kind === 'list' && !!field.multiSelect;
    const selected = multi ? Array.isArray(value) ? value : text ? [text] : [] : text;
    return <select {...common} className={`form-control ${field.kind === 'list' ? 'form-list' : ''}`}
      multiple={multi} size={field.kind === 'list' ? Math.max(2, Math.floor(height / (fontSize * 1.3))) : undefined}
      value={selected} onChange={event => setValue(multi ? Array.from(event.target.selectedOptions, option => option.value) : event.target.value)}>
      {!multi && <option value="">—</option>}
      {options.map((option, index) => <option key={index} value={option.value}>{option.label}</option>)}
    </select>;
  }
  if (field.multiline) return <textarea {...common} className="form-control form-multiline" value={text}
    maxLength={field.maxLength} spellCheck={false} onChange={event => setValue(event.target.value)} />;
  return <input {...common} className={`form-control ${field.comb ? 'form-comb' : ''}`} type={field.password ? 'password' : 'text'}
    value={text} maxLength={field.maxLength} autoComplete="off" spellCheck={false}
    onChange={event => setValue(event.target.value)} />;
}

export default function FormLayer({ source, page, zoom, values, onChange, enabled, onError }: Props) {
  const [geometry, setGeometry] = useState<{ viewport: PageViewport; rotation: number; sourceId: string; pageIndex: number; zoom: number; pageRotation: number }>();
  const fields = useMemo(() => new Map((source.formFields || []).map(field => [field.name, field])), [source.formFields]);
  useEffect(() => {
    let canceled = false;
    source.pdf.getPage(page.index + 1).then(pdfPage => {
      if (!canceled) setGeometry({ viewport: pdfPage.getViewport({ scale: zoom, rotation: 0 }), rotation: normalizeRotation(pdfPage.rotate + page.rotation), sourceId: source.id, pageIndex: page.index, zoom, pageRotation: page.rotation });
    }).catch(() => { if (!canceled) onError?.('Non riesco a visualizzare i campi del modulo in questa pagina.'); });
    return () => { canceled = true; };
  }, [source, page.index, page.rotation, zoom, onError]);
  if (!geometry || geometry.sourceId !== source.id || geometry.pageIndex !== page.index || geometry.zoom !== zoom || geometry.pageRotation !== page.rotation || source.readOnlyReason) return null;
  const { viewport, rotation } = geometry;
  return <div className={`form-layer ${enabled ? 'is-enabled' : ''}`} aria-label="Campi del modulo"
    style={{ width: viewport.width, height: viewport.height, transform: rotationStyle(rotation, viewport.width, viewport.height) }}>
    {(source.formWidgets || []).filter(widget => widget.pageIndex === page.index && !widget.hidden).map(widget => {
      const field = fields.get(widget.fieldName);
      if (!field || field.readOnly || (['dropdown', 'list'].includes(field.kind) && !field.options?.length && !field.editable)) return null;
      const rect = viewport.convertToViewportRectangle(widget.rect);
      const left = Math.min(rect[0], rect[2]), top = Math.min(rect[1], rect[3]);
      const width = Math.abs(rect[2] - rect[0]), height = Math.abs(rect[3] - rect[1]);
      if (width < .1 || height < .1) return null;
      // Widget /MK rotation is counter-clockwise in PDF coordinates.
      const angle = normalizeRotation(-widget.rotation);
      const turned = angle % 180 !== 0;
      const innerWidth = turned ? height : width, innerHeight = turned ? width : height;
      const value = Object.hasOwn(values, field.name) ? values[field.name] : field.value;
      return <div key={widget.id} className="form-widget" style={{ left, top, width, height }}>
        <div className="form-widget-content" style={{ width: innerWidth, height: innerHeight, transform: rotationStyle(angle, innerWidth, innerHeight) }}>
          <FieldControl field={field} widget={widget} value={value} width={innerWidth} height={innerHeight} zoom={zoom} enabled={enabled} onChange={onChange} />
        </div>
      </div>;
    })}
  </div>;
}


