import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readSourceAsset,parseLegacyGlb,sourceAccessor,auditSourceGlb} from '../scripts/cas-source-asset-audit.mjs';
import {buildAlexWardrobeGlb,ALEX_SOURCE_SHA256} from '../scripts/build-cas-alex-wardrobe.mjs';

test('CAS-02.1-D exact production Alex face/head/body texture and all 10 original animations survive untouched',()=>{
 const original=parseLegacyGlb(readSourceAsset('alex'));
 const generated=buildAlexWardrobeGlb();
 const out=parseLegacyGlb(generated.buffer);
 assert.equal(original.sourceSha256,ALEX_SOURCE_SHA256);
 assert.equal(generated.metadata.sourceSha256,ALEX_SOURCE_SHA256);
 assert.equal(generated.json.asset.generator.includes('Alex source mesh'),true);
 assert.equal(out.gltf.skins.length,1);
 assert.deepEqual(out.gltf.skins,original.gltf.skins,'actual original bone order/bind matrices intact');
 assert.deepEqual(out.gltf.animations,original.gltf.animations,'original animation source channels intact');
 assert.deepEqual(out.gltf.images,original.gltf.images,'same real Alex texture');
 assert.deepEqual(out.gltf.textures,original.gltf.textures);
 assert.equal(out.gltf.meshes.length,3);
 assert.equal(out.gltf.materials.length,2);
 assert.equal(out.gltf.nodes.length,original.gltf.nodes.length+2);
 assert.equal(generated.metadata.productionReady,false);
 assert.equal(generated.metadata.originalClipNames.length,10);
});
test('CAS-02.1-D the ORIGINAL Alex 25,847 triangles are exactly partitioned, never deleted or duplicated',()=>{
 const original=parseLegacyGlb(readSourceAsset('alex'));
 const result=parseLegacyGlb(buildAlexWardrobeGlb().buffer);
 const a=original.gltf.meshes[0].primitives[0],body=result.gltf.meshes[0].primitives[0];
 const originalFoot=result.gltf.meshes[1].primitives[0],alternative=result.gltf.meshes[2].primitives[0];
 const sourceIndices=sourceAccessor(original,a.indices).values;
 const rest=sourceAccessor(result,body.indices).values,shoe=sourceAccessor(result,originalFoot.indices).values;
 assert.deepEqual([...rest,...shoe].sort((x,y)=>x-y),sourceIndices.sort((x,y)=>x-y));
 assert.equal((rest.length+shoe.length)/3,25847);
 assert.equal(alternative.indices,originalFoot.indices,'both footwear versions split precisely same source faces');
 assert.deepEqual(body.attributes,a.attributes,'body shares ORIGINAL mesh vertex source, untouched');
 assert.deepEqual(originalFoot.attributes,a.attributes,'shoe remains exact ORIGINAL source positions/UV/skin');
 assert.equal(originalFoot.material,a.material,'original shoe keeps original texture/material');
 assert.equal(shoe.length/3>=900,true,'not just a cosmetic material swap');
});
test('CAS-02.1-D alternative footwear moves REAL skinned shoe vertices and retains exact joint bind',()=>{
 const source=parseLegacyGlb(readSourceAsset('alex')),r=buildAlexWardrobeGlb();
 const output=parseLegacyGlb(r.buffer),a=source.gltf.meshes[0].primitives[0],alt=output.gltf.meshes[2].primitives[0];
 assert.equal(alt.attributes.TEXCOORD_0,a.attributes.TEXCOORD_0);
 assert.equal(alt.attributes.JOINTS_0,a.attributes.JOINTS_0);
 assert.equal(alt.attributes.WEIGHTS_0,a.attributes.WEIGHTS_0);
 assert.equal(alt.attributes.NORMAL,a.attributes.NORMAL);
 assert.notEqual(alt.attributes.POSITION,a.attributes.POSITION);
 const initial=sourceAccessor(source,a.attributes.POSITION).values;
 const altered=sourceAccessor(output,alt.attributes.POSITION).values;
 assert.equal(altered.length,initial.length);
 let displacement=0,max=0;
 for(let i=0;i<initial.length;i++){
  const d=Math.abs(initial[i]-altered[i]);
  if(d>0.0001)displacement++;max=Math.max(max,d);
 }
 assert.ok(displacement>1000,'real geometric shoe changes, not just recoloring');
 assert.ok(max>.003&&max<.1,'bounded real source geometry deformation');
 assert.deepEqual(output.gltf.skins[0],source.gltf.skins[0]);
 assert.equal(r.metadata.bindingSha256,auditSourceGlb(readSourceAsset('alex'),'alex').bindSha256);
 assert.notEqual(output.gltf.materials[1].pbrMetallicRoughness.baseColorFactor,
   output.gltf.materials[0].pbrMetallicRoughness?.baseColorFactor);
});
test('CAS-02.1-D output is byte-reproducible and source Mira must NOT be silently mixed into Alex',()=>{
 const a=buildAlexWardrobeGlb(),b=buildAlexWardrobeGlb();
 assert.ok(a.buffer.equals(b.buffer));
 assert.match(a.metadata.sha256,/^[a-f0-9]{64}$/);
 assert.deepEqual(a.metadata.bySide.length,2);
 assert.ok(a.metadata.bySide.every(x=>x>400));
 assert.equal(a.json.extras.casAlexFootwear.productionReady,false);
 assert.equal(JSON.stringify(a.json).includes('lifesim.room01.v1'),false);
 const m=auditSourceGlb(readSourceAsset('mira'),'mira');
 assert.notEqual(a.metadata.bindingSha256,m.bindSha256,
   'Mira cannot receive Alex shoes without reskinning/retargeting');
});
