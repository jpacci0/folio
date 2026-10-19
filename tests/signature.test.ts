import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, degrees } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { drawnSignature, validSignature } from '../src/signature';
import { exportPdf } from '../src/pdf-engine';
const require = createRequire(import.meta.url);
const { signatureStore } = require('../electron/signature-store.cjs');
const { createCanvas } = createRequire(require.resolve('pdfjs-dist/package.json'))('@napi-rs/canvas');

test('Saved signatures survive a new store, replacements, invalid writes and deletion', async () => {
  await mkdir('test-results', { recursive: true });
  const directory = await mkdtemp(path.resolve('test-results', 'jfolio-signature-'));
  const first = signatureStore(directory);
  assert.equal(await first.load(), null);
  const drawn = drawnSignature([[{ x: .1, y: .4 }, { x: .7, y: .6 }]]);
  await first.save(drawn);
  const reopened = signatureStore(directory);
  assert.deepEqual(await reopened.load(), drawn);
  assert.ok(validSignature(drawn));
  assert.ok(Math.abs(drawn.aspectRatio - 368 / 51.2) < .001);
  assert.throws(() => reopened.save({ kind: 'draw', aspectRatio: 1, paths: [[{ x: 0, y: NaN }]] }), /non valida/);
  assert.deepEqual(await reopened.load(), drawn);
  const image = { kind: 'image', aspectRatio: 1, dataUrl: 'data:image/png;base64,' + (await readFile('public/jfolio-icon.png')).toString('base64') };
  await reopened.save(image);
  assert.deepEqual(await signatureStore(directory).load(), image);
  await reopened.save(null);
  assert.equal(await signatureStore(directory).load(), null);
});

test('Image signatures preserve transparency and location on cropped, rotated PDFs', async () => {
  const stamp = createCanvas(80, 40), ctx = stamp.getContext('2d');
  ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 40, 40); // right half stays transparent
  const dataUrl = stamp.toDataURL('image/png');
  for (const rotation of [0, 90, 180, 270]) {
    const original = await PDFDocument.create(), page = original.addPage([640, 900]);
    page.setCropBox(25, 45, 500, 720); page.setRotation(degrees(rotation));
    const bytes = await original.save(), pdf = await getDocument({ data: bytes.slice() }).promise;
    const viewport = (await pdf.getPage(1)).getViewport({ scale: 1 });
    const result = await exportPdf([{ id: 'p', sourceId: 's', index: 0, rotation: 0, marks: [{
      id: 'signature', kind: 'signature', x: .2, y: .3, width: 160 / viewport.width, height: 80 / viewport.height,
      size: 1.6, color: '#000000', imageDataUrl: dataUrl,
    }] }], new Map([['s', { id: 's', name: 'test.pdf', bytes, pdf }]]));
    const reopened = await getDocument({ data: result.slice() }).promise;
    const rendered = await reopened.getPage(1), canvas = createCanvas(viewport.width, viewport.height);
    await rendered.render({ canvas, viewport: rendered.getViewport({ scale: 1 }) }).promise;
    const context = canvas.getContext('2d');
    const pixel = (dx: number, dy: number) => [...context.getImageData(Math.round(viewport.width * .2 + dx), Math.round(viewport.height * .3 + dy), 1, 1).data];
    assert.deepEqual(pixel(20, 20), [255, 0, 0, 255], 'red ink stays in position at ' + rotation);
    assert.deepEqual(pixel(120, 20), [255, 255, 255, 255], 'transparent area stays white at ' + rotation);
    assert.deepEqual(pixel(-10, -10), [255, 255, 255, 255], 'outside signature at ' + rotation);
    await reopened.destroy(); await pdf.destroy();
  }
});
