const { _electron: electron, expect } = require('@playwright/test');
const { PDFDocument, PDFHexString } = require('pdf-lib');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

async function createFixture() {
  const doc = await PDFDocument.create();
  const first = doc.addPage([595, 842]);
  const second = doc.addPage([595, 842]);
  const form = doc.getForm();
  const name = form.createTextField('Nome completo');
  name.setText('Nome iniziale');
  name.addToPage(first, { x: 55, y: 730, width: 300, height: 28 });
  name.addToPage(second, { x: 55, y: 730, width: 300, height: 28 });
  const consent = form.createCheckBox('Consenso');
  consent.addToPage(first, { x: 55, y: 680, width: 20, height: 20 });
  const choice = form.createRadioGroup('Scelta');
  choice.addOptionToPage('Prima', first, { x: 55, y: 630, width: 20, height: 20 });
  choice.addOptionToPage('Seconda', first, { x: 110, y: 630, width: 20, height: 20 });
  choice.acroField.setOpt([PDFHexString.fromText('Yes'), PDFHexString.fromText('Yes')]);
  const country = form.createDropdown('Paese');
  country.addOptions(['Italia', 'Francia']);
  country.addToPage(first, { x: 55, y: 570, width: 200, height: 28 });
  country.acroField.setOptions([
    { value: PDFHexString.fromText('IT'), display: PDFHexString.fromText('Italia') },
    { value: PDFHexString.fromText('FR'), display: PDFHexString.fromText('Francia') },
  ]);
  const notes = form.createTextField('Note');
  notes.enableMultiline();
  notes.addToPage(second, { x: 55, y: 570, width: 300, height: 80 });
  return doc.save();
}

(async () => {
  const resultDir = path.resolve('test-results/forms-desktop');
  await fs.mkdir(resultDir, { recursive: true });
  const input = path.join(resultDir, 'modulo-desktop.pdf');
  const output = path.join(resultDir, 'modulo-desktop-compilato.pdf');
  await fs.writeFile(input, await createFixture());
  const env = { ...process.env, JFOLIO_TEST_PROFILE: `forms-desktop-${Date.now()}` };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.FOLIO_TEST_EXECUTABLE;
  const errors = [];
  async function launch(openPath) {
    const app = await electron.launch({ executablePath, args: executablePath ? ['--test'] : ['.', '--test'], env, timeout: 30000 });
    try {
    const window = await app.firstWindow();
    window.setDefaultTimeout(15000);
    window.on('pageerror', error => errors.push(error.message));
    await window.getByRole('heading', { name: /I tuoi PDF/ }).waitFor();
    await app.evaluate(({ dialog, ipcMain, BrowserWindow }, { openPath, output }) => {
      const main = BrowserWindow.getAllWindows()[0];
      main.formsDirty = false;
      main.formsPrinted = [];
      ipcMain.on('document:dirty', (_event, value) => { main.formsDirty = value; });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [openPath] });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: output });
      // Capture the actual prepared print pages, then simulate the system dialog.
      // No printer receives a job during this test.
      main.webContents.print = async (_options, callback) => {
        try {
          const pages = await main.webContents.executeJavaScript('Array.from(document.querySelectorAll("#print-root .print-sheet img"), image => image.src)');
          main.formsPrinted.push(pages);
          callback(true);
        } catch (error) { callback(false, error.message); }
      };
    }, { openPath, output });
    await window.getByRole('button', { name: /Apri un PDF/ }).click();
    await window.getByRole('heading', { name: path.basename(openPath), exact: true }).waitFor();
    await expect(window.locator('.form-banner')).toContainText('Modulo compilabile');
    await expect(window.locator('.page-loading')).toHaveCount(0);
    return { app, window };
    } catch (error) { await close(app); throw error; }
  }
  async function close(app) {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.removeAllListeners('close'))).catch(() => {});
    await app.close();
  }
  let first;
  let selectedState;
  try {
    first = await launch(input);
    const { app, window } = first;
    assert.equal(await window.evaluate(() => typeof window.require), 'undefined');
    await window.getByLabel('Nome completo', { exact: true }).fill('Mario Rossi');
    await window.getByRole('checkbox', { name: 'Consenso', exact: true }).check();
    const radios = window.locator('input[type=radio][data-field-name="Scelta"]');
    selectedState = await radios.nth(1).getAttribute('value');
    await radios.nth(1).check();
    await expect(radios.nth(0)).not.toBeChecked();
    await window.getByLabel('Paese', { exact: true }).selectOption('FR');
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].formsDirty)).toBe(true);
    await window.getByRole('button', { name: 'Pagina successiva', exact: true }).click();
    await expect(window.getByLabel('Nome completo', { exact: true })).toHaveValue('Mario Rossi');
    await window.getByLabel('Note', { exact: true }).fill('Prima riga: città e caffè\nSeconda riga');
    await window.getByRole('button', { name: 'Salva copia', exact: true }).click();
    await expect(window.locator('.toast')).toContainText('Copia salvata');
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].formsDirty)).toBe(false);
    const saved = (await PDFDocument.load(await fs.readFile(output))).getForm();
    assert.equal(saved.getTextField('Nome completo').getText(), 'Mario Rossi');
    assert.equal(saved.getTextField('Nome completo').acroField.getWidgets().length, 2);
    assert.equal(saved.getCheckBox('Consenso').isChecked(), true);
    assert.equal(saved.getRadioGroup('Scelta').acroField.getValue().decodeText(), selectedState);
    assert.deepEqual(saved.getDropdown('Paese').acroField.getValues().map(value => value.decodeText()), ['FR']);
    assert.equal(saved.getTextField('Note').getText(), 'Prima riga: città e caffè\nSeconda riga');
    await window.locator('button.print-button').click();
    await expect(window.locator('.busy-overlay')).toHaveCount(0);
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].formsPrinted.length)).toBe(1);
    await window.getByLabel('Nome completo', { exact: true }).fill('Anna Verdi - stampa aggiornata');
    await window.locator('button.print-button').click();
    await expect(window.locator('.busy-overlay')).toHaveCount(0);
    const printing = await app.evaluate(({ BrowserWindow }) => {
      const captures = BrowserWindow.getAllWindows()[0].formsPrinted;
      return { counts: captures.map(pages => pages.length), changed: captures.length === 2 && captures[0][0] !== captures[1][0] && captures[0][1] !== captures[1][1] };
    });
    assert.deepEqual(printing.counts, [2, 2]);
    assert.equal(printing.changed, true, 'Print must include unsaved field edits on both repeated widgets');
    await window.getByRole('button', { name: 'Salva copia', exact: true }).click();
    await expect(window.locator('.unsaved-dot')).toHaveCount(0);
    assert.equal((await PDFDocument.load(await fs.readFile(output))).getForm().getTextField('Nome completo').getText(), 'Anna Verdi - stampa aggiornata');
    await window.screenshot({ path: path.join(resultDir, 'forms-installed.png') });
    assert.equal(await window.getByRole('alert').count(), 0);
  } finally { if (first) await close(first.app); }

  let reopened;
  try {
    reopened = await launch(output);
    const { window } = reopened;
    await expect(window.getByLabel('Nome completo', { exact: true })).toHaveValue('Anna Verdi - stampa aggiornata');
    await expect(window.getByRole('checkbox', { name: 'Consenso', exact: true })).toBeChecked();
    await expect(window.locator('input[type=radio][data-field-name="Scelta"]').nth(1)).toBeChecked();
    await expect(window.getByLabel('Paese', { exact: true })).toHaveValue('FR');
    await window.getByRole('button', { name: 'Pagina successiva', exact: true }).click();
    await expect(window.getByLabel('Note', { exact: true })).toHaveValue('Prima riga: città e caffè\nSeconda riga');
    await window.getByLabel('Note', { exact: true }).fill('Ancora compilabile dopo il riavvio');
    await window.getByRole('button', { name: 'Salva copia', exact: true }).click();
    await expect(window.locator('.unsaved-dot')).toHaveCount(0);
    assert.equal((await PDFDocument.load(await fs.readFile(output))).getForm().getTextField('Note').getText(), 'Ancora compilabile dopo il riavvio');
    assert.deepEqual(errors, []);
    console.log('PASS: installed AcroForm controls, native save, radio/choice exports, dirty IPC, updated print pages and full restart.');
  } finally { if (reopened) await close(reopened.app); }
})().catch(error => { console.error(error); process.exitCode = 1; });
