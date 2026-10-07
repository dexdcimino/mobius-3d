// The LIVE site: dexcimino.com, its AI Lab card, its overlay, its headers.
//
//   node verification/live-check.mjs [https://dexcimino.com]
//
// Everything else runs against a local server that imitates the site. This
// runs against the site, because the headers Vercel actually sends -- one
// policy or two, wasm allowed or not -- are only provable there.
import { chromium } from 'playwright-core';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { launchOptions } = require('./serve.cjs');
const SITE = process.argv[2] || 'https://dexcimino.com';
const FIX = join(resolve(fileURLToPath(new URL('..', import.meta.url))), 'verification', 'fixtures');

let pass = 0; const fail = [];
const note = (ok, why) => { if (ok) pass++; else fail.push(why); };

const browser = await chromium.launch(launchOptions());
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const csp = [];
  page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(`[${(m.location() && m.location().url) || '?'}] ${m.text().slice(0, 90)}`); });
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  const eye = page.locator('#mobiusCard .ai-card-eye');
  await eye.scrollIntoViewIfNeeded();
  await eye.click();
  await page.waitForFunction(() => document.getElementById('appModal')?.open === true, null, { timeout: 15000 });
  const frame = page.frameLocator('#appFrame');
  await frame.locator('#stats').filter({ hasText: 'triangles' }).waitFor({ timeout: 30000 });
  const sample = await frame.locator('#stats').textContent();
  note(/768,000 triangles/.test(sample), `the live preview reports "${sample}"`);

  // A Draco GLB through the live overlay: the decoder is fetched from the
  // site and compiled under the site's real policy.
  await frame.locator('#files').setInputFiles(join(FIX, 'knot-draco.glb'));
  await frame.locator('#stats').filter({ hasText: '16,384 triangles' }).waitFor({ timeout: 30000 }).catch(() => {});
  const draco = await frame.locator('#stats').textContent();
  const card = await frame.locator('#error-card').isVisible();
  note(/16,384 triangles/.test(draco) && !card, `the live Draco GLB reports "${draco}"${card ? ' with an error card' : ''}`);
  // The viewer's own documents only: the main page's policy is the site's
  // business, and its refusals are printed below rather than counted here.
  const mine = csp.filter(line => line.includes('/mobius/'));
  note(mine.length === 0, `CSP refusals inside the viewer: ${mine.join(' | ')}`);
  const site = csp.filter(line => !line.includes('/mobius/'));
  if (site.length) console.log(`note: ${site.length} CSP refusal(s) on the main page, not the viewer: ${site.join(' | ')}`);
  console.log(`live: sample "${sample.split('·')[0].trim()}", draco "${draco.split('·')[0].trim()}", ${mine.length} CSP refusals in the viewer`);
} finally {
  await browser.close();
}
console.log(`live check: ${pass} passed${fail.length ? `, ${fail.length} FAILED` : ''}`);
for (const f of fail) console.log(`  - ${f}`);
process.exit(fail.length ? 1 : 0);
