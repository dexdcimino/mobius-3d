// ONE SOURCE, ONE BUILD, TWO HOMES.
//
//   npm run build   ->  dist/   the viewer: index.html, two scripts, decoders
//
// dist/ is what the desktop app ships (desktop/main.cjs serves it over its own
// mobius:// scheme) and what the portfolio site serves at /mobius/ (copied
// there by `npm run site`). Nothing else differs between the two: an edit in
// src/ reaches both the next time each is built.
//
// It used to be a single self-contained HTML file. That stopped being possible
// the day compressed GLBs were supported: the Draco and KTX2 decoders are
// WebAssembly fetched at runtime, and a worker is its own file. A folder also
// lets the page drop inline script entirely.
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const OUT = 'dist';
const LIBS = 'node_modules/three/examples/jsm/libs';
await rm(OUT, { recursive: true, force: true });
await mkdir(`${OUT}/decoders/draco`, { recursive: true });
await mkdir(`${OUT}/decoders/basis`, { recursive: true });

const common = { bundle: true, minify: true, format: 'iife', legalComments: 'inline', target: ['chrome110', 'firefox115', 'safari16'] };
await build({ ...common, entryPoints: ['src/viewer.js'], outfile: `${OUT}/viewer.js` });
await build({ ...common, entryPoints: ['src/parse-worker.js'], outfile: `${OUT}/parse-worker.js` });
await build({ ...common, bundle: false, entryPoints: ['src/boot.js'], outfile: `${OUT}/boot.js` });

await writeFile(`${OUT}/index.html`, await readFile('src/template.html', 'utf8'));

// The decoders, exactly as three.js ships them. Only the WASM builds: every
// browser this runs in has WebAssembly, and the pure-JS Draco fallback is
// another 700 KB nobody would load.
const DECODERS = [
  ['draco/draco_wasm_wrapper.js', 'draco'], ['draco/draco_decoder.wasm', 'draco'],
  ['basis/basis_transcoder.js', 'basis'], ['basis/basis_transcoder.wasm', 'basis'],
];
for (const [file, dir] of DECODERS) {
  const from = `${LIBS}/${file}`;
  if (!existsSync(from)) throw new Error(`decoder missing from three.js: ${from}`);
  await cp(from, `${OUT}/decoders/${dir}/${file.split('/').pop()}`);
}
await cp('THIRD-PARTY-LICENSE.txt', `${OUT}/THIRD-PARTY-LICENSE.txt`);

// Count what was built, so a build that silently dropped a piece says so.
const expected = ['index.html', 'viewer.js', 'parse-worker.js', 'boot.js', ...DECODERS.map(([f, d]) => `decoders/${d}/${f.split('/').pop()}`)];
const missing = expected.filter(f => !existsSync(`${OUT}/${f}`));
if (missing.length) throw new Error(`build is missing: ${missing.join(', ')}`);
console.log(`dist/: ${expected.length} files built`);
