import * as THREE from 'three';

// A half-twisted strip on a lifted figure-eight path. At the crossover, the
// two centerline passes are 0.96 units apart versus a ribbon width of 0.36.
export function infinityRibbon() {
  const segments=256, across=6, width=.36, positions=[], colors=[], indices=[];
  const stops=['#58c9f5','#ad86ed','#f4a785','#58c9f5'].map(c=>new THREE.Color(c));
  for(let i=0;i<=segments;i++) {
    const t=i/segments*Math.PI*2;
    const center=new THREE.Vector3(2.3*Math.sin(t),.95*Math.sin(2*t),.48*Math.cos(t));
    const tangent=new THREE.Vector3(2.3*Math.cos(t),1.9*Math.cos(2*t),-.48*Math.sin(t)).normalize();
    const normal=new THREE.Vector3(-tangent.y,tangent.x,0).normalize();
    const binormal=new THREE.Vector3().crossVectors(tangent,normal).normalize();
    const direction=normal.multiplyScalar(Math.cos(t/2)).addScaledVector(binormal,Math.sin(t/2));
    const phase=i/segments*3,stop=Math.min(2,Math.floor(phase));
    const color=stops[stop].clone().lerp(stops[stop+1],phase-stop);
    for(let j=0;j<=across;j++) {
      const p=center.clone().addScaledVector(direction,(j/across-.5)*width);
      positions.push(p.x,p.y,p.z);colors.push(color.r,color.g,color.b);
      if(i<segments&&j<across){const a=i*(across+1)+j,b=a+across+1;indices.push(a,b,a+1,b,b+1,a+1);}
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  // Match the seam's opposite orientation after the half twist.
  const normals=geometry.attributes.normal;
  for(let j=0;j<=across;j++) {
    const a=j,b=segments*(across+1)+(across-j);
    const n=new THREE.Vector3().fromBufferAttribute(normals,a).sub(new THREE.Vector3().fromBufferAttribute(normals,b)).normalize();
    normals.setXYZ(a,n.x,n.y,n.z);normals.setXYZ(b,-n.x,-n.y,-n.z);
  }
  return new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.42,metalness:.08,side:THREE.DoubleSide}));
}

// The sample a visitor sees first: the trefoil the Mobius mark is drawn from,
// in the mark's own red-to-orange, at a density that says something about the
// viewer -- 768,000 triangles -- while still opening instantly on any GPU.
export function trefoilKnot({ tubular = 2400, radial = 160 } = {}) {
  const geometry = new THREE.TorusKnotGeometry(1, 0.34, tubular, radial, 2, 3);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const red = new THREE.Color('#e8231c'), orange = new THREE.Color('#ff9a1f'), c = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    // Height decides the blend, as in the icon: red over the top, orange through
    // the middle, red again underneath.
    const t = 1 - Math.abs(position.getY(i) / 1.4);
    c.copy(red).lerp(orange, Math.max(0, Math.min(1, t)));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .32, metalness: .05 }));
  mesh.name = 'Trefoil knot';
  return mesh;
}
