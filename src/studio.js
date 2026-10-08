import * as THREE from 'three';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';
import { rimlight, underlight } from './accent.js';

/* THE STUDIO. Most of what a glossy surface shows is its reflection of the
   room, so the room is where the presentation is made. three.js's
   RoomEnvironment is a grey box with white panels all round it: every edge of
   every model reflected white -- the pale "film" -- and every side was lit
   about the same, which read flat. This one is a dark room with a big soft key
   above and in front, a cool strip to the left, and ACCENT-COLOURED strips
   behind and a dim accent floor, so a grazing edge glows in the accent and
   the underside picks up its colour, the way a product shot is lit. It is
   rebuilt (a few milliseconds) whenever the accent changes. */
export function initStudio(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new THREE.Scene();
  const panel = (w, h, position, strength, color = 0xffffff) => {
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(...position); mesh.lookAt(0, 0, 0);
    mesh.userData.strength = strength;
    room.add(mesh);
    return mesh;
  };
  room.add(new THREE.Mesh(new THREE.BoxGeometry(24, 14, 24), new THREE.MeshBasicMaterial({ color: 0x0b0d12, side: THREE.BackSide })));
  const white = [
    panel(7, 5, [4, 7, 6], 5.5),            // key softbox, above and to the right of the camera
    panel(1.6, 8, [-9, 2, 2], 1.6, 0xd6e4ff), // cool strip, left
    panel(10, 10, [0, 9, 0], .45),          // a faint ceiling, so tops are never black
  ];
  const tinted = [
    [panel(1.4, 9, [-5, 2, -9], 3.6), rimlight],  // rim strips behind
    [panel(1.4, 9, [7, 2, -6], 2.6), rimlight],
    [panel(18, 18, [0, -6, 0], .9), underlight],  // the floor bounce
  ];
  for (const mesh of white) mesh.material.color.multiplyScalar(mesh.userData.strength);
  let target = null;
  return {
    get texture() { return target?.texture; },
    setAccent(hex) {
      for (const [mesh, tone] of tinted) mesh.material.color.copy(tone(hex)).multiplyScalar(mesh.userData.strength);
      const previous = target;
      target = pmrem.fromScene(room, .04);
      previous?.dispose();
      return target.texture;
    },
  };
}

/* THE CONTACT SHADOW. The model drawn from underneath, looking up, as a
   darkness that fades with height, blurred twice, and laid on the floor: dark
   where the model touches the grid and gone a little way up, so it sits ON
   the grid instead of floating over it. This is the occlusion that reads at a
   glance. Screen-space AO would darken creases on every frame of every orbit
   for every model; this costs one small extra draw, and only when the shape
   changes -- a new model, a turn upright, an animation frame -- never for an
   orbit. Every model is scaled to 3 units and stood on y = 0, so one fixed
   camera fits them all. */
export function initContactShadow(renderer, scene) {
  const SIZE = 6.5, HEIGHT = 1.4, RES = 512, BLUR = 2.6;
  const group = new THREE.Group(); group.position.y = .002;
  const target = new THREE.WebGLRenderTarget(RES, RES), blurTarget = new THREE.WebGLRenderTarget(RES, RES);
  target.texture.generateMipmaps = blurTarget.texture.generateMipmaps = false;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: target.texture, transparent: true, opacity: .95, depthWrite: false, toneMapped: false }));
  floor.scale.y = -1; floor.renderOrder = -1;
  group.add(floor);
  const blurPlane = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE).rotateX(Math.PI / 2));
  blurPlane.visible = false; group.add(blurPlane);
  const camera = new THREE.OrthographicCamera(-SIZE / 2, SIZE / 2, SIZE / 2, -SIZE / 2, 0, HEIGHT);
  camera.rotation.x = Math.PI / 2; group.add(camera);
  scene.add(group);

  const depth = new THREE.MeshDepthMaterial();
  depth.userData.darkness = { value: 1.4 };
  depth.onBeforeCompile = shader => {
    shader.uniforms.darkness = depth.userData.darkness;
    shader.fragmentShader = 'uniform float darkness;\n' + shader.fragmentShader.replace(
      'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
      'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );');
  };
  depth.depthTest = depth.depthWrite = false;
  const horizontal = new THREE.ShaderMaterial(HorizontalBlurShader), vertical = new THREE.ShaderMaterial(VerticalBlurShader);
  horizontal.depthTest = vertical.depthTest = false;
  function blur(amount) {
    blurPlane.visible = true;
    blurPlane.material = horizontal; horizontal.uniforms.tDiffuse.value = target.texture; horizontal.uniforms.h.value = amount / 256;
    renderer.setRenderTarget(blurTarget); renderer.render(blurPlane, camera);
    blurPlane.material = vertical; vertical.uniforms.tDiffuse.value = blurTarget.texture; vertical.uniforms.v.value = amount / 256;
    renderer.setRenderTarget(target); renderer.render(blurPlane, camera);
    blurPlane.visible = false;
  }
  const shadowScene = new THREE.Scene();
  shadowScene.overrideMaterial = depth;
  let dirty = true;
  return {
    floor: group,
    invalidate() { dirty = true; },
    // Draws the shadow if the shape changed since the last one.
    update(holder, force = false) {
      if (!(dirty || force) || !group.visible) return;
      dirty = false;
      const parent = holder.parent, clear = renderer.getClearAlpha(), color = renderer.getClearColor(new THREE.Color());
      shadowScene.add(holder);
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(target); renderer.clear();
      renderer.render(shadowScene, camera);
      blur(BLUR); blur(BLUR * .4);
      renderer.setRenderTarget(null);
      renderer.setClearColor(color, clear);
      parent?.add(holder);
    },
  };
}
