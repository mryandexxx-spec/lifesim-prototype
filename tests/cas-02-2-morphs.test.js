import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readSourceAsset,parseLegacyGlb,sourceAccessor,auditSourceGlb} from '../scripts/cas-source-asset-audit.mjs';
import {CAS_022_SOURCE_SHA256,CAS_022_MORPHS,buildCas022Morphs}
  from '../scripts/cas-02-2-morphs.mjs';

for(const kind of ['alex','mira']){
 test('CAS-02.2-A '+kind+' source-accurate real skinned morph geometry, unchanged rig/clips/materials/shoes',()=>{
   const originalBuffer=readSourceAsset(kind);
   const original=parseLegacyGlb(originalBuffer),old=auditSourceGlb(originalBuffer,kind);
   const {buffer,json,metadata}=buildCas022Morphs(kind,originalBuffer);
   const built=parseLegacyGlb(buffer),actual=auditSourceGlb(buffer,kind);
   assert.equal(original.sourceSha256,CAS_022_SOURCE_SHA256[kind]);
   assert.equal(metadata.sourceSha256,original.sourceSha256);
   assert.equal(json.extras.cas022.productionReady,false);
   assert.equal(metadata.saveSchemaChanged,false);
   assert.equal(metadata.gameRuntimeChanged,false);
   assert.deepEqual(json.skins,original.gltf.skins,'same source bone bind pose');
   assert.deepEqual(json.nodes,original.gltf.nodes,'same exact source skeleton & mesh transforms');
   assert.deepEqual(json.animations,original.gltf.animations,'same animations and channel targets');
   assert.deepEqual(json.materials,original.gltf.materials,'same original textures/materials');
   assert.deepEqual(json.textures,original.gltf.textures);
   assert.deepEqual(json.images,original.gltf.images);
   assert.equal(json.meshes[0].primitives[0].indices,original.gltf.meshes[0].primitives[0].indices);
   assert.deepEqual(json.meshes[0].primitives[0].attributes,
     original.gltf.meshes[0].primitives[0].attributes,'original weighted skin/UV/POSITION unchanged');
   assert.deepEqual(json.meshes[0].weights,[0,0],'original mesh is the default');
   assert.deepEqual(json.meshes[0].extras.targetNames,[...CAS_022_MORPHS]);
   assert.equal(json.meshes[0].primitives[0].targets.length,2,'two real morph accessors');
   assert.equal(actual.joints,66);
   assert.equal(actual.skinCount,1);
   assert.equal(actual.bindSha256,old.bindSha256);
   assert.equal(actual.triangles,old.triangles);
   assert.deepEqual(actual.clipNames,old.clipNames);
   assert.equal(actual.morphTargets,2);
   assert.equal(metadata.sourceMeshCount,1);
   for(const [index,target] of json.meshes[0].primitives[0].targets.entries()){
     const delta=sourceAccessor(built,target.POSITION);
     const xyz=delta.values;
     assert.equal(delta.acc.count,
       original.gltf.accessors[original.gltf.meshes[0].primitives[0].attributes.POSITION].count);
     assert.ok(xyz.some((v,i)=>i%3===0&&Math.abs(v)>.001),'morph must actually change vertices');
     assert.ok(xyz.every((v,i)=>i%3===0||v===0),'no vertical/forward contact shift');
     assert.ok(metadata.vertexCounts[index]>=100);
     assert.ok(metadata.maxVertexDisplacementMeters[index]<.06);
   }
   assert.ok(buffer.length>originalBuffer.length,'actual glTF morph data in source derivative');
 });
}
test('CAS-02.2-A fails closed on unapproved source or unknown resident',()=>{
 const original=readSourceAsset('alex'),changed=Buffer.from(original);
 changed[changed.length-9]^=1;
 assert.throws(()=>buildCas022Morphs('alex',changed),/Unexpected.*SHA/);
 assert.throws(()=>buildCas022Morphs('unlisted',original),/Unknown resident/);
});
test('CAS-02.2-A makes no browser save or game imports and stays lab-only',()=>{
 const source=buildCas022Morphs.toString();
 assert.doesNotMatch(source,/localStorage|lifesim\.room01\.v1|game\.js/);
});
