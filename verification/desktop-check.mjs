// The PACKAGED desktop app, launched the way Windows launches it.
//
//   npm run dist && node verification/desktop-check.mjs
//
// It opens a model whose path has spaces and non-ASCII in it (which is what
// "Open with" hands over), sends a second file to the running app the way a
// second "Open with" does, opens a compressed GLB to prove the decoders are
// served from inside the package, and checks the page cannot reach Node.
import { _electron } from 'playwright-core';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const FIX = join(ROOT, 'verification', 'fixtures');
const brand = JSON.parse(await readFile(join(ROOT, 'desktop', 'brand.json'), 'utf8'));
const { extensions } = JSON.parse(await readFile(join(ROOT, 'desktop', 'formats.json'), 'utf8'));
const exe = process.env.MOBIUS_TEST_EXE || join(ROOT, 'release', 'win-unpacked', `${brand.executable}.exe`);
if (!existsSync(exe)) throw new Error(`no packaged app at ${exe} -- run npm run dist first`);

let pass = 0; const fail = [];
const note = (ok, why) => { if (ok) pass++; else fail.push(why); };

const work = join(tmpdir(), `mobius-desktop-${process.pid}`);
const folder = join(work, 'launch files ü');
await mkdir(folder, { recursive: true });
const model = join(folder, 'mesh space ü.glb');
await copyFile(join(FIX, 'launch files ü', 'mesh space ü.glb'), model);
const env = { ...process.env, MOBIUS_TEST_PROFILE: join(work, 'profile') };
delete env.ELECTRON_RUN_AS_NODE;

const app = await _electron.launch({ executablePath: exe, args: [model], env, timeout: 60000 });
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => window.viewerReady === true);
  await page.waitForFunction(() => document.querySelector('#filename').textContent === 'mesh space ü.glb', null, { timeout: 30000 });
  note(/^1 triangle\b/.test(await page.locator('#stats').textContent()), 'the launch model did not open');
  note(await page.evaluate(() => location.protocol) === 'mobius:', 'the window is not on the mobius: scheme');
  note(await page.evaluate(() => typeof process === 'undefined' && typeof require === 'undefined'), 'the page can reach Node');
  note(await page.evaluate(() => document.querySelector('header h1').textContent) === 'Mobius 3D', 'the window is not branded Mobius 3D');

  // A second "Open with": a new process, forwarded to the running window.
  const second = spawn(exe, [join(FIX, 'textured.obj')], { env, windowsHide: true, stdio: 'ignore' });
  await page.waitForFunction(() => document.querySelector('#filename').textContent === 'textured.obj', null, { timeout: 30000 });
  note(await page.locator('#status').textContent() === '', 'the forwarded OBJ reported missing companion files');
  second.unref();

  // Compressed glTF: the decoders have to come out of the PACKAGE, through the
  // app's own scheme. A third launch, forwarded like the second.
  spawn(exe, [join(FIX, 'knot-draco.glb')], { env, windowsHide: true, stdio: 'ignore' }).unref();
  await page.waitForFunction(() => document.querySelector('#filename').textContent === 'knot-draco.glb', null, { timeout: 30000 });
  note(/16,384 triangles/.test(await page.locator('#stats').textContent()), `the Draco GLB reports "${await page.locator('#stats').textContent()}"`);
  note(await page.evaluate(() => document.getElementById('error-card').hidden), 'the Draco GLB showed an error card');

  // The Windows "Open with" registration, as generated.
  const nsh = await readFile(join(ROOT, 'desktop', 'shell.nsh'), 'utf8');
  note((nsh.match(/WriteRegStr HKCU/g) || []).length === extensions.length * 3, `shell.nsh writes ${(nsh.match(/WriteRegStr HKCU/g) || []).length} values for ${extensions.length} types`);
  note(!/UserChoice|HKEY_CLASSES_ROOT|WriteRegStr HKLM/.test(nsh), 'shell.nsh writes outside the per-user verbs');
  note(nsh.includes(`'"$INSTDIR\\${brand.executable}.exe" "%1"'`), 'shell.nsh does not quote the executable and the model path');
} finally {
  await app.close();
  await rm(work, { recursive: true, force: true }).catch(() => {});
}
console.log(`desktop check: ${pass} passed${fail.length ? `, ${fail.length} FAILED` : ''}`);
for (const f of fail) console.log(`  - ${f}`);
process.exit(fail.length ? 1 : 0);
