import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { hsvToHex, hexToHsv, gridPalette } from '../src/background.js';
import { ACCENTS, toOklch } from '../src/accent.js';
const luminance = c => .2126 * c.r + .7152 * c.g + .0722 * c.b;
const contrast = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
test('HSB round trips preserve all sampled sRGB colors', () => {
  for (const hex of ['#000000','#ffffff','#20232b','#ff0000','#00ff00','#0000ff','#808080','#21a4d9']) {
    const { h, s, v } = hexToHsv(hex);
    assert.equal(hsvToHex(h, s, v), hex);
  }
});
test('all six accent hues remain chromatic, distinct and visible across the RGB cube', () => {
 for (const [name,accent] of ACCENTS) {
  const base = new THREE.Color(accent), original = toOklch(base);
  for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
    const hex = '#' + [r,g,b].map(n => n.toString(16).padStart(2,'0')).join('');
    const y = luminance(new THREE.Color(hex)), palette = gridPalette(hex,accent), label = `${name} on ${hex}`;
    assert.ok(Math.abs(contrast(y, luminance(palette.minor)) - 1.72) < 1e-5, label);
    assert.ok(contrast(y, luminance(palette.major)) >= 2.8, label);
    if (contrast(y,luminance(base)) >= 2.8) assert.equal(palette.effectiveHex,accent,label);
    for (const c of [palette.major,palette.minor]) {
      const o = toOklch(c), drift = Math.abs(Math.atan2(Math.sin(o.h-original.h),Math.cos(o.h-original.h)))*180/Math.PI;
      assert.ok(o.C >= .025, `${label}: chroma ${o.C}`);
      assert.ok(drift < 2, `${label}: hue drift ${drift}`);
      assert.ok([c.r,c.g,c.b].every(v=>v>=0&&v<=1),label);
    }
  }
 }
  assert.equal(gridPalette('#000000').light, true);
  assert.equal(gridPalette('#ffffff').light, false);
});
