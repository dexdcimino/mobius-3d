// The portfolio's featured video of the viewer: about a minute of the REAL
// build being used, recorded frame by frame on a virtual clock so it is smooth
// however slowly this machine renders, with a drawn cursor (a headless browser
// has none) that eases between the controls it presses.
//
//   npm run build && node tools/video.mjs out.mp4 [--seconds 60] [--audio music.m4a]
//
// Every frame advances the page's clock by exactly 1/30 s -- animation, orbit,
// the swatch mark -- and a JPEG of it is piped straight to ffmpeg. CSS
// transitions run on real time and finish between two frames, so a hover
// snaps rather than fades; nothing here leans on one.
//
// It is silent. --audio muxes a track in and fades it out with the picture;
// without one there is no audio stream at all, so a player shows no volume
// control for a sound that is not there.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const serveDist = require('../verification/serve.cjs');
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args.splice(i, 2)[1]; };
const AUDIO = flag('--audio'), SECONDS = Number(flag('--seconds', 60));
const OUT = resolve(args[0] || 'mobius.mp4');
// 16:10, the shape of the portfolio's featured frame, so it fills it uncropped.
const FPS = 30, W = 1280, H = 800, SCALE = 1.5;

const served = await serveDist();
const browser = await chromium.launch(serveDist.launchOptions());
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
const cdp = await page.context().newCDPSession(page);
await page.clock.install();
await page.goto(`${served.origin}?sample=knot`);
await page.waitForFunction(() => window.viewerReady && /triangles/.test(window.mobiusDebug.statsText));
await page.waitForTimeout(1200);
// At this height the panel scrolls and View -- the grid and Auto orbit -- is
// below the fold, so the two sections the video never touches start shut and
// the panel is scrolled just far enough to show them.
await page.evaluate(() => {
  for (const d of document.querySelectorAll('#controls-panel .panel-controls > details')) if (/^(Surface|Model)$/.test(d.querySelector('summary').textContent)) d.open = false;
  document.querySelector('.background-row').scrollIntoView({ block: 'nearest', behavior: 'instant' });
});
await page.clock.pauseAt(Date.now() + 1000);

const total = SECONDS * FPS;
const fade = Math.round(FPS * 1.2);
const filters = `scale=${W}:${H}:flags=lanczos,fade=t=in:st=0:d=0.6,fade=t=out:st=${(total - fade) / FPS}:d=${fade / FPS},format=yuv420p`;
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  ...(AUDIO ? ['-i', AUDIO] : []), '-vf', filters, '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-profile:v', 'high',
  '-g', String(FPS * 2), '-movflags', '+faststart',
  ...(AUDIO ? ['-c:a', 'aac', '-b:a', '160k', '-af', `afade=t=out:st=${(total - fade) / FPS}:d=${fade / FPS}`, '-shortest'] : ['-an']), OUT],
  { stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = new Promise((ok, fail) => ff.on('close', code => code ? fail(new Error(`ffmpeg exited ${code}`)) : ok()));

// The cursor: an arrow, drawn over everything, that the script moves and the
// real mouse follows so hovers and presses land where it points.
await page.evaluate(() => {
  const c = document.createElement('div');
  c.id = 'rec-cursor';
  c.innerHTML = '<svg width="32" height="32" viewBox="0 0 26 26"><path d="M3 2v19.5l5.2-4.9 3.4 7.6 3.6-1.6-3.4-7.4H19Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg><i></i>';
  c.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))';
  const ring = c.querySelector('i');
  ring.style.cssText = 'position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:50%;border:2px solid #fff;opacity:0;';
  document.body.appendChild(c);
});

let frame = 0, x = W * .62, y = H * 1.08, press = 0;
async function shot() {
  if (frame >= total) return;
  await page.evaluate(([x, y, p]) => {
    const c = document.getElementById('rec-cursor');
    c.style.transform = `translate(${x - 3}px, ${y - 2}px)`;
    const ring = c.lastChild;
    ring.style.opacity = p > 0 ? String(p) : '0';
    ring.style.transform = `scale(${1.6 - p * .6})`;
  }, [x, y, press]);
  await page.clock.runFor(1000 / FPS);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 94 });
  if (!ff.stdin.write(Buffer.from(data, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
  frame++; press = Math.max(0, press - .12);
  if (frame % FPS === 0) process.stdout.write(`\r${frame / FPS}s / ${SECONDS}s`);
}
const ease = p => p < .5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
const wait = async s => { for (let i = Math.round(s * FPS); i > 0; i--) await shot(); };
// Eases along a shallow arc, as a hand does, and the real mouse follows.
async function moveTo(tx, ty, s = .9) {
  const sx = x, sy = y, n = Math.max(1, Math.round(s * FPS));
  const bend = Math.hypot(tx - sx, ty - sy) * .12;
  for (let i = 1; i <= n; i++) {
    const p = ease(i / n), arc = Math.sin(Math.PI * p) * bend;
    x = sx + (tx - sx) * p - (ty - sy) / (Math.hypot(tx - sx, ty - sy) || 1) * arc;
    y = sy + (ty - sy) * p + (tx - sx) / (Math.hypot(tx - sx, ty - sy) || 1) * arc;
    await page.mouse.move(x, y);
    await shot();
  }
}
async function centre(selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`nothing to point at: ${selector}`);
  // A control scrolled out of its panel still has a box; a press there lands
  // on whatever covers it. Refuse rather than record a dead click.
  const hit = await page.evaluate(([s, x, y]) => { const el = document.querySelector(s), at = document.elementFromPoint(x, y); return !!el && !!at && (el === at || el.contains(at) || at.contains(el)); },
    [selector.replace(/:text-is\(.*\)$/, ''), box.x + box.width / 2, box.y + box.height / 2]);
  if (!hit && !/:text-is/.test(selector)) throw new Error(`${selector} is covered or off screen`);
  return [box.x + box.width / 2, box.y + box.height / 2, box];
}
async function click(selector, s) {
  const [cx, cy] = await centre(selector);
  await moveTo(cx, cy, s);
  await wait(.15);
  await page.mouse.down(); press = 1; await shot(); await shot();
  await page.mouse.up(); await wait(.35);
}
async function drag(tx, ty, s) { await page.mouse.down(); await moveTo(tx, ty, s); await page.mouse.up(); }
async function choose(select, text) {
  await click(`#${select}-button`);
  await wait(.4);
  await click(`#${select}-list li:text-is("${text}")`, .55);
}

try {
  // 0-5 s. The knot as the preview opens: green, fluted, playing Wave.
  await wait(1.6);
  await moveTo(W * .44, H * .62, 1.6);
  await wait(.8);

  // Auto orbit on.
  await click('#spin', 1.1);
  await wait(2.2);

  // 8-14 s. Pulse.
  await choose('anim-clip', 'Pulse');
  await wait(2.4);

  // 14-20 s. The first accent change.
  await click('.accent-swatch[data-accent="Orange"]', 1.1);
  await wait(2.6);

  // 20-28 s. Orbit by hand: auto orbit off, a slow drag round and over.
  await click('#spin', 1);
  await moveTo(W * .30, H * .40, 1);
  await drag(W * .52, H * .52, 2.4);
  await wait(1.2);

  // 28-34 s. Hold Bulge on its slider while Pulse plays on.
  const [, sy, slider] = await centre('#shape-weight');
  await moveTo(slider.x + slider.width * .45, sy, 1.1);
  await page.mouse.down(); press = 1;
  await moveTo(slider.x + slider.width * .82, sy, 1.4);
  await page.mouse.up();
  await wait(1.8);

  // 34-40 s. Grid off and on again, and Wave back.
  await click('#grid', 1);
  await wait(1.6);
  await choose('anim-clip', 'Wave');
  await wait(1.2);
  await click('#grid', 1);
  await wait(1.2);

  // 40-46 s. The second accent change, auto orbit back on.
  await click('.accent-swatch[data-accent="Violet"]', 1.1);
  await wait(1.6);
  await click('#spin', 1);
  await wait(1.8);

  // 46-52 s. Pulse again, then the third accent change.
  await choose('anim-clip', 'Pulse');
  await wait(1.6);
  await click('.accent-swatch[data-accent="Blue"]', 1.1);
  await wait(1.2);

  // The rest: the cursor leaves and the knot turns on its own.
  await moveTo(W * .5, H * 1.1, 1.6);
  while (frame < total) await shot();
} finally {
  ff.stdin.end();
  await ffDone.catch(error => { console.error(error.message); process.exitCode = 1; });
  await browser.close();
  served.close();
}
console.log(`\nvideo: ${frame} frames at ${FPS} fps (${(frame / FPS).toFixed(1)} s) -> ${OUT}${AUDIO ? ' with audio' : ', silent'}`);
