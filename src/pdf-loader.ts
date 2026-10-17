import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, PDFSignature } from 'pdf-lib';
import { MAX_FILE_SIZE, uid } from './pdf-engine';
import type { Source } from './types';
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
export { pdfjs };
export async function loadSource(name: string, bytes: Uint8Array): Promise<Source> {
  if (bytes.length > MAX_FILE_SIZE) throw new Error('Il limite per ogni PDF è 150 MB.');
  if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes('%PDF-')) throw new Error('Questo file non sembra essere un PDF valido.');
  const assetBase = new URL('./pdf-assets/', document.baseURI).href;
  const task = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true, cMapUrl: assetBase + 'cmaps/', cMapPacked: true, standardFontDataUrl: assetBase + 'standard_fonts/', wasmUrl: assetBase + 'wasm/' });
  let pdf;
  try { pdf = await task.promise; } catch (error) {
    await task.destroy();
    if ((error as Error).name === 'PasswordException') throw new Error('I PDF protetti da password non sono ancora supportati. Apri una copia senza password.');
    throw new Error('Non riesco ad aprire questo PDF: potrebbe essere danneggiato.');
  }
  let readOnlyReason: string | undefined;
  try {
    const doc = await PDFDocument.load(bytes);
    const fields = doc.getForm().getFields();
    if (fields.some(f => f instanceof PDFSignature)) readOnlyReason = 'Questo PDF contiene campi firma: in questa versione puoi leggerlo e stamparlo. Modificarlo potrebbe invalidare una firma digitale.';
    else if (fields.length) readOnlyReason = 'Questo PDF contiene moduli interattivi: in questa versione puoi leggerlo e stamparlo. La modifica dei moduli sarà aggiunta in seguito.';
  } catch { readOnlyReason = 'Questo PDF è visualizzabile, ma non è compatibile con il motore di modifica. Puoi leggerlo e stamparlo.'; }
  return { id: uid(), name, bytes, pdf, readOnlyReason };
}
