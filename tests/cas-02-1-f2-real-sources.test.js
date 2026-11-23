import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CC0_SHOE_CANDIDATES,ASSET_SHA256,ASSET_DIR}
 from '../scripts/cas-02-1-f0-download-assets.mjs';
import {splitF2ShoePair,buildF2Candidates,F2_DIR}
 from '../scripts/cas-02-1-f2-real-source-audit.mjs';
import {parseLegacyGlb,sourceAccessor}
 from '../scripts/cas-source-asset-audit.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');

test('F2-C actual leather, sneakers, boots have three distinct immutable publisher sources',()=>{
 assert.deepEqual(CC0_SHOE_CANDIDATES.map(v=>v.id),['dress','sneakers','boots']);
 assert.equal(new Set(Object.values(ASSET_SHA256)).size,3);
 for(const source of CC0_SHOE_CANDIDATES){
  assert.match(ASSET_SHA256[source.id],/^[a-f0-9]{64}$/);
  assert.ok(source.expectedTriangles>=19000);
 }
});
test('F2-C must reject source mismatch, license-less or unknown candidate',()=>{
 const entry=CC0_SHOE_CANDIDATES[0];
 assert.throws(()=>splitF2ShoePair(Buffer.from('not a source'),entry),/audited CC0/);
 assert.throws(()=>splitF2ShoePair(Buffer.from('not a source'),{...entry,id:'unknown'}),/Unknown CC0/);
});
test('F2-C inspect REAL three GLBs: exact source triangles, two independent copied mesh objects, preserved textures, explicit quarantine',t=>{
 if(!CC0_SHOE_CANDIDATES.every(x=>existsSync(ASSET_DIR+'/'+x.id+'.glb'))){
  t.skip('Vendor source downloaded in WebGL/Pages source audit stages, not default checkout');
  return;
 }
 const report=buildF2Candidates();
 assert.deepEqual(report.sources.map(s=>s.id),['dress','sneakers','boots']);
 assert.equal(report.productionReady,false);
 assert.equal(report.physicallyApproved,false);
 for(const entry of CC0_SHOE_CANDIDATES){
  const src=readFileSync(ASSET_DIR+'/'+entry.id+'.glb');
  assert.equal(sha(src),ASSET_SHA256[entry.id]);
  const quality=report.sources.find(s=>s.id===entry.id);
  assert.equal(quality.normalisedFitApproved,false);
  assert.equal(quality.contactApproved,false);
  assert.equal(quality.sourceOrientationVerified,false);
  assert.equal(quality.sourceSha256,ASSET_SHA256[entry.id]);
  assert.ok(['quarantined','geometry-split-review-required'].includes(quality.status));
  if(entry.id!=='boots'){
   assert.equal(quality.status,'geometry-split-review-required',
    'genuine '+entry.id+' must split into two intact source shoe halves');
   assert.equal(quality.sourceParts.length,2);
  }
  assert.ok(quality.reason.length>10,'quarantine/review reason must be available');
  assert.equal(quality.sourceParts.length===2||quality.status==='quarantined',true);
  for(const side of quality.sourceParts){
   const bytes=readFileSync(F2_DIR+'/'+side.file);
   assert.equal(sha(bytes),side.sha256);
   const result=parseLegacyGlb(bytes);
   assert.equal(result.gltf.skins?.length||0,0,'do not claim vertex bone skin');
   assert.equal(result.gltf.animations?.length||0,0);
   assert.equal(result.gltf.textures?.length,3);
   assert.equal(result.gltf.images?.length,3);
   assert.equal(result.gltf.meshes.length,1);
   assert.equal(result.gltf.meshes[0].primitives.reduce((n,p)=>
    n+sourceAccessor(result,p.indices).acc.count/3,0),side.sourceTriangles);
  }
  if(quality.sourceParts.length===2)assert.equal(
   quality.sourceParts[0].sourceTriangles+quality.sourceParts[1].sourceTriangles,
   entry.expectedTriangles);
 }
});
test('F2-C no unapproved source is silently promoted into live wardrobe or saved state',()=>{
 const q=readFileSync('scripts/cas-02-1-f2-real-source-audit.mjs','utf8');
 assert.doesNotMatch(q,/localStorage|productionReady:true|physicalIphoneApproved:true/);
 assert.match(q,/sourceOrientationVerified:false/);
 assert.match(q,/normalisedFitApproved:false/);
 assert.match(q,/status:'quarantined'/);
});
