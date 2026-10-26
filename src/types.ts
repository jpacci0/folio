import type { PDFDocumentProxy } from 'pdfjs-dist';
export type Point = { x: number; y: number };
export type Signature = { kind: 'draw'; paths: Point[][]; aspectRatio: number } | { kind: 'image'; dataUrl: string; aspectRatio: number };
export type Mark = {
  id: string; kind: 'text' | 'highlight' | 'draw' | 'signature';
  x: number; y: number; width: number; height: number;
  color: string; size: number; text?: string; paths?: Point[][]; imageDataUrl?: string;
};
export type PageModel = { id: string; sourceId: string; index: number; rotation: number; marks: Mark[] };
export type FormValue = string | boolean | string[];
/** Radio values are appearance-state names, not /Opt labels (which need not be unique). */
export type FormValues = Record<string, FormValue>;
export type FormField = {
  name: string; label: string; kind: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'list';
  value: FormValue; readOnly: boolean; required: boolean;
  maxLength?: number; multiline?: boolean; comb?: boolean; password?: boolean;
  editable?: boolean; multiSelect?: boolean; options?: { value: string; label: string }[];
};
export type FormWidget = {
  id: string; fieldName: string; pageIndex: number; rect: [number, number, number, number];
  exportValue?: string; rotation: number; fontSize?: number; textAlign?: number; hidden: boolean;
};
export type Source = {
  id: string; name: string; bytes: Uint8Array; pdf: PDFDocumentProxy; readOnlyReason?: string;
  formFields?: FormField[]; formWidgets?: FormWidget[]; formWarnings?: string[];
};
export type Tool = 'select' | 'text' | 'highlight' | 'draw' | 'signature';
declare global {
  interface Window {
    folio?: {
      open: () => Promise<{ name: string; bytes: Uint8Array } | null>;
      save: (name: string, bytes: Uint8Array) => Promise<boolean>;
      print: () => Promise<{ success: boolean; reason?: string }>;
      dirty: (value: boolean) => void;
      loadSignature: () => Promise<Signature | null>;
      saveSignature: (signature: Signature | null) => Promise<void>;
    };
  }
}
