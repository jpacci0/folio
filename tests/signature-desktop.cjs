const { _electron: electron, expect } = require('@playwright/test');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const env = { ...process.env, JFOLIO_TEST_PROFILE: randomUUID() };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.FOLIO_TEST_EXECUTABLE;
async function session(check) {
  const app = await electron.launch({ executablePath, args: executablePath ? ['--test'] : ['.', '--test'], env, timeout: 30000 });
  try {
    const page = await app.firstWindow(); page.setDefaultTimeout(15000);
    await page.getByRole('button', { name: /Vuoi dare un/ }).click();
    await page.getByRole('button', { name: 'Firma', exact: true }).click();
    await check(page);
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally { await app.close(); }
}
(async () => {
  await session(async page => {
    await page.getByRole('button', { name: 'Crea la tua firma' }).click();
    const pad = await page.locator('.signature-pad').boundingBox();
    await page.mouse.move(pad.x + 80, pad.y + 80); await page.mouse.down();
    await page.mouse.move(pad.x + 130, pad.y + 150, { steps: 10 });
    await page.mouse.move(pad.x + 300, pad.y + 100, { steps: 15 }); await page.mouse.up();
    await page.getByRole('button', { name: 'Usa questa firma' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
  await session(async page => {
    await expect(page.locator('.signature-preview polyline')).toHaveCount(1);
    await page.getByRole('button', { name: 'Cambia firma' }).click();
    await page.getByRole('button', { name: 'Importa immagine' }).click();
    await page.getByLabel('Immagine della firma').setInputFiles(path.resolve('public/jfolio-icon.png'));
    await page.getByRole('button', { name: 'Usa questa firma' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
  await session(async page => {
    await expect(page.locator('.signature-preview image')).toHaveCount(1);
    await page.screenshot({ path: 'test-results/native-saved-signature.png' });
    await page.getByRole('button', { name: 'Elimina firma salvata' }).click();
    await expect(page.locator('.signature-preview')).toHaveCount(0);
  });
  await session(async page => {
    await expect(page.getByRole('button', { name: 'Crea la tua firma' })).toBeEnabled();
    await expect(page.locator('.signature-preview')).toHaveCount(0);
  });
  console.log('PASS: drawn and imported signatures survive full desktop restarts; deletion persists.');
})().catch(error => { console.error(error); process.exitCode = 1; });
