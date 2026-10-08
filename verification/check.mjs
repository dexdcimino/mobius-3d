// The viewer, driven in a real browser, served the way the portfolio serves it.
//
//   npm run build && node verification/check.mjs
//
// It serves dist/ at /mobius/ with the same Content-Security-Policy header the
// site sends for that path, and a host page that embeds it in an iframe with
// the same sandbox flags the site's app overlay uses -- because a viewer that
// works as a bare page and fails inside the overlay has failed where it counts.
//
// FALSELY PASSES IF: a fixture never reaches the code it names. So the
// compressed fixtures are asserted compressed before they are opened, the
// heavy model is asserted to be heavy, and every "it loaded" reads the
// triangle count the viewer itself printed.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');
const FIX = join(ROOT, 'verification', 'fixtures');
if (!existsSync(join(DIST, 'index.html'))) throw new Error('no dist/ -- run npm run build first');

// The header the portfolio sends for /mobius/(.*). Kept word for word with
// vercel.json in the site repo; if one changes, change both.
export const SITE_CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; " +
  "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' data: blob:; " +
  "font-src 'self'; frame-ancestors 'self'; base-uri 'none'; object-src 'none'";
// The overlay's sandbox, plus allow-downloads, which the site adds for this card.
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.txt': 'text/plain' };
const HOST = `<!doctype html><meta charset="utf-8"><title>host</title>
<style>html,body{margin:0;height:100%;background:#111}dialog{padding:0;border:0;width:90vw;height:86vh;border-radius:22px;overflow:hidden}iframe{width:100%;height:100%;border:0}</style>
<link rel="icon" href="data:,"><dialog id="d"><iframe id="f" sandbox="${SANDBOX}"></iframe></dialog>
<script>
  const d = document.getElementById('d'), f = document.getElementById('f');
  /* The portfolio's own Escape rule, copied: close the overlay on an Escape
     inside the frame that nothing in the frame claimed, read a tick late. */
  f.addEventListener('load', () => f.contentDocument.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    setTimeout(() => { if (!e.defaultPrevented && d.open) d.close(); }, 0);
  }));
  window.openViewer = q => { f.src = '/mobius/?embed=1' + (q || ''); d.showModal(); };
</script>`;

const requests = [];
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  requests.push(path);
  if (path === '/host.html') { res.writeHead(200, { 'content-type': MIME['.html'] }); res.end(HOST); return; }
  if (path.startsWith('/mobius/')) {
    const rel = path.slice('/mobius/'.length) || 'index.html';
    const file = resolve(DIST, rel);
    if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'content-security-policy': SITE_CSP });
      res.end(body);
    } catch { res.writeHead(404).end(); }
    return;
  }
  res.writeHead(404).end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p));
if (!CHROME) throw new Error('no Chrome or Edge found -- set CHROME');

let pass = 0; const fail = [];
const note = (ok, why) => { if (ok) pass++; else fail.push(why); };

const TMP = join(tmpdir(), `mobius-check-${process.pid}`);
await mkdir(TMP, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  await page.goto(`${ORIGIN}/host.html`);
  await page.evaluate(() => window.openViewer('&sample=knot'));
  const frame = await (await page.waitForSelector('#f')).contentFrame();
  await frame.waitForFunction(() => window.viewerReady === true, null, { timeout: 30000 });
  const stats = () => frame.evaluate(() => (window.mobiusDebug?.statsText || ''));
  const card = () => frame.evaluate(() => {
    const c = document.getElementById('error-card');
    return c.hidden ? null : { title: document.getElementById('error-title').textContent, body: document.getElementById('error-body').textContent };
  });

  // ---- 1. it starts, it is Mobius, and the sample is the knot -------------
  const head = await frame.evaluate(() => ({ h1: document.querySelector('header h1').textContent, title: document.title }));
  note(head.h1 === 'Mobius 3D' && /Mobius 3D/.test(head.title), `the header reads "${head.h1}" / "${head.title}"`);
  await frame.waitForFunction(() => /triangles/.test((window.mobiusDebug?.statsText || '')), null, { timeout: 30000 });
  note(/28,800 triangles/.test(await stats()), `the sample knot reports "${await stats()}"`);
  // A first visit opens on green (Dex).
  const first = await frame.evaluate(() => document.getElementById('accent-name').textContent);
  note(first === 'Green', `a first visit's accent is ${first}`);

  // ---- 2. render on demand: an idle viewer draws NOTHING ------------------
  // The sample's Wave plays on open (Dex, 2026-10-08), so it is drawing; a
  // PAUSED viewer is the idle one, and it must stop.
  // (After the shader compiles: on a software GPU that alone can take a second.)
  await page.waitForTimeout(1500);
  const p0 = await frame.evaluate(() => [window.mobiusDebug.playing, window.mobiusDebug.frames]);
  await page.waitForTimeout(1500);
  const p1 = await frame.evaluate(() => window.mobiusDebug.frames);
  note(p0[0] && p1 > p0[1] + 2, `the sample's animation is not playing on open: playing=${p0[0]}, ${p1 - p0[1]} frames in 1.5s`);
  console.log(`animation on open: ${p1 - p0[1]} frames in 1.5s`);
  await frame.click('#anim-play');
  await page.waitForTimeout(1500);   // let the damping settle
  const f0 = await frame.evaluate(() => window.mobiusDebug.frames);
  await page.waitForTimeout(1500);
  const f1 = await frame.evaluate(() => window.mobiusDebug.frames);
  note(f1 === f0, `an idle viewer drew ${f1 - f0} frames in 1.5s — it should draw none`);
  const box = await (await page.$('#f')).boundingBox();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.55, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(300);
  const f2 = await frame.evaluate(() => window.mobiusDebug.frames);
  note(f2 > f1, 'dragging the model drew no frames — render-on-demand never wakes');
  console.log(`render on demand: ${f1 - f0} frames idle, ${f2 - f1} for one drag`);

  // ---- 3. every format, through the real file input ------------------------
  const open = async (...names) => {
    await frame.setInputFiles('#files', names.map(n => (n.includes('/') || n.includes('\\')) ? n : join(FIX, n)));
    await frame.waitForFunction(() => document.getElementById('loading').hidden, null, { timeout: 120000 });
  };
  const FORMATS = ['triangle.glb', 'triangle.gltf', 'triangle.fbx', 'triangle.obj', 'triangle.ply', 'triangle.stl',
                   'triangle.dae', 'triangle.3mf', 'triangle.3ds', 'box.usdz'];
  note(FORMATS.length === 10, 'the format list was edited without updating the check');
  for (const name of FORMATS) {
    await open(name, ...(name === 'triangle.gltf' ? ['triangle.bin'] : []));
    const s = await stats(), c = await card();
    note(!c && /\d triangles?\b/.test(s), `${name}: ${c ? `error card "${c.title}"` : `stats "${s}"`}`);
  }
  // Textured OBJ: the MTL and the PNG have to come along.
  await open('textured.obj', 'textured.mtl', 'checker.png');
  note(!(await card()) && /triangles/.test(await stats()), 'textured OBJ + MTL + PNG did not open');

  // ---- 4. compressed glTF: the decoders, under the site's CSP --------------
  for (const [name, ext] of [['knot-draco.glb', 'KHR_draco_mesh_compression'], ['knot-meshopt.glb', 'EXT_meshopt_compression']]) {
    const bytes = await readFile(join(FIX, name));
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    note((json.extensionsRequired || []).includes(ext), `${name} does not REQUIRE ${ext} — it would pass without the decoder`);
    await open(name);
    const s = await stats(), c = await card();
    note(!c && /16,384 triangles/.test(s), `${name}: ${c ? `error card "${c.title}: ${c.body}"` : `stats "${s}"`}`);
  }
  // KTX2 has no fixture an encoder here can write, so its transcoder is made
  // to load for real: a fetch of the .js, a fetch of the .wasm, and the
  // compile, all under the same CSP as everything else.
  const ktx2 = await frame.evaluate(async () => {
    try { await window.mobiusDebug.ktx2Ready(); return 'ok'; } catch (e) { return String(e && e.message || e); }
  });
  note(ktx2 === 'ok', `the KTX2 transcoder did not initialise: ${ktx2}`);

  // ---- 5. a point cloud is drawn as points ---------------------------------
  await open('cloud.ply');
  note(/20,000 points/.test(await stats()) && !(await card()), `cloud.ply reports "${await stats()}"`);

  // ---- 6. the files that must fail, each with its own sentence -------------
  const FAILS = [
    ['broken.glb', /isn't a working \.glb/i, /glTF signature/i],
    ['renamed-blend.fbx', /isn't a working \.fbx/i, /BLEND/],
    ['ancient.fbx', /too old/i, /FBX 6\.1/],
    ['scene.blend', /Blender files can't be opened/i, /File → Export/],
  ];
  for (const [name, title, body] of FAILS) {
    await open(name);
    const c = await card();
    note(!!c && title.test(c.title) && body.test(c.body), `${name}: ${c ? `"${c.title}" / "${c.body}"` : 'no error card at all'}`);
  }
  await open('triangle.glb', 'triangle.stl');
  note(/one model at a time/i.test((await card())?.title || ''), 'two models at once did not say "one at a time"');
  await frame.click('#error-close');

  // ---- 7. a HEAVY model, parsed off the main thread -------------------------
  // 1.5 million triangles of binary STL (75 MB) and 1 million of OBJ text.
  // The assertion is about the page, not the parser: while it parses, the
  // longest gap between animation frames stays short, because the worker is
  // doing the work. A main-thread parse of the OBJ holds the page for seconds.
  const heavyStl = join(TMP, 'heavy.stl'), heavyObj = join(TMP, 'heavy.obj');
  {
    const tris = 1_500_000, buf = Buffer.alloc(84 + tris * 50);
    buf.writeUInt32LE(tris, 80);
    for (let i = 0; i < tris; i++) {
      const o = 84 + i * 50, a = i * 0.001, x = Math.cos(a) * (1 + i / tris), z = Math.sin(a) * (1 + i / tris), y = i / tris;
      buf.writeFloatLE(x, o + 12); buf.writeFloatLE(y, o + 16); buf.writeFloatLE(z, o + 20);
      buf.writeFloatLE(x + 0.01, o + 24); buf.writeFloatLE(y, o + 28); buf.writeFloatLE(z, o + 32);
      buf.writeFloatLE(x, o + 36); buf.writeFloatLE(y + 0.01, o + 40); buf.writeFloatLE(z, o + 44);
    }
    await writeFile(heavyStl, buf);
    const rows = 500, cols = 1000, lines = [];
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) lines.push(`v ${(c / cols * 4 - 2).toFixed(4)} ${Math.sin(c * 0.05 + r * 0.03).toFixed(4)} ${(r / rows * 2 - 1).toFixed(4)}`);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c + 1, b = a + cols + 1;
      lines.push(`f ${a} ${b} ${a + 1}`, `f ${b} ${b + 1} ${a + 1}`);
    }
    await writeFile(heavyObj, lines.join('\n'));
  }
  const sizeMB = async p => Math.round((await stat(p)).size / 1e6);
  console.log(`heavy fixtures: STL ${await sizeMB(heavyStl)} MB, OBJ ${await sizeMB(heavyObj)} MB`);
  for (const [path, tris] of [[heavyStl, '1,500,000'], [heavyObj, '1,000,000']]) {
    /* LONG TASKS, NOT FRAME GAPS. The first version timed the gap between
       animation frames, and headless Chrome on a software GPU stops delivering
       frames while a worker saturates the CPU -- a 2.2 s "freeze" with the
       main thread provably idle (a 16 ms timer kept ticking straight through
       it). The question is whether the MAIN THREAD was held, and the Long
       Tasks API answers exactly that: every task over 50 ms, with its length. */
    await frame.evaluate(() => {
      window.__long = []; 
      window.__obs = new PerformanceObserver(list => { for (const e of list.getEntries()) window.__long.push([e.startTime, e.duration]); });
      window.__obs.observe({ type: 'longtask' });
    });
    const t0 = Date.now();
    await open(path);
    await page.waitForTimeout(800);   // the first draw lands after the load resolves
    const ms = Date.now() - t0;
    /* Split at the moment the model was handed to the scene: everything before
       is reading, parsing and building -- what this check is about -- and
       everything after is the first DRAW, which on a shared CI runner's
       software GPU has measured 3.7 and 7.3 seconds for one frame of a million
       triangles while the parse stayed off this thread. The draw is printed,
       not gated: it measures the runner's CPU, not where the parse ran. */
    const [longest, draw] = await frame.evaluate(() => {
      window.__obs.disconnect();
      const at = window.mobiusDebug.shownAt, max = list => Math.round(Math.max(0, ...list.map(e => e[1])));
      return [max(window.__long.filter(e => e[0] < at)), max(window.__long.filter(e => e[0] >= at))];
    });
    const s = await stats();
    const file = basename(path);
    note(new RegExp(`${tris} triangles`).test(s), `${file}: stats "${s}" ${JSON.stringify(await card())}`);
    console.log(`  ${file}: ${s.split('·')[0].trim()} in ${ms} ms, longest main-thread task ${longest} ms before the scene, ${draw} ms drawing`);
    /* What is allowed: building the scene and the first draw of the uploaded
       geometry, each a few hundred ms on a SOFTWARE GPU. What is refused: the
       parse itself on this thread -- seconds, in one task. */
    // 2 s: passing runs measured 376-805 ms on a software GPU, and the same
    // OBJ parsed on the main thread measured 6,450 ms. Room for a slow CI
    // machine on one side, three times the margin on the other.
    note(longest < 2000, `the main thread was held for ${longest} ms in one task while ${file} loaded — the parse is not off the main thread`);
  }

  // ---- 8. Cancel stops a worker parse --------------------------------------
  await frame.setInputFiles('#files', heavyObj);
  await frame.waitForFunction(() => !document.getElementById('loading').hidden && !document.getElementById('loading-cancel').hidden, null, { timeout: 10000 });
  /* Pressed the INSTANT the card shows, from inside the page. A fast machine
     (GitHub's runners) parses this OBJ before a pointer click finishes waiting
     for the button to be "stable", and the card is gone by the time it lands. */
  await frame.evaluate(() => document.getElementById('loading-cancel').click());
  await frame.waitForFunction(() => document.getElementById('loading').hidden, null, { timeout: 5000 });
  const afterCancel = await frame.evaluate(() => ({ empty: !document.getElementById('empty').hidden, stats: (window.mobiusDebug?.statsText || '') }));
  note(afterCancel.empty && !afterCancel.stats && !(await card()), `after Cancel: ${JSON.stringify(afterCancel)}`);

  // ---- 9. Escape is claimed by what it closes, inside the overlay ----------
  await frame.click('#load-sample');
  await frame.click('#background');
  await frame.waitForFunction(() => document.getElementById('background-picker').open);
  await frame.focus('#color-hex');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const esc1 = await frame.evaluate(() => document.getElementById('background-picker').open);
  const host1 = await page.evaluate(() => document.getElementById('d').open);
  note(!esc1 && host1, `Escape in the picker: picker open=${esc1}, overlay open=${host1} — it must close only the picker`);
  await frame.focus('#open');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  note(!(await page.evaluate(() => document.getElementById('d').open)), 'a second Escape did not close the overlay');
  await page.evaluate(() => window.openViewer('&sample=knot'));
  await frame.waitForFunction(() => window.viewerReady === true && /triangles/.test((window.mobiusDebug?.statsText || '')));

  // ---- 10. the screenshot, without preserveDrawingBuffer, from the sandbox -
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), frame.click('#capture')]);
  const png = join(TMP, 'shot.png');
  await download.saveAs(png);
  const pngBytes = (await stat(png)).size;
  note(pngBytes > 20000, `the screenshot is ${pngBytes} bytes — a blank frame compresses to a few KB`);
  console.log(`screenshot: ${Math.round(pngBytes / 1024)} KB`);

  // ---- 10b. the controls (Dex, 2026-10-08) ---------------------------------
  // Wireframe must change what is DRAWN, which is why the
  // knot came down from 768,000 triangles: at that density it looked like
  // nothing happened. Asserted on the materials actually on the mesh.
  {
    const materials = () => frame.evaluate(() => window.mobiusDebug.materials());
    await frame.click('label:has(#wireframe)');
    const m1 = await materials();
    note(m1.length === 1 && m1[0].wireframe, `wireframe on the knot: ${JSON.stringify(m1)}`);
    // Flat shading was removed (Dex, 2026-10-08): no switch left behind.
    note(!(await frame.$('#flat')), 'the Flat shading switch is still on the page');
    // The drawn dropdown: same width as its button, five one-or-two word modes.
    await frame.click('#mode-button');
    const dd = await frame.evaluate(() => {
      const b = document.getElementById('mode-button').getBoundingClientRect(), l = document.getElementById('mode-list').getBoundingClientRect();
      return { shown: !document.getElementById('mode-list').hidden, same: Math.abs(b.width - l.width) < 1, items: [...document.querySelectorAll('#mode-list li')].map(li => li.textContent) };
    });
    note(dd.shown && dd.same && dd.items.join() === 'Normals,Grayscale,Vertex colors,Unlit,Material', `the shading list: ${JSON.stringify(dd)}`);
    await frame.click('#mode-list li:text-is("Grayscale")');
    const m2 = await materials();
    note(m2[0]?.type === 'MeshStandardMaterial' && m2[0].wireframe && (await frame.evaluate(() => document.getElementById('mode').value)) === 'clay',
         `Grayscale from the list: ${JSON.stringify(m2)}`);
    // Shift-click: a closed section opens all, an open one closes all.
    await frame.click('details:has(> summary:text-is("Lighting")) > summary', { modifiers: ['Shift'] });
    const allOpen = await frame.evaluate(() => [...document.querySelectorAll('.panel-controls details')].every(d => d.open));
    await frame.click('details:has(> summary:text-is("Lighting")) > summary', { modifiers: ['Shift'] });
    const allShut = await frame.evaluate(() => [...document.querySelectorAll('.panel-controls details')].every(d => !d.open));
    note(allOpen && allShut, `shift-click: all open ${allOpen}, all shut ${allShut}`);
    await frame.click('details:has(> summary:text-is("Surface")) > summary');
    // The Sample toggle and the four shapes, each repainting from the accent.
    await frame.click('details:has(> summary:text-is("Sample")) > summary');
    const shapes = [];
    for (const k of ['mobius', 'shell', 'klein', 'knot']) {
      await frame.click(`[data-sample="${k}"]`);
      shapes.push(await frame.evaluate(() => [document.getElementById('filename').textContent, window.mobiusDebug.statsText]));
    }
    note(new Set(shapes.map(s => s[0])).size === 4 && shapes.every(s => /triangles/.test(s[1])), `the four samples: ${JSON.stringify(shapes)}`);
    const tint = () => frame.evaluate(() => window.mobiusDebug.sampleTop());
    const before = await tint();
    await frame.click('[data-accent="Blue"]');
    const after = await tint();
    note(before && after && before !== after && after.b > after.r, `the sample did not follow the accent: ${JSON.stringify([before, after])}`);
    // The rim and the underlight are the accent, SATURATED -- not white with a
    // tint, which is what Dex asked to be rid of -- and the room follows it.
    const lit = await frame.evaluate(() => window.mobiusDebug.lighting());
    const vivid = c => c[2] > c[0] && Math.max(...c) - Math.min(...c) > .3 * Math.max(...c);
    note(vivid(lit.rim) && vivid(lit.under) && lit.shadow && lit.studio && lit.overGrid, `the lighting did not take the Blue accent: ${JSON.stringify(lit)}`);
    // The chosen swatch carries the morphing mark, and it is moving.
    const mk1 = await frame.evaluate(() => window.mobiusDebug.swatchMark);
    await frame.waitForFunction(d => window.mobiusDebug.swatchMark.path !== d, mk1.path, { timeout: 8000 }).catch(() => {});
    const mk2 = await frame.evaluate(() => window.mobiusDebug.swatchMark);
    note(mk1.on === 'Blue' && mk2.on === 'Blue' && /^M[\d.]+ [\d.]+(L[\d.]+ [\d.]+){71}Z$/.test(mk2.path) && mk1.path !== mk2.path,
         `the swatch mark: ${JSON.stringify([mk1.on, mk2.on, mk1.path?.slice(0, 30), mk2.path?.slice(0, 30)])}`);
    // It IS the swatch, not a shape inside one: the button's own circle is
    // gone, the mark covers its whole outline, and it is drawn in Blue.
    const whole = await frame.evaluate(() => {
      const b = document.querySelector('.accent-swatch[data-accent="Blue"]'), m = b.querySelector('.accent-mark');
      const br = b.getBoundingClientRect(), mr = m.getBoundingClientRect();
      return { bg: getComputedStyle(b).backgroundColor, fill: getComputedStyle(m.querySelector('path')).fill, swatch: b.style.getPropertyValue('--swatch'),
        fit: [mr.left - br.left, mr.top - br.top, mr.width - br.width, mr.height - br.height].map(n => Math.round(n)) };
    });
    const hexRgb = h => { const n = parseInt(h.trim().slice(1), 16); return `rgb(${n >> 16}, ${n >> 8 & 255}, ${n & 255})`; };
    note(whole.bg === 'rgba(0, 0, 0, 0)' && whole.fit.every(n => n === 0) && whole.fill === hexRgb(whole.swatch),
         `the pressed swatch is not the mark itself: ${JSON.stringify(whole)}`);
    await frame.click('#sample-toggle');
    const off = await frame.evaluate(() => ({ shown: window.mobiusDebug.shown, empty: !document.getElementById('empty').hidden, pressed: document.getElementById('sample-toggle').getAttribute('aria-pressed'), shadow: window.mobiusDebug.lighting().shadow }));
    note(off.shown === null && off.empty && off.pressed === 'false' && !off.shadow, `Sample off with nothing imported: ${JSON.stringify(off)}`);
    await frame.click('#sample-toggle');
    // Reset asks first, then puts every option back.
    await frame.click('#reset');
    const asked = await frame.textContent('#reset');
    await frame.click('#reset');
    const reset = await frame.evaluate(() => ({ mode: document.getElementById('mode').value, label: document.getElementById('mode-button').textContent,
      wire: document.getElementById('wireframe').checked, accent: document.getElementById('accent-name').textContent }));
    note(asked === 'Sure?' && reset.mode === 'material' && reset.label === 'Material' && !reset.wire && reset.accent === 'Green',
         `Reset: asked "${asked}", then ${JSON.stringify(reset)}`);
    console.log(`controls: ${shapes.map(s => s[0]).join(' / ')}; reset asked "${asked}"`);
  }

  // ---- 10c. animation, blend shapes, emissive (Dex, 2026-10-08) ------------
  {
    const state = () => frame.evaluate(() => ({
      timeline: !document.getElementById('timeline').hidden, playing: window.mobiusDebug.playing,
      clips: [...document.getElementById('anim-clip').options].map(o => o.textContent),
      shapes: document.getElementById('shapes-section').hidden ? null : [...document.getElementById('shape-pick').options].map(o => o.textContent),
      time: document.getElementById('anim-time').textContent, inf: window.mobiusDebug.influences(),
    }));
    // The sample: two clips, seven shapes, and a timeline clear of the panel.
    // (Reset, just above, left it playing.)
    if (!(await frame.evaluate(() => window.mobiusDebug.playing))) await frame.click('#anim-play');
    const s0 = await state();
    note(s0.timeline && s0.playing && s0.clips.join() === 'Wave,Pulse' && s0.shapes?.length === 7 && s0.shapes[0] === 'Bulge' && s0.inf[1] === .25,
         `the sample's motion: ${JSON.stringify(s0)}`);
    const geo = await frame.evaluate(() => {
      const t = document.getElementById('timeline').getBoundingClientRect(), a = document.querySelector('aside').getBoundingClientRect();
      return { right: t.right, panel: a.left, bottom: innerHeight - t.bottom };
    });
    note(geo.right <= geo.panel - 8 && geo.bottom >= 8, `the timeline runs under the panel: ${JSON.stringify(geo)}`);
    // Waited for, not slept: right after Reset the first frames wait on a
    // shader compile, which on CI's software GPU outlasted a 400 ms sleep.
    await frame.waitForFunction(t => document.getElementById('anim-time').textContent !== t, s0.time, { timeout: 10000 }).catch(() => {});
    const s1 = await state();
    note(s1.inf.join() !== s0.inf.join() && s1.time !== s0.time, `playing moved nothing: ${s0.time} -> ${s1.time}`);
    // Pause holds the pose; scrubbing moves it while paused.
    await frame.click('#anim-play');
    const held = await state();
    await page.waitForTimeout(400);
    note(JSON.stringify((await state()).inf) === JSON.stringify(held.inf) && !held.playing, 'pause did not hold the pose');
    await frame.evaluate(() => { const r = document.getElementById('anim-scrub'); r.value = '1'; r.dispatchEvent(new Event('input', { bubbles: true })); });
    const scrubbed = await state();
    note(/^1\.00 \/ 4\.00 s$/.test(scrubbed.time) && scrubbed.inf.join() !== held.inf.join(), `scrubbing to 1s: ${JSON.stringify(scrubbed)}`);
    // The clip list, from the drawn dropdown; speed 2x.
    await frame.click('#anim-clip-button');
    await frame.click('#anim-clip-list li:text-is("Pulse")');
    const pulse = await state();
    note(pulse.playing && /\/ 2\.00 s$/.test(pulse.time), `choosing Pulse: ${JSON.stringify(pulse)}`);
    await frame.click('#anim-speed-button');
    await frame.click('#anim-speed-list li:text-is("2×")');
    note(await frame.evaluate(() => document.getElementById('anim-speed').value) === '2', 'the speed list did not take 2×');
    // A blend shape slider does NOT pause the clip (Dex): Pulse keys Bulge and
    // Ridges, and with Bulge held at 0.8 the clip plays on -- the time moves,
    // Ridges keeps moving, and Bulge stays where the slider put it.
    await frame.evaluate(() => { const r = document.getElementById('shape-weight'); r.value = '0.8'; r.dispatchEvent(new Event('input', { bubbles: true })); });
    const shaped = await state();
    // Waited for: Ridges is a sine, and two reads a fixed time apart can land
    // on the same value either side of its peak.
    await frame.waitForFunction(w => window.mobiusDebug.influences()[1] !== w, shaped.inf[1], { timeout: 10000 }).catch(() => {});
    const later = await state();
    note(shaped.playing && later.playing && later.time !== shaped.time && shaped.inf[0] === .8 && later.inf[0] === .8 && later.inf[1] !== shaped.inf[1],
         `Bulge held at 0.8 while Pulse plays: ${JSON.stringify([shaped, later])}`);
    // Space pauses and plays.
    await frame.focus('#capture'); await frame.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('Space');
    note(!(await frame.evaluate(() => window.mobiusDebug.playing)), 'Space did not pause the animation');
    await page.keyboard.press('Space');
    note(await frame.evaluate(() => window.mobiusDebug.playing), 'Space did not start the animation');
    // An imported glTF with two clips and a blend shape; a still one hides it all.
    await open('animated.glb');
    const g = await state();
    note(!(await card()) && g.timeline && g.playing && g.clips.join() === 'Spin,Raise' && g.shapes?.join() === 'Raise', `animated.glb: ${JSON.stringify(g)}`);
    const info = await frame.evaluate(() => [document.querySelector('[data-info=animations]')?.textContent, document.querySelector('[data-info="blend shapes"]')?.textContent]);
    note(info[0] === '2' && info[1] === '1', `Model info for animated.glb: ${JSON.stringify(info)}`);
    // Emissive: the switch is live for a model that glows, and turns it off.
    const emissive = () => frame.evaluate(() => window.mobiusDebug.emissive());
    const lit = await emissive();
    await frame.click('details:has(> summary:text-is("Textures")) > summary');
    await frame.click('label:has([data-map=emissive])');
    const dark = await emissive();
    note(lit !== '000000' && lit !== null && dark === '000000', `the Emissive switch: ${lit} -> ${dark}`);
    await open('triangle.glb');
    const still = await state();
    note(!still.timeline && still.shapes === null && !still.playing, `a still model: ${JSON.stringify(still)}`);
    console.log(`motion: sample ${s0.clips.join('/')} with ${s0.shapes.length} shapes; animated.glb ${g.clips.join('/')}; emissive ${lit} -> ${dark}`);
    await frame.click('#sample-toggle');
  }

  // ---- 11. the GPU dropping the context says so ----------------------------
  await frame.evaluate(() => window.mobiusDebug.loseContext());
  await frame.waitForFunction(() => !document.getElementById('error-card').hidden, null, { timeout: 5000 }).catch(() => {});
  note(/graphics card/i.test((await card())?.title || ''), `a lost context showed ${JSON.stringify(await card())}`);

  // ---- 12. storage blocked, and a phone-width window -----------------------
  // Both from the original suite. An iframe's storage can be refused outright
  // by browser privacy settings, and the viewer must still start; and below
  // 680px the controls panel starts closed behind a button.
  {
    const blocked = await context.newPage();
    const blockedErrors = [];
    blocked.on('pageerror', e => blockedErrors.push(e.message));
    await blocked.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });
    });
    await blocked.goto(`${ORIGIN}/mobius/?sample=knot`);
    await blocked.waitForFunction(() => window.viewerReady === true && /triangles/.test((window.mobiusDebug?.statsText || '')), null, { timeout: 30000 }).catch(() => {});
    note(/28,800 triangles/.test(await blocked.evaluate(() => (window.mobiusDebug?.statsText || ''))) && !blockedErrors.length,
         `with storage refused: ${blockedErrors.join(' | ') || 'the sample never loaded'}`);
    await blocked.setViewportSize({ width: 600, height: 820 });
    // Waited for, as the original did: the media-query listener runs when the
    // resize lands, not on a schedule a sleep can guess.
    await blocked.waitForFunction(() => document.getElementById('controls-panel').hidden, null, { timeout: 5000 }).catch(() => {});
    const narrow = await blocked.evaluate(() => ({
      panel: document.getElementById('controls-panel').hidden,
      button: getComputedStyle(document.getElementById('toggle-controls')).display !== 'none',
    }));
    note(narrow.panel && narrow.button, `at 600px: panel hidden=${narrow.panel}, Controls button shown=${narrow.button}`);
    await blocked.close();
  }

  // ---- 13. nothing left the origin, and nothing went wrong quietly ----------
  const foreign = requests.filter(p => !p.startsWith('/mobius/') && p !== '/host.html');
  note(foreign.length === 0, `requests outside /mobius/: ${foreign.join(', ')}`);
  const decoders = requests.filter(p => p.includes('/decoders/'));
  note(decoders.some(p => p.endsWith('draco_decoder.wasm')) && decoders.some(p => p.endsWith('basis_transcoder.wasm')),
       `the decoders were never fetched: ${decoders.join(', ') || 'none'}`);
  // Expected: the deliberate failures log their exception, and the lost context.
  const unexpected = errors.filter(e => !/isn't a working|too old|FBX version|signature|BLEND|context|CONTEXT_LOST/i.test(e));
  note(unexpected.length === 0, `console/page errors: ${unexpected.join(' | ')}`);
} finally {
  await browser.close();
  server.close();
  await rm(TMP, { recursive: true, force: true });
}

console.log(`\nmobius check: ${pass} passed${fail.length ? `, ${fail.length} FAILED` : ''}`);
for (const f of fail) console.log(`  - ${f}`);
process.exit(fail.length ? 1 : 0);
