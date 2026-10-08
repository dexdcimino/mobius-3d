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
  const page = await browser.newPage({ viewport: { width: 1800, height: 1125 } });
  const ready = () => page.waitForFunction(() => window.viewerReady === true);
  const settle = () => page.waitForTimeout(900);
  const snap = async name => { const file = join(OUT, `mobius-${name}.png`); await page.screenshot({ path: file }); shots.push(file); };

  const accent = name => page.click(`.accent-swatch[data-accent="${name}"]`);
  const pick = (id, value) => page.evaluate(([id, value]) => {
    const el = document.getElementById(id); el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }, [id, value]);

  // 1. The sample knot, as the preview opens: green, fluted, playing Wave.
  await page.goto(`${served.origin}?sample=knot`); await ready(); await settle();
  await snap('knot');

  // 2. The same knot in orange playing Pulse, with Bulge held on its slider
  // while the animation runs on.
  await accent('Orange');
  await pick('anim-clip', await page.evaluate(() => [...document.getElementById('anim-clip').options].find(o => /pulse/i.test(o.text)).value));
  await pick('shape-pick', await page.evaluate(() => [...document.getElementById('shape-pick').options].find(o => /bulge/i.test(o.text)).value));
  await pick('shape-weight', '.7');
  await settle();
  await snap('shapes');

  // 3. The seashell in violet under raking light, which finds the ridges.
  await page.click('[data-sample="shell"]'); await accent('Violet'); await pick('lighting', 'raking');
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
