import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {OF_GARDEN_ASSETS,gardenModelState} from '../src/of-garden-assets.js';
import {OUTDOOR_CATALOG} from '../src/outdoor-catalog.js';
import {gardenView,newGardenRecord,advanceGardenRecord} from '../src/gardening.js';
test('OF-C exact 22 source variants, native one-meter footprint, soil names and real mesh',()=>{
 let count=0;
 for(const [sku,variants] of Object.entries(OF_GARDEN_ASSETS)){
  assert.equal(OUTDOOR_CATALOG[sku].category,'garden');assert.equal(OUTDOOR_CATALOG[sku].width,1);assert.equal(OUTDOOR_CATALOG[sku].depth,1);
  for(const [state,v] of Object.entries(variants)){
   count++;const bytes=readFileSync('assets/furniture/of-r2/'+sku+'-'+state+'.glb');
   assert.equal(bytes.length,v.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),v.sha256);assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(8),bytes.length);
   const json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
   assert.ok(json.meshes.length>0);assert.ok(json.materials.some(m=>m.name===(state==='wet'?'Wet soil':'Dry soil')),sku+' '+state);
   assert.deepEqual(v.boundsBlender[0],[-.5,-.5,0]);assert.deepEqual(v.boundsBlender[1].slice(0,2),[.5,.5]);
  }
 }
 assert.equal(count,22);
});
test('OF-C visual selection follows actual wet growth, moisture expiration, crop and replant',()=>{
 for(const sku of Object.keys(OF_GARDEN_ASSETS)){
  let r={...newGardenRecord(0),hydratedUntil:5000,lastWateredAt:0};
  for(const [at,variant] of [[0,'seed'],[1440,'sprout'],[2880,'growing'],[4320,'wet'],[5001,'new']]){
   const v=gardenView({gardens:{'out-1':r}},'out-1',at);const before=JSON.stringify(v);
   const state=gardenModelState(sku,v);assert.equal(state.variant,variant);assert.equal(state.wetSoil,at<4320);assert.equal(JSON.stringify(v),before);
  }
  r=advanceGardenRecord(r,4320);r.harvestedAt=4320;
  const v=gardenView({gardens:{'out-1':r}},'out-1',4320);
  assert.equal(gardenModelState(sku,v).variant,sku.includes('.herb.')?'harvested':'wet');
  assert.deepEqual(gardenModelState(sku,gardenView({gardens:{'out-1':newGardenRecord(4320)}},'out-1',4320)),{variant:'seed',wet:false,wetSoil:false});
 }
 assert.equal(gardenModelState('tree.round',{}),null);
});
