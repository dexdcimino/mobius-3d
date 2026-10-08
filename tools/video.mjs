// The portfolio's featured video of the viewer: about a minute of the REAL
// build being used, recorded frame by frame on a virtual clock so it is smooth
// however slowly this machine renders, with a drawn cursor (a headless browser
// has none) that drifts between the controls it presses.
//
//   npm run build && node tools/video.mjs out.mp4 [--seconds 60] [--audio song.mp3 --audio-from 6] [--poster poster.png]
//
// Every frame advances the page's clock by exactly 1/30 s -- animation, orbit,
// the swatch mark -- and a JPEG of it is piped straight to ffmpeg. CSS
// transitions run on real time and finish between two frames, so a hover
// snaps rather than fades; nothing here leans on one.
//
// THE CUTS ARE ON THE MUSIC. The soundtrack is chillstep at about 95 BPM, so a
// bar is BAR seconds and every action lands on a bar line (`until`), with
// moves a bar or more long and eased in and out (Dex: slow, flowing, never
// jittery). --audio-from is where in the track the video starts: the track
// opens on six seconds of silence, and from 6 s its drop falls on the video's
// DROP, which the orange accent change is timed to.
//
// --audio muxes the track in and fades it with the picture; without one there
// is no audio stream at all, so a player shows no volume control for a sound
// that is not there. --poster saves the first frame, so the still a visitor
// sees before it plays is the shot it opens on.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const serveDist = require('../verification/serve.cjs');
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args.splice(i, 2)[1]; };
const AUDIO = flag('--audio'), AUDIO_FROM = Number(flag('--audio-from', 0)), SECONDS = Number(flag('--seconds', 60));
const POSTER = flag('--poster');
const OUT = resolve(args[0] || 'mobius.mp4');
// 4:3: the featured frame on a desktop runs about 1.15 to 1.4 wide, so this
// fills it with the least letterbox; the one-column 16:10 frame pillarboxes
// in the viewer's own background colour, which reads as more of the app.
const FPS = 30, W = 1200, H = 900, SCALE = 1.5, OUT_W = 1440, OUT_H = 1080;
const BAR = 4 * 60 / 95, DROP = 31;

const served = await serveDist();
const browser = await chromium.launch(serveDist.launchOptions());
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
const cdp = await page.context().newCDPSession(page);
// It opens on the violet accent (Dex), as a returning visitor's saved choice would.
await page.addInitScript(() => { try { localStorage.setItem('mobius-accent', 'Violet'); } catch {} });
await page.clock.install();
await page.goto(`${served.origin}?sample=knot`);
await page.waitForFunction(() => window.viewerReady && /triangles/.test(window.mobiusDebug.statsText));
await page.waitForTimeout(1200);
// The opening shot: straight on and close. Surface and Lighting start shut and
// the panel at its top, so Model -- the info and the Bulge slider -- is in view.
await page.click('[data-view="front"]');
await page.evaluate(() => {
  for (const d of document.querySelectorAll('#controls-panel .panel-controls > details')) if (/^(Surface|Lighting)$/.test(d.querySelector('summary').textContent)) d.open = false;
  document.querySelector('.panel-controls').scrollTop = 0;
});
const over = [W * .36, H * .48];
await page.mouse.move(...over);
await page.mouse.wheel(0, -100 * Math.log(.62) / Math.log(.95));
await page.mouse.move(W * .62, H * 1.2);
await page.waitForTimeout(900);
await page.clock.pauseAt(Date.now() + 1000);

const total = SECONDS * FPS;
const fade = Math.round(FPS * 1.5);
const filters = `scale=${OUT_W}:${OUT_H}:flags=lanczos,fade=t=in:st=0:d=0.5,fade=t=out:st=${(total - fade) / FPS}:d=${fade / FPS},format=yuv420p`;
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  ...(AUDIO ? ['-ss', String(AUDIO_FROM), '-i', AUDIO] : []), '-vf', filters, '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-profile:v', 'high',
  '-g', String(FPS * 2), '-movflags', '+faststart',
  ...(AUDIO ? ['-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '160k',
    '-af', `afade=t=in:st=0:d=0.3,afade=t=out:st=${(total - fade * 1.6) / FPS}:d=${fade * 1.6 / FPS}`, '-t', String(SECONDS)] : ['-an']), OUT],
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

let frame = 0, x = W * .62, y = H * 1.2, press = 0;
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
  // The clip's scale is what makes it device pixels: without it CDP hands
  // back CSS pixels and the encode is an upscale.
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 94, clip: { x: 0, y: 0, width: W, height: H, scale: SCALE } });
  const jpeg = Buffer.from(data, 'base64');
  if (frame === 0 && POSTER) writeFileSync(POSTER.replace(/\.png$/, '.jpg'), jpeg);
  if (!ff.stdin.write(jpeg)) await new Promise(r => ff.stdin.once('drain', r));
  frame++; press = Math.max(0, press - .06);
  if (frame % FPS === 0) process.stdout.write(`\r${frame / FPS}s / ${SECONDS}s`);
}
// Sine in and out: no jerk at either end of a move.
const ease = p => (1 - Math.cos(Math.PI * p)) / 2;
const wait = async s => { for (let i = Math.round(s * FPS); i > 0; i--) await shot(); };
// Holds until the given bar line (or second, with `at`), so each action lands on the beat.
const until = async t => { while (frame < Math.round(t * FPS) && frame < total) await shot(); };
const bar = n => n * BAR;
// Drifts along a shallow arc, as a hand does, and the real mouse follows.
async function moveTo(tx, ty, s = BAR) {
  const sx = x, sy = y, n = Math.max(1, Math.round(s * FPS));
  const d = Math.hypot(tx - sx, ty - sy) || 1, bend = d * .1;
  for (let i = 1; i <= n; i++) {
    const p = ease(i / n), arc = Math.sin(Math.PI * p) * bend;
    x = sx + (tx - sx) * p - (ty - sy) / d * arc;
    y = sy + (ty - sy) * p + (tx - sx) / d * arc;
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
// Arrives a beat early and presses ON the beat at `t`.
async function clickAt(t, selector, s = BAR * .75) {
  const [cx, cy] = await centre(selector);
  await until(t - s - BAR / 4);
  // Running late from the move before, it shortens rather than miss the beat.
  await moveTo(cx, cy, Math.max(.5, Math.min(s, t - frame / FPS - .1)));
  await until(t);
  await page.mouse.down(); press = 1; await shot(); await shot();
  await page.mouse.up();
}
async function chooseAt(t, select, text) {
  await clickAt(t, `#${select}-button`);
  await clickAt(t + BAR / 2, `#${select}-list li:text-is("${text}")`, BAR * .4);
}
// Orbit by a slow drag; dolly by small wheel steps spread over the move.
async function orbitAt(t, dx, dy, s, zoom = 1) {
  await until(t);
  const sx = x, sy = y, n = Math.round(s * FPS), step = -100 * Math.log(zoom) / Math.log(.95) / n;
  await page.mouse.down();
  for (let i = 1; i <= n; i++) {
    const p = ease(i / n);
    x = sx + dx * p; y = sy + dy * p;
    await page.mouse.move(x, y);
    if (step) await page.mouse.wheel(0, step);
    await shot();
  }
  await page.mouse.up();
}
// Scrolls the panel itself, eased, so a control below the fold comes into view.
async function scrollPanelAt(t, selector, s = BAR) {
  await until(t);
  const [from, to] = await page.evaluate(sel => {
    const p = document.querySelector('.panel-controls'), el = document.querySelector(sel);
    return [p.scrollTop, Math.min(p.scrollHeight - p.clientHeight, p.scrollTop + el.getBoundingClientRect().bottom - p.getBoundingClientRect().bottom + 16)];
  }, selector);
  const n = Math.round(s * FPS);
  for (let i = 1; i <= n; i++) {
    await page.evaluate(v => { document.querySelector('.panel-controls').scrollTop = v; }, from + (to - from) * ease(i / n));
    await shot();
  }
}

try {
  // Two bars on the opening shot: violet, straight on, close, playing Wave.
  // The cursor drifts in over the model.
  await until(bar(.5));
  await moveTo(W * .30, H * .46, BAR * 1.5);
  // Bar 2: one slow drag turns it three-quarters and eases the camera back.
  await orbitAt(bar(2), W * .06, H * .05, BAR * 2, 1.15);
  // Bar 4: Pulse.
  await chooseAt(bar(5), 'anim-clip', 'Pulse');
  // Bar 7: the first accent change, to blue.
  await clickAt(bar(7), '.accent-swatch[data-accent="Blue"]');
  // Bar 8: Bulge held on its slider while Pulse plays on, over a bar and a half.
  const [, sy, slider] = await centre('#shape-weight');
  await until(bar(8.5) - BAR * .9);
  await moveTo(slider.x + slider.width * .2, sy, BAR * .9);
  await page.mouse.down(); press = 1;
  await moveTo(slider.x + slider.width * .78, sy, BAR * 1.5);
  await page.mouse.up();
  // Bar 10: the panel scrolls down to View, and auto orbit goes on.
  await scrollPanelAt(bar(10.25), '.sample-row', BAR * .75);
  await clickAt(bar(11.5), '#spin');
  // THE DROP: the second accent change, to orange.
  await clickAt(DROP, '.accent-swatch[data-accent="Orange"]', BAR);
  // Wave back, then the grid off and on again.
  await chooseAt(bar(14.5), 'anim-clip', 'Wave');
  await clickAt(bar(16), '#grid');
  await clickAt(bar(17.5), '#grid');
  // The third accent change, to green.
  await clickAt(bar(19), '.accent-swatch[data-accent="Green"]');
  // The rest: the cursor leaves and the knot turns on its own.
  await until(bar(20));
  await moveTo(W * .5, H * 1.15, BAR * 1.5);
  while (frame < total) await shot();
} finally {
  ff.stdin.end();
  await ffDone.catch(error => { console.error(error.message); process.exitCode = 1; });
  await browser.close();
  served.close();
}
console.log(`\nvideo: ${frame} frames at ${FPS} fps (${(frame / FPS).toFixed(1)} s) -> ${OUT}${AUDIO ? ' with audio' : ', silent'}${POSTER ? `; poster -> ${POSTER.replace(/\.png$/, '.jpg')}` : ''}`);
