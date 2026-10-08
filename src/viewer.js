import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { TDSLoader } from 'three/addons/loaders/TDSLoader.js';
import { USDLoader } from 'three/addons/loaders/USDLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import brand from '../desktop/brand.json';
import { supported, extensionOf, nativeAdvice, sniffMismatch, fbxVersion } from './formats.js';
import { showError, hideError, describeFailure } from './errors.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DEFAULT_BACKGROUND, initBackground } from './background.js';
import { ACCENTS } from './accent.js';
import { captureCamera } from './capture.js';
import { SAMPLES, makeSample, paintSample } from './sample.js';
import { dropdown } from './dropdown.js';

const $ = id => document.getElementById(id);
document.title = `${brand.name} • Model Viewer`;
document.querySelector('header h1').textContent = brand.name;
const scene = new THREE.Scene();
scene.background = new THREE.Color(DEFAULT_BACKGROUND);
/* high-performance asks a laptop for its discrete GPU, which is where a
   ten-million-triangle model belongs. preserveDrawingBuffer is OFF: it costs a
   copy of the frame on every frame, and the one reader that needed it -- the
   screenshot -- renders and reads in the same task, before the buffer clears. */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('viewport').appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
let framingAspect = 1;
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
const studio = pmrem.fromScene(room, 0.04);
room.dispose(); pmrem.dispose();
scene.environment = studio.texture;
scene.environmentIntensity = 0.65;
const hemi = new THREE.HemisphereLight(0xffffff, 0x53596b, 1.3);
scene.add(hemi);
const lights = new THREE.Group();
for (const [color, intensity, position] of [[0xffffff, 2.5, [4, 6, 5]], [0xb4ceff, 1.0, [-4, 2, 1]], [0xffffff, 2.0, [1, 4, -5]]]) {
  const light = new THREE.DirectionalLight(color, intensity);
  light.position.set(...position); lights.add(light);
}
scene.add(lights);
const grid = new THREE.GridHelper(12, 24, 0x626eaa, 0x30395f);
scene.add(grid);
const background = initBackground(scene, grid);
const holder = new THREE.Group(); scene.add(holder);
/* TWO MODELS CAN BE LOADED AT ONCE: the sample and the one you opened. The
   Sample button swaps which is on screen without reloading either. Each is a
   record -- its wrapper, its meshes, its counts -- and `shown` is the one in
   the holder; root and meshes always describe that one. */
let root = null, meshes = [], temporary = [], urls = [], busy = false;
let sample = null, imported = null, shown = null, sampleKey = 'knot', accentHex = ACCENTS[1][1];
let contextLost = false;

/* RENDER ON DEMAND. The original drew every frame forever, which with a heavy
   model holds the GPU at full load while nothing moves -- fans, battery, and
   in the website overlay a page that stutters behind a viewer nobody is
   touching. Now a frame is drawn when something asks for one: the camera
   moving (OrbitControls fires 'change', and keeps returning true from update()
   while damping settles), any control on the page, a resize, a new model. */
let frameQueued = false, framesDrawn = 0;
function requestRender() {
  if (frameQueued || contextLost) return;
  frameQueued = true;
  requestAnimationFrame(() => {
    frameQueued = false;
    const moving = controls.update();
    renderer.render(scene, camera);
    framesDrawn++;
    if (moving || controls.autoRotate) requestRender();
  });
}
controls.addEventListener('change', requestRender);
// Every control on the page repaints -- cheaper to say once than at each one.
for (const type of ['input', 'change', 'click', 'keydown']) document.addEventListener(type, requestRender, true);

/* THE GPU CAN DROP THE VIEWER. A model bigger than the free video memory, a
   driver reset, a laptop switching GPUs: the context is lost and the canvas
   freezes on its last frame, which reads as a hang. It is said instead. */
renderer.domElement.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  contextLost = true;
  showError({ title: 'The graphics card dropped the viewer',
              body: 'This usually means the model needed more video memory than was free. Close other 3D apps or tabs and reload, or open a lighter version of the model.',
              action: 'Reload the viewer' });
});
const status = (text, error=false) => { $('status').textContent = text; $('status').classList.toggle('error', error); };

function fit(view) {
  const box = new THREE.Box3().setFromObject(holder);
  const center = box.isEmpty() ? new THREE.Vector3(0, 1, 0) : box.getCenter(new THREE.Vector3());
  const size = box.isEmpty() ? new THREE.Vector3(2, 2, 2) : box.getSize(new THREE.Vector3());
  const radius = Math.max(size.length()/2, 0.01);
  const halfAngle = Math.min(THREE.MathUtils.degToRad(camera.fov/2), Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*framingAspect));
  const distance = radius / Math.sin(halfAngle) * 1.15;
  const directions = { front: [0, 0, 1], side: [1, 0, 0], top: [0, 1, 0.0001], iso: [1, .65, 1] };
  const direction = view ? new THREE.Vector3(...directions[view]) : camera.position.clone().sub(controls.target);
  if (direction.lengthSq() < 0.001) direction.set(1, .65, 1);
  controls.target.copy(center); camera.position.copy(center).add(direction.normalize().multiplyScalar(distance));
  camera.near = Math.max(radius/10000, .00001); camera.far = radius * 1000;
  camera.updateProjectionMatrix(); controls.minDistance = radius * .01; controls.maxDistance = radius * 100;
  controls.update();
  requestRender();
}

function disposeRecord(record) {
  if (!record) return;
  const geometries = new Set(), materials = new Set(), textures = new Set();
  record.root.traverse(o => {
    if (o.geometry) geometries.add(o.geometry);
    const originals = o.userData.originalMaterial || o.material;
    if (originals) (Array.isArray(originals) ? originals : [originals]).forEach(m => materials.add(m));
  });
  materials.forEach(m => { Object.values(m).forEach(v => { if(v?.isTexture) textures.add(v); }); m.dispose(); });
  geometries.forEach(g => g.dispose()); textures.forEach(t => { t.source?.data?.close?.(); t.dispose(); });
  record.wrapper.removeFromParent();
}

// Nothing on screen: the empty state. Neither model is thrown away.
function showNothing() {
  temporary.forEach(m => m.dispose()); temporary = [];
  holder.clear(); root = null; meshes = []; shown = null;
  $('empty').hidden = false;
  $('filename').textContent = $('stats').textContent = $('info').textContent = $('maps-note').textContent = '';
  $('capture').disabled = true;
  $('model-info').hidden = true;
  grid.visible = $('grid').checked;
  syncSampleUI();
  requestRender();
}

// The imported model, and its blob URLs, gone for good.
function clearModel() {
  if (shown === imported) showNothing();
  disposeRecord(imported); imported = null;
  urls.forEach(u => URL.revokeObjectURL(u)); urls = [];
}

const plural = (n, one, many = one + 's') => `${n.toLocaleString()} ${n === 1 ? one : many}`;
// 768000 -> 768K, 1234567 -> 1.23M: the header line is a glance, the panel has the exact number.
const short = n => n < 1e3 ? String(n) : n < 1e6 ? `${+(n / 1e3).toFixed(n < 1e4 ? 1 : 0)}K` : `${+(n / 1e6).toFixed(n < 1e7 ? 2 : 1)}M`;
const MAP_KEYS = { base: ['map'], normal: ['normalMap', 'bumpMap'], roughness: ['roughnessMap'], metalness: ['metalnessMap'],
                   specular: ['specularMap', 'specularIntensityMap', 'specularColorMap'] };

function makeRecord(object, name) {
  const record = { root: object, name, meshes: [], triangles: 0, vertices: 0, points: 0, objects: 0, maps: new Set() };
  const materials = new Set(), textures = new Set();
  object.traverse(o => {
    if(o.isLight || o.isCamera) { o.visible = false; return; }
    if (o !== object && !o.isBone) record.objects++;
    // A point cloud is shown as points, and counted as points.
    if (o.isPoints) { record.points += o.geometry.attributes.position?.count || 0; return; }
    if (!o.isMesh) return;
    if(!o.userData.generatedNormals && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
    record.meshes.push(o); o.userData.originalMaterial = o.material;
    record.vertices += o.geometry.attributes.position?.count || 0;
    record.triangles += (o.geometry.index?.count || o.geometry.attributes.position?.count || 0)/3 * (o.isInstancedMesh ? o.count : 1);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      materials.add(m);
      for (const [key, value] of Object.entries(m)) if (value?.isTexture) {
        textures.add(value);
        for (const [map, keys] of Object.entries(MAP_KEYS)) if (keys.includes(key)) record.maps.add(map);
      }
    }
  });
  record.objects = Math.max(record.objects, 1);
  record.triangles = Math.round(record.triangles);
  record.materials = materials.size; record.textures = textures.size;
  if(!record.meshes.length && !record.points) throw new Error('No triangle meshes found in this file.');
  const bound = new THREE.Box3().setFromObject(object);
  const size = bound.getSize(new THREE.Vector3());
  const max = Math.max(size.x, size.y, size.z);
  if(!Number.isFinite(max) || max <= 0) throw new Error('The model has empty or invalid geometry.');
  record.size = size;
  // Normalize a wrapper, preserving the imported object's transforms and normals.
  const wrapper = new THREE.Group(); wrapper.add(object); wrapper.scale.setScalar(3/max);
  wrapper.updateMatrixWorld(true);
  const normalized = new THREE.Box3().setFromObject(wrapper);
  const center = normalized.getCenter(new THREE.Vector3());
  wrapper.position.set(-center.x, -normalized.min.y, -center.z);
  record.wrapper = wrapper;
  return record;
}

const dims = v => [v.x, v.y, v.z].map(n => +n.toPrecision(3)).join(' × ');
function show(record, view = 'iso') {
  temporary.forEach(m => m.dispose()); temporary = [];
  holder.clear(); holder.rotation.set(0,0,0);
  holder.add(record.wrapper);
  shown = record; root = record.root; meshes = record.meshes;
  $('empty').hidden = true;
  $('capture').disabled = false;
  $('model-info').hidden = false;
  grid.visible = $('grid').checked;
  $('filename').textContent = record.name;
  $('filename').title = record.name;
  $('stats').textContent = [
    meshes.length && `${short(record.triangles)} tris`,
    meshes.length && `${short(record.vertices)} verts`,
    meshes.length && plural(meshes.length, 'mesh', 'meshes'),
    record.points && `${short(record.points)} points`,
  ].filter(Boolean).join('  ·  ');
  const rows = [['Objects', record.objects], ['Meshes', meshes.length], ['Materials', record.materials], ['Textures', record.textures],
    ['Vertices', record.vertices], ['Triangles', record.triangles], record.points && ['Points', record.points], ['Size', dims(record.size)]];
  $('info').replaceChildren(...rows.filter(Boolean).flatMap(([k, v]) => {
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = k; dd.textContent = typeof v === 'number' ? v.toLocaleString() : v; dd.dataset.info = k.toLowerCase();
    return [dt, dd];
  }));
  syncSampleUI();
  applyMode(); fit(view); requestRender();
}

function setModel(object, name) { imported = makeRecord(object, name); show(imported); }

/* SHADING is one list. Material: the file's own materials, with each texture
   map switchable below. Unlit: no lighting at all -- base colour, its texture
   and vertex colours as they are. Vertex colors: those colours, lit. Grayscale:
   one neutral material, to read the surface. Normals: directions as RGB.
   Wireframe, flat and two-sided apply to every one of them. */
function applyMode() {
  temporary.forEach(m => m.dispose()); temporary = [];
  const mode = $('mode').value;
  const on = {};
  for (const box of document.querySelectorAll('#maps input')) {
    const map = box.dataset.map;
    // Only the maps this model has, and only in the modes that draw textures.
    box.disabled = !(mode === 'material' || (mode === 'raw' && map === 'base')) || (!!shown && !shown.maps.has(map));
    on[map] = box.checked && !box.disabled;
  }
  for (const mesh of meshes) {
    const originals = mesh.userData.originalMaterial;
    const hasColors = !!mesh.geometry.attributes.color;
    const converted = (Array.isArray(originals) ? originals : [originals]).map(original => {
      let material;
      if(mode === 'material') {
        material = original.clone();
        for (const [map, keys] of Object.entries(MAP_KEYS)) if (!on[map]) for (const key of keys) if (key in material) material[key] = null;
      }
      else if(mode === 'raw') material = new THREE.MeshBasicMaterial({ color: original.color ?? 0xffffff, map: on.base ? original.map ?? null : null,
        vertexColors: hasColors, transparent: !!original.transparent, opacity: original.opacity ?? 1, alphaTest: original.alphaTest ?? 0, toneMapped: false });
      else if(mode === 'vertex') material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: hasColors, roughness: .65, metalness: 0 });
      else if(mode === 'normal') material = new THREE.MeshNormalMaterial();
      else material = new THREE.MeshStandardMaterial({ color: 0xa7abb3, roughness: .42, metalness: 0 });
      material.wireframe = $('wireframe').checked;
      material.flatShading = $('flat').checked || (mode === 'material' && !!original.flatShading);
      material.side = $('twosided').checked ? THREE.DoubleSide : original.side;
      material.needsUpdate = true;
      temporary.push(material); return material;
    });
    mesh.material = Array.isArray(originals) ? converted : converted[0];
  }
  if (shown) {
    const found = [...shown.maps];
    $('maps-note').textContent = !found.length ? 'This model has no texture maps.'
      : mode === 'material' || mode === 'raw' ? '' : 'Texture maps show in Material and Unlit.';
  }
  $('maps').classList.toggle('off', mode !== 'material' && mode !== 'raw');
  $('hint').textContent = mode === 'raw' ? 'Unlit: base colour, its texture and vertex colours, with no lighting.' : mode === 'clay' ? 'Gray inspection material reveals the imported surface shading.' : mode === 'normal' ? 'Surface normals shown as RGB directions.' : mode === 'vertex' ? 'Vertex colors with studio lighting. Meshes without colors appear white.' : 'Imported materials, with each texture map switchable.';
  requestRender();
}

// ---- decoders, built once --------------------------------------------------
// Heavy GLBs are COMPRESSED: Draco or Meshopt for the geometry, KTX2 for the
// textures. Without these a production GLB fails outright, so they ship with
// the viewer (dist/decoders/) and load only when a file actually needs them.
// They get their own default LoadingManager on purpose: the model's manager
// rewrites every URL to a local blob or an empty data: URI so a model can never
// make a network request, and that would also stop the decoder fetching itself.
const decoderBase = new URL('decoders/', document.baseURI).href;
const draco = new DRACOLoader().setDecoderPath(decoderBase + 'draco/');
draco.setWorkerLimit(Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)));
const ktx2 = new KTX2Loader().setTranscoderPath(decoderBase + 'basis/').detectSupport(renderer);

// ---- the parse worker ------------------------------------------------------
// OBJ, STL and PLY are parsed off the main thread; see parse-worker.js.
const WORKER_FORMATS = new Set(['obj', 'stl', 'ply']);
/* CANCEL COVERS THE WHOLE LOAD, not just the worker. The button is on screen
   from the first frame, and the worker only starts once the file has been
   read -- a Cancel pressed in that first hundred milliseconds used to find
   nothing to cancel and the model loaded anyway. The check caught it. */
const CANCELLED = () => Object.assign(new Error('Cancelled'), { cancelled: true });
let worker = null, workerSeq = 0, cancelLoad = null;
function parseInWorker(ext, buffer, token) {
  worker ??= new Worker(new URL('parse-worker.js', document.baseURI));
  const id = ++workerSeq, w = worker;
  return new Promise((resolve, reject) => {
    const done = () => { w.removeEventListener('message', onMessage); w.removeEventListener('error', onError); token.onCancel = null; };
    const onMessage = ({ data }) => {
      if (data.id !== id) return;
      done();
      if (data.error) reject(Object.assign(new Error(data.error.message), { name: data.error.name }));
      else resolve(data.parts);
    };
    // A worker that dies without answering has almost always run out of memory.
    const onError = event => { done(); worker = null; reject(Object.assign(new Error(event.message || 'The parser stopped without answering.'), { name: 'RangeError' })); };
    token.onCancel = () => { done(); w.terminate(); if (worker === w) worker = null; reject(CANCELLED()); };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ id, ext, buffer }, [buffer]);
  });
}

// The worker's typed arrays, made back into scene objects. Materials are made
// here, by name, by whatever the format calls for.
function buildFromParts(parts, materialFor) {
  const group = new THREE.Group();
  for (const part of parts) {
    const geometry = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(part.geometry.attributes)) geometry.setAttribute(name, new THREE.BufferAttribute(a.array, a.itemSize, a.normalized));
    if (part.geometry.index) geometry.setIndex(new THREE.BufferAttribute(part.geometry.index, 1));
    for (const g of part.geometry.groups) geometry.addGroup(g.start, g.count, g.materialIndex);
    const made = part.materials.map(m => materialFor(m, part.kind));
    const material = part.multi ? made : made[0];
    const object = part.kind === 'points' ? new THREE.Points(geometry, material)
      : part.kind === 'lines' ? new THREE.LineSegments(geometry, material) : new THREE.Mesh(geometry, material);
    object.name = part.name;
    if (part.generatedNormals) object.userData.generatedNormals = true;
    group.add(object);
  }
  return group;
}

const forKind = (material, kind, vertexColors) => {
  if (kind === 'points') return new THREE.PointsMaterial({ color: material?.color ?? 0xffffff, size: 2, sizeAttenuation: false, vertexColors });
  if (kind === 'lines') return new THREE.LineBasicMaterial({ color: material?.color ?? 0xffffff, vertexColors });
  return material;
};

// ---- the loading card ------------------------------------------------------
let loadTimer = 0;
function showLoading(name, cancellable) {
  const started = performance.now();
  $('loading-name').textContent = name;
  $('loading-cancel').hidden = !cancellable;
  const tick = () => { $('loading-time').textContent = `${Math.floor((performance.now() - started) / 1000)}s`; };
  tick(); clearInterval(loadTimer); loadTimer = setInterval(tick, 1000);
  $('loading').hidden = false;
}
function hideLoading() { clearInterval(loadTimer); $('loading').hidden = true; }
$('loading-cancel').onclick = () => cancelLoad?.();
// One frame for the card to PAINT before a main-thread parse takes the thread.
const paint = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

async function loadFiles(files) {
  if(busy || !files.length) return;
  hideError();
  const models = files.filter(f => supported.test(f.name));
  if(models.length !== 1) {
    const native = !models.length && files.map(f => nativeAdvice(f.name)).find(Boolean);
    if (native) showError(native);
    else if (models.length) showError({ title: 'One model at a time', body: 'Open a single model, together with its textures, .bin or .mtl files.' });
    else showError({ title: 'Not a model this viewer reads', body: 'Choose a GLB, GLTF, FBX, OBJ, PLY, STL, DAE, 3MF, 3DS or USD/USDZ file.' });
    return;
  }
  const model = models[0];
  const ext = extensionOf(model.name);
  const token = { cancelled: false, onCancel: null };
  cancelLoad = () => { token.cancelled = true; token.onCancel?.(); };
  const checkpoint = () => { if (token.cancelled) throw CANCELLED(); };
  busy = true; $('open').disabled = true; status('');
  clearModel(); showNothing();
  showLoading(model.name, WORKER_FORMATS.has(ext));
  const exact = new Map(), basenames = new Map(), missing = new Set();
  const normalize = s => decodeURIComponent(s).replaceAll('\\','/').replace(/^\.\//,'').toLowerCase();
  for(const file of files) {
    const key = normalize(file.webkitRelativePath || file.name);
    const url = URL.createObjectURL(file); urls.push(url); exact.set(key,url);
    const base = key.split('/').pop();
    if(!basenames.has(base)) basenames.set(base,url); else basenames.set(base,null);
  }
  let finish;
  const finished = new Promise(resolve => finish = resolve);
  const manager = new THREE.LoadingManager(finish);
  manager.onError = url => missing.add(url.startsWith('blob:') ? 'an image or dependency' : url);
  manager.setURLModifier(url => {
    if(/^(data:|blob:)/i.test(url)) return url;
    const key = normalize(url);
    const match = exact.get(key) || basenames.get(key.split('/').pop());
    if(match) return match;
    missing.add(url);
    // Never fetch remote references from a model.
    return 'data:application/octet-stream;base64,';
  });
  manager.itemStart('__model__');
  try {
    const bytes = await model.arrayBuffer();
    checkpoint();
    const head = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 4096));
    const mismatch = sniffMismatch(ext, head);
    if (mismatch) throw Object.assign(new Error(mismatch), { friendly: { title: `This isn't a working .${ext} file`, body: mismatch } });
    if (ext === 'fbx') {
      const version = fbxVersion(head);
      if (version && version < 7000) throw Object.assign(new Error(`FBX version ${version}`), { friendly: {
        title: 'This FBX is too old to read', body: `It is FBX ${(version / 1000).toFixed(1)}. Files from before FBX 7.0 (2011) are not supported — re-save it as FBX 2014 or newer.` } });
    }
    let object;
    if (WORKER_FORMATS.has(ext)) {
      // MTL first, on this thread: its textures need the document.
      let materials = null;
      if (ext === 'obj') {
        const mtlName = /^mtllib\s+(.+)$/m.exec(new TextDecoder().decode(new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 1 << 20))))?.[1]?.trim();
        const mtlFile = files.find(f => normalize(f.name) === normalize(mtlName || '')) || files.find(f => /\.mtl$/i.test(f.name));
        if (mtlFile) { materials = new MTLLoader(manager).parse(await mtlFile.text(), ''); materials.preload(); }
        else if (mtlName) missing.add(mtlName);
      }
      checkpoint();
      const parts = await parseInWorker(ext, bytes, token);
      object = buildFromParts(parts, (m, kind) => {
        if (ext === 'obj') {
          let made = materials?.create(m.name);
          made = made ? made.clone() : new THREE.MeshPhongMaterial({ name: m.name });
          made.flatShading = m.flatShading; made.vertexColors = m.vertexColors;
          return forKind(made, kind, m.vertexColors);
        }
        const base = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: m.vertexColors, roughness: .65,
          transparent: (m.opacity ?? 1) < 1, opacity: m.opacity ?? 1 });
        return forKind(base, kind, m.vertexColors);
      });
    } else {
      await paint();
      if(ext === 'glb' || ext === 'gltf') {
        const loader = new GLTFLoader(manager).setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
        object = (await loader.parseAsync(bytes, '')).scene;
      }
      else if(ext === 'fbx') object = new FBXLoader(manager).parse(bytes, '');
      else if(ext === 'dae') object = new ColladaLoader(manager).parse(new TextDecoder().decode(bytes), '').scene;
      else if(ext === '3mf') object = new ThreeMFLoader(manager).parse(bytes);
      else if(ext === '3ds') object = new TDSLoader(manager).parse(bytes, '');
      else object = new USDLoader(manager).parse(bytes);
    }
    manager.itemEnd('__model__'); await finished;
    setModel(object, model.name);
    if (missing.size) status(`Missing assets: ${[...missing].join(', ')}. Reopen with the companion files selected too.`, true);
  } catch(error) {
    manager.itemEnd('__model__');
    clearModel();
    if (!error?.cancelled) {
      console.error(error);
      showError(error?.friendly || describeFailure(error, { ext, name: model.name }));
    }
  } finally { cancelLoad = null; hideLoading(); busy = false; $('open').disabled = false; $('files').value = ''; requestRender(); }
}

$('error-action').onclick = () => {
  hideError();
  if (contextLost) location.reload();
  else $('open').click();
};
$('error-close').onclick = hideError;

/* ESCAPE IS CLAIMED BY WHATEVER IT CLOSES. Inside the website overlay the
   parent closes the whole window on an Escape nobody claimed (it reads
   defaultPrevented a tick late). The colour picker is a native <dialog> that
   closes itself without claiming the key, so one press shut the picker AND
   the overlay. Each of these now closes its own thing and says so -- the
   picker by hand, because preventDefault also stops its native close. */
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if ($('background-picker').open) { event.preventDefault(); $('background-picker').close(); }
  else if (!$('loading').hidden && cancelLoad) { event.preventDefault(); cancelLoad(); }
  else if (!$('error-card').hidden) { event.preventDefault(); hideError(); }
});

$('open').onclick = () => window.mobiusDesktop ? window.mobiusDesktop.open().catch(error => status(error.message, true)) : $('files').click();
$('files').onchange = e => loadFiles([...e.target.files]);
for(const id of ['mode','wireframe','flat','twosided']) $(id).onchange = applyMode;
for (const box of document.querySelectorAll('#maps input')) box.onchange = applyMode;
const dropdowns = [dropdown($('mode')), dropdown($('lighting'))];
$('grid').onchange = () => grid.visible = $('grid').checked;
$('spin').onchange = () => controls.autoRotate = $('spin').checked;
$('fit').onclick = () => fit();

document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => fit(button.dataset.view));
$('exposure').oninput = () => renderer.toneMappingExposure = Number($('exposure').value);
$('lighting').onchange = () => {
  const preset = $('lighting').value;
  scene.environment = preset === 'studio' ? studio.texture : null;
  hemi.intensity = preset === 'raking' ? .2 : preset === 'soft' ? 2.5 : 1.3;
  lights.children.forEach((l,i) => l.intensity = preset === 'raking' ? [4,0,0][i] : preset === 'soft' ? [.7,.3,.4][i] : [2.5,1,2][i]);
};
$('rotateLight').oninput = () => { lights.rotation.y = Number($('rotateLight').value); scene.environmentRotation.y = lights.rotation.y; };
$('up').onclick = () => { holder.rotation.x -= Math.PI/2; fit('iso'); };
$('capture').onclick = () => {
  const exportCamera = captureCamera(camera, holder, renderer.domElement.width/renderer.domElement.height);
  const gridWasVisible = grid.visible;
  let png;
  try {
    grid.visible = false;
    renderer.render(scene,exportCamera);
    png = renderer.domElement.toDataURL('image/png');
  } finally {
    grid.visible = gridWasVisible;
    renderer.render(scene,camera);
  }
  const a=document.createElement('a'); a.download='model-preview.png'; a.href=png; a.click();
};
document.addEventListener('keydown',e => {
  if ($('background-picker').open) return;
  if(/INPUT|SELECT/.test(e.target.tagName)) return;
  if(e.key.toLowerCase() === 'f') fit();
  if(e.key.toLowerCase() === 'w') { $('wireframe').checked = !$('wireframe').checked; applyMode(); }
  if(e.key.toLowerCase() === 'o') $('open').click();
});
let dragDepth = 0;
document.addEventListener('dragenter',e => { e.preventDefault(); dragDepth++; $('drop').hidden=false; });
document.addEventListener('dragover',e => e.preventDefault());
document.addEventListener('dragleave',e => { e.preventDefault(); if(--dragDepth<=0) $('drop').hidden=true; });
document.addEventListener('drop',e => { e.preventDefault(); dragDepth=0; $('drop').hidden=true; loadFiles([...e.dataTransfer.files]); });
const resize = () => {
  const rect = $('viewport').getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const panel = document.querySelector('aside').getBoundingClientRect();
  const reserved = $('controls-panel').hidden ? 0 : rect.right - panel.left + 16;
  renderer.setSize(rect.width, rect.height);
  framingAspect = Math.max(rect.width - reserved, 100) / rect.height;
  camera.setViewOffset(rect.width, rect.height, reserved / 2, 0, rect.width, rect.height);
  requestRender();
};
function toggleControls(hidden) {
  $('controls-panel').hidden = hidden;
  document.body.classList.toggle('controls-hidden', hidden);
  $('toggle-controls').setAttribute('aria-expanded', String(!hidden));
  resize(); fit();
}
$('toggle-controls').onclick = () => toggleControls(!$('controls-panel').hidden);
const compactLayout = matchMedia('(max-width:680px)');
compactLayout.addEventListener('change', e => toggleControls(e.matches));
toggleControls(compactLayout.matches);
// Only a close request crosses the iframe boundary; model data stays local.
if (new URLSearchParams(location.search).get('embed') === '1' && window.parent !== window) {
  let parentOrigin;
  try { parentOrigin = new URL(document.referrer).origin; } catch { /* Use the host close button. */ }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !e.defaultPrevented && parentOrigin && parentOrigin !== 'null') {
      window.parent.postMessage({ type: 'mobius:close-request' }, parentOrigin);
    }
  });
}
const accents = ACCENTS;
function selectAccent(name) {
  const [label, color] = accents.find(([label]) => label === name) || accents[1];
  $('accent-name').textContent = label;
  for (const button of $('accent-swatches').children) {
    button.setAttribute('aria-pressed', String(button.dataset.accent === label));
    button.style.setProperty('--swatch', accents.find(([name]) => name === button.dataset.accent)[1]);
  }
  background.setAccent(color);
  accentHex = color;
  if (sample) { paintSample(sample.root, color); requestRender(); }
  try { localStorage.setItem('mobius-accent', label); } catch { /* Storage may be unavailable for local files. */ }
}
for (const [name, color] of accents) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'accent-swatch'; button.dataset.accent = name;
  button.title = name; button.setAttribute('aria-label', `${name} accent`);
  button.style.setProperty('--swatch', color);
  button.onclick = () => selectAccent(name);
  $('accent-swatches').appendChild(button);
}
let savedAccent;
try { savedAccent = localStorage.getItem('mobius-accent'); } catch { /* Use the default accent. */ }
selectAccent(savedAccent);
new ResizeObserver(resize).observe($('viewport'));
resize(); showNothing(); fit('iso');
status('');
/* THE SAMPLE is on when the viewer opens, so a visitor with no model of their
   own still sees it work; opening a model turns it off, and the Sample button
   swaps between the two from then on. ?sample=<key> picks the shape. */
function syncSampleUI() {
  const on = !!sample && shown === sample;
  $('sample-toggle').setAttribute('aria-pressed', String(on));
  $('sample-toggle').title = on ? (imported ? `Back to ${imported.name}` : 'Hide the sample model') : 'Show the sample model';
  $('sample-section').hidden = !on;
  for (const b of document.querySelectorAll('[data-sample]')) b.setAttribute('aria-pressed', String(b.dataset.sample === sampleKey));
}
function showSample(key = sampleKey) {
  if (busy) return;
  hideError();
  if (!sample || key !== sampleKey) {
    if (shown === sample) showNothing();
    disposeRecord(sample);
    sampleKey = key in SAMPLES ? key : 'knot';
    sample = makeRecord(makeSample(sampleKey, accentHex), SAMPLES[sampleKey].name);
  }
  show(sample, SAMPLES[sampleKey].view);
}
$('sample-toggle').onclick = () => {
  if (shown === sample && sample) { if (imported) show(imported); else showNothing(); }
  else showSample();
};
for (const b of document.querySelectorAll('[data-sample]')) b.onclick = () => showSample(b.dataset.sample);
$('load-sample').onclick = () => showSample();

/* SHIFT-CLICK A SECTION to open or close all of them: a closed one opens
   every section, an open one closes every section. */
for (const summary of document.querySelectorAll('.panel-controls summary')) summary.addEventListener('click', event => {
  if (!event.shiftKey) return;
  event.preventDefault();
  const open = !summary.parentElement.open;
  for (const d of document.querySelectorAll('.panel-controls details')) d.open = open;
  requestRender();
});

/* RESET, armed like every destructive button on the site: the first press asks
   "Sure?", a second within three seconds resets every option to its default.
   The model on screen stays; only how it is shown goes back. */
let resetArmed = 0;
function disarmReset() { clearTimeout(resetArmed); resetArmed = 0; $('reset').classList.remove('armed'); $('reset').textContent = 'Reset'; }
$('reset').onclick = () => {
  if (!resetArmed) {
    $('reset').classList.add('armed'); $('reset').textContent = 'Sure?';
    resetArmed = setTimeout(disarmReset, 3000);
    return;
  }
  disarmReset();
  const set = (id, value, event = 'change') => {
    const el = $(id);
    if (el.type === 'checkbox') el.checked = value; else el.value = value;
    el.dispatchEvent(new Event(event, { bubbles: true }));
  };
  set('mode', 'material'); set('lighting', 'studio'); set('rotateLight', 0, 'input'); set('exposure', 1, 'input');
  for (const id of ['wireframe', 'flat', 'twosided', 'spin']) set(id, false);
  set('grid', true);
  for (const box of document.querySelectorAll('#maps input')) box.checked = true;
  $('color-reset').click();
  selectAccent(ACCENTS[1][0]);
  dropdowns.forEach(d => d.sync());
  if (shown === sample && sampleKey !== 'knot') showSample('knot');
  else if (shown) { applyMode(); holder.rotation.set(0,0,0); fit(shown === sample ? SAMPLES[sampleKey].view : 'iso'); }
};
$('reset').onblur = disarmReset;

const wantedSample = new URLSearchParams(location.search).get('sample');
showSample(wantedSample in SAMPLES ? wantedSample : 'knot');
requestRender();
window.viewerReady = true;
/* For the checks in verification/, and harmless to anyone else: how many
   frames have been drawn (render-on-demand is asserted as "none while idle"),
   and a way to make the GPU drop the context, which nothing else can force. */
window.mobiusDebug = {
  get frames() { return framesDrawn; },
  // The exact counts, in words, for checks that need more than the header's "768K tris".
  get statsText() {
    if (!shown) return '';
    return [shown.meshes.length && plural(shown.triangles, 'triangle'), shown.meshes.length && plural(shown.vertices, 'vertex', 'vertices'),
      shown.meshes.length && plural(shown.meshes.length, 'mesh', 'meshes'), shown.points && plural(shown.points, 'point')].filter(Boolean).join('  ·  ');
  },
  materials: () => meshes.flatMap(m => [m.material].flat()).map(m => ({ type: m.type, wireframe: m.wireframe, flatShading: m.flatShading, side: m.side })),
  sampleTop: () => { const c = sample?.root.geometry.attributes.color; if (!c) return null; let i = 0, best = 0; const h = sample.root.geometry.userData.height; for (let j = 0; j < h.length; j++) if (h[j] > h[best]) best = j; i = best; return { r: +c.getX(i).toFixed(3), g: +c.getY(i).toFixed(3), b: +c.getZ(i).toFixed(3) }; },
  get shown() { return shown === sample ? 'sample' : shown === imported && shown ? 'imported' : null; },
  loseContext: () => renderer.getContext().getExtension('WEBGL_lose_context')?.loseContext(),
  ktx2Ready: () => ktx2.init(),
  // A frame drawn NOW, in the caller's task, for checks that read the canvas
  // back: with render-on-demand and no preserveDrawingBuffer the buffer is
  // only readable in the same task that drew it.
  render: () => renderer.render(scene, camera),
};
if (window.mobiusDesktop) {
  let incoming = Promise.resolve();
  window.mobiusDesktop.onFiles(payload => {
    incoming = incoming.then(async () => {
      if (payload.error) { status(payload.error, true); return; }
      const files = payload.files.map(entry => {
        const file = new File([entry.bytes], entry.name);
        Object.defineProperty(file, 'webkitRelativePath', {value:entry.relativePath});
        return file;
      });
      await loadFiles(files);
      if (payload.warnings?.length) status(payload.warnings.join(' '), true);
    }).catch(error => status(error.message, true));
  });
  window.mobiusDesktop.ready();
}

