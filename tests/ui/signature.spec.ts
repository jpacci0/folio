import { test, expect } from '@playwright/test';

test('Image signature is remembered, exportable, replaceable and removable', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.goto('/');
  await page.getByRole('button', { name: /Vuoi dare un/ }).click();
  await page.getByRole('button', { name: 'Firma', exact: true }).click();
  await page.getByRole('button', { name: 'Crea la tua firma' }).click();
  await page.getByRole('button', { name: 'Importa immagine' }).click();
  await page.getByLabel('Immagine della firma').setInputFiles({ name: 'invalid.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('non è leggibile');
  await expect(page.getByRole('button', { name: 'Usa questa firma' })).toBeDisabled();
  await page.getByLabel('Immagine della firma').setInputFiles('public/jfolio-icon.png');
  await page.getByRole('button', { name: 'Usa questa firma' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: /Vuoi dare un/ }).click();
  await page.getByRole('button', { name: 'Firma', exact: true }).click();
  await expect(page.locator('.signature-preview image')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Cambia firma' })).toBeEnabled();
  await expect(page.locator('.page-loading')).toHaveCount(0);
  await page.locator('.annotations').click({ position: { x: 120, y: 150 } });
  await expect(page.locator('.annotations image')).toHaveCount(1);
  const initial = await page.locator('.annotations image').boundingBox();
  expect(initial!.width / initial!.height).toBeCloseTo(1, 1);
  await page.getByLabel(/Larghezza/).fill('45');
  const resized = await page.locator('.annotations image').boundingBox();
  expect(resized!.width / resized!.height).toBeCloseTo(1, 1);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Salva copia' }).click();
  expect((await downloaded).suggestedFilename()).toContain('modificato.pdf');
  await page.getByRole('button', { name: 'Elimina firma salvata' }).click();
  await expect(page.locator('.signature-preview')).toHaveCount(0);
  await expect(page.locator('.annotations image')).toHaveCount(1);
  await page.reload();
  await page.getByRole('button', { name: /Vuoi dare un/ }).click();
  await page.getByRole('button', { name: 'Firma', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Crea la tua firma' })).toBeEnabled();
});

test('Welcome has no trailing vertical scroll at desktop sizes; PDFs still scroll', async ({ page }) => {
  for (const [width, height] of [[1500, 980], [1366, 768], [1920, 1080], [960, 640]]) {
    await page.setViewportSize({ width, height }); await page.goto('/');
    await page.getByRole('heading', { name: /I tuoi PDF/ }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const dimensions = await page.evaluate(() => {
      const w = document.querySelector('.workspace')!;
      return { document: document.documentElement.scrollHeight - innerHeight, workspace: w.scrollHeight - w.clientHeight };
    });
    console.log('Welcome layout', width, height, dimensions);
    expect(dimensions.document).toBe(0); expect(dimensions.workspace).toBeLessThanOrEqual(1);
  }
  await page.getByRole('button', { name: /Vuoi dare un/ }).click();
  await expect(page.locator('.paper canvas')).toBeVisible();
  await expect(page.locator('.page-loading')).toHaveCount(0);
  const overflow = await page.locator('.workspace').evaluate(w => w.scrollHeight - w.clientHeight);
  expect(overflow).toBeGreaterThan(0);
});
