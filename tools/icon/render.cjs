// Renders the knot for the icon: grid off, paused, a chosen orbit, captured on black and on white
// through the app's own Save-screenshot path, then difference-matted to a transparent PNG.
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const DIST = require('path').resolve(__dirname, '../../dist'), OUT = process.argv[2];
const cfg = JSON.parse(process.argv[3] || '{}'); // {dx, dy, t, shadow, size}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm' };
const srv = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  try { const b = fs.readFileSync(path.join(DIST, p)); res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404).end(); } });
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: require('../../verification/serve.cjs').launchOptions().executablePath, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const size = cfg.size || 1024;
  const pg = await b.newPage({ viewport: { width: size, height: size } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(`http://127.0.0.1:${srv.address().port}/?sample=knot`);
  await pg.waitForFunction(() => window.viewerReady && /triangles/.test(window.mobiusDebug.statsText), null, { timeout: 30000 });
  await pg.waitForTimeout(300);
  await pg.evaluate(() => { const g = document.getElementById('grid'); if (g.checked) g.click(); });
  if (cfg.spinOff) await pg.evaluate(() => { const s = document.getElementById('spin'); if (s.checked) s.click(); });
  if (cfg.exp) await pg.evaluate(v => { const e = document.getElementById('exposure'); e.value = v; e.dispatchEvent(new Event('input')); }, cfg.exp);
  if (cfg.light) await pg.evaluate(v => { const e = document.getElementById('lighting'); e.value = v; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); }, cfg.light);
  await pg.waitForTimeout(cfg.t ?? 1500);
  await pg.keyboard.press('Space');
  if (cfg.dx || cfg.dy) { await pg.mouse.move(size*.3, size/2); await pg.mouse.down(); await pg.mouse.move(size*.3 + (cfg.dx||0), size/2 + (cfg.dy||0), { steps: 20 }); await pg.mouse.up(); }
  await pg.waitForTimeout(800);
  await pg.evaluate(() => { HTMLAnchorElement.prototype.click = function () { window.__png = this.href; }; });
  const grab = async hex => { await pg.evaluate(h => { const i = document.getElementById('color-hex'); i.value = h; i.dispatchEvent(new Event('change')); }, hex);
    await pg.waitForTimeout(200); await pg.evaluate(() => document.getElementById('capture').click()); return pg.evaluate(() => window.__png); };
  const black = await grab('#000000'), white = await grab('#FFFFFF');
  // alpha = 1 - (white - black); colour = black / alpha
  const out = await pg.evaluate(async ([a, bw, shadow]) => {
    const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
    const [A, B] = await Promise.all([load(a), load(bw)]);
    const c = document.createElement('canvas'); c.width = A.width; c.height = A.height; const x = c.getContext('2d');
    x.drawImage(A, 0, 0); const k = x.getImageData(0, 0, c.width, c.height);
    x.drawImage(B, 0, 0); const w = x.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < k.data.length; i += 4) {
      const d = ((w.data[i] - k.data[i]) + (w.data[i+1] - k.data[i+1]) + (w.data[i+2] - k.data[i+2])) / 3;
      const al = Math.max(0, Math.min(255, 255 - d));
      for (let j = 0; j < 3; j++) k.data[i+j] = al ? Math.min(255, k.data[i+j] * 255 / al) : 0;
      k.data[i+3] = al;
    }
    x.putImageData(k, 0, 0); return c.toDataURL('image/png');
  }, [black, white]);
  fs.writeFileSync(OUT, Buffer.from(out.split(',')[1], 'base64'));
  console.log(JSON.stringify({ inf: await pg.evaluate(() => window.mobiusDebug.influences()), playing: await pg.evaluate(() => window.mobiusDebug.playing), clip: await pg.evaluate(() => document.getElementById('anim-clip').value) }), errs);
  await b.close(); srv.close();
});
