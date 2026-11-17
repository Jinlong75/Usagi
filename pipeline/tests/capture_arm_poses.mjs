/** 031 reproducible CPU poses for the focused Blender MToon comparison. */
import { readFileSync, writeFileSync } from 'node:fs';
import { GLTFLoader } from '../../app/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '../../app/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
import { Vector3 } from '../../app/node_modules/three/build/three.module.js';
const [input, output] = process.argv.slice(2);
const source = readFileSync(input), size = source.readUInt32LE(12);
const doc = JSON.parse(source.subarray(20,20+size));
delete doc.materials; delete doc.images; delete doc.textures; delete doc.samplers;
delete doc.extensions.VRMC_vrm.expressions;
for (const mesh of doc.meshes) for (const primitive of mesh.primitives) delete primitive.material;
const text = JSON.stringify(doc);
const json = Buffer.from(text.padEnd(Math.ceil(text.length/4)*4,' '));
const binary = source.subarray(28+size);
const bytes = Buffer.alloc(28+json.length+binary.length);
bytes.writeUInt32LE(0x46546c67,0); bytes.writeUInt32LE(2,4); bytes.writeUInt32LE(bytes.length,8);
bytes.writeUInt32LE(json.length,12); bytes.writeUInt32LE(0x4e4f534a,16); json.copy(bytes,20);
bytes.writeUInt32LE(binary.length,20+json.length); bytes.writeUInt32LE(0x004e4942,24+json.length); binary.copy(bytes,28+json.length);
const loader = new GLTFLoader(); loader.register(parser=>new VRMLoaderPlugin(parser));
const { userData:{vrm} } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const snapshots = {};
for (const pose of ['neutral','yaw','arms']) {
  vrm.humanoid.resetNormalizedPose();
  if (pose==='yaw') vrm.humanoid.getNormalizedBoneNode('head').rotation.y=.4;
  if (pose==='arms') for (const [bone, angle] of [['leftUpperArm',.43],['rightUpperArm',-.43],['leftLowerArm',-.10],['rightLowerArm',.10]]) vrm.humanoid.getNormalizedBoneNode(bone).rotation.z=angle;
  vrm.humanoid.update(); vrm.scene.updateMatrixWorld(true);
  const bones = {}, points = [];
  vrm.scene.traverse(object=>{
    if (object.isBone && !object.name.startsWith('Normalized_')) bones[object.name]=object.matrixWorld.toArray();
    if (!object.isSkinnedMesh) return;
    let body=false; for (let node=object;node;node=node.parent) body ||= node.name.startsWith('Usagi_Body');
    if (!body) return;
    points.push(...Array.from({length:object.geometry.attributes.position.count},(_,i)=>object.getVertexPosition(i,new Vector3()).applyMatrix4(object.matrixWorld).toArray()));
  });
  snapshots[pose]={bones,points};
  if (pose==='neutral') {
    const original=[];
    vrm.scene.traverse(object=>{
      if (!object.isSkinnedMesh) return;
      let body=false; for (let node=object;node;node=node.parent) body ||= node.name.startsWith('Usagi_Body');
      if (!body) return;
      const p=object.geometry.attributes.position;
      for(let i=0;i<p.count;i++) original.push([p.getX(i),-p.getZ(i),p.getY(i)]);
    });
    snapshots[pose].original=original;
  }
}
writeFileSync(output,JSON.stringify(snapshots));
