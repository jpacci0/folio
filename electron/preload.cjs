const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('folio', {
  loadSignature: () => ipcRenderer.invoke('signature:load'),
  saveSignature: (value) => ipcRenderer.invoke('signature:save', value),
  open: () => ipcRenderer.invoke('pdf:open'),
  save: (name, bytes) => ipcRenderer.invoke('pdf:save', name, bytes),
  print: () => ipcRenderer.invoke('pdf:print'),
  dirty: (value) => ipcRenderer.send('document:dirty', value === true),
});
