import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {parseLegacyGlb,sourceAccessor} from '../scripts/cas-source-asset-audit.mjs';
import {ASSET_SHA256} from '../scripts/cas-02-1-f0-download-assets.mjs';
import {splitShoeSource,F1_DIR} from '../scripts/cas-02-1-f1-split-dress.mjs';
import {buildResidentFootwear} from '../scripts/build-cas-resident-footwear-v2.mjs';
import {buildAlexF1Underfoot,F1_ALEX_SOURCE_SHA256} from '../scripts/cas-02-1-f1-alex-underfoot.mjs';
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

test('CAS F1 separate original-skin underfoot mask removes lingering white footwear without losing faces or source animation',()=>{
 const original=buildResidentFootwear('alex').buffer;
 assert.equal(sha(original),F1_ALEX_SOURCE_SHA256);
 const {model,metadata}=buildAlexF1Underfoot(original);
 const a=parseLegacyGlb(original),b=parseLegacyGlb(model);
 assert.equal(b.gltf.skins.length,1);
 assert.deepEqual(b.gltf.skins,a.gltf.skins,'exact inverse binds, joint order and source skin retained');
 assert.deepEqual(b.gltf.animations,a.gltf.animations,'all 10 original source animation tracks retained');
 assert.ok(metadata.maskedSourceSneakerTriangles>=700);
 assert.ok(metadata.maskedSourceSneakerTriangles<1700);
 assert.equal(metadata.sourceBodyTriangles,metadata.unmaskedBodyTriangles+metadata.maskedSourceSneakerTriangles);
 const node=b.gltf.nodes.find(n=>n.name===metadata.sourceResidualNode);
 assert.ok(node&&node.skin===0&&node.mesh>=a.gltf.meshes.length);
 const main=b.gltf.meshes[0].primitives[0],mask=b.gltf.meshes[node.mesh].primitives[0];
 assert.deepEqual(main.attributes,mask.attributes,'residual must preserve original source weighted vertices');
 assert.equal(main.material,mask.material,'same unchanged original appearance restored in source mode');
 const count=p=>sourceAccessor(b,p.indices).values.length/3;
 assert.equal(count(main)+count(mask),metadata.sourceBodyTriangles);
 assert.equal(b.gltf.meshes[1].name,a.gltf.meshes[1].name,'reversible original source shoe untouched');
 assert.equal(b.gltf.extras.casSourceFootwearStyles.sourceSha256,a.gltf.extras.casSourceFootwearStyles.sourceSha256);
});
