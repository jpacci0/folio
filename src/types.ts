import type { PDFDocumentProxy } from 'pdfjs-dist';
export type Point = { x: number; y: number };
export type Mark = {
  id: string; kind: 'text' | 'highlight' | 'draw' | 'signature';
  x: number; y: number; width: number; height: number;
  color: string; size: number; text?: string; paths?: Point[][];
};
export type PageModel = { id: string; sourceId: string; index: number; rotation: number; marks: Mark[] };
export type Source = { id: string; name: string; bytes: Uint8Array; pdf: PDFDocumentProxy; readOnlyReason?: string };
export type Tool = 'select' | 'text' | 'highlight' | 'draw' | 'signature';
declare global {
  interface Window {
    folio?: {
      open: () => Promise<{ name: string; bytes: Uint8Array } | null>;
      save: (name: string, bytes: Uint8Array) => Promise<boolean>;
      print: () => Promise<{ success: boolean; reason?: string }>;
      dirty: (value: boolean) => void;
    };
  }
}
