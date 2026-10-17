const { _electron: electron } = require('@playwright/test');
const { PDFDocument } = require('pdf-lib');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const profile = path.resolve('test-results'); await fs.mkdir(profile, { recursive: true });
  const source = await PDFDocument.create(); source.addPage([595, 842]);
  const input = path.join(profile, 'native-input.pdf'); const output = path.join(profile, 'native-output.pdf');
  await fs.writeFile(input, await source.save());
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.FOLIO_TEST_EXECUTABLE;
  const app = await electron.launch({ executablePath, args: executablePath ? ['--test'] : ['.', '--test'], env, timeout: 30000 });
  try {
    const window = await app.firstWindow(); await window.waitForLoadState('domcontentloaded');
    window.setDefaultTimeout(15000);
    const errors = []; window.on('pageerror', e => errors.push(e.message));
    await window.getByRole('heading', { name: /I tuoi PDF/ }).waitFor();
    console.log('Desktop assets loaded');
    assert.equal(await window.evaluate(() => typeof window.folio.open), 'function');
    assert.equal(await window.evaluate(() => typeof window.require), 'undefined');
    await app.evaluate(({ dialog }, { input, output }) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [input] });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: output });
    }, { input, output });
    await window.getByRole('button', { name: /Apri un PDF/ }).click();
    await window.getByRole('heading', { name: 'native-input.pdf' }).waitFor();
    console.log('Native open passed');
    await window.locator('.page-loading').waitFor({ state: 'hidden' });
    await window.getByRole('button', { name: 'Testo', exact: true }).click();
    await window.getByLabel('Il tuo testo').fill('Salvataggio desktop: è tutto locale.');
    await window.locator('.annotations').click({ position: { x: 50, y: 100 } });
    await window.getByRole('button', { name: 'Salva copia' }).click();
    await window.locator('.toast').filter({ hasText: 'Copia salvata' }).waitFor();
    console.log('Native save passed');
    assert.equal((await PDFDocument.load(await fs.readFile(output))).getPageCount(), 1);
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].webContents.print = (_options, callback) => callback(true); });
    await window.getByRole('button', { name: 'Stampa', exact: true }).click();
    await window.locator('.busy-overlay').waitFor({ state: 'hidden' });
    assert.equal(await window.getByRole('alert').count(), 0);
    assert.deepEqual(errors, []);
    await window.screenshot({ path: path.join(profile, 'native-desktop.png') });
    console.log('PASS: packaged assets, sandboxed preload, native open/save, PDF export, print IPC.');
  } finally { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(w => w.removeAllListeners('close'))).catch(() => {}); await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
