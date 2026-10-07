// What a file IS, read off its first bytes, and what to say when it is not
// something this viewer can open. The extension decides the loader; the bytes
// decide whether that was a lie. A .fbx that is really a renamed .blend fails
// deep inside the FBX parser with a message nobody can act on, so it is caught
// here and named instead.

export const MODEL_EXTENSIONS = ['glb', 'gltf', 'fbx', 'obj', 'ply', 'stl', 'dae', '3mf', '3ds', 'usdz', 'usd', 'usda', 'usdc'];
export const supported = new RegExp(`\\.(${MODEL_EXTENSIONS.join('|')})$`, 'i');
export const extensionOf = name => (name.split('.').pop() || '').toLowerCase();

// Formats people drop expecting them to work. Each gets its own instruction,
// because "unsupported format" tells nobody what to do next.
const NATIVE = {
  blend: ['Blender', 'In Blender: File → Export → glTF 2.0 (.glb) or FBX.'],
  max: ['3ds Max', 'In 3ds Max: File → Export → FBX, or use the glTF exporter.'],
  ma: ['Maya', 'In Maya: File → Export All → FBX.'],
  mb: ['Maya', 'In Maya: File → Export All → FBX.'],
  c4d: ['Cinema 4D', 'In Cinema 4D: File → Export → FBX or glTF.'],
  ztl: ['ZBrush', 'In ZBrush: Zplugin → FBX Export, or decimate and export OBJ.'],
  zpr: ['ZBrush', 'In ZBrush: Zplugin → FBX Export, or decimate and export OBJ.'],
  skp: ['SketchUp', 'In SketchUp: File → Export → 3D Model → FBX or OBJ.'],
  step: ['STEP CAD', 'CAD solids need tessellating first: export STL, OBJ or GLB from the CAD tool.'],
  stp: ['STEP CAD', 'CAD solids need tessellating first: export STL, OBJ or GLB from the CAD tool.'],
  iges: ['IGES CAD', 'CAD solids need tessellating first: export STL, OBJ or GLB from the CAD tool.'],
  igs: ['IGES CAD', 'CAD solids need tessellating first: export STL, OBJ or GLB from the CAD tool.'],
  drc: ['raw Draco', 'Draco is supported inside a GLB. Export a Draco-compressed .glb instead.'],
  abc: ['Alembic', 'Alembic is an animation cache. Export a frame as GLB, FBX or OBJ.'],
  uasset: ['Unreal asset', 'Export the mesh from Unreal as FBX or GLB.'],
  unitypackage: ['Unity package', 'Export the mesh from Unity as FBX, or with the glTFast exporter.'],
};

export function nativeAdvice(name) {
  const hit = NATIVE[extensionOf(name)];
  return hit && { title: `${hit[0]} files can't be opened directly`, body: hit[1] };
}

const ascii = (bytes, start, length) => String.fromCharCode(...bytes.subarray(start, start + length));

// The first bytes, checked against the extension. Returns null when they agree
// (or when the format has no reliable signature), or a description of what the
// bytes look like when they plainly do not.
export function sniffMismatch(ext, bytes) {
  if (bytes.length < 4) return 'The file is empty or truncated.';
  const head = ascii(bytes, 0, Math.min(bytes.length, 32));
  const looksLike =
    head.startsWith('glTF') ? 'glb' :
    head.startsWith('Kaydara FBX Binary') ? 'fbx' :
    head.startsWith('PK\u0003\u0004') ? 'zip' :
    head.startsWith('BLENDER') ? 'blend' :
    head.startsWith('ply') ? 'ply' :
    null;
  if (ext === 'glb' && looksLike !== 'glb') {
    if (looksLike === 'blend') return 'This is a Blender file renamed to .glb. Export it from Blender as glTF 2.0.';
    if (head.trimStart().startsWith('{')) return 'This is a text .gltf saved with a .glb extension. Rename it to .gltf.';
    return 'This file says .glb but does not start with the glTF signature, so it is not a binary glTF.';
  }
  if (ext === 'fbx' && looksLike && looksLike !== 'fbx') return `This file says .fbx but its contents look like ${looksLike.toUpperCase()}.`;
  if ((ext === '3mf' || ext === 'usdz') && looksLike !== 'zip') return `A .${ext} file is a ZIP package, and this one is not.`;
  if (ext === 'usdc' && !head.startsWith('PXR-USDC')) return 'This file says .usdc but is not a binary USD crate.';
  if (looksLike === 'blend') return 'This is a Blender file. In Blender: File → Export → glTF 2.0 (.glb) or FBX.';
  return null;
}

// FBX versions older than 7.0 (2011) are binary 6xxx or ASCII 6.x; the loader
// refuses them with an exception that names neither the problem nor the fix.
export function fbxVersion(bytes) {
  if (ascii(bytes, 0, 18) === 'Kaydara FBX Binary') return new DataView(bytes.buffer, bytes.byteOffset).getUint32(23, true);
  const m = /FBXVersion:\s*(\d+)/.exec(ascii(bytes, 0, Math.min(bytes.length, 2000)));
  return m ? Number(m[1]) : null;
}
