import * as THREE from 'three';

// Fit a fresh camera along the current viewing direction. Using projected box
// corners handles wide/tall models without moving the live camera or controls.
export function captureCamera(source, object, aspect) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) throw new Error('Open a model before saving a screenshot.');
  const center = box.getCenter(new THREE.Vector3());
  const camera = source.clone();
  camera.clearViewOffset();
  camera.aspect = aspect;
  const right = new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
  const back = new THREE.Vector3(0,0,1).applyQuaternion(camera.quaternion);
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()/2));
  const tanX = tanY*aspect;
  let distance = 0;
  for (const x of [box.min.x,box.max.x]) for (const y of [box.min.y,box.max.y]) for (const z of [box.min.z,box.max.z]) {
    const p = new THREE.Vector3(x,y,z).sub(center);
    distance = Math.max(distance, p.dot(back)+1.15*Math.max(Math.abs(p.dot(right))/tanX,Math.abs(p.dot(up))/tanY));
  }
  const radius = Math.max(box.getSize(new THREE.Vector3()).length()/2,.001);
  const away = Math.max(distance,radius*1.01);
  camera.position.copy(center).addScaledVector(back,away);
  // The live view's depth rule (fitDepth in viewer.js): a ratio of hundreds,
  // not millions, so a socket a hair off the face does not flicker in the PNG.
  camera.near = Math.max(Math.min((away-radius)*.9, away/50), away/1000);
  camera.far = away+radius*10;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}
