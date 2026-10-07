// Copies the built viewer into the portfolio site, where it is served at
// /mobius/ and opened by the AI Lab's eye button.
//
//   npm run site                      -> ~/OneDrive/Desktop/Portfolio SIte/mobius/
//   MOBIUS_SITE=<dir> npm run site    -> anywhere else
//
// This is the whole of the bridge between the two: the site holds a BUILT
// copy and never the source, so an edit here reaches it the next time this
// runs and the site commits what changed. A MIRROR, not a merge -- a file
// dropped from dist/ is removed from the site too, or the site would keep
// serving a decoder nothing loads any more.
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';

const DIST = resolve('dist');
const SITE_ROOT = resolve(process.env.MOBIUS_SITE ? join(process.env.MOBIUS_SITE, '..') : join(homedir(), 'OneDrive', 'Desktop', 'Portfolio SIte'));
const TARGET = process.env.MOBIUS_SITE ? resolve(process.env.MOBIUS_SITE) : join(SITE_ROOT, 'mobius');

if (!existsSync(join(DIST, 'index.html'))) throw new Error('no dist/ -- run npm run build first');
// The portfolio is recognised by its own files, so a mistyped path cannot
// mirror over some other folder's "mobius".
if (!existsSync(join(SITE_ROOT, 'vercel.json')) || !existsSync(join(SITE_ROOT, 'index.html'))) {
  throw new Error(`${SITE_ROOT} does not look like the portfolio site (no vercel.json / index.html). Set MOBIUS_SITE.`);
}

async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full, base));
    else out.push(relative(base, full).split('\\').join('/'));
  }
  return out;
}

const wanted = await walk(DIST);
await mkdir(TARGET, { recursive: true });
const present = await walk(TARGET);
const stale = present.filter(f => !wanted.includes(f));
for (const f of stale) await rm(join(TARGET, f));
let bytes = 0;
for (const f of wanted) {
  await mkdir(join(TARGET, f, '..'), { recursive: true });
  await cp(join(DIST, f), join(TARGET, f));
  bytes += (await stat(join(DIST, f))).size;
}
console.log(`site: ${wanted.length} files (${(bytes / 1e6).toFixed(2)} MB) -> ${TARGET}${stale.length ? `, ${stale.length} stale removed` : ''}`);
