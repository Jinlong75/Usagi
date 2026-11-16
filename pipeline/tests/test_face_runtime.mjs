// Exercise three-vrm 3.5.5 itself, using binds extracted from the synthetic VRM.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.argv[2];
const runtime = await import(pathToFileURL(path.join(root, 'node_modules/@pixiv/three-vrm/lib/three-vrm.module.js')));
const THREE = await import(pathToFileURL(path.join(root, 'node_modules/three/build/three.module.js')));
const { VRMExpressionLoaderPlugin, MToonMaterial } = runtime;
const bytes = fs.readFileSync(path.join(root, 'synthetic-face.vrm'));
const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
const presets = Object.fromEntries(Object.entries(gltf.extensions.VRMC_vrm.expressions.preset)
  .filter(([, e]) => e.textureTransformBinds?.length));
const scene = new THREE.Scene();
const materials = new Map();
for (const [index, m] of gltf.materials.entries()) {
  if (!['FaceEyes', 'FaceMouth'].includes(m.name)) continue;
  const map = new THREE.Texture();
  const emissiveMap = new THREE.Texture();
  for (const [texture, info] of [[map, m.pbrMetallicRoughness.baseColorTexture], [emissiveMap, m.emissiveTexture]]) {
    const tr = info.extensions.KHR_texture_transform;
    texture.offset.fromArray(tr.offset);
    texture.repeat.fromArray(tr.scale);
  }
  const material = new MToonMaterial({ map, emissiveMap });
  materials.set(index, material);
  scene.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
}
const parser = {
  json: gltf,
  associations: new Map([...materials].map(([index, material]) => [material, { materials: index }])),
};
const loaded = { scene, userData: {} };
await new VRMExpressionLoaderPlugin(parser).afterRoot(loaded);
const manager = loaded.userData.vrmExpressionManager;
assert.equal(manager.expressions.filter(e => e.binds.length > 0).length, 14);
function check(name, expected) {
  const m = [...materials.entries()].find(([i]) => gltf.materials[i].name === name)[1];
  for (const texture of [m.map, m.emissiveMap]) {
    assert.deepEqual(texture.offset.toArray(), expected);
    assert.deepEqual(texture.repeat.toArray(), [.25, .25]);
  }
}
for (const [name, expression] of Object.entries(presets)) {
  manager.resetValues();
  manager.setValue(name, 1);
  manager.update();
  for (const [index] of materials) {
    const bind = expression.textureTransformBinds.find(b => b.material === index);
    check(gltf.materials[index].name, bind?.offset ?? [0, 0]);
  }
}
manager.resetValues();
manager.setValue('blink', 1);
manager.update();
check('FaceEyes', [.25, 0]);
manager.setValue('happy', 1);
manager.setValue('aa', 1);
manager.update();
check('FaceEyes', [0, .25]); // blink's [.25,0] delta MUST be blocked
check('FaceMouth', [.5, .25]); // aa MUST also be blocked
manager.setValue('happy', 0);
manager.update();
check('FaceEyes', [.25, 0]);
check('FaceMouth', [.25, 0]);
manager.resetValues();
manager.setValue('happy', .5);
manager.update();
check('FaceEyes', [0, 0]); // Binary threshold is strictly > 0.5
manager.setValue('happy', .51);
manager.update();
check('FaceEyes', [0, .25]);
manager.resetValues();
manager.update();
check('FaceEyes', [0, 0]);
check('FaceMouth', [0, 0]);
manager.setValue('happy', 1);
manager.setValue('angry', 1);
manager.update();
check('FaceEyes', [.25, .5]); // Documented limitation: emotions do add.
console.log('011 three-vrm 3.5.5: happy blocks blink/aa, binary threshold, base/emissive UVs and reset passed');
