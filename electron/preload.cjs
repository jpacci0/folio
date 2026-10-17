const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('folio', {
  open: () => ipcRenderer.invoke('pdf:open'),
  save: (name, bytes) => ipcRenderer.invoke('pdf:save', name, bytes),
  print: () => ipcRenderer.invoke('pdf:print'),
  dirty: (value) => ipcRenderer.send('document:dirty', value === true),
});
