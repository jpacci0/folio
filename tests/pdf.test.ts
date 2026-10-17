import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, degrees, StandardFonts } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createWelcomePdf, exportPdf, normalizeRotation, toBase } from '../src/pdf-engine';
import type { Source, PageModel } from '../src/types';

test('Export keeps original text, page order, rotation and added text', async () => {
  const bytes = await createWelcomePdf();
  const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: true }).promise;
  const source: Source = { id: 'a', name: 'test.pdf', bytes, pdf };
  const model: PageModel[] = [{ id: 'p2', sourceId: 'a', index: 1, rotation: 90, marks: [{ id: 'note', kind: 'text', x: 0.1, y: 0.2, width: 0.2, height: 0.04, text: 'Test di esportazione', size: 16, color: '#123456' }] }, { id: 'p1', sourceId: 'a', index: 0, rotation: 0, marks: [] }];
  const result = await exportPdf(model, new Map([['a', source]]));
  const saved = await PDFDocument.load(result);
  assert.equal(saved.getPageCount(), 2); assert.equal(saved.getPage(0).getRotation().angle, 90);
  const reopened = await getDocument({ data: result.slice(), useSystemFonts: true }).promise;
  const first = await (await reopened.getPage(1)).getTextContent();
  const text = first.items.map(i => 'str' in i ? i.str : '').join(' ');
  assert.match(text, /Fai spazio alle idee/); assert.match(text, /Test di esportazione/);
  await reopened.destroy(); await pdf.destroy();
});

test('Marks respect non-zero crop boxes and all intrinsic rotations', async () => {
  for (const rotation of [0, 90, 180, 270]) {
    const doc = await PDFDocument.create(), p = doc.addPage([640, 900]);
    p.setCropBox(25, 45, 500, 720); p.setRotation(degrees(rotation));
    const font = await doc.embedFont(StandardFonts.Helvetica); p.drawText('Originale', { font, x: 60, y: 100 });
    const bytes = await doc.save(); const pdf = await getDocument({ data: bytes.slice() }).promise;
    const source: Source = { id: 'a', name: 'rotated.pdf', bytes, pdf };
    const result = await exportPdf([{ id: 'p', sourceId: 'a', index: 0, rotation: 0, marks: [{ id: 'm', kind: 'text', text: 'POSIZIONE', x: .2, y: .3, width: .2, height: .04, size: 12, color: '#000000' }] }], new Map([['a', source]]));
    const reopened = await getDocument({ data: result.slice() }).promise;
    const page = await reopened.getPage(1), viewport = page.getViewport({ scale: 1 });
    const text = (await page.getTextContent()).items.find(i => 'str' in i && i.str === 'POSIZIONE');
    assert.ok(text && 'transform' in text);
    const [x, y] = viewport.convertToViewportPoint(text.transform[4], text.transform[5]);
    assert.ok(Math.abs(x - .2 * viewport.width) < .01, `x rotation ${rotation}: ${x}`);
    assert.ok(Math.abs(y - (.3 * viewport.height + 12)) < .01, `y rotation ${rotation}: ${y}`);
    await reopened.destroy(); await pdf.destroy();
  }
});

test('Read-only sources cannot be modified and empty documents are rejected', async () => {
  const bytes = await createWelcomePdf(); const pdf = await getDocument({ data: bytes.slice() }).promise;
  const source: Source = { id: 'a', name: 'form.pdf', bytes, pdf, readOnlyReason: 'Modulo protetto' };
  await assert.rejects(() => exportPdf([], new Map()), /almeno una pagina/);
  await assert.rejects(() => exportPdf([{ id: 'p', sourceId: 'a', index: 0, rotation: 0, marks: [] }], new Map([['a', source]])), /Modulo protetto/);
  await pdf.destroy();
});

test('Pointer coordinates return to base page space after rotation', () => {
  assert.deepEqual(toBase({ x: .7, y: .2 }, 90), { x: .2, y: .30000000000000004 });
  assert.deepEqual(toBase({ x: .2, y: .7 }, 270), { x: .30000000000000004, y: .2 });
  assert.equal(normalizeRotation(-90), 270);
});
