// The desktop app: the SAME dist/ the website serves, in its own window, with
// a narrow bridge for the one thing a web page cannot do -- be handed a file by
// the operating system ("Open with", a double-click, a drag onto the icon).
const { app, BrowserWindow, ipcMain, dialog, protocol, session, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const brand = require('./brand.json');
const { extensions } = require('./formats.json');
const { modelArgument, collectFiles } = require('./files.cjs');

const SCHEME = 'mobius';
const ORIGIN = `${SCHEME}://viewer`;
protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.setName(brand.name);
app.setAppUserModelId(brand.appId);
// Test profiles isolate preferences from an installed app; this never touches
// file associations. Normal launches use Electron's usual per-user directory.
if (process.env.MOBIUS_TEST_PROFILE) app.setPath('userData', process.env.MOBIUS_TEST_PROFILE);

const DIST = path.join(app.getAppPath(), 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8' };

let win, ready = false, pending = [], chain = Promise.resolve();
function deliver(filename) {
  if (!filename) return;
  if (!ready) { pending.push(filename); return; }
  chain = chain.then(async () => {
    try { win.webContents.send('viewer:files', await collectFiles(filename)); }
    catch (error) { win.webContents.send('viewer:files', { error: error.message }); }
  });
}

// macOS hands files over as an EVENT, not in argv -- both for "Open with" and
// for a drop on the Dock icon -- and it can arrive before the window exists.
app.on('open-file', (event, filename) => { event.preventDefault(); deliver(filename); });

if (!app.requestSingleInstanceLock()) app.quit();
else {
  pending.push(modelArgument(process.argv));
  app.on('second-instance', (_event, argv, cwd) => {
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
    deliver(modelArgument(argv, cwd));
  });
  app.whenReady().then(async () => {
    /* THE VIEWER GETS ITS OWN SESSION. Everything that keeps it offline -- no
       http(s) at all, no permission ever granted -- applies to this partition
       only, so the updater (which runs in the main process on the default
       session) can still reach GitHub Releases. Blocking the default session,
       as the first version did, would have quietly killed every update. */
    const viewer = session.fromPartition('persist:viewer');
    viewer.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    viewer.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }));
    viewer.protocol.handle(SCHEME, async request => {
      const url = new URL(request.url);
      if (url.host !== 'viewer') return new Response('', { status: 404 });
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.resolve(DIST, rel);
      // Nothing outside dist/, whatever the path says.
      if (file !== DIST && !file.startsWith(DIST + path.sep)) return new Response('', { status: 403 });
      try {
        return new Response(await fs.readFile(file), { headers: { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' } });
      } catch { return new Response('', { status: 404 }); }
    });

    win = new BrowserWindow({
      title: brand.name, width: 1200, height: 850, minWidth: 420, minHeight: 520, backgroundColor: '#0a1821', autoHideMenuBar: true,
      icon: path.join(__dirname, 'icon.png'),
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, session: viewer },
    });
    win.removeMenu();
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    const trusted = event => event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && event.senderFrame.url.startsWith(`${ORIGIN}/`);
    ipcMain.on('viewer:ready', event => {
      if (!trusted(event)) return;
      ready = true;
      for (const filename of pending) deliver(filename);
      pending = [];
    });
    ipcMain.handle('viewer:choose', async event => {
      if (!trusted(event)) throw new Error('Untrusted caller');
      const result = await dialog.showOpenDialog(win, { title: 'Open model', properties: ['openFile'], filters: [{ name: '3D models', extensions }] });
      if (!result.canceled) deliver(result.filePaths[0]);
    });
    win.webContents.on('did-start-loading', () => { ready = false; });
    await win.loadURL(`${ORIGIN}/`);

    /* UPDATES ASK FIRST (Dex, 2026-10-09). The build pushed to GitHub Releases
       is found here, but nothing downloads until the person says Yes on the
       viewer's bottom-left "Update?" prompt; the release's own notes ride
       along for its info tip. No hides it until a newer version (the viewer
       remembers which). Yes downloads, then quits, installs and reopens. An
       install that cannot replace itself (an unsigned macOS build, a .deb)
       says so and offers the release page instead. A failed CHECK is silent
       on purpose: offline is still a working viewer.
       Only in a packaged build, never in a test run, and never in a Microsoft
       Store install (process.windowsStore): the Store updates that one, and
       it must never replace itself with the GitHub installer. */
    if (app.isPackaged && !process.windowsStore && !process.env.MOBIUS_TEST_PROFILE) {
      let autoUpdater;
      try { ({ autoUpdater } = require('electron-updater')); } catch { /* updater missing from this build */ }
      if (autoUpdater) startUpdates(autoUpdater, trusted);
    }
  });
  app.on('window-all-closed', () => app.quit());
}

const RELEASES = 'https://github.com/dexdcimino/mobius-3d/releases/latest';
// GitHub hands the release body over as HTML; the tip wants a few plain lines.
function noteLines(notes) {
  const raw = Array.isArray(notes) ? notes.map(n => n.note || '').join('\n') : String(notes || '');
  return raw.replace(/<\/(p|li|h\d|div)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split('\n').map(line => line.replace(/^\s*[-*•]\s*/, '').replace(/\*\*|__|`/g, '').trim()).filter(Boolean).slice(0, 8);
}
function startUpdates(autoUpdater, trusted) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  let offered = null, installing = false;
  const send = payload => { if (win && !win.isDestroyed()) win.webContents.send('viewer:update', payload); };
  autoUpdater.on('update-available', info => {
    offered = { state: 'available', version: info.version, notes: noteLines(info.releaseNotes) };
    if (ready) send(offered);
  });
  autoUpdater.on('download-progress', p => send({ state: 'downloading', percent: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', () => {
    send({ state: 'installing' });
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  });
  autoUpdater.on('error', () => { if (installing) { installing = false; send({ state: 'failed' }); } });
  // A reload of the viewer asks again, and gets what was already found.
  ipcMain.on('viewer:update-ask', event => { if (trusted(event) && offered && !installing) event.sender.send('viewer:update', offered); });
  ipcMain.on('viewer:update-yes', event => {
    if (!trusted(event) || !offered || installing) return;
    installing = true;
    send({ state: 'downloading', percent: 0 });
    autoUpdater.downloadUpdate().catch(() => { installing = false; send({ state: 'failed' }); });
  });
  ipcMain.on('viewer:update-page', event => { if (trusted(event)) shell.openExternal(RELEASES); });
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, 6 * 60 * 60 * 1000);   // a window left open for days still hears about it
}
