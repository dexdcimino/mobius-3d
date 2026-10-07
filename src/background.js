import * as THREE from 'three';
import { ACCENTS, gridPalette, luminance, contrast } from './accent.js';
export { gridPalette } from './accent.js';

export const DEFAULT_BACKGROUND = '#0a1821';
const clamp = (n, max) => Math.max(0, Math.min(max, n));
export function hsvToHex(h, s, v) {
  s /= 100; v /= 100;
  const channel = n => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)))).toString(16).padStart(2, '0');
  };
  return `#${channel(5)}${channel(3)}${channel(1)}`;
}
export function hexToHsv(hex) {
  const [r, g, b] = hex.match(/[a-f\d]{2}/gi).map(n => parseInt(n, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : d / max * 100, v: max * 100 };
}

export function initBackground(scene, grid) {
  const $ = id => document.getElementById(id);
  const dialog = $('background-picker'), swatch = $('background');
  let hex = DEFAULT_BACKGROUND;
  try {
    const saved = localStorage.getItem('mobius-background');
    if (/^#[a-f\d]{6}$/i.test(saved)) hex = saved.toLowerCase();
    // Migrate the previous default; retain every other custom background.
    if (hex === '#0b1b24') { hex = DEFAULT_BACKGROUND; localStorage.setItem('mobius-background',hex); }
  } catch { /* Best-effort persistence. */ }
  let accent = ACCENTS[1][1];
  let hsv = hexToHsv(hex);
  const gridColors = grid.geometry.attributes.color;
  // Preserve the GridHelper's existing central axes versus minor line layout.
  const major = Array.from({ length: gridColors.count }, (_, i) => gridColors.getX(i) !== gridColors.getX(0));
  grid.material.toneMapped = false;
  function paint(save = true) {
    scene.background.set(hex);
    const palette = gridPalette(hex, accent);
    for (let i = 0; i < gridColors.count; i++) {
      const c = major[i] ? palette.major : palette.minor;
      gridColors.setXYZ(i, c.r, c.g, c.b);
    }
    gridColors.needsUpdate = true;
    document.documentElement.style.setProperty('--accent', palette.effectiveHex);
    document.documentElement.style.setProperty('--accent-ink', palette.ink);
    const active = document.querySelector('.accent-swatch[aria-pressed="true"]');
    if (active) active.style.setProperty('--swatch', palette.effectiveHex);
    swatch.style.background = hex;
    swatch.setAttribute('aria-label', `Background color ${hex}`);
    const textIsLight = contrast(luminance(scene.background),1) >= contrast(luminance(scene.background),0);
    document.documentElement.style.setProperty('--viewport-text', textIsLight ? '#eef1ff' : '#19202d');
    document.documentElement.style.setProperty('--viewport-muted', textIsLight ? '#b8c0d6' : '#353e50');
    $('color-square').style.setProperty('--hue-color', hsvToHex(hsv.h, 100, 100));
    $('color-cursor').style.left = `${hsv.s}%`;
    $('color-cursor').style.top = `${100 - hsv.v}%`;
    $('color-square').setAttribute('aria-label', `Saturation ${Math.round(hsv.s)}%, brightness ${Math.round(hsv.v)}%. Arrow keys adjust; Shift changes by ten.`);
    $('color-hue').value = hsv.h;
    $('color-saturation').value = hsv.s;
    $('color-brightness').value = hsv.v;
    $('color-saturation').style.background = `linear-gradient(to right, ${hsvToHex(hsv.h, 0, hsv.v)}, ${hsvToHex(hsv.h, 100, hsv.v)})`;
    $('color-brightness').style.background = `linear-gradient(to right, #000000, ${hsvToHex(hsv.h, hsv.s, 100)})`;
    for (const key of ['h', 's', 'v']) {
      const value = Math.round(hsv[key]);
      $('color-' + key + '-value').textContent = `${value}${key === 'h' ? '°' : '%'}`;
    }
    $('color-hex').value = hex.toUpperCase();
    $('color-hex').setCustomValidity('');
    if (save) try { localStorage.setItem('mobius-background', hex); } catch { /* Private or embedded storage can be blocked. */ }
  }
  function update() { hex = hsvToHex(hsv.h, hsv.s, hsv.v); paint(); }
  swatch.onclick = () => {
    dialog.showModal();
    swatch.setAttribute('aria-expanded', 'true');
    const box = swatch.getBoundingClientRect();
    dialog.style.left = `${Math.max(12, Math.min(box.right - dialog.offsetWidth, innerWidth - dialog.offsetWidth - 12))}px`;
    dialog.style.top = `${Math.max(12, Math.min(box.top - dialog.offsetHeight - 12, innerHeight - dialog.offsetHeight - 12))}px`;
  };
  $('color-close').onclick = () => dialog.close();
  dialog.onclose = () => swatch.setAttribute('aria-expanded', 'false');
  dialog.addEventListener('click', e => {
    const r = dialog.getBoundingClientRect();
    if (e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dialog.close();
  });
  const square = $('color-square');
  function point(e) {
    const r = square.getBoundingClientRect();
    hsv.s = clamp((e.clientX - r.left) / r.width * 100, 100);
    hsv.v = clamp(100 - (e.clientY - r.top) / r.height * 100, 100);
    update();
  }
  square.onpointerdown = e => { if (e.button !== 0) return; square.focus(); square.setPointerCapture(e.pointerId); point(e); };
  square.onpointermove = e => { if (square.hasPointerCapture(e.pointerId)) point(e); };
  square.onpointerup = e => { if (square.hasPointerCapture(e.pointerId)) square.releasePointerCapture(e.pointerId); };
  square.onkeydown = e => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault(); const n = e.shiftKey ? 10 : 1;
    hsv.s = clamp(hsv.s + (e.key === 'ArrowRight' ? n : e.key === 'ArrowLeft' ? -n : 0), 100);
    hsv.v = clamp(hsv.v + (e.key === 'ArrowUp' ? n : e.key === 'ArrowDown' ? -n : 0), 100);
    update();
  };
  for (const [id, key] of [['color-hue', 'h'], ['color-saturation', 's'], ['color-brightness', 'v']]) {
    $(id).oninput = e => { hsv[key] = Number(e.target.value); update(); };
  }
  $('color-hex').onchange = e => {
    const value = e.target.value.trim();
    if (!/^#?[a-f\d]{6}$/i.test(value)) { e.target.setCustomValidity('Enter six hexadecimal digits, for example #242837.'); e.target.reportValidity(); return; }
    hex = '#' + value.replace('#', '').toLowerCase(); hsv = hexToHsv(hex); paint();
  };
  $('color-reset').onclick = () => { hex = DEFAULT_BACKGROUND; hsv = hexToHsv(hex); paint(); };
  paint(false);
  return { setAccent(color) { accent = color; paint(false); } };
}
