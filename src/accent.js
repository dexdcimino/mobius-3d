import * as THREE from 'three';

export const ACCENTS = [
  ['Red', '#ff767f'], ['Orange', '#ffad66'], ['Gold', '#f5d567'],
  ['Green', '#64d99c'], ['Blue', '#88aaff'], ['Violet', '#bb98ff'],
];
export const luminance = c => .2126 * c.r + .7152 * c.g + .0722 * c.b;
export const contrast = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);

// Oklab conversions use linear sRGB. Adjust L at fixed hue; reduce chroma only
// to fit the sRGB gamut. See https://www.w3.org/TR/css-color-4/#ok-lab .
export function toOklch(c) {
  const l = Math.cbrt(.4122214708*c.r + .5363325363*c.g + .0514459929*c.b);
  const m = Math.cbrt(.2119034982*c.r + .6806995451*c.g + .1073969566*c.b);
  const s = Math.cbrt(.0883024619*c.r + .2817188376*c.g + .6299787005*c.b);
  const a = 1.9779984951*l - 2.428592205*m + .4505937099*s;
  const b = .0259040371*l + .7827717662*m - .808675766*s;
  return {L:.2104542553*l + .793617785*m - .0040720468*s, C:Math.hypot(a,b), h:Math.atan2(b,a)};
}
function fromOklch(L, C, h) {
  const a = C*Math.cos(h), b = C*Math.sin(h);
  const l = (L + .3963377774*a + .2158037573*b)**3;
  const m = (L - .1055613458*a - .0638541728*b)**3;
  const s = (L - .0894841775*a - 1.291485548*b)**3;
  return new THREE.Color().setRGB(4.0767416621*l - 3.3077115913*m + .2309699292*s,
    -1.2684380046*l + 2.6097574011*m - .3413193965*s,
    -.0041960863*l - .7034186147*m + 1.707614701*s);
}
const inGamut = c => [c.r,c.g,c.b].every(v => v >= 0 && v <= 1);
function atLightness(L, source) {
  const full = fromOklch(L, source.C, source.h);
  if (inGamut(full)) return full;
  let low = 0, high = source.C;
  for (let i=0;i<20;i++) {
    const mid = (low+high)/2;
    if (inGamut(fromOklch(L,mid,source.h))) low=mid; else high=mid;
  }
  return fromOklch(L,low,source.h);
}
function atLuminance(target, source) {
  let low = 0, high = 1;
  for (let i=0;i<26;i++) {
    const mid = (low+high)/2;
    if (luminance(atLightness(mid,source)) < target) low=mid; else high=mid;
  }
  return atLightness((low+high)/2,source);
}

export function gridPalette(backgroundHex, accentHex = ACCENTS[1][1]) {
  const y = luminance(new THREE.Color(backgroundHex));
  const base = new THREE.Color(accentHex), source = toOklch(base);
  let major = base;
  if (contrast(y,luminance(base)) < 2.8) {
    // Small margin protects the 2.8 target after 8-bit display quantization.
    const targets = [2.85*(y+.05)-.05, (y+.05)/2.85-.05];
    const candidates = targets.filter(t => t>0 && t<1).map(t => atLuminance(t,source))
      .filter(c => toOklch(c).C >= Math.min(.035, source.C*.3));
    candidates.sort((a,b) => {
      const distance = c => {const o=toOklch(c);return Math.hypot(o.L-source.L,o.C-source.C);};
      return distance(a)-distance(b);
    });
    // One contrast direction is always feasible for the six configured hues.
    if (!candidates.length) throw new Error('No chromatic accent contrast candidate');
    major = new THREE.Color('#'+candidates[0].getHexString());
  }
  const light = luminance(major) > y;
  const minorTarget = light ? 1.72*(y+.05)-.05 : (y+.05)/1.72-.05;
  const minor = atLuminance(minorTarget, toOklch(major));
  const effectiveHex = '#'+major.getHexString();
  const ink = contrast(luminance(major),luminance(new THREE.Color('#191322'))) >= 4.5 ? '#191322' : '#ffffff';
  return {minor,major,light,effectiveHex,ink,adjusted:effectiveHex!==accentHex.toLowerCase()};
}

// The sample model's two stops, from an accent. Light end: the accent's own
// lightness or a little over, hue nudged toward yellow; dark end: deep, nudged
// toward blue-violet. Both keep the accent's FULL chroma (gamut permitting):
// the first version held it at 75% with the top at L .68, and every accent
// came out pastel.
const towardHue = (h, target, max) => {
  const d = Math.atan2(Math.sin(target - h), Math.cos(target - h));
  return h + Math.sign(d) * Math.min(Math.abs(d), max);
};
const DEG = Math.PI / 180;
export function sampleGradient(accentHex = ACCENTS[1][1]) {
  const source = toOklch(new THREE.Color(accentHex));
  const top = { L: Math.min(.7, source.L + .02), C: source.C * 1.05, h: towardHue(source.h, 100 * DEG, 10 * DEG) };
  const bottom = { L: .34, C: source.C * .95, h: towardHue(source.h, 285 * DEG, 20 * DEG) };
  return { top: atLightness(top.L, top), bottom: atLightness(bottom.L, bottom) };
}

// The light from below: the hemisphere's ground colour, a dark version of the
// accent instead of the grey-white that lit every underside the same.
export function underlight(accentHex = ACCENTS[1][1]) {
  const source = toOklch(new THREE.Color(accentHex));
  return atLightness(.38, { L: .38, C: source.C * .55, h: source.h });
}
// The rim light behind the model, the accent at its lightest.
export function rimlight(accentHex = ACCENTS[1][1]) {
  const source = toOklch(new THREE.Color(accentHex));
  return atLightness(.9, { L: .9, C: source.C * .35, h: source.h });
}
