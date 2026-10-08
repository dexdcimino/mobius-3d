// The portfolio's screenshots of the viewer, taken from the REAL build so they
// cannot drift from what a visitor gets when they press the eye.
//
//   npm run build && node tools/screenshots.mjs [outDir]
//
// Default outDir is the portfolio's assets/gallery/. The site's image pipeline
// bakes them on commit (see the gal-item blocks with data-game="mobius").
import { chromium } from 'playwright-core';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const serveDist = require('../verification/serve.cjs');
const OUT = resolve(process.argv[2] || join(homedir(), 'OneDrive', 'Desktop', 'Portfolio SIte', 'assets', 'gallery'));
if (!existsSync(OUT)) throw new Error(`no such folder: ${OUT}`);

const served = await serveDist();
const browser = await chromium.launch(serveDist.launchOptions());
const shots = [];
try {
  // The gallery's own shape: its stage and its thumbnails are both 1440:690,
  // and the thumbnails COVER, so a 16:10 shot lost the timeline off the bottom
  // of every thumbnail. Shot at that shape, nothing is cropped anywhere; at
  // 4/3 scale the files are 1920x920.
  const page = await browser.newPage({ viewport: { width: 1440, height: 690 }, deviceScaleFactor: 4 / 3 });
  const ready = () => page.waitForFunction(() => window.viewerReady === true);
  const settle = () => page.waitForTimeout(900);
  const snap = async name => { const file = join(OUT, `mobius-${name}.png`); await page.screenshot({ path: file }); shots.push(file); };

  // Orbit by a drag and dolly by the wheel, over the model rather than the
  // panel. The wheel is OrbitControls' 0.95 per 100 of delta, so a factor
  // below 1 is that much closer.
  const over = [520, 360];
  const orbit = async (dx, dy) => { await page.mouse.move(...over); await page.mouse.down(); await page.mouse.move(over[0] + dx, over[1] + dy, { steps: 12 }); await page.mouse.up(); };
  const zoom = async factor => { await page.mouse.move(...over); await page.mouse.wheel(0, -100 * Math.log(factor) / Math.log(.95)); };
  const accent = name => page.click(`.accent-swatch[data-accent="${name}"]`);
  const pick = (id, value) => page.evaluate(([id, value]) => {
    const el = document.getElementById(id); el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }, [id, value]);

  // 1. The sample knot, as the preview opens: green, fluted, playing Wave --
  // turned three-quarters from above, the icon's angle, so all three openings
  // read, and a fifth closer.
  await page.goto(`${served.origin}?sample=knot`); await ready(); await settle();
  await orbit(100, 45); await zoom(.8); await settle();
  await snap('knot');

  // 2. The same knot in orange playing Pulse, with Bulge held on its slider
  // while the animation runs on.
  await accent('Orange');
  await pick('anim-clip', await page.evaluate(() => [...document.getElementById('anim-clip').options].find(o => /pulse/i.test(o.text)).value));
  await pick('shape-pick', await page.evaluate(() => [...document.getElementById('shape-pick').options].find(o => /bulge/i.test(o.text)).value));
  await pick('shape-weight', '.7');
  // Already a fifth closer from the first shot; turned a little the other
  // way, with the panel scrolled to the slider the shot is about.
  await orbit(-70, 0);
  await page.evaluate(() => document.getElementById('shapes-section').scrollIntoView({ block: 'end', behavior: 'instant' }));
  await settle();
  await snap('shapes');

  // 3. The seashell in violet under raking light, which finds the ridges.
  await page.click('[data-sample="shell"]'); await accent('Violet'); await pick('lighting', 'raking');
  await zoom(.88);
  await settle();
  await snap('shell');

  // 4. The Klein bottle in blue, inspected: its surface normals as colour.
  await page.click('[data-sample="klein"]'); await accent('Blue'); await pick('lighting', 'studio');
  await pick('mode', 'normal');
  await settle();
  await snap('inspect');
} finally {
  await browser.close();
  served.close();
}
console.log(`screenshots: ${shots.length} -> ${OUT}`);
