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

/* The colour is the ACCENT, as a two-stop gradient: lighter over the top,
   deeper underneath, the light end leaning warm and the dark end cool, the way
   paint shifts hue as well as value. Each vertex keeps its 0..1 height, so a
   new accent repaints in place without rebuilding anything. */
export function paintSample(mesh, accentHex) {
  const geometry = mesh.geometry, position = geometry.attributes.position;
  let height = geometry.userData.height;
  if (!height) {
    // Off the positions themselves: a bounding box also counts every blend
    // shape at full weight at once, which squeezed the gradient into the middle.
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < position.count; i++) { const y = position.getY(i); min = Math.min(min, y); max = Math.max(max, y); }
    const span = Math.max(max - min, 1e-6);
    height = geometry.userData.height = new Float32Array(position.count);
    for (let i = 0; i < position.count; i++) height[i] = (position.getY(i) - min) / span;
  }
  const { top, bottom } = sampleGradient(accentHex);
  if (!geometry.attributes.color) geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(position.count * 3), 3));
  const colors = geometry.attributes.color.array, c = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    // Straight across the whole height: a smoothstep put all the change in the
    // middle third, and the top and bottom read as two flat colours.
    c.copy(bottom).lerp(top, height[i]);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geometry.attributes.color.needsUpdate = true;
}

/* THE KNOT MOVES. Its blend shapes are pushes along the surface normal, keyed
   to where a vertex sits on the strip (u, 0..1 along the knot) and round the
   tube (v, 0..1): Bulge swells beads along it, Ridges flutes the tube, Pinch
   thins it. The WAVE that travels round the strip is four more, the same ripple
   a quarter-cycle apart. Any sine travelling as sin(ku - t) is a mix of those
   four with weights max(0, cos(t - phase)) -- never negative, so every one is
   an ordinary 0..1 blend shape -- which makes "Wave" a plain keyframed clip of
   four weights that any viewer could play, not code running per frame. */
const TUBULAR = 360, RADIAL = 40;
const WAVES = 9, PHASES = [0, 90, 180, 270];
const KNOT_SHAPES = [
  ['Bulge',  (u, v) => .13 * Math.max(0, Math.sin(u * Math.PI * 2 * 7)) ** 2],
  ['Ridges', (u, v) => .05 * Math.cos(v * Math.PI * 2 * 8)],
  ['Pinch',  () => -.14],
  ...PHASES.map((p, i) => [`Wave ${'ABCD'[i]}`, u => .09 * Math.sin(u * Math.PI * 2 * WAVES - p * Math.PI / 180)]),
];

/* The tube's start and end rings are the same points twice, and normals
   computed face by face differ across that seam -- a dotted line of shading
   round the tube. Points that share a position share one averaged normal. */
function seamGroups(position) {
  const groups = new Map();
  for (let i = 0; i < position.count; i++) {
    const key = [position.getX(i), position.getY(i), position.getZ(i)].map(v => Math.round(v * 1e4)).join();
    groups.has(key) ? groups.get(key).push(i) : groups.set(key, [i]);
  }
  return [...groups.values()].filter(g => g.length > 1);
}
function weld(normals, groups) {
  for (const group of groups) {
    let x = 0, y = 0, z = 0;
    for (const i of group) { x += normals[i * 3]; y += normals[i * 3 + 1]; z += normals[i * 3 + 2]; }
    const l = Math.hypot(x, y, z) || 1;
    for (const i of group) { normals[i * 3] = x / l; normals[i * 3 + 1] = y / l; normals[i * 3 + 2] = z / l; }
  }
}

function addKnotShapes(geometry) {
  const position = geometry.attributes.position, normal = geometry.attributes.normal, n = position.count;
  const groups = seamGroups(position);
  weld(normal.array, groups);
  geometry.morphAttributes.position = []; geometry.morphAttributes.normal = [];
  geometry.morphTargetsRelative = true;
  const scratch = new THREE.BufferGeometry();
  scratch.setIndex(geometry.index);
  for (const [name, push] of KNOT_SHAPES) {
    const delta = new Float32Array(n * 3), moved = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.floor(i / (RADIAL + 1)) / TUBULAR, v = (i % (RADIAL + 1)) / RADIAL, d = push(u, v);
      for (let a = 0; a < 3; a++) {
        delta[i * 3 + a] = normal.array[i * 3 + a] * d;
        moved[i * 3 + a] = position.array[i * 3 + a] + delta[i * 3 + a];
      }
    }
    // The shape's own normals, so a bulge catches the light like one.
    scratch.setAttribute('position', new THREE.BufferAttribute(moved, 3));
    scratch.computeVertexNormals();
    const shaded = scratch.attributes.normal.array;
    weld(shaded, groups);
    const normalDelta = new Float32Array(n * 3);
    for (let j = 0; j < n * 3; j++) normalDelta[j] = shaded[j] - normal.array[j];
    const target = new THREE.BufferAttribute(delta, 3); target.name = name;
    const targetNormal = new THREE.BufferAttribute(normalDelta, 3); targetNormal.name = name;
    geometry.morphAttributes.position.push(target); geometry.morphAttributes.normal.push(targetNormal);
  }
  scratch.dispose();
}

// Two clips, so the list has something to choose between.
function knotClips() {
  const index = name => KNOT_SHAPES.findIndex(([n]) => n === name);
  const track = (name, times, values) => new THREE.NumberKeyframeTrack(`.morphTargetInfluences[${index(name)}]`, times, values);
  const steps = 96, period = 4, times = [], wave = PHASES.map(() => []), beads = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps * period, theta = t / period * Math.PI * 2;
    times.push(t);
    PHASES.forEach((p, i) => wave[i].push(Math.max(0, Math.cos(theta - p * Math.PI / 180))));
    beads.push(.25 + .2 * Math.sin(theta * 2));
  }
  const waveClip = new THREE.AnimationClip('Wave', period, [
    ...PHASES.map((p, i) => track(`Wave ${'ABCD'[i]}`, times, wave[i])), track('Bulge', times, beads)]);
  const pulse = [], ridges = [];
  for (let s = 0; s <= steps; s++) { const theta = s / steps * Math.PI * 2; pulse.push(.5 - .5 * Math.cos(theta)); ridges.push(.5 + .5 * Math.sin(theta)); }
  const pulseClip = new THREE.AnimationClip('Pulse', period / 2, [
    track('Bulge', times.map(t => t / 2), pulse), track('Ridges', times.map(t => t / 2), ridges)]);
  return [waveClip, pulseClip];
}

/* The material: a satin plastic, with highlights tight enough to show the
   form and a specular held under the default, so the studio's white walls do
   not wash a pale film over every grazing edge. */
export const sampleMaterial = side => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .35, metalness: 0, specularIntensity: .7, side });

export function makeSample(key, accentHex) {
  const spec = SAMPLES[key] || SAMPLES.knot;
  const geometry = spec.make();
  geometry.computeVertexNormals();
  if (key === 'knot') addKnotShapes(geometry);
  const mesh = new THREE.Mesh(geometry, sampleMaterial(spec.side));
  mesh.name = spec.name;
  // The knot opens fluted (Dex): Ridges at 80%, a resting weight rather than
  // a held one, so Pulse, which keys Ridges, still moves it.
  if (key === 'knot') { mesh.updateMorphTargets(); mesh.animations = knotClips(); mesh.userData.restShapes = { Ridges: .8 }; }
  paintSample(mesh, accentHex);
  return mesh;
}
