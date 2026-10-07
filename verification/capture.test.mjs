import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {captureCamera} from '../src/capture.js';

test('export camera fits translated, rotated wide/tall models, preserving view and live camera',()=>{
 for(const aspect of [0.6,1,1.6]) for(const size of [[10,1,2],[1,10,2],[2,2,2]]) for(const position of [[5,3,8],[0,15,.001],[-5,-3,6]]) {
  const object=new THREE.Mesh(new THREE.BoxGeometry(...size));object.rotation.set(.3,.6,.2);object.position.set(8,2,-3);object.updateMatrixWorld(true);
  const source=new THREE.PerspectiveCamera(40,aspect,.01,1000);source.position.set(...position);source.lookAt(1,1,1);source.setViewOffset(1200,850,170,0,1200,850);source.updateMatrixWorld(true);
  const saved=JSON.stringify(source.toJSON()),camera=captureCamera(source,object,aspect);
  assert.equal(JSON.stringify(source.toJSON()),saved);
  assert.ok(camera.quaternion.angleTo(source.quaternion)<1e-7);
  const box=new THREE.Box3().setFromObject(object),center=box.getCenter(new THREE.Vector3()).project(camera);
  assert.ok(Math.abs(center.x)<1e-7&&Math.abs(center.y)<1e-7);
  for(const x of [box.min.x,box.max.x]) for(const y of [box.min.y,box.max.y]) for(const z of [box.min.z,box.max.z]) {
   const p=new THREE.Vector3(x,y,z).project(camera);assert.ok(Math.abs(p.x)<=1/1.15+1e-6&&Math.abs(p.y)<=1/1.15+1e-6&&Math.abs(p.z)<=1);
  }
  object.geometry.dispose();object.material.dispose();
 }
});
