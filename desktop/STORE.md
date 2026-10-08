# Microsoft Store

The Store copy of Mobius 3D exists so Windows never shows "Windows protected
your PC": the Store signs what it publishes. It is built from the same source
as the GitHub installer, by `desktop/builder-store.cjs`.

| | |
|---|---|
| package | `npm run dist:store` on Windows -> `release/Mobius-3D-Store.appx` (unsigned; Partner Center signs it) |
| identity | `desktop/store.json`, copied from Partner Center > the app > **Product identity** |
| icons | `build/appx/`, made from `build/icon.png` by `python3 tools/icon/store.py` |
| releases | once `store.json` is filled, every release attaches `Mobius-3D-Store.appx` to its GitHub Release |
| updates | the Store's. `main.cjs` skips electron-updater when `process.windowsStore` is set |
| CI | `check.yml`'s `store-package` job builds it with a stand-in identity and checks the icons, the 13 Open with types and the .0 version |

## Publishing a version

1. Merge the version bump as usual. The release attaches `Mobius-3D-Store.appx`.
2. Partner Center > Apps and games > Mobius 3D > **Start update** > Packages:
   drop in that file, then **Submit to the Store**. Review usually takes 1 to 3
   days.

## Listing (paste into the Store listing page)

**Product name:** Mobius 3D

**Short description:**
A fast, private 3D model viewer. Open GLB, FBX, OBJ, STL, USDZ and more, play animations and inspect materials.

**Description:**
Windows 3D Viewer is gone, and I couldn't find a replacement I liked, so I made my own.

Mobius 3D opens the 3D files you actually have and shows them properly: lit, shaded and ready to turn around. Drag a model in, or right-click it and choose Open with Mobius 3D.

What it opens:
- GLB and glTF 2.0, including Draco, Meshopt and KTX2 compression
- FBX (7.0 and later), OBJ with MTL, STL, PLY (meshes and point clouds)
- Collada DAE, 3MF, 3DS, and USD, USDA, USDC and USDZ

What you can do:
- Play a model's animations on a timeline, with pause, scrub and 0.5x, 1x or 2x speed
- Drive its blend shapes with a slider each
- Look at it as Material, Unlit, Normals, Grayscale or Vertex colors, with wireframe and two-sided switches
- Turn each texture map on and off: base colour, normal, roughness, metalness, specular and emissive
- See its triangles, vertices, meshes, materials and textures at a glance
- Save a screenshot

Heavy files load off the main thread, so a multi-million-triangle model never freezes the window, and a load can be cancelled.

Private by design: your models never leave your computer. There is no account, no tracking and no ads, and the viewer blocks anything a model tries to fetch from the internet.

**Features (one per line):**
Opens GLB, glTF, FBX, OBJ, STL, PLY, DAE, 3MF, 3DS and USD/USDZ
Plays animations with a timeline and speed control
Blend shape sliders
Material, Unlit, Normals, Grayscale and Vertex color views
Per-texture-map switches
Wireframe and two-sided views
Model stats: triangles, vertices, meshes, materials, textures
Right-click Open with Mobius 3D
Heavy models load without freezing the window
Nothing leaves your computer

**Search terms:** 3D viewer, GLB viewer, FBX viewer, OBJ viewer, STL viewer, USDZ viewer, glTF, 3D model

**Category:** Multimedia design (subcategory: Illustration and graphic design)

**Privacy policy URL:** https://github.com/dexdcimino/mobius-3d/blob/main/PRIVACY.md

**Website:** https://dexcimino.com

**Support contact:** https://github.com/dexdcimino/mobius-3d/issues

**Screenshots:** the four in the portfolio's `assets/gallery/mobius-*.png`
(1920x920, above the Store's 1366x768 minimum).

**Age rating questionnaire:** no user interaction with others, no shared
location, no personal data, no purchases, no violence: it rates 3+ / Everyone.

**Pricing:** Free. **Markets:** all.
