import * as THREE from 'three';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';
import { sampleGradient } from './accent.js';

/* THE SAMPLES. Four shapes a visitor with no model of their own can turn over,
   each showing something a viewer has to get right: smooth curvature, a
   one-sided band, an open shell seen from inside, a surface through itself.
   Each is dense enough to look smooth and LIGHT enough that wireframe and flat
   shading read. The first knot was 768,000 triangles, and at that density a
   wireframe is a solid surface and flat shading looks the same as smooth --
   which is exactly what it looked like: two toggles that did nothing. */

// A: the trefoil the Mobius mark is drawn from.
const knot = () => new THREE.TorusKnotGeometry(1, 0.34, 360, 40, 2, 3);

// B: a Mobius band with real thickness -- a rounded slab swept round a circle
// with one half twist. The profile is centrally symmetric, so after the half
// turn point k of the last ring IS point k + N/2 of the first, and the band
// closes on itself with no seam and no duplicated vertices.
function mobius() {
  const segments = 360, N = 48, R = 1.3, a = .6, b = .07;
  const profile = [];
  for (let k = 0; k < N; k++) {
    const t = k / N * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    profile.push([a * Math.sign(c) * Math.abs(c) ** .5, b * Math.sign(s) * Math.abs(s) ** .5]);
  }
  const positions = [], indices = [];
  for (let i = 0; i < segments; i++) {
    const u = i / segments * Math.PI * 2, ct = Math.cos(u / 2), st = Math.sin(u / 2);
    for (const [x, y] of profile) {
      const r = x * ct - y * st, h = x * st + y * ct;
      positions.push((R + r) * Math.cos(u), h, (R + r) * Math.sin(u));
    }
  }
  for (let i = 0; i < segments; i++) {
    const last = i === segments - 1, ni = last ? 0 : i + 1, shift = last ? N / 2 : 0;
    for (let k = 0; k < N; k++) {
      const k1 = (k + 1) % N;
      const a0 = i * N + k, a1 = i * N + k1, b0 = ni * N + (k + shift) % N, b1 = ni * N + (k1 + shift) % N;
      indices.push(a0, a1, b0, a1, b1, b0);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

// C: a seashell -- a tube that widens as it winds, apex up, open at the mouth.
// The standard parametric seashell, three turns.
const shell = () => new ParametricGeometry((u, v, target) => {
  const U = u * Math.PI * 2, V = v * Math.PI * 6, e = Math.exp(V / (Math.PI * 6)), c2 = Math.cos(U / 2) ** 2;
  target.set(2 * (1 - e) * Math.cos(V) * c2, 1 - e * e + (e - 1) * Math.sin(U), 2 * (e - 1) * Math.sin(V) * c2);
}, 64, 420);

// D: a Klein bottle, the classic bottle immersion: the neck turns back and
// passes through the body to join the base from inside.
const klein = () => new ParametricGeometry((u, v, target) => {
  u *= 2 * Math.PI; v *= 2 * Math.PI;
  let x, z;
  if (u < Math.PI) {
    x = 3 * Math.cos(u) * (1 + Math.sin(u)) + 2 * (1 - Math.cos(u) / 2) * Math.cos(u) * Math.cos(v);
    z = -8 * Math.sin(u) - 2 * (1 - Math.cos(u) / 2) * Math.sin(u) * Math.cos(v);
  } else {
    x = 3 * Math.cos(u) * (1 + Math.sin(u)) + 2 * (1 - Math.cos(u) / 2) * Math.cos(v + Math.PI);
    z = -8 * Math.sin(u);
  }
  target.set(x, -z, -2 * (1 - Math.cos(u) / 2) * Math.sin(v));   // stood up: its length is the height
}, 180, 96);

export const SAMPLES = {
  knot:   { make: knot,   name: 'Trefoil knot', view: 'iso',  side: THREE.FrontSide },
  mobius: { make: mobius, name: 'Mobius band',  view: 'iso',  side: THREE.FrontSide },
  shell:  { make: shell,  name: 'Seashell',     view: 'iso',  side: THREE.DoubleSide },
  klein:  { make: klein,  name: 'Klein bottle', view: 'front', side: THREE.DoubleSide },
};

/* The colour is the ACCENT, as a two-stop gradient: light over the top, dark
   underneath, the light end leaning warm and the dark end cool, the way paint
   shifts hue as well as value. Each vertex keeps its 0..1 height, so a new
   accent repaints in place without rebuilding anything. */
export function paintSample(mesh, accentHex) {
  const geometry = mesh.geometry, position = geometry.attributes.position;
  let height = geometry.userData.height;
  if (!height) {
    geometry.computeBoundingBox();
    const { min, max } = geometry.boundingBox, span = Math.max(max.y - min.y, 1e-6);
    height = geometry.userData.height = new Float32Array(position.count);
    for (let i = 0; i < position.count; i++) height[i] = (position.getY(i) - min.y) / span;
  }
  const { top, bottom } = sampleGradient(accentHex);
  if (!geometry.attributes.color) geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(position.count * 3), 3));
  const colors = geometry.attributes.color.array, c = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const h = height[i], t = h * h * (3 - 2 * h);   // smoothstep: soft at both ends
    c.copy(bottom).lerp(top, t);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geometry.attributes.color.needsUpdate = true;
}

export function makeSample(key, accentHex) {
  const spec = SAMPLES[key] || SAMPLES.knot;
  const geometry = spec.make();
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .38, metalness: .04, side: spec.side }));
  mesh.name = spec.name;
  paintSample(mesh, accentHex);
  return mesh;
}
