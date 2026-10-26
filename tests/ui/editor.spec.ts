import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function demo(page: Page) {
  await page.goto('/'); await page.getByRole('button', { name: /Vuoi dare un/ }).click();
  await expect(page.locator('.paper canvas')).toBeVisible(); await expect(page.locator('.page-loading')).toHaveCount(0);
}
test('Add text, draw, highlight, sign, undo, reorder, save and reopen a real PDF', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await demo(page);
  await page.getByRole('button', { name: 'Testo', exact: true }).click();
  await page.getByLabel('Il tuo testo').fill('Nota di Jacopo: già pronto!');
  await page.locator('.annotations').click({ position: { x: 70, y: 530 } });
  await expect(page.locator('.annotations .mark')).toHaveCount(1);
  await page.getByRole('button', { name: 'Annulla (Ctrl Z)', exact: true }).click();
  await expect(page.locator('.annotations .mark')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ripristina (Ctrl Shift Z)', exact: true }).click();
  await expect(page.locator('.annotations .mark')).toHaveCount(1);
  await page.getByRole('button', { name: 'Evidenzia', exact: true }).click();
  let box = (await page.locator('.annotations').boundingBox())!;
  await page.mouse.move(box.x + 45, box.y + 225); await page.mouse.down(); await page.mouse.move(box.x + 360, box.y + 245, { steps: 8 }); await page.mouse.up();
  await expect(page.locator('.annotations .mark')).toHaveCount(2);
  await page.getByRole('button', { name: 'Disegna', exact: true }).click();
  await page.mouse.move(box.x + 70, box.y + 550); await page.mouse.down(); await page.mouse.move(box.x + 100, box.y + 570, { steps: 8 }); await page.mouse.move(box.x + 160, box.y + 540, { steps: 8 }); await page.mouse.up();
  await expect(page.locator('.annotations .mark')).toHaveCount(3);
  await page.getByRole('button', { name: 'Firma', exact: true }).click(); await page.getByRole('button', { name: 'Crea la tua firma' }).click();
  const pad = (await page.locator('.signature-pad').boundingBox())!;
  await page.mouse.move(pad.x + 80, pad.y + 120); await page.mouse.down(); await page.mouse.move(pad.x + 140, pad.y + 50, { steps: 10 }); await page.mouse.move(pad.x + 170, pad.y + 150, { steps: 10 }); await page.mouse.move(pad.x + 350, pad.y + 100, { steps: 15 }); await page.mouse.up();
  await page.getByRole('button', { name: 'Usa questa firma' }).click();
  await page.locator('.annotations').click({ position: { x: 290, y: 560 } });
  await expect(page.locator('.annotations .mark')).toHaveCount(4);
  await page.getByRole('button', { name: 'Ruota', exact: true }).click(); await expect(page.locator('.page-loading')).toHaveCount(0);
  await page.getByRole('button', { name: 'Dopo', exact: true }).click();
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Salva copia', exact: true }).click();
  const download = await downloadPromise; const downloadedPath = (await download.path())!;
  const result = await PDFDocument.load(await readFile(downloadedPath));
  expect(result.getPageCount()).toBe(2); expect(result.getPage(1).getRotation().angle).toBe(90);
  await expect(page.getByText('Modifiche non salvate', { exact: false })).toHaveCount(0);
  await page.locator('input[type=file]').setInputFiles({ name: 'Verificato.pdf', mimeType: 'application/pdf', buffer: await readFile(downloadedPath) });
  await expect(page.getByRole('heading', { name: 'Verificato.pdf' })).toBeVisible();
  await page.getByRole('button', { name: 'Pagina 2', exact: true }).click();
  await expect(page.locator('.textLayer')).toContainText('Nota di Jacopo');
  expect(errors).toEqual([]);
});

test('Search, page management, original protection and invalid files', async ({ page }) => {
  await demo(page);
  await page.getByRole('button', { name: 'Cerca nel PDF' }).click(); await page.getByLabel('Cerca nel documento').fill('ordine');
  await expect(page.locator('.search-hit')).toHaveCount(1); await page.locator('.search-hit').click();
  await expect(page.locator('.page-navigation')).toContainText('2');
  await page.getByRole('button', { name: 'Duplica', exact: true }).click(); await expect(page.locator('.page-navigation')).toContainText('3');
  await page.getByRole('button', { name: 'Elimina pagina', exact: true }).click(); await expect(page.locator('.page-navigation')).toContainText('2');
  await page.getByRole('button', { name: 'Annulla (Ctrl Z)', exact: true }).click();
  await expect(page.locator('.page-navigation')).toContainText('3');
  page.on('dialog', d => d.accept());
  await page.locator('input[type=file]').setInputFiles({ name: 'rotto.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') });
  await expect(page.getByRole('alert')).toContainText('non sembra essere un PDF');
  await expect(page.getByRole('heading', { name: 'Benvenuto in JFolio.pdf' })).toBeVisible();
});

test('Forms can be filled; print prepares only document pages', async ({ page }) => {
  const doc = await PDFDocument.create(); const p = doc.addPage(); const field = doc.getForm().createTextField('Nome'); field.setText('Jacopo'); field.addToPage(p, { x: 50, y: 500, width: 200, height: 30 });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'Modulo.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) });
  await expect(page.locator('.form-banner')).toContainText('Modulo compilabile');
  await page.getByRole('textbox', { name: 'Nome', exact: true }).fill('Mario Rossi');
  await expect(page.getByRole('button', { name: 'Salva copia' })).toBeEnabled();
  await page.evaluate(() => { window.print = () => { (window as unknown as { printed: number }).printed = document.querySelectorAll('#print-root .print-sheet img').length; }; });
  await page.getByRole('button', { name: 'Stampa', exact: true }).click();
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
});
