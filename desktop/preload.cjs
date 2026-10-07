const { contextBridge, ipcRenderer } = require('electron');
// The whole of what the page can ask the desktop for: open the native file
// dialog, say it is ready, and be handed files. No paths, no fs, no Node.
contextBridge.exposeInMainWorld('mobiusDesktop', {
  open: () => ipcRenderer.invoke('viewer:choose'),
  ready: () => ipcRenderer.send('viewer:ready'),
  onFiles: callback => ipcRenderer.on('viewer:files', (_event, payload) => callback(payload)),
});
