import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {parseLegacyGlb,sourceAccessor} from '../scripts/cas-source-asset-audit.mjs';
import {ASSET_SHA256} from '../scripts/cas-02-1-f0-download-assets.mjs';
import {splitShoeSource,F1_DIR} from '../scripts/cas-02-1-f1-split-dress.mjs';
import {createHash} from 'node:crypto';

const sha=b=>createHash('sha256').update(b).digest('hex');
test('CAS F1 only accepts license-pinned third-party original, not authored fake shoes',()=>{
 assert.match(readFileSync('scripts/cas-02-1-f1-split-dress.mjs','utf8'),/ASSET_SHA256\.dress/);
 assert.match(readFileSync('src/cas-cc0-shoe-rig-lab.js','utf8'),/mixamorig:/);
 assert.match(readFileSync('src/cas-cc0-shoe-rig-lab.js','utf8'),/foot\.addChild\(anchor\)/);
 assert.doesNotMatch(readFileSync('src/cas-cc0-shoe-rig-lab.js','utf8'),/localStorage\.setItem/);
 assert.ok(existsSync('cas-cc0-shoe-rig-lab.html'));
});
test('CAS F1 source GLB physically splits 19,744 original triangles, keeps all textures and original CC0 bytes',()=>{
 const sourcePath='assets/characters/cas-cc0-f0/dress.glb';
 if(!existsSync(sourcePath))return; // CI browser + Pages builds generate licensed source first.
 const source=readFileSync(sourcePath);
 assert.equal(sha(source),ASSET_SHA256.dress);
 const {outputs,sourceTriangles}=splitShoeSource(source);
 assert.equal(sourceTriangles,19744);
 assert.equal(outputs.left.triangles+outputs.right.triangles,sourceTriangles);
 assert.ok(outputs.left.triangles>6000);
 assert.ok(outputs.right.triangles>6000);
 const sourceG=parseLegacyGlb(source).gltf;
 for(const part of Object.values(outputs)){
  const {gltf}=parseLegacyGlb(part.glb);
  assert.equal(gltf.skins?.length||0,0,'source prop remains unskinned; no false claim');
  assert.equal(gltf.animations?.length||0,0);
  assert.equal(gltf.materials?.length,sourceG.materials?.length);
  assert.equal(gltf.images?.length,sourceG.images?.length);
  assert.equal(gltf.textures?.length,sourceG.textures?.length);
  assert.equal(gltf.meshes.length,1);
  let triangles=0;
  for(const primitive of gltf.meshes[0].primitives)
   triangles+=sourceAccessor(parseLegacyGlb(part.glb),primitive.indices).values.length/3;
  assert.equal(triangles,part.triangles);
  assert.equal(part.sourceBounds.min[1]>=0,true);
 }
 if(existsSync(F1_DIR+'/dress.manifest.json')){
  const m=JSON.parse(readFileSync(F1_DIR+'/dress.manifest.json','utf8'));
  assert.equal(m.sourceSha256,ASSET_SHA256.dress);
  assert.equal(m.license,'CC0-1.0');
  for(const side of ['left','right']){
   assert.equal(m.parts[side].sha256,sha(readFileSync(F1_DIR+'/'+m.parts[side].file)));
   assert.equal(m.parts[side].triangles,outputs[side].triangles);
  }
 }
});
