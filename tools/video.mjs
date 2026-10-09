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
// --dry walks the whole script on the clock without a frame captured: a control
// that is covered or off screen fails in seconds rather than half an hour in.
const DRY = args.includes('--dry') && args.splice(args.indexOf('--dry'), 1);
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
const ff = DRY ? null : spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  ...(AUDIO ? ['-ss', String(AUDIO_FROM), '-i', AUDIO] : []), '-vf', filters, '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-profile:v', 'high',
  '-g', String(FPS * 2), '-movflags', '+faststart',
  ...(AUDIO ? ['-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '160k',
    '-af', `afade=t=in:st=0:d=0.3,afade=t=out:st=${(total - fade * 1.6) / FPS}:d=${fade * 1.6 / FPS}`, '-t', String(SECONDS)] : ['-an']), OUT],
  { stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = DRY ? Promise.resolve() : new Promise((ok, fail) => ff.on('close', code => code ? fail(new Error(`ffmpeg exited ${code}`)) : ok()));

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
  // The caption: what the cursor is doing, in a line under the title.
  const h1 = document.querySelector('header h1').getBoundingClientRect(), cap = document.createElement('div');
  cap.id = 'rec-caption';
  cap.style.cssText = `position:fixed;left:${h1.left}px;top:${h1.bottom + 10}px;z-index:2147483646;pointer-events:none;font:500 15px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;color:rgba(236,242,248,.9);letter-spacing:.01em;opacity:0;display:flex;align-items:center;gap:9px`;
  cap.innerHTML = '<i style="width:7px;height:7px;border-radius:50%;background:var(--accent);flex:none"></i><span></span>';
  document.body.appendChild(cap);
});

let frame = 0, x = W * .62, y = H * 1.2, press = 0;
// A caption change fades the old line out over 6 frames, then the new one in over 9.
let capShown = '', capWant = '', capAt = 0, capOpacity = 0;
const caption = text => { capWant = text; capAt = frame; };
async function shot() {
  if (frame >= total) return;
  if (capWant !== capShown) { capOpacity = Math.max(0, capOpacity - 1 / 6); if (!capOpacity) { capShown = capWant; capAt = frame; } }
  else if (capShown) capOpacity = Math.min(1, capOpacity + 1 / 9);
  await page.evaluate(([x, y, p, text, o]) => {
    const cap = document.getElementById('rec-caption');
    cap.lastChild.textContent = text; cap.style.opacity = String(o);
    const c = document.getElementById('rec-cursor');
    c.style.transform = `translate(${x - 3}px, ${y - 2}px)`;
    const ring = c.lastChild;
    ring.style.opacity = p > 0 ? String(p) : '0';
    ring.style.transform = `scale(${1.6 - p * .6})`;
  }, [x, y, press, capShown, capOpacity]);
  await page.clock.runFor(1000 / FPS);
  if (DRY) { frame++; press = Math.max(0, press - .06); return; }
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


// Drags a range input's thumb from where it is to `to` (0..1 along it).
async function slideAt(t, selector, to, s = BAR * .6) {
  const [, cy, box] = await centre(selector);
  const at = await page.evaluate(sel => { const r = document.querySelector(sel); return (r.value - r.min) / (r.max - r.min); }, selector);
  const px = f => box.x + 8 + f * (box.width - 16);
  await until(t - .9);
  await moveTo(px(at), cy, .8);
  await until(t);
  await page.mouse.down(); press = 1;
  await moveTo(px(to), cy, s);
  await page.mouse.up();
}
// Pans by a middle drag, the way the viewer now takes it.
async function panAt(t, dx, dy, s) {
  await until(t);
  const sx = x, sy = y, n = Math.round(s * FPS);
  await page.mouse.down({ button: 'middle' });
  for (let i = 1; i <= n; i++) { const p = ease(i / n); x = sx + dx * p; y = sy + dy * p; await page.mouse.move(x, y); await shot(); }
  await page.mouse.up({ button: 'middle' });
}
const QUICK = BAR * .45;

try {
  // v4 (Dex): quicker hands, still eased, and more of the app: shading modes,
  // exposure and light direction, a second sample with its own animations, and
  // a caption under the title naming each thing as it happens.
  caption('Trefoil Knot, playing its Wave animation');
  await until(1.0);
  await moveTo(W * .32, H * .46, .9);
  caption('Drag to orbit');
  await orbitAt(2.0, W * .12, H * .04, 1.6, 1.12);
  caption('Middle drag to pan');
  await until(4.0);
  await panAt(4.3, W * .07, H * .03, .9);
  await panAt(5.25, -W * .07, -H * .03, .8);
  // v5 (Dex): swing back to the front view; the angled one is a bad shot to sit on.
  await orbitAt(6.1, -W * .12, -H * .04, 1.0, 1 / 1.12);
  caption('Switch the shading');
  await clickAt(7.3, 'summary:text-is("Surface")', QUICK);
  await chooseAt(8.3, 'mode', 'Normals');
  caption('Normals: the surface direction as colour');
  await chooseAt(10.6, 'mode', 'Unlit');
  caption('Unlit: the colour alone, no light');
  await chooseAt(12.9, 'mode', 'Material');
  caption('Back to the full material');
  await clickAt(15.2, 'summary:text-is("Surface")', QUICK);
  caption('Turn up the exposure');
  await clickAt(16.3, 'summary:text-is("Lighting")', QUICK);
  await slideAt(17.4, '#exposure', .78, 1.3);
  caption('Swing the light round');
  await slideAt(19.9, '#rotateLight', .88, 1.2);
  await moveTo(x, y, .3);
  await slideAt(21.6, '#rotateLight', .5, 1.2);
  caption('Pick an accent colour');
  await clickAt(23.6, '.accent-swatch[data-accent="Blue"]', QUICK);
  caption('Try another sample');
  await scrollPanelAt(25.0, '.sample-row', .8);
  await clickAt(26.6, '[data-sample="mobius"]', QUICK);
  caption('Mobius Band, its ribbon rolling as a wave');
  // THE DROP: the second accent change, to orange.
  await clickAt(DROP, '.accent-swatch[data-accent="Orange"]', QUICK);
  caption('Orbit and zoom');
  await moveTo(W * .34, H * .5, .9);
  await orbitAt(33.0, -W * .1, H * .05, 1.8, .82);
  caption('Flutter, its second animation');
  await chooseAt(36.0, 'anim-clip', 'Flutter');
  caption('Auto orbit');
  await clickAt(39.6, '#spin', QUICK);
  caption('The floor grid, off and on');
  await clickAt(42.4, '#grid', QUICK);
  await clickAt(44.2, '#grid', QUICK);
  caption('Pick an accent colour');
  await clickAt(46.6, '.accent-swatch[data-accent="Green"]', QUICK);
  caption('Back to Roll');
  await chooseAt(48.6, 'anim-clip', 'Roll');
  await until(51.5);
  caption('Mobius 3D: free on Windows, macOS, Linux and the web');
  await moveTo(W * .5, H * 1.15, 1.2);
  while (frame < total) await shot();
} finally {
  ff?.stdin.end();
  await ffDone.catch(error => { console.error(error.message); process.exitCode = 1; });
  await browser.close();
  served.close();
}
console.log(`\nvideo: ${frame} frames at ${FPS} fps (${(frame / FPS).toFixed(1)} s) -> ${OUT}${AUDIO ? ' with audio' : ', silent'}${POSTER ? `; poster -> ${POSTER.replace(/\.png$/, '.jpg')}` : ''}`);
