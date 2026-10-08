import * as THREE from 'three';
import { dropdown } from './dropdown.js';

/* ANIMATION AND BLEND SHAPES. A model's clips play on a timeline along the
   bottom of the viewport -- shown only when the model has clips, and stopping
   short of the controls panel so neither covers the other -- and its blend
   shapes (morph targets) get a section in the panel: pick one, drag its weight.

   Clips are gathered from wherever a loader left them: glTF hands them back
   beside the scene (the viewer puts them on it), FBX puts them on the root or
   its only child, Collada on its scene. Each record keeps its own mixer, so
   switching between the sample and an imported model keeps where each was. */

const $ = id => document.getElementById(id);
const SPEEDS = [['0.5', '0.5×'], ['1', '1×'], ['2', '2×']];

export function clipsOf(object) {
  const clips = new Set();
  object.traverse(o => { for (const clip of o.animations || []) if (clip.duration > 0 && clip.tracks.length) clips.add(clip); });
  return [...clips];
}

// name -> every [mesh, index] it moves: a shape called "Smile" on the head and
// on the teeth is one control.
export function shapesOf(meshes) {
  const shapes = new Map();
  for (const mesh of meshes) for (const [name, index] of Object.entries(mesh.morphTargetDictionary || {})) {
    if (!shapes.has(name)) shapes.set(name, []);
    shapes.get(name).push([mesh, index]);
  }
  return shapes;
}

const fmt = t => t.toFixed(t < 10 ? 2 : 1);

export function initMotion(requestRender) {
  let record = null, playing = false, speed = 1, scrubbing = false;
  for (const [value, label] of SPEEDS) $('anim-speed').add(new Option(label, value, false, value === '1'));
  const clipList = dropdown($('anim-clip')), speedList = dropdown($('anim-speed')), shapeList = dropdown($('shape-pick'));

  const action = () => record?.action;
  function setPlaying(on) {
    playing = on && !!action();
    $('anim-play').setAttribute('aria-pressed', String(playing));
    $('anim-play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
    $('anim-play').title = playing ? 'Pause (Space)' : 'Play (Space)';
    if (playing) requestRender();
  }
  function showTime() {
    const a = action();
    if (!a) return;
    const d = a.getClip().duration, t = a.time % d;
    if (!scrubbing) $('anim-scrub').value = String(t);
    $('anim-time').textContent = `${fmt(t)} / ${fmt(d)} s`;
  }
  function showShape() {
    const bound = record?.shapes.get($('shape-pick').value)?.[0];
    const w = bound ? bound[0].morphTargetInfluences[bound[1]] : 0;
    $('shape-weight').value = String(w);
    $('shape-value').textContent = w.toFixed(2);
  }
  // A slider's weight, held over whatever the clip says for that shape: the
  // clip keeps playing and every other shape keeps moving. Pausing on a drag
  // made a shape impossible to tune against the motion it was part of.
  function hold() {
    for (const [name, w] of record?.held || []) for (const [mesh, index] of record.shapes.get(name) || []) mesh.morphTargetInfluences[index] = w;
  }
  // A model's resting blend-shape weights, if it names any.
  function rest() {
    for (const [name, w] of Object.entries(record.root.userData.restShapes || {}))
      for (const [mesh, index] of record.shapes.get(name) || []) mesh.morphTargetInfluences[index] = w;
  }
  function useClip(index) {
    record.mixer.stopAllAction();
    record.clipIndex = index;
    const clip = record.clips[index];
    record.action = record.mixer.clipAction(clip).play();
    $('anim-scrub').max = String(clip.duration);
    $('anim-scrub').step = String(Math.max(clip.duration / 1000, .001));
    record.mixer.update(0); hold();
    showTime(); showShape(); requestRender();
  }

  function attach(next) {
    record = next;
    const clips = record?.clips || [], shapes = record?.shapes || new Map();
    if (record && !record.rested) { record.rested = true; rest(); }
    $('timeline').hidden = !clips.length;
    document.body.classList.toggle('has-timeline', !!clips.length);
    if (clips.length) {
      record.mixer ??= new THREE.AnimationMixer(record.root);
      $('anim-clip').replaceChildren(...clips.map((c, i) => new Option(c.name || `Clip ${i + 1}`, String(i))));
      $('anim-clip').value = String(record.clipIndex ?? 0);
      clipList.rebuild();
      if (!record.action) { useClip(0); record.autoplay = true; }
      else { showTime(); }
      // Opening a model with clips plays the first; coming back to one keeps
      // whatever it was doing.
      setPlaying(record.autoplay);
    } else setPlaying(false);
    $('shapes-section').hidden = !shapes.size;
    $('shape-pick').replaceChildren(...[...shapes.keys()].map(name => new Option(name, name)));
    shapeList.rebuild();
    $('shapes-note').textContent = shapes.size && clips.length ? 'A slider holds its shape while the animation plays on.' : '';
    showShape();
  }

  $('anim-play').onclick = () => { setPlaying(!playing); if (record) record.autoplay = playing; };
  $('anim-clip').onchange = () => { useClip(Number($('anim-clip').value)); setPlaying(true); record.autoplay = true; };
  $('anim-speed').onchange = () => { speed = Number($('anim-speed').value); };
  const scrub = $('anim-scrub');
  scrub.addEventListener('pointerdown', () => { scrubbing = true; });
  addEventListener('pointerup', () => { scrubbing = false; });
  scrub.oninput = () => {
    if (!record?.mixer) return;
    record.mixer.setTime(Number(scrub.value)); hold();
    showTime(); showShape(); requestRender();
  };
  $('shape-pick').onchange = showShape;
  $('shape-weight').oninput = () => {
    if (!record) return;
    const w = Number($('shape-weight').value);
    (record.held ??= new Map()).set($('shape-pick').value, w);
    hold();
    $('shape-value').textContent = w.toFixed(2);
    requestRender();
  };
  document.addEventListener('keydown', e => {
    if (e.key !== ' ' || $('timeline').hidden || /INPUT|SELECT|BUTTON|TEXTAREA/.test(e.target.tagName)) return;
    e.preventDefault(); $('anim-play').click();
  });

  return {
    attach,
    // Called once per drawn frame; true while something is moving.
    tick(seconds) {
      if (!playing || !record?.mixer || scrubbing) return false;
      record.mixer.update(seconds * speed); hold();
      showTime();
      if (!$('shapes-section').hidden) showShape();
      return true;
    },
    reset() {
      $('anim-speed').value = '1'; speed = 1; speedList.sync();
      if (!record) return;
      record.held?.clear();
      for (const pairs of record.shapes.values()) for (const [mesh, index] of pairs) mesh.morphTargetInfluences[index] = 0;
      rest();
      if (record.clips.length) { $('anim-clip').value = '0'; clipList.sync(); useClip(0); record.autoplay = true; setPlaying(true); }
      showShape();
    },
    get playing() { return playing; },
  };
}
