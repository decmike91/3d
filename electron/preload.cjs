const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  http: (req) => ipcRenderer.invoke('http', req),
  saveFile: (name, content) => ipcRenderer.invoke('saveFile', name, content),
  discover: () => ipcRenderer.invoke('discover'),
});
