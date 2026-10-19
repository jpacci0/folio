import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui', timeout: 45000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 1500, height: 1000 }, headless: true, screenshot: 'only-on-failure', launchOptions: { chromiumSandbox: true, ...(process.env.PLAYWRIGHT_BROWSER_PATH ? { executablePath: process.env.PLAYWRIGHT_BROWSER_PATH } : {}) } },
  webServer: { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
});
