import type { Point, Signature } from './types';

const STORAGE_KEY = 'jfolio.signature.v1';
export function validSignature(value: unknown): value is Signature {
  if (!value || typeof value !== 'object') return false;
  const s = value as Signature;
  if (!Number.isFinite(s.aspectRatio) || s.aspectRatio < 0.02 || s.aspectRatio > 50) return false;
  if (s.kind === 'image') return typeof s.dataUrl === 'string' && s.dataUrl.length <= 2_000_000 && /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(s.dataUrl);
  return s.kind === 'draw' && Array.isArray(s.paths) && s.paths.length > 0 && s.paths.length <= 128 &&
    s.paths.every(p => Array.isArray(p) && p.length >= 2) && s.paths.flat().length <= 10000 &&
    s.paths.flat().every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
}
export async function loadSignature(): Promise<Signature | null> {
  const value: unknown = window.folio ? await window.folio.loadSignature() : JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (value === null) return null;
  if (!validSignature(value)) throw new Error('La firma salvata non è leggibile. Puoi sostituirla con una nuova.');
  return value;
}
export async function saveSignature(signature: Signature | null) {
  if (signature && !validSignature(signature)) throw new Error('La firma è troppo complessa. Prova a semplificarla.');
  try {
    if (window.folio) await window.folio.saveSignature(signature);
    else if (signature) localStorage.setItem(STORAGE_KEY, JSON.stringify(signature));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { throw new Error('Non riesco a salvare la firma sul dispositivo. Controlla lo spazio disponibile e riprova.'); }
}
export function drawnSignature(paths: Point[][]): Signature {
  const strokes = paths.filter(p => p.length > 1), points = strokes.flat();
  if (!points.length) throw new Error('Disegna prima la tua firma.');
  const minX = Math.min(...points.map(p => p.x * 600)) - 4, minY = Math.min(...points.map(p => p.y * 216)) - 4;
  const width = Math.max(...points.map(p => p.x * 600)) + 4 - minX, height = Math.max(...points.map(p => p.y * 216)) + 4 - minY;
  return { kind: 'draw', aspectRatio: width / height, paths: strokes.map(path => path.map(p => ({ x: (p.x * 600 - minX) / width, y: (p.y * 216 - minY) / height }))) };
}
export async function importSignature(file: File): Promise<Signature> {
  if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Scegli un’immagine PNG o JPG.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Scegli un’immagine inferiore a 5 MB.');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('L’immagine non è leggibile. Prova un altro file.'); }
  try {
    if (bitmap.width * bitmap.height > 16_000_000) throw new Error('L’immagine è troppo grande: riducila sotto i 16 megapixel.');
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const signature: Signature = { kind: 'image', dataUrl: canvas.toDataURL('image/png'), aspectRatio: canvas.width / canvas.height };
    if (!validSignature(signature)) throw new Error('L’immagine è troppo pesante o troppo allungata. Ritaglia la zona della firma e riprova.');
    return signature;
  } finally { bitmap.close(); }
}
