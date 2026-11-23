import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {decodeGlb,inspectGlb,expandPassport,auditEntry,imageDimensions} from '../scripts/qsk-04-asset-qa.mjs';

const registry=JSON.parse(readFileSync(new URL('../docs/qsk-04-asset-registry.json',import.meta.url)));
function tinyGlb(gltf,bin=Buffer.alloc(60)){
  gltf={asset:{version:'2.0'},buffers:[{byteLength:bin.length}],...gltf};
  const json=Buffer.from(JSON.stringify(gltf));
  const paddedJson=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
  const paddedBin=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
  const result=Buffer.alloc(28+paddedJson.length+paddedBin.length);
  result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);
  result.writeUInt32LE(paddedJson.length,12);result.writeUInt32LE(0x4e4f534a,16);
  paddedJson.copy(result,20);const offset=20+paddedJson.length;
  result.writeUInt32LE(paddedBin.length,offset);result.writeUInt32LE(0x004e4942,offset+4);
  paddedBin.copy(result,offset+8);return result;
}
const fixture=(overrides={})=>tinyGlb({
  bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:24}],
  accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},
    {bufferView:1,componentType:5126,count:3,type:'VEC2'}],
  meshes:[{primitives:[{attributes:{POSITION:0,TEXCOORD_0:1}}]}],...overrides
});
const entry={id:'test',file:'assets/characters/test.glb',category:'character',status:'staged-not-integrated',
  sha256:null,bytes:0,provenance:{source:'fixture',license:'unknown-not-cleared',evidence:'tests/test'},
  budget:{triangles:100,textureEdge:2048},expected:{skins:0,triangles:1}};

test('QSK-04 keeps canonical Alex and Mira source-pinned, immutable and stage-safe',()=>{
  assert.deepEqual(registry.origins.map(x=>x.id),['original-alex','original-mira']);
  for(const e of registry.origins){
    assert.match(e.sha256,/^[0-9a-f]{64}$/);
    assert.equal(e.expected.joints,66);
    assert.equal(e.status,'existing-published');
    assert.equal(e.provenance.license,'unknown-not-cleared');
  }
  assert.equal(registry.collections.reduce((n,x)=>n+x.expectedCount,0),63);
  assert.equal(registry.collections.at(-1).status,'staged-not-integrated');
  assert.ok(!JSON.stringify(registry).includes('lifesim.room01.v1'));
});

test('QSK-04 parses bounded GLB with real UV metadata and refuses corrupt header/chunks',()=>{
  const valid=fixture();const parsed=decodeGlb(valid);assert.equal(parsed.gltf.asset.version,'2.0');
  const metadata=inspectGlb(valid);
  assert.equal(metadata.triangles,1);assert.equal(metadata.uvPrimitives,1);
  assert.equal(metadata.skinCount,0);assert.equal(metadata.images.length,0);
  const bad=Buffer.from(valid);bad.writeUInt32LE(12,8);
  assert.throws(()=>inspectGlb(bad),/byte length mismatch/);
  const truncated=valid.subarray(0,valid.length-4);
  assert.throws(()=>inspectGlb(truncated),/length mismatch/);
  assert.throws(()=>inspectGlb(fixture({meshes:[{primitives:[{attributes:{POSITION:22}}]}]})),/missing\/sparse accessor/);
  assert.throws(()=>inspectGlb(fixture({meshes:[{primitives:[{attributes:{POSITION:0,TEXCOORD_0:5}}]}]})),/missing\/sparse accessor/);
  assert.throws(()=>inspectGlb(fixture({meshes:[{primitives:[{attributes:{POSITION:0},mode:1}]}]})),/non-triangle/);
});

test('QSK-04 actual integrity and budget checks fail closed while rights stay explicitly unapproved',()=>{
  const raw=fixture(),source=createHash('sha256').update(raw).digest('hex');
  const valid=auditEntry({...entry,sha256:source,bytes:raw.length},raw);
  assert.equal(valid.integrity,'pass');assert.equal(valid.rightsCleared,false);
  assert.equal(valid.readyForNewIntegration,false);
  assert.equal(valid.provenanceGate,'blocked-until-reviewed');
  const drift=auditEntry({...entry,sha256:'f'.repeat(64),bytes:raw.length},raw);
  assert.equal(drift.integrity,'fail');assert.match(drift.errors.join(),/SHA256 drift/);
  const oversized=auditEntry({...entry,sha256:source,bytes:raw.length,budget:{triangles:0,textureEdge:32}},raw);
  assert.equal(oversized.integrity,'fail');assert.match(oversized.errors.join(),/Triangles/);
  const wrongRig=auditEntry({...entry,sha256:source,bytes:raw.length,expected:{skins:1,joints:66}},raw);
  assert.equal(wrongRig.integrity,'fail');
});

test('QSK-04 validates PNG pixel bounds and refuses unsupported texture MIME',()=>{
  const png=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.write('IHDR',12);png.writeUInt32BE(1024,16);png.writeUInt32BE(512,20);
  assert.deepEqual(imageDimensions(png,'image/png'),{width:1024,height:512});
  assert.throws(()=>imageDimensions(png,'image/webp'),/unsupported/);
});

test('QSK-04 prevents path traversal, duplicated sources and silent promoted statuses',()=>{
  const one={...registry,collections:[],origins:[registry.origins[0],registry.origins[0]]};
  assert.throws(()=>expandPassport(one,()=>''),/duplicate\/unsafe/);
  const corrupt={...registry,collections:[],origins:[{...registry.origins[0],file:'assets/characters/../steal.glb'}]};
  assert.throws(()=>expandPassport(corrupt,()=>''),/duplicate\/unsafe/);
  const approved={...registry,collections:[],origins:[{...registry.origins[0],status:'production-ready'}]};
  assert.throws(()=>expandPassport(approved,()=>''),/unsafe promotion/);
});
