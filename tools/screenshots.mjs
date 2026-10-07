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
const FIX = resolve('verification/fixtures');

const served = await serveDist();
const browser = await chromium.launch(serveDist.launchOptions());
const shots = [];
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1125 } });
  const ready = () => page.waitForFunction(() => window.viewerReady === true);
  const settle = () => page.waitForTimeout(900);
  const snap = async name => { const file = join(OUT, `mobius-${name}.png`); await page.screenshot({ path: file }); shots.push(file); };

  // 1. The sample knot, as the preview opens.
  await page.goto(`${served.origin}?sample=knot`); await ready(); await settle();
  await snap('knot');

  // 2. The same model under inspection: its surface normals as colour.
  // (Not wireframe -- at 768k triangles a wireframe is grey noise.)
  await page.selectOption('#mode', 'normal');
  await page.click('[data-view="front"]');
  await settle();
  await snap('inspect');

  // 3. What a file it cannot read looks like.
  await page.goto(served.origin); await ready();
  await page.setInputFiles('#files', join(FIX, 'scene.blend'));
  await page.waitForFunction(() => !document.getElementById('error-card').hidden);
  await settle();
  await snap('error');
} finally {
  await browser.close();
  served.close();
}
console.log(`screenshots: ${shots.length} -> ${OUT}`);
