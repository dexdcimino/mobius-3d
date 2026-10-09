// character.fbx: what a ZBrush export of a polypainted character looks like
// to the viewer -- vertex colours, no textures, and a material whose diffuse
// colour is a dark grey that nothing in the file means as a colour. Blue
// head and body, white eyes, and black SOCKETS that sit a hair OUTSIDE the
// head (0.2% of its radius), the way an inflated or deflated subtool sits:
// with a poor depth range they flicker against the face under them.
//
//   node verification/make-character-fixture.mjs
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';

const parts = [];
const add = (geometry, color, colorAt) => parts.push({ geometry: geometry.toNonIndexed(), color, colorAt });
const BLUE = [0, .47, 1], WHITE = [1, 1, 1], BLACK = [0, 0, 0];
add(new THREE.CapsuleGeometry(.45, .8, 8, 24).translate(0, .85, 0), BLUE);                       // body
add(new THREE.SphereGeometry(.42, 32, 24).translate(0, 1.85, 0), BLUE);                         // head
// Socket caps: a patch of a sphere 0.2% bigger than the head, round each eye.
for (const side of [-1, 1]) {
  const cap = new THREE.SphereGeometry(.42 * 1.002, 32, 24, Math.PI / 2 + side * .42 - .3, .6, Math.PI / 2 - .35, .5)
    .translate(0, 1.85, 0);
  add(cap, BLACK);
  add(new THREE.SphereGeometry(.07, 16, 12).translate(side * .17, 1.92, .37), WHITE);           // eye
}

let vertices = [], indices = [], colors = [], offset = 0;
for (const { geometry, color } of parts) {
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) { vertices.push(p.getX(i), p.getY(i), p.getZ(i)); }
  for (let i = 0; i < p.count; i += 3) {
    indices.push(offset + i, offset + i + 1, -(offset + i + 2) - 1);
    // Colours are written as sRGB, as a DCC writes them.
    for (let k = 0; k < 3; k++) colors.push(...color, 1);
  }
  offset += p.count;
}
const n = v => +v.toFixed(5);
const fbx = `; FBX 7.4.0 project file
; A polypainted character with a dark-grey material, for the vertex-colour and depth checks.
FBXHeaderExtension:  {
	FBXHeaderVersion: 1003
	FBXVersion: 7400
}
Objects:  {
	Geometry: 2001, "Geometry::Character", "Mesh" {
		Vertices: *${vertices.length} {
			a: ${vertices.map(n).join(',')}
		}
		PolygonVertexIndex: *${indices.length} {
			a: ${indices.join(',')}
		}
		LayerElementColor: 0 {
			Version: 101
			Name: "Col"
			MappingInformationType: "ByPolygonVertex"
			ReferenceInformationType: "Direct"
			Colors: *${colors.length} {
				a: ${colors.map(n).join(',')}
			}
		}
	}
	Model: 2002, "Model::Character", "Mesh" {
		Version: 232
	}
	Material: 2003, "Material::Polypaint", "" {
		Version: 102
		ShadingModel: "phong"
		Properties70:  {
			P: "DiffuseColor", "Color", "", "A",0.5,0.5,0.5
		}
	}
}
Connections:  {
	C: "OO",2001,2002
	C: "OO",2003,2002
	C: "OO",2002,0
}
`;
writeFileSync(new URL('./fixtures/character.fbx', import.meta.url), fbx);
console.log(`Created character.fbx: ${indices.length / 3} triangles.`);
