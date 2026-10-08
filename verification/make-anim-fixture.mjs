// animated.glb: a quad with one blend shape ("Raise"), an emissive factor and
// TWO clips -- "Spin" (a node rotation) and "Raise" (the blend shape's
// weight) -- for the timeline, the clip list, the Blend shapes section and the
// Emissive switch. Written with glTF-Transform so it is a real exporter's file.
//
//   node verification/make-anim-fixture.mjs
import { Document, NodeIO } from '@gltf-transform/core';

const doc = new Document(), buffer = doc.createBuffer();
const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
const position = acc('VEC3', new Float32Array([-1, 0, 0, 1, 0, 0, 1, 2, 0, -1, 2, 0]));
const raise = acc('VEC3', new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1]));
const material = doc.createMaterial('Glow').setBaseColorFactor([.8, .8, .8, 1]).setEmissiveFactor([1, .4, 0]);
const prim = doc.createPrimitive().setAttribute('POSITION', position).setIndices(acc('SCALAR', new Uint16Array([0, 1, 2, 0, 2, 3])))
  .setMaterial(material).addTarget(doc.createPrimitiveTarget('Raise').setAttribute('POSITION', raise));
const mesh = doc.createMesh('Quad').addPrimitive(prim).setWeights([0]).setExtras({ targetNames: ['Raise'] });
const node = doc.createNode('Quad').setMesh(mesh);
doc.createScene('Scene').addChild(node);
const times = acc('SCALAR', new Float32Array([0, 1, 2]));
const spin = doc.createAnimationSampler().setInput(times).setInterpolation('LINEAR')
  .setOutput(acc('VEC4', new Float32Array([0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, -1])));
doc.createAnimation('Spin').addSampler(spin)
  .addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath('rotation').setSampler(spin));
const lift = doc.createAnimationSampler().setInput(acc('SCALAR', new Float32Array([0, 1.5, 3]))).setInterpolation('LINEAR')
  .setOutput(acc('SCALAR', new Float32Array([0, 1, 0])));
doc.createAnimation('Raise').addSampler(lift)
  .addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath('weights').setSampler(lift));
await new NodeIO().write(new URL('./fixtures/animated.glb', import.meta.url).pathname, doc);
console.log('Created animated.glb.');
