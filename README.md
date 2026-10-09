# Mobius 3D

A local 3D model viewer that runs in two places from **one codebase**:

- **Desktop** (Windows, Linux, macOS): drag a model in, or right-click a file
  and **Open with → Mobius 3D**. When a new Release is out it asks first: an
  **Update?** prompt, bottom left, with the release notes behind its info icon.
- **The web**: the same viewer, served as a functional preview on
  [dexcimino.com](https://dexcimino.com) (AI Lab → Mobius 3D → the eye).

Models never leave the machine. Files are read in the browser or the app, and
nothing a model references can reach the network.

## Formats

GLB / glTF 2.0 (including **Draco, Meshopt and KTX2** compression), FBX (7.0+),
OBJ + MTL, STL, PLY (meshes and point clouds), Collada DAE, 3MF, 3DS, and
USD / USDA / USDC / USDZ. Details and limits: [FORMATS.md](FORMATS.md).

## How it is put together

```
src/            the viewer -- three.js, one page
  viewer.js       scene, controls, loading, the error and loading cards
  parse-worker.js OBJ / STL / PLY parsed off the main thread
  formats.js      what a file really is, read off its first bytes
  errors.js       every failure as a sentence that says what to do
build.mjs       src/ -> dist/  (index.html, scripts, WebAssembly decoders)
desktop/        the Electron shell that serves dist/ in its own window
tools/site.mjs  copies dist/ into the portfolio site's /mobius/ folder
tools/screenshots.mjs, video.mjs, icon/
                the portfolio's gallery shots, featured video and app icon,
                all taken from the real build
verification/   the checks, and the fixtures they open
```

**One source, two homes.** `npm run build` makes `dist/`. The desktop app
packages that folder; the website serves a copy of it. Edit `src/`, and:

| to update | run | then |
|---|---|---|
| the website | `npm run site` | commit the portfolio's `mobius/` folder |
| the desktop app | write `build/release-notes.md`, bump `version` and merge to main (or push a `vX.Y.Z` tag) | CI builds all three platforms and publishes a Release with those notes; installed apps show **Update?** with the notes behind its info icon |

## Heavy models

- OBJ, STL and PLY parse in a **Web Worker**, so a multi-million-triangle file
  never freezes the window, and the load can be **cancelled**.
- Compressed glTF decodes in WebAssembly workers (Draco, KTX2) or WASM (Meshopt).
- The scene **renders on demand**: an idle viewer draws nothing, so a heavy
  model costs no GPU time while nobody is touching it.
- A GPU that drops the viewer (out of video memory, a driver reset) gets a card
  saying so, instead of a frozen canvas.

## Develop

```bash
npm ci
npm start            # build and open the desktop app
npm run check        # build, then drive the viewer in Chrome -- 49 checks
npm run dist         # the installer for this machine, into release/
```

Other checks: `node verification/desktop-check.mjs` (the packaged app, after
`npm run dist`), the three original checks in `verification/*.cjs`, and
`node --test verification/*.test.mjs`. `npm run fixtures` regenerates the
compressed and failure fixtures.

## Install notes

- **Windows**: the Microsoft Store copy installs with no warning (see
  [desktop/STORE.md](desktop/STORE.md)). The GitHub installer is unsigned, so
  SmartScreen may warn about it ("More info → Run anyway"). It adds an **Open with Mobius 3D** entry for each format and
  never changes your default apps. It shows in the right-click **Open with**
  list, and as its own **Open with Mobius 3D** line under **Show more options**.
- **Download links never go stale**: installers are named without a version
  (`Mobius-3D-Setup-x64.exe`, `Mobius-3D-mac.dmg`, `Mobius-3D-x86_64.AppImage`),
  so `releases/latest/download/<name>` always serves the newest one.
- **macOS**: unsigned (no Apple Developer ID). Right-click the app → **Open**
  the first time. It cannot update itself; download new versions from Releases.
- **Linux**: AppImage (self-updating) or .deb.

## Third-party

three.js (MIT), the Draco decoder and Basis Universal transcoder (Apache-2.0),
meshoptimizer (MIT). See [THIRD-PARTY-LICENSE.txt](THIRD-PARTY-LICENSE.txt).
