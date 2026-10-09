import * as THREE from 'three';

/* THE ORIENTATION GIZMO, top left under the title and exactly its width: the
   three axes as the camera sees them, drawn in SVG over the viewport (crisp at
   any scale, and no second WebGL pass). Y is up and FRONT IS +Z -- the camera
   on the +Z side looking back at the model -- which is glTF's convention and
   three's, and what Blender calls front once its Z-up is turned Y-up. The line
   under the axes names the side you are looking at. A positive axis is a
   filled, lettered ball; its negative a hollow ring; pressing either frames
   the model from that side. The top-left corner button folds it into a small icon,
   and the choice is remembered. */
const AXES = [
  { key: 'x', color: '#ff5c6c', dir: new THREE.Vector3(1, 0, 0) },
  { key: 'y', color: '#7ee36b', dir: new THREE.Vector3(0, 1, 0) },
  { key: 'z', color: '#5ea2ff', dir: new THREE.Vector3(0, 0, 1) },
];
// Which side the camera is on, by the axis it is furthest along.
const SIDES = { '+z': 'Front', '-z': 'Back', '+x': 'Right', '-x': 'Left', '+y': 'Top', '-y': 'Bottom' };
const VIEWS = { '+z': 'front', '-z': 'back', '+x': 'right', '-x': 'left', '+y': 'top', '-y': 'bottom' };
const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}) => { const e = document.createElementNS(NS, name); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

export function initGizmo({ camera, title, onView }) {
  const root = document.createElement('div');
  root.id = 'gizmo';
  // The corner buttons wear the site's dark tip (.gizmo-tip, shown on hover
  // and keyboard focus), not a native title, which draws the OS's own box.
  root.innerHTML = `<button type="button" class="gizmo-fold" aria-label="Hide gizmo">–<span class="gizmo-tip" aria-hidden="true">Hide gizmo</span></button>
    <button type="button" class="gizmo-open" aria-label="Show gizmo"><span class="gizmo-tip" aria-hidden="true">Show gizmo</span></button>
    <div class="gizmo-side" aria-live="polite"></div>`;
  const svg = el('svg', { viewBox: '-50 -50 100 100', role: 'img', 'aria-label': 'Orientation: X right, Y up, Z front' });
  root.insertBefore(svg, root.querySelector('.gizmo-side'));
  // The folded icon: the same three axes, small and fixed.
  root.querySelector('.gizmo-open').insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M10 14 L20 14" stroke="#ff5c6c"/><path d="M10 14 L10 4" stroke="#7ee36b"/><path d="M10 14 L4 20" stroke="#5ea2ff"/></svg>`);
  svg.append(el('circle', { r: 47, class: 'gizmo-disc' }));
  const items = [];
  for (const axis of AXES) for (const sign of [1, -1]) {
    const g = el('g', { class: `gizmo-axis ${sign > 0 ? 'pos' : 'neg'}`, tabindex: 0, role: 'button' });
    const id = `${sign > 0 ? '+' : '-'}${axis.key}`;
    g.setAttribute('aria-label', `View from the ${SIDES[id].toLowerCase()} (${id.toUpperCase()})`);
    const line = sign > 0 ? el('line', { stroke: axis.color }) : null;
    const ball = el('circle', { r: sign > 0 ? 9 : 6.5, fill: sign > 0 ? axis.color : '#0d2029', stroke: axis.color });
    const label = sign > 0 ? Object.assign(el('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central' }), { textContent: axis.key.toUpperCase() }) : null;
    if (line) g.append(line);
    g.append(ball); if (label) g.append(label);
    const go = () => onView(VIEWS[id]);
    g.addEventListener('click', go);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    items.push({ g, line, ball, label, dir: axis.dir.clone().multiplyScalar(sign), id });
  }
  svg.append(...items.map(i => i.g));
  document.querySelector('main').append(root);

  let folded = false;
  try { folded = localStorage.getItem('mobius-gizmo') === 'folded'; } catch { /* Best-effort. */ }
  const setFolded = value => {
    folded = value; root.classList.toggle('folded', folded);
    try { localStorage.setItem('mobius-gizmo', folded ? 'folded' : 'open'); } catch { /* Best-effort. */ }
  };
  setFolded(folded);
  root.querySelector('.gizmo-fold').onclick = () => setFolded(true);
  root.querySelector('.gizmo-open').onclick = () => setFolded(false);

  // Under the title, its width: measured, because the title's size changes
  // with the window and the header wraps to two rows on a phone.
  function place() {
    const t = title.getBoundingClientRect(), header = title.closest('header').getBoundingClientRect();
    root.style.left = `${t.left}px`;
    root.style.top = `${header.bottom + 14}px`;
    root.style.setProperty('--gizmo-width', `${Math.round(t.width)}px`);
  }
  new ResizeObserver(place).observe(title);
  addEventListener('resize', place);
  place();

  const inverse = new THREE.Quaternion(), v = new THREE.Vector3(), toCamera = new THREE.Vector3();
  let side = '';
  function update() {
    inverse.copy(camera.quaternion).invert();
    for (const item of items) {
      v.copy(item.dir).applyQuaternion(inverse);       // into camera space: x right, y up, z towards you
      const x = v.x * 34, y = -v.y * 34;
      item.ball.setAttribute('cx', x); item.ball.setAttribute('cy', y);
      item.label?.setAttribute('x', x); item.label?.setAttribute('y', y + .5);
      item.line?.setAttribute('x2', x); item.line?.setAttribute('y2', y);
      item.depth = v.z;
      // Pointing away from you, an axis dims, so near and far read apart.
      item.g.style.opacity = (.55 + .45 * (v.z + 1) / 2).toFixed(3);
    }
    // Draw back to front, so the axis nearest you is on top.
    for (const item of [...items].sort((a, b) => a.depth - b.depth)) svg.append(item.g);
    camera.getWorldDirection(toCamera).negate();
    const ranked = [['x', toCamera.x], ['y', toCamera.y], ['z', toCamera.z]].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const name = ([axis, value]) => SIDES[`${value >= 0 ? '+' : '-'}${axis}`];
    // Between two sides -- the three-quarter view the viewer opens on -- it
    // names both: "Front right", not a coin toss between them.
    const [first, second] = ranked;
    const between = first[0] !== 'y' && second[0] !== 'y' && Math.abs(second[1]) > .7 * Math.abs(first[1]);
    const pair = between ? [first, second].sort((a, b) => (a[0] === 'z' ? 0 : 1) - (b[0] === 'z' ? 0 : 1)) : [first];
    const now = pair.map(name).join(' ').replace(/^(\w+) (\w+)$/, (_, a, b) => `${a} ${b.toLowerCase()}`);
    if (now !== side) { side = now; root.querySelector('.gizmo-side').textContent = side; }
  }
  return { update, get side() { return side; }, get folded() { return folded; }, setFolded, element: root };
}
