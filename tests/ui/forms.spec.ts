import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PDFDocument, PDFHexString, degrees } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function fixture() {
  const doc = await PDFDocument.create();
  const first = doc.addPage([595, 842]);
  const second = doc.addPage([640, 900]);
  second.setCropBox(15, 25, 500, 720);
  second.setRotation(degrees(90));
  const form = doc.getForm();
  const applicant = form.createTextField('Nome completo');
  applicant.setText('Nome iniziale');
  applicant.addToPage(first, { x: 55, y: 730, width: 250, height: 26 });
  applicant.addToPage(second, { x: 55, y: 650, width: 250, height: 26 });
  const consent = form.createCheckBox('Consenso');
  consent.addToPage(first, { x: 55, y: 680, width: 18, height: 18 });
  const choice = form.createRadioGroup('Scelta');
  choice.addOptionToPage('Prima', first, { x: 55, y: 630, width: 18, height: 18 });
  choice.addOptionToPage('Seconda', first, { x: 110, y: 630, width: 18, height: 18 });
  // Real forms may reuse the same export label for distinct appearance states.
  // Selection must retain the widget's state, not select the first matching label.
  choice.acroField.setOpt([PDFHexString.fromText('Yes'), PDFHexString.fromText('Yes')]);
  const country = form.createDropdown('Paese');
  country.addOptions(['Italia', 'Francia']);
  country.addToPage(first, { x: 55, y: 570, width: 200, height: 25 });
  country.acroField.setOptions([
    { value: PDFHexString.fromText('IT'), display: PDFHexString.fromText('Italia') },
    { value: PDFHexString.fromText('FR'), display: PDFHexString.fromText('Francia') },
  ]);
  const fixed = form.createTextField('Codice non modificabile');
  fixed.setText('ORIGINALE');
  fixed.enableReadOnly();
  fixed.addToPage(first, { x: 55, y: 510, width: 200, height: 25 });
  const notes = form.createTextField('Note');
  notes.enableMultiline();
  notes.addToPage(second, { x: 55, y: 500, width: 300, height: 75 });
  const comb = form.createTextField('Codice a caselle');
  comb.setMaxLength(16);
  comb.enableCombing();
  comb.addToPage(second, { x: 55, y: 450, width: 300, height: 25 });
  const interests = form.createOptionList('Interessi');
  interests.addOptions(['Foto', 'Sport', 'Viaggi']);
  interests.enableMultiselect();
  interests.addToPage(second, { x: 55, y: 320, width: 200, height: 80 });
  return Buffer.from(await doc.save());
}

async function open(page: Page, buffer: Buffer, name = 'Modulo di prova.pdf') {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'application/pdf', buffer });
  await expect(page.locator('.form-banner')).toContainText('Modulo compilabile');
  await expect(page.locator('.page-loading')).toHaveCount(0);
  await expect(page.locator('.form-layer')).toBeVisible();
}

async function save(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Salva copia', exact: true }).click();
  const downloaded = await pending;
  return readFile((await downloaded.path())!);
}

test('Fill every standard control, synchronize repeated fields, undo, save and reopen an interactive form', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page, await fixture());
  await expect(page.locator('.readonly-banner')).toHaveCount(0);
  for (const name of ['Aggiungi PDF', 'Duplica', 'Dopo', 'Elimina pagina']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
  }
  await expect(page.locator('[data-field-name="Codice non modificabile"]')).toHaveCount(0);
  await page.getByLabel('Nome completo', { exact: true }).fill('Mario Rossi');
  await page.getByRole('checkbox', { name: 'Consenso', exact: true }).check();
  const radios = page.locator('input[type=radio][data-field-name="Scelta"]');
  await expect(radios).toHaveCount(2);
  const secondRadioValue = await radios.nth(1).getAttribute('value');
  await radios.nth(0).check();
  await radios.nth(1).check();
  await expect(radios.nth(0)).not.toBeChecked();
  await expect(radios.nth(1)).toBeChecked();
  await page.getByLabel('Paese', { exact: true }).selectOption('FR');
  await expect(page.getByLabel('Paese', { exact: true })).toHaveValue('FR');
  await page.getByRole('button', { name: 'Annulla (Ctrl Z)', exact: true }).click();
  await expect(page.getByLabel('Paese', { exact: true })).toHaveValue('');
  await expect(radios.nth(1)).toBeChecked();
  await page.getByRole('button', { name: 'Ripristina (Ctrl Shift Z)', exact: true }).click();
  await expect(page.getByLabel('Paese', { exact: true })).toHaveValue('FR');

  await page.getByRole('button', { name: 'Pagina successiva', exact: true }).click();
  await expect(page.getByLabel('Nome completo', { exact: true })).toHaveValue('Mario Rossi');
  await page.getByLabel('Nome completo', { exact: true }).fill('Mario Rossi aggiornato');
  await page.getByLabel('Note', { exact: true }).fill('Prima riga: città e caffè\nSeconda riga');
  await page.getByLabel('Codice a caselle', { exact: true }).fill('RSSMRA90A01H501X');
  await expect(page.getByLabel('Codice a caselle', { exact: true })).toHaveAttribute('maxlength', '16');
  await page.getByLabel('Interessi', { exact: true }).selectOption(['Foto', 'Viaggi']);
  await page.getByRole('button', { name: 'Pagina precedente', exact: true }).click();
  await expect(page.getByLabel('Nome completo', { exact: true })).toHaveValue('Mario Rossi aggiornato');

  const output = await save(page);
  const doc = await PDFDocument.load(output);
  const form = doc.getForm();
  expect(form.getFields()).toHaveLength(8);
  expect(form.getTextField('Nome completo').getText()).toBe('Mario Rossi aggiornato');
  expect(form.getTextField('Nome completo').acroField.getWidgets()).toHaveLength(2);
  expect(form.getCheckBox('Consenso').isChecked()).toBe(true);
  expect(form.getRadioGroup('Scelta').acroField.getValue().decodeText()).toBe(secondRadioValue);
  expect(form.getDropdown('Paese').acroField.getValues().map(value => value.decodeText())).toEqual(['FR']);
  expect(form.getDropdown('Paese').acroField.getOptions().map(option => option.value.decodeText())).toEqual(['IT', 'FR']);
  expect(form.getOptionList('Interessi').getSelected().sort()).toEqual(['Foto', 'Viaggi']);
  expect(form.getTextField('Note').getText()).toBe('Prima riga: città e caffè\nSeconda riga');
  expect(form.getTextField('Codice a caselle').getText()).toBe('RSSMRA90A01H501X');
  expect(form.getTextField('Codice non modificabile').getText()).toBe('ORIGINALE');
  expect(form.getTextField('Codice non modificabile').isReadOnly()).toBe(true);
  expect(doc.getPage(1).getRotation().angle).toBe(90);
  expect(doc.getPage(1).getCropBox()).toEqual({ x: 15, y: 25, width: 500, height: 720 });
  await expect(page.locator('.unsaved-dot')).toHaveCount(0);
  await page.locator('input[type=file]').setInputFiles({ name: 'Modulo riaperto.pdf', mimeType: 'application/pdf', buffer: output });
  await expect(page.getByRole('heading', { name: 'Modulo riaperto.pdf' })).toBeVisible();
  await expect(page.getByLabel('Nome completo', { exact: true })).toHaveValue('Mario Rossi aggiornato');
  await expect(page.getByRole('checkbox', { name: 'Consenso', exact: true })).toBeChecked();
  await expect(page.locator('input[type=radio][data-field-name="Scelta"]').nth(1)).toBeChecked();
  await expect(page.getByLabel('Paese', { exact: true })).toHaveValue('FR');
  await page.getByRole('button', { name: 'Pagina successiva', exact: true }).click();
  await expect(page.getByLabel('Note', { exact: true })).toHaveValue('Prima riga: città e caffè\nSeconda riga');
  await expect(page.getByLabel('Interessi', { exact: true })).toHaveValues(['Foto', 'Viaggi']);
  // Reopening must preserve editability, not just painted appearances.
  await page.getByLabel('Note', { exact: true }).fill('Modificabile dopo la riapertura');
  expect((await PDFDocument.load(await save(page))).getForm().getTextField('Note').getText()).toBe('Modificabile dopo la riapertura');
  expect(errors).toEqual([]);
});

test('Form controls remain clickable through rotations and zoom, and allow annotations and printing', async ({ page }) => {
  await open(page, await fixture());
  const checkbox = page.getByRole('checkbox', { name: 'Consenso', exact: true });
  for (const rotation of [90, 180, 270, 0]) {
    await page.getByRole('button', { name: 'Ruota', exact: true }).click();
    await expect(page.locator('.page-loading')).toHaveCount(0);
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
    if (rotation === 180) await page.getByRole('button', { name: 'Aumenta zoom', exact: true }).click();
  }
  await page.getByLabel('Nome completo', { exact: true }).fill('Visibile anche durante le annotazioni');
  await page.getByRole('button', { name: 'Testo', exact: true }).click();
  await expect(page.getByLabel('Nome completo', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Nome completo', { exact: true })).toHaveValue('Visibile anche durante le annotazioni');
  await page.getByLabel('Il tuo testo').fill('Nota esterna al modulo');
  await page.locator('.annotations').click({ position: { x: 70, y: 370 } });
  await expect(page.locator('.annotations .mark')).toHaveCount(1);
  await expect(page.getByLabel('Nome completo', { exact: true })).toBeEnabled();
  await checkbox.check();
  await page.evaluate(() => {
    window.print = () => {
      (window as unknown as { printed: number }).printed = document.querySelectorAll('#print-root .print-sheet img').length;
    };
  });
  await page.getByRole('button', { name: 'Stampa', exact: true }).click();
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(2);
  const doc = await PDFDocument.load(await save(page));
  expect(doc.getForm().getCheckBox('Consenso').isChecked()).toBe(true);
  expect(doc.getForm().getTextField('Nome completo').getText()).toBe('Visibile anche durante le annotazioni');
  expect(doc.getPage(0).getRotation().angle).toBe(0);
});

test('Optional local form opens with editable fields and survives a text round trip', async ({ page }) => {
  test.skip(!process.env.JFOLIO_FORM_FIXTURE, 'Provide a local fixture path; personal PDFs are never included in the repository.');
  const original = await readFile(process.env.JFOLIO_FORM_FIXTURE!);
  await open(page, original, 'Modulo locale.pdf');
  const text = page.locator('.form-layer input[type=text]').first();
  await expect(text).toBeVisible();
  const fieldName = (await text.getAttribute('data-field-name'))!;
  const existing = await text.inputValue();
  await text.fill('PROVA JFOLIO');
  const output = await save(page);
  const result = await PDFDocument.load(output);
  expect(result.getForm().getTextField(fieldName).getText()).toBe('PROVA JFOLIO');
  const before = await PDFDocument.load(original);
  expect(result.getForm().getFields().map(field => field.getName())).toEqual(expect.arrayContaining(before.getForm().getFields().map(field => field.getName())));
  expect(result.getPageCount()).toBe(before.getPageCount());
  expect(before.getForm().getTextField(fieldName).getText() || '').toBe(existing);
  await page.locator('input[type=file]').setInputFiles({ name: 'Modulo locale riaperto.pdf', mimeType: 'application/pdf', buffer: output });
  await expect(page.locator('.form-layer input[type=text]').first()).toHaveValue('PROVA JFOLIO');
});



