import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Mark, PageModel, Point, Source } from './types';

export const MAX_FILE_SIZE = 150 * 1024 * 1024;
export const uid = () => crypto.randomUUID();
export function normalizeRotation(rotation: number) { return ((rotation % 360) + 360) % 360; }
export function toBase(point: Point, rotation: number): Point {
  switch (normalizeRotation(rotation)) {
    case 90: return { x: point.y, y: 1 - point.x };
    case 180: return { x: 1 - point.x, y: 1 - point.y };
    case 270: return { x: 1 - point.y, y: point.x };
    default: return point;
  }
}
export function rotationTransform(rotation: number, w: number, h: number) {
  switch (normalizeRotation(rotation)) {
    case 90: return `translate(${h} 0) rotate(90)`;
    case 180: return `translate(${w} ${h}) rotate(180)`;
    case 270: return `translate(0 ${w}) rotate(270)`;
    default: return '';
  }
}
function color(hex: string) { return rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255); }
export function strokeMark(points: Point[], ink: string, size: number): Mark | null {
  if (points.length < 2) return null;
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
  const width = Math.max(0.002, Math.max(...points.map(p => p.x)) - x);
  const height = Math.max(0.002, Math.max(...points.map(p => p.y)) - y);
  return { id: uid(), kind: 'draw', x, y, width, height, color: ink, size, paths: [points.map(p => ({ x: (p.x - x) / width, y: (p.y - y) / height }))] };
}

/** Copy source pages without rasterizing them; apply marks in PDF user space. */
export async function exportPdf(pages: PageModel[], sources: Map<string, Source>, fontBytes?: Uint8Array) {
  if (!pages.length) throw new Error('Il documento deve contenere almeno una pagina.');
  const output = await PDFDocument.create();
  output.registerFontkit(fontkit);
  const font = fontBytes ? await output.embedFont(fontBytes, { subset: true }) : await output.embedFont(StandardFonts.Helvetica);
  const images = new Map<string, Awaited<ReturnType<typeof output.embedPng>>>();
  const loaded = new Map<string, PDFDocument>();
  for (const model of pages) {
    const source = sources.get(model.sourceId);
    if (!source) throw new Error('Documento di origine non disponibile.');
    if (source.readOnlyReason) throw new Error(source.readOnlyReason);
    if (!loaded.has(source.id)) loaded.set(source.id, await PDFDocument.load(source.bytes));
    const [page] = await output.copyPages(loaded.get(source.id)!, [model.index]);
    output.addPage(page);
    const original = await source.pdf.getPage(model.index + 1);
    const viewport = original.getViewport({ scale: 1 });
    const w = viewport.width, h = viewport.height;
    const pdfPoint = (x: number, y: number) => {
      const [px, py] = viewport.convertToPdfPoint(x * w, y * h);
      return { x: px, y: py };
    };
    for (const mark of model.marks) {
      if (mark.kind === 'text') {
        const lines = (mark.text || '').split('\n');
        for (let i = 0; i < lines.length; i++) {
          page.drawText(lines[i], { ...pdfPoint(mark.x, mark.y + (mark.size * (1 + i * 1.3)) / h), size: mark.size, font, color: color(mark.color), rotate: degrees(viewport.rotation) });
        }
      } else if (mark.kind === 'highlight') {
        const a = pdfPoint(mark.x, mark.y), b = pdfPoint(mark.x + mark.width, mark.y + mark.height);
        page.drawRectangle({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y), color: color(mark.color), opacity: 0.32 });
      } else if (mark.kind === 'signature' && mark.imageDataUrl) {
        let image = images.get(mark.imageDataUrl);
        if (!image) { image = await output.embedPng(mark.imageDataUrl); images.set(mark.imageDataUrl, image); }
        page.drawImage(image, { ...pdfPoint(mark.x, mark.y + mark.height), width: mark.width * w, height: mark.height * h, rotate: degrees(viewport.rotation) });
      } else {
        for (const path of mark.paths || []) {
          for (let i = 1; i < path.length; i++) {
            page.drawLine({ start: pdfPoint(mark.x + path[i - 1].x * mark.width, mark.y + path[i - 1].y * mark.height), end: pdfPoint(mark.x + path[i].x * mark.width, mark.y + path[i].y * mark.height), thickness: mark.size, color: color(mark.color) });
          }
        }
      }
    }
    page.setRotation(degrees(normalizeRotation(viewport.rotation + model.rotation)));
  }
  output.setCreator('JFolio PDF'); output.setProducer('JFolio • pdf-lib');
  return output.save();
}

export async function createWelcomePdf() {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const purple = rgb(0.38, 0.29, 0.86), dark = rgb(0.12, 0.14, 0.2), gray = rgb(0.43, 0.46, 0.52);
  for (let index = 0; index < 2; index++) {
    const page = pdf.addPage([595.28, 841.89]);
    page.drawRectangle({ x: 0, y: 828, width: 595.28, height: 14, color: purple });
    page.drawText('JFolio /', { x: 52, y: 770, size: 22, font: bold, color: purple });
    page.drawText('IL TUO SPAZIO PDF', { x: 52, y: 717, size: 9, font: bold, color: gray });
    page.drawText(index === 0 ? 'Meno distrazioni.' : 'Fai spazio alle idee.', { x: 52, y: 667, size: 34, font: bold, color: dark });
    page.drawText(index === 0 ? 'Più spazio alle idee.' : 'Una pagina alla volta.', { x: 52, y: 622, size: 34, font: bold, color: dark });
    const lines = index === 0 ? [
      'Benvenuto in JFolio, il tuo nuovo spazio per leggere,',
      'annotare e firmare i documenti. Tutto sul tuo dispositivo.',
      '',
      'Questo PDF è una piccola palestra: puoi modificarlo',
      'liberamente e salvare una copia quando vuoi.',
    ] : [
      'Usa le miniature per scegliere una pagina.',
      'Con le frecce puoi cambiarne l\'ordine; puoi anche',
      'ruotarla, duplicarla o rimuoverla.',
      '',
      'Aggiungi un altro PDF per raccogliere tutto qui.',
    ];
    lines.forEach((line, i) => page.drawText(line, { x: 52, y: 566 - i * 23, size: 13, font: regular, color: gray }));
    page.drawRectangle({ x: 52, y: 232, width: 491, height: 160, color: rgb(0.96, 0.95, 0.99) });
    page.drawText(index === 0 ? 'Prova qualcosa di tuo' : 'Il documento resta tuo', { x: 73, y: 357, size: 17, font: bold, color: dark });
    const tips = index === 0 ? ['01    Evidenzia una frase con il mouse.', '02    Aggiungi un pensiero con lo strumento Testo.', '03    Disegna una firma e inseriscila qui sotto.'] : ['I tuoi file non vengono caricati su un server.', 'Le annotazioni saranno incorporate nella copia PDF.', 'La firma disegnata è un segno grafico, senza certificato.'];
    tips.forEach((line, i) => page.drawText(line, { x: 73, y: 321 - i * 27, size: 11, font: regular, color: gray }));
    page.drawLine({ start: { x: 340, y: 149 }, end: { x: 543, y: 149 }, thickness: 0.7, color: rgb(0.8, 0.81, 0.85) });
    page.drawText('La tua firma', { x: 340, y: 131, size: 9, font: regular, color: gray });
    page.drawText('DOCUMENTO DI ESEMPIO', { x: 52, y: 44, size: 8, font: regular, color: gray });
    page.drawText(`FOLIO    /    0${index + 1}`, { x: 468, y: 44, size: 8, font: regular, color: gray });
  }
  return pdf.save();
}
