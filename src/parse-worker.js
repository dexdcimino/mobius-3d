// The text and geometry-only formats, parsed OFF the main thread.
//
// OBJ, ASCII STL and ASCII PLY are parsed character by character, and a scan
// or a CAD export of a few million triangles holds the page for tens of
// seconds -- long enough for the browser to offer to kill it. Here the page
// keeps drawing (a spinner, an elapsed clock, a Cancel that works) while the
// parse runs, and the result comes back as typed arrays TRANSFERRED rather
// than copied, so a 600 MB position buffer costs nothing to hand over.
//
// Only geometry crosses. Materials are rebuilt on the main thread, because
// MTL textures need image decoding that belongs to the document; this sends
// the material NAMES and the flags the main thread needs to make them.
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';

const ATTRIBUTES = ['position', 'normal', 'uv', 'color'];

function pack(geometry, transfer) {
  const out = { attributes: {}, index: null, groups: geometry.groups.map(g => ({ ...g })) };
  for (const name of ATTRIBUTES) {
    const attr = geometry.attributes[name];
    if (!attr) continue;
    out.attributes[name] = { array: attr.array, itemSize: attr.itemSize, normalized: attr.normalized };
    transfer.add(attr.array.buffer);
  }
  if (geometry.index) { out.index = geometry.index.array; transfer.add(geometry.index.array.buffer); }
  return out;
}

function plyFaces(bytes) {
  // The header is ASCII even in a binary PLY, and ends at end_header.
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
  const m = /element\s+face\s+(\d+)/.exec(head);
  return m ? Number(m[1]) : 0;
}

self.onmessage = ({ data }) => {
  const { id, ext, buffer } = data;
  const transfer = new Set();
  try {
    const bytes = new Uint8Array(buffer);
    let parts;
    if (ext === 'obj') {
      const root = new OBJLoader().parse(new TextDecoder().decode(bytes));
      parts = [];
      root.traverse(o => {
        if (!o.geometry) return;
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        // An OBJ with no vn lines arrives without normals, and computing them
        // for a million triangles on the main thread froze the page for 2.4 s
        // AFTER the worker had finished -- measured, by the check that now
        // holds the line at one second. They are made here instead.
        let generatedNormals = false;
        if (o.isMesh && !o.geometry.attributes.normal) { o.geometry.computeVertexNormals(); generatedNormals = true; }
        parts.push({
          generatedNormals,
          kind: o.isMesh ? 'mesh' : o.isLineSegments ? 'lines' : o.isPoints ? 'points' : 'mesh',
          name: o.name,
          materials: materials.map(m => ({ name: m.name, flatShading: !!m.flatShading, vertexColors: !!m.vertexColors })),
          multi: Array.isArray(o.material),
          geometry: pack(o.geometry, transfer),
        });
      });
    } else if (ext === 'stl') {
      const geometry = new STLLoader().parse(buffer);
      parts = [{ kind: 'mesh', name: '', geometry: pack(geometry, transfer),
                 materials: [{ name: '', vertexColors: !!geometry.attributes.color, opacity: geometry.alpha ?? 1 }] }];
    } else if (ext === 'ply') {
      const faces = plyFaces(bytes);
      const geometry = new PLYLoader().parse(buffer);
      // Normals for a multi-million-triangle scan are computed HERE rather than
      // on the main thread, and flagged so the model panel can still say they
      // were generated rather than imported.
      let generatedNormals = false;
      if (faces && !geometry.attributes.normal) { geometry.computeVertexNormals(); generatedNormals = true; }
      // A PLY with no faces is a point cloud. Drawn as triangles it is noise:
      // consecutive points stitched into slivers. Drawn as points it is a scan.
      parts = [{ kind: faces ? 'mesh' : 'points', name: '', geometry: pack(geometry, transfer), generatedNormals,
                 materials: [{ name: '', vertexColors: !!geometry.attributes.color }] }];
    } else {
      throw new Error(`No worker parser for .${ext}`);
    }
    self.postMessage({ id, parts }, [...transfer]);
  } catch (error) {
    // RangeError is what an allocation that does not fit looks like here.
    self.postMessage({ id, error: { name: error?.name || 'Error', message: String(error?.message || error) } });
  }
};
