import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readSourceAsset,parseLegacyGlb,sourceAccessor} from '../scripts/cas-source-asset-audit.mjs';
import {buildResidentFootwear,SOURCE_SHA256,STYLES} from '../scripts/build-cas-resident-footwear-v2.mjs';

const triangleKeys=values=>{
 const keys=[];
 for(let i=0;i<values.length;i+=3)keys.push(values.slice(i,i+3).join(':'));
 return keys.sort();
};
for(const kind of ['alex','mira']){
 test('CAS-02.1-E '+kind+': faithful source face, skin, UV, exact animation channels and texture',()=>{
  const original=parseLegacyGlb(readSourceAsset(kind));
  const {buffer,metadata}=buildResidentFootwear(kind),out=parseLegacyGlb(buffer);
  assert.equal(original.sourceSha256,SOURCE_SHA256[kind]);
  assert.equal(out.gltf.skins.length,1);
  assert.deepEqual(out.gltf.skins,original.gltf.skins,'never retarget bones or inverse bind matrices');
  assert.deepEqual(out.gltf.animations,original.gltf.animations,'keep every actual source animation channel');
  assert.deepEqual(out.gltf.images,original.gltf.images,'keep original face and clothes texture');
  assert.deepEqual(out.gltf.textures,original.gltf.textures);
  assert.deepEqual(out.gltf.materials[0],original.gltf.materials[0]);
  assert.equal(out.gltf.meshes.length,4);
  assert.equal(metadata.styleNodes.length,3);
  assert.deepEqual(metadata.styleNames,STYLES);
  assert.equal(metadata.productionReady,false);
  assert.equal(metadata.originalGameModelsUnchanged,true);
  assert.equal(metadata.sourceAnimations.length,kind==='alex'?10:13);
  assert.match(metadata.sourceBindSha256,/^[a-f0-9]{64}$/);
  assert.match(metadata.sha256,/^[a-f0-9]{64}$/);
  assert.equal(metadata.sourceSkinJoints,66);
  assert.ok(metadata.shoeTriangles>1000);
  assert.ok(metadata.bySide.every(n=>n>=550));
 });
 test('CAS-02.1-E '+kind+': exact per-triangle partition of original 3D source with three skinned variants',()=>{
  const src=parseLegacyGlb(readSourceAsset(kind));
  const {buffer,metadata}=buildResidentFootwear(kind);
  const out=parseLegacyGlb(buffer);
  const original=src.gltf.meshes[0].primitives[0];
  const main=out.gltf.meshes[0].primitives[0];
  const originalShoe=out.gltf.meshes[1].primitives[0];
  const originalKeys=triangleKeys(sourceAccessor(src,original.indices).values);
  const otherKeys=triangleKeys([
   ...sourceAccessor(out,main.indices).values,...sourceAccessor(out,originalShoe.indices).values
  ]);
  assert.deepEqual(otherKeys,originalKeys,'source geometry must neither lose nor duplicate a triangle');
  assert.equal(metadata.bodyTriangles+metadata.shoeTriangles,metadata.sourceTriangles);
  assert.deepEqual(main.attributes,original.attributes);
  assert.deepEqual(originalShoe.attributes,original.attributes);
  assert.equal(originalShoe.material,original.material);
  for(const [i,style] of STYLES.entries()){
   const n=out.gltf.nodes[metadata.styleNodes[i]];
   assert.equal(n.name,'CAS '+kind+' shoes '+style);
   assert.equal(n.skin,src.gltf.nodes.find(x=>x.skin===0).skin);
   assert.ok(out.gltf.meshes[n.mesh].primitives.every(p=>
    p.attributes.JOINTS_0===original.attributes.JOINTS_0&&
    p.attributes.WEIGHTS_0===original.attributes.WEIGHTS_0&&
    p.attributes.TEXCOORD_0===original.attributes.TEXCOORD_0
   ));
   const tris=out.gltf.meshes[n.mesh].primitives.reduce((sum,p)=>
    sum+sourceAccessor(out,p.indices).values.length/3,0);
   assert.equal(tris,metadata.shoeTriangles,style+' full one-pair shoe coverage');
  }
 });
 test('CAS-02.1-E '+kind+': variants visibly change REAL source positions and contrasting sole materials',()=>{
  const src=parseLegacyGlb(readSourceAsset(kind));
  const {buffer,metadata}=buildResidentFootwear(kind);
  const out=parseLegacyGlb(buffer);
  const source=src.gltf.meshes[0].primitives[0];
  const positions=sourceAccessor(src,source.attributes.POSITION).values;
  const paint=[];
  for(const style of ['graphite','terracotta']){
   const node=out.gltf.nodes[metadata.styleNodes[STYLES.indexOf(style)]];
   const mesh=out.gltf.meshes[node.mesh],upper=mesh.primitives[0],sole=mesh.primitives[1];
   assert.equal(mesh.primitives.length,2);
   assert.equal(upper.attributes.POSITION,sole.attributes.POSITION);
   const actual=sourceAccessor(out,upper.attributes.POSITION).values;
   let moved=0,maximum=0;
   for(let i=0;i<positions.length;i++){
    const delta=Math.abs(actual[i]-positions[i]);
    if(delta>0.00001)moved++;
    maximum=Math.max(maximum,delta);
   }
   assert.ok(moved>700,'actual source shoe vertices must deform, not only recolor');
   assert.ok(maximum>.003&&maximum<.16);
   assert.ok(metadata.styleStats[style].soleTriangles>30);
   const upperTint=out.gltf.materials[upper.material].pbrMetallicRoughness.baseColorFactor;
   const soleTint=out.gltf.materials[sole.material].pbrMetallicRoughness.baseColorFactor;
   assert.notDeepEqual(upperTint,soleTint,'contrast sole is a separate genuine material primitive');
   paint.push(upperTint.join(','));
  }
  assert.notEqual(paint[0],paint[1],'the two source-skinned alternatives differ in color');
 });
}
test('CAS-02.1-E source SHA gate prevents mixed Mira/Alex skins and generated assets reproduce bytes',()=>{
 const alex=buildResidentFootwear('alex'),mira=buildResidentFootwear('mira');
 assert.equal(alex.buffer.equals(buildResidentFootwear('alex').buffer),true);
 assert.equal(mira.buffer.equals(buildResidentFootwear('mira').buffer),true);
 assert.notEqual(alex.metadata.sourceBindSha256,mira.metadata.sourceBindSha256);
 assert.notEqual(alex.metadata.sha256,mira.metadata.sha256);
 assert.throws(()=>buildResidentFootwear('mira',readSourceAsset('alex')),/SHA-256 changed/);
 const wrong=Buffer.from(readSourceAsset('alex'));wrong[wrong.length-16]^=1;
 assert.throws(()=>buildResidentFootwear('alex',wrong),/SHA-256 changed/);
 for(const doc of [alex.json,mira.json])assert.equal(JSON.stringify(doc).includes('lifesim.room01.v1'),false);
});
