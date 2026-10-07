import fs from 'node:fs';
import {zipSync,strToU8} from 'three/addons/libs/fflate.module.js';
import {deflateSync} from 'node:zlib';
const dir=new URL('./fixtures/',import.meta.url);fs.mkdirSync(dir,{recursive:true});
const write=(name,data)=>fs.writeFileSync(new URL(name,dir),data);
const vertices=[-1,0,0,1,0,0,0,2,0];
const bin=Buffer.from(new Float32Array(vertices).buffer);
const gltf={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-1,0,0],max:[1,2,0]}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36}],buffers:[{byteLength:36}]};
let json=Buffer.from(JSON.stringify(gltf));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);write('triangle.glb',Buffer.concat([header,json,bh,bin]));
gltf.buffers[0].uri='triangle.bin';write('triangle.gltf',JSON.stringify(gltf));write('triangle.bin',bin);
write('triangle.stl','solid triangle\nfacet normal 0 0 1\nouter loop\nvertex -1 0 0\nvertex 1 0 0\nvertex 0 2 0\nendloop\nendfacet\nendsolid triangle');
write('triangle.ply','ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n-1 0 0\n1 0 0\n0 2 0\n3 0 1 2\n');
write('triangle.dae',`<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1"><asset><unit meter="1"/><up_axis>Y_UP</up_axis></asset><library_geometries><geometry id="geom"><mesh><source id="pos"><float_array id="arr" count="9">${vertices.join(' ')}</float_array><technique_common><accessor source="#arr" count="3" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source><vertices id="verts"><input semantic="POSITION" source="#pos"/></vertices><triangles count="1"><input semantic="VERTEX" source="#verts" offset="0"/><p>0 1 2</p></triangles></mesh></geometry></library_geometries><library_visual_scenes><visual_scene id="Scene"><node><instance_geometry url="#geom"/></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#Scene"/></scene></COLLADA>`);
function chunk(id,...parts){const body=Buffer.concat(parts),h=Buffer.alloc(6);h.writeUInt16LE(id);h.writeUInt32LE(body.length+6,2);return Buffer.concat([h,body]);}
const count=Buffer.from([3,0]),faces=Buffer.from([1,0,0,0,1,0,2,0,0,0]);
write('triangle.3ds',chunk(0x4d4d,chunk(0x3d3d,chunk(0x4000,Buffer.from('Triangle\0'),chunk(0x4100,chunk(0x4110,count,bin),chunk(0x4120,faces))))));
write('triangle.3mf',zipSync({'_rels/.rels':strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),'3D/3dmodel.model':strToU8('<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh><vertices><vertex x="-1" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="2" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object></resources><build><item objectid="1"/></build></model>')}));
for(const name of ['triangle.obj','triangle.fbx'])write(name,fs.readFileSync(new URL(name,import.meta.url)));
write('textured.obj','mtllib textured.mtl\no Plane\nv -1 0 0\nv 1 0 0\nv 1 2 0\nv -1 2 0\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nusemtl Painted\nf 1/1 2/2 3/3\nf 1/1 3/3 4/4\n');
write('textured.mtl','newmtl Painted\nKd 0.7 0.8 0.9\nmap_Kd checker.png\n');
function crc(b){let c=0xffffffff;for(const x of b){c^=x;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return (c^0xffffffff)>>>0;}
function pngChunk(type,data){const t=Buffer.from(type),h=Buffer.alloc(4),end=Buffer.alloc(4);h.writeUInt32BE(data.length);end.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([h,t,data,end]);}
const ih=Buffer.alloc(13);ih.writeUInt32BE(2);ih.writeUInt32BE(2,4);ih[8]=8;ih[9]=2;
write('checker.png',Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',ih),pngChunk('IDAT',deflateSync(Buffer.from([0,255,0,0,0,255,0,0,0,255,0,255,0,0]))),pngChunk('IEND',Buffer.alloc(0))]));
console.log('Created nine format fixtures and textured OBJ.');
