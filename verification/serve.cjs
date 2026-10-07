// Serves dist/ over http for the browser checks. The viewer is a folder of
// files now (scripts, a worker, WebAssembly decoders), and a file:// page can
// fetch none of them -- so every check runs against a real origin.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const DIST = path.resolve(__dirname, '..', 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.txt': 'text/plain' };
module.exports = async function serveDist() {
  const server = http.createServer(async (req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(DIST, rel);
    if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
    try { res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(await fs.readFile(file)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  // Never the reason a finished check fails to exit.
  server.unref();
  return { origin: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() };
};

// The browser every check drives: Chrome or Edge, whichever this machine has.
const { existsSync } = require('node:fs');
module.exports.launchOptions = () => {
  const executablePath = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p));
  if (!executablePath) throw new Error('no Chrome or Edge found -- set CHROME');
  return { executablePath, headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] };
};
