# Formats

| Format | What works | Parsed |
| --- | --- | --- |
| GLB / glTF 2.0 | Meshes, PBR materials, embedded and external textures. **Draco**, **Meshopt** and **KTX2** compression. | main thread; decoders in workers |
| FBX | Meshes, materials and textures from FBX 7.0 (2011) onwards, binary or ASCII. Older files are refused with a message saying so. | main thread |
| OBJ + MTL | Meshes, lines and points; MTL materials and texture maps (select them with the OBJ). Normals generated when the file has none. | **worker** |
| STL | Binary and ASCII meshes; per-face colours where the exporter wrote them. | **worker** |
| PLY | Meshes with vertex colours, **and point clouds** (a PLY with no faces is drawn as points). | **worker** |
| Collada / DAE | Static scenes. | main thread |
| 3MF | Mesh and build objects. | main thread |
| 3DS | Legacy meshes and materials. | main thread |
| USD / USDA / USDC / USDZ | Meshes and basic materials through three.js's USD loader. Newer and partial: complex stages and shading networks may not survive. | main thread |

**Not readable directly, with a message saying how to export instead:**
Blender (.blend), 3ds Max (.max), Maya (.ma / .mb), Cinema 4D (.c4d), ZBrush
(.ztl / .zpr), SketchUp (.skp), STEP / IGES CAD solids, raw Draco (.drc),
Alembic (.abc), Unreal and Unity packages. A file whose bytes contradict its
extension -- a renamed .blend, a text .gltf called .glb -- is also named for
what it is.

**Not supported:** animation playback, and reproducing every engine or DCC
shader. This is a previewer: it shows the geometry, its normals, vertex colours
and materials, and it never modifies the source file.

## Selecting companion files

In the browser, select (or drop) the model **together with** its textures,
`.mtl` or `.bin` files -- a web page cannot look in the model's folder for
them. The desktop app does: "Open with" and its Open dialog gather textures
next to the model and in `textures/`, `maps/`, `materials/`, `images/` and
`.fbm` folders, three levels deep, and follow a glTF's relative references.

## Limits

512 MiB for the model and 256 MiB of companion files in the desktop app; in a
browser, whatever memory the tab is given. A model too large for the GPU says
so rather than freezing. The floor grid is relative, not a unit measurement.
Triangle counts include instances; vertex counts include split vertices.
