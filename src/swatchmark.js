/* THE SELECTED-ACCENT MARK. In place of a dot and a ring, the chosen swatch
   carries a small shape that morphs circle -> triangle -> square -> hexagon,
   turning slowly all the while; at the hexagon it spins fast, comes back to a
   circle as it slows, and the loop starts again.

   Every shape is drawn as the same 72 points at the same 72 angles, each at
   that shape's radius in that direction, so a morph is just a blend of two
   radii per point -- no path matching, and nothing pops. One SVG exists and
   moves to whichever swatch is pressed. It stops with the tab (rAF does), and
   under reduced motion it holds still as a hexagon. */

const N = 72, R = 10;
// The radius of a regular n-gon, vertex up, in direction a; 0 sides is the
// circle. Sizes are evened by eye: by circumradius alone the triangle looks
// half the size of the circle.
const SHAPES = [[0, .9], [3, 1.18], [4, 1.02], [6, .98]];
function radius([sides, scale], a) {
  if (!sides) return R * scale;
  const sector = Math.PI * 2 / sides;
  const local = ((a + Math.PI / 2) % sector + sector) % sector - sector / 2;
  return R * scale * Math.cos(Math.PI / sides) / Math.cos(local);
}
const ANGLES = Array.from({ length: N }, (_, i) => i / N * Math.PI * 2 - Math.PI / 2);
const RADII = SHAPES.map(shape => ANGLES.map(a => radius(shape, a)));

// The loop, in seconds: [from, to, hold, morph].
const STEPS = [[0, 1, .7, .8], [1, 2, .7, .8], [2, 3, .7, .8]];
const SPIN = 1.6, SPIN_TURNS = 2;   // hexagon -> circle, with the fast turn
const CYCLE = STEPS.reduce((t, [, , hold, morph]) => t + hold + morph, 0) + .5 + SPIN;
const SLOW = 40;                    // degrees a second, always
const ease = p => p < .5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;

// Which two shapes, how far between them, and the extra spin, at time t.
function at(t) {
  t %= CYCLE;
  for (const [from, to, hold, morph] of STEPS) {
    if (t < hold) return [from, from, 0, 0];
    if (t < hold + morph) return [from, to, ease((t - hold) / morph), 0];
    t -= hold + morph;
  }
  if (t < .5) return [3, 3, 0, 0];
  const p = (t - .5) / SPIN;
  // The spin rises and falls over the whole step; the circle comes back in
  // its second half, while it is slowing.
  return [3, 0, ease(Math.max(0, p - .4) / .6), ease(p) * 360 * SPIN_TURNS];
}

function pathAt(t) {
  const [from, to, mix, spin] = at(t);
  const turn = (SLOW * t + spin) * Math.PI / 180;
  let d = '';
  for (let i = 0; i < N; i++) {
    const r = RADII[from][i] + (RADII[to][i] - RADII[from][i]) * mix, a = ANGLES[i] + turn;
    d += `${i ? 'L' : 'M'}${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`;
  }
  return d + 'Z';
}

export function initSwatchMark() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('accent-mark');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  svg.appendChild(path);
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let start = performance.now(), frame = 0;
  const draw = now => {
    frame = 0;
    if (!svg.isConnected) return;
    if (still.matches) { path.setAttribute('d', pathAt(STEPS.reduce((t, [, , h, m]) => t + h + m, 0) + .25)); return; }
    path.setAttribute('d', pathAt((now - start) / 1000));
    frame = requestAnimationFrame(draw);
  };
  still.addEventListener?.('change', () => { if (!frame) frame = requestAnimationFrame(draw); });
  return {
    // Puts the mark on this swatch; the loop starts over from the circle.
    place(button) {
      button.appendChild(svg);
      start = performance.now();
      if (!frame) frame = requestAnimationFrame(draw);
    },
    // For checks: the outline it drew last.
    get path() { return path.getAttribute('d'); },
    svg,
  };
}
