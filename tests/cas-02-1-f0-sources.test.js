import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CC0_SHOE_CANDIDATES,ASSET_SHA256,inspectCandidateGlb} from '../scripts/cas-02-1-f0-download-assets.mjs';

test('CAS-02.1-F0 only individually identified no-brand CC0 GLB with documented source',()=>{
 assert.deepEqual(CC0_SHOE_CANDIDATES.map(x=>x.id),['dress','sneakers','boots']);
 for(const x of CC0_SHOE_CANDIDATES){
  assert.equal(new URL(x.page).hostname,'grab3d.com');
  assert.ok(x.page.startsWith('https://grab3d.com/models/props/'));
  assert.ok(x.slug&&x.file.endsWith('.glb'));
  assert.ok(x.expectedTriangles>=10000&&x.expectedTriangles<=25000);
  assert.equal(ASSET_SHA256[x.id]===null||/^[0-9a-f]{64}$/.test(ASSET_SHA256[x.id]),true);
 }
});
test('CAS-02.1-F0 downloaded source must be real well-formed GLB, never be HTML or arbitrary file',()=>{
 const b=Buffer.alloc(32);
 assert.throws(()=>inspectCandidateGlb(b,CC0_SHOE_CANDIDATES[0]),/invalid GLB 2.0/);
 assert.throws(()=>inspectCandidateGlb(Buffer.from('Access denied'),CC0_SHOE_CANDIDATES[1]),/unsupported external GLB/);
 const crafted=Buffer.alloc(32);
 crafted.writeUInt32LE(0x46546c67,0);crafted.writeUInt32LE(2,4);crafted.writeUInt32LE(31,8);
 assert.throws(()=>inspectCandidateGlb(crafted,CC0_SHOE_CANDIDATES[2]),/invalid GLB 2.0/);
});
