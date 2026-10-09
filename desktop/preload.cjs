const { contextBridge, ipcRenderer } = require('electron');
// The whole of what the page can ask the desktop for: open the native file
// dialog, say it is ready, be handed files, and hear about an update and
// answer it (ask, yes, or the release page). No paths, no fs, no Node.
contextBridge.exposeInMainWorld('mobiusDesktop', {
  open: () => ipcRenderer.invoke('viewer:choose'),
  ready: () => ipcRenderer.send('viewer:ready'),
  onFiles: callback => ipcRenderer.on('viewer:files', (_event, payload) => callback(payload)),
  onUpdate: callback => { ipcRenderer.on('viewer:update', (_event, payload) => callback(payload)); ipcRenderer.send('viewer:update-ask'); },
  update: () => ipcRenderer.send('viewer:update-yes'),
  updatePage: () => ipcRenderer.send('viewer:update-page'),
});
