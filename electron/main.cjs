const { app, BrowserWindow, ipcMain, dialog, Menu, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
let mainWindow;
let dirty = false;
const MAX_SIZE = 150 * 1024 * 1024;
const dev = !app.isPackaged && process.argv.includes('--dev');
const testing = process.argv.includes('--test');
if (testing) app.setPath('userData', path.join(app.getPath('temp'), 'folio-tests', String(process.pid)));
const entry = dev ? 'http://127.0.0.1:5173/' : pathToFileURL(path.join(__dirname, '../dist/index.html')).href;
function trusted(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || event.senderFrame.url !== entry) throw new Error('Richiesta non consentita.');
}
function validateBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_SIZE || bytes.byteLength < 5 || Buffer.from(bytes.subarray(0, 5)).toString() !== '%PDF-') throw new Error('PDF non valido o troppo grande (massimo 150 MB).');
}
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
  mainWindow = new BrowserWindow({ width: 1500, height: 980, minWidth: 960, minHeight: 680, show: !testing, backgroundColor: '#f4f5f7', title: 'Folio', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, devTools: dev } });
  Menu.setApplicationMenu(null);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => { if (url !== entry) event.preventDefault(); });
  mainWindow.on('close', (event) => {
    if (dirty && dialog.showMessageBoxSync(mainWindow, { type: 'question', buttons: ['Continua a lavorare', 'Esci senza salvare'], defaultId: 0, cancelId: 0, title: 'Modifiche non salvate', message: 'Vuoi uscire senza salvare una copia del PDF?' }) !== 1) event.preventDefault();
  });
  mainWindow.loadURL(entry);
});
ipcMain.on('document:dirty', (event, value) => { trusted(event); dirty = value === true; });
ipcMain.handle('pdf:open', async (event) => {
  trusted(event);
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { title: 'Apri un PDF', filters: [{ name: 'Documenti PDF', extensions: ['pdf'] }], properties: ['openFile'] });
  if (canceled || !filePaths[0]) return null;
  if ((await fs.stat(filePaths[0])).size > MAX_SIZE) throw new Error('Il limite per un PDF è 150 MB.');
  const bytes = await fs.readFile(filePaths[0]); validateBytes(bytes);
  return { name: path.basename(filePaths[0]), bytes: new Uint8Array(bytes) };
});
ipcMain.handle('pdf:save', async (event, name, bytes) => {
  trusted(event); validateBytes(bytes);
  const safeName = path.basename(typeof name === 'string' ? name : 'documento.pdf').replace(/[<>:"/\\|?*]/g, '_');
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, { title: 'Salva una copia', defaultPath: safeName, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (canceled || !filePath) return false;
  await fs.writeFile(filePath, bytes); return true;
});
ipcMain.handle('pdf:print', async (event) => {
  trusted(event);
  return new Promise(resolve => mainWindow.webContents.print({ silent: false, printBackground: true }, (success, reason) => resolve({ success, reason })));
});
app.on('window-all-closed', () => app.quit());
