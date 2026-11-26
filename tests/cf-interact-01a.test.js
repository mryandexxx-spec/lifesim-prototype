import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SOURCE,SOURCE_SHA,benchDescriptor,deriveHeight,measureBench,runProbe} from '../tools/cf-interact-geometry.mjs';
import {validateSeatInteractionAsset,resolveSeatInteraction} from '../src/interaction-anchors.js';

test('actual SHA-pinned native geometry and two derived fixtures, rotation and slots',()=>{
 const dir=mkdtempSync(join(tmpdir(),'cf-interact-'));
 try{const r=runProbe(dir);assert.equal(r.cases.length,36);assert.equal(r.cases.filter(c=>c.result.ok).length,24);assert.equal(r.fixtures.length,3);}
 finally{rmSync(dir,{recursive:true,force:true});}
});
const bytes=deriveHeight(readFileSync(SOURCE),.45),measurement=measureBench(bytes,.45),asset=benchDescriptor(measurement.assetSha,.45);
const base={asset,measurement,instance:{id:'b',origin:{x:2,y:0,z:3},yaw:31},
 rig:{id:'diagnostic',revision:'1',maxFlatKneeHeight:.52,supportWidth:.32,supportDepth:.24},
 action:{kind:'sit.normal',revision:'1',sourceClip:'sit',approachGap:.5,minSupportFraction:.5},
 environment:{occupiedSlots:[],corridorClear:()=>true}};
test('stale and false asset geometry never produce a plan',()=>{
 assert.equal(validateSeatInteractionAsset(asset,{...measurement,assetSha:SOURCE_SHA}).reason,'STALE_GEOMETRY');
 for(const a of [{...asset,seatY:.46},{...asset,frontYaw:0},{...asset,floorY:-.05},
   {...asset,regions:asset.regions.map((r,i)=>i===0?{...r,minZ:-.31}:r)}]){
   assert.equal(validateSeatInteractionAsset(a,measurement).ok,false);
 }
});
test('reject invalid schema, anchor in gap and overlapping slots',()=>{
 for(const a of [{...asset,version:2},{...asset,units:'cm'},{...asset,slots:[{...asset.slots[0],anchorZ:-.12}]},
  {...asset,slots:[asset.slots[0],{...asset.slots[0],id:'duplicate-region'}]}]){
  assert.equal(validateSeatInteractionAsset(a,measurement).reason,'INVALID_ASSET');
 }
});
test('typed failures before any bake or reservation mutation',()=>{
 const r=resolveSeatInteraction(base);assert.ok(r.ok);assert.ok(Object.isFrozen(r));assert.ok(Object.isFrozen(r.contact));
 for(const [over,reason] of [[{instance:{...base.instance,scale:1.1}},'INVALID_INSTANCE'],
  [{rig:{...base.rig,maxFlatKneeHeight:.4}},'SEAT_TOO_HIGH'],
  [{rig:{...base.rig,supportWidth:.9}},'INSUFFICIENT_SUPPORT'],
  [{action:{...base.action,kind:'sit.high'}},'UNSUPPORTED_ACTION'],
  [{environment:null},'ENVIRONMENT_UNKNOWN'],
  [{environment:{...base.environment,corridorClear:()=>{throw Error('unknown')}}},'APPROACH_BLOCKED']]){
  assert.equal(resolveSeatInteraction({...base,...over}).reason,reason);
 }
 assert.deepEqual(base.environment.occupiedSlots,[]);
 assert.equal(r.pending.includes('FBIK_BAKE'),true);
});
test('clip and rig revisions and slot participate in deterministic cache identity, yaw does not',()=>{
 const a=resolveSeatInteraction(base);
 assert.equal(resolveSeatInteraction({...base,instance:{...base.instance,yaw:121}}).cacheKey,a.cacheKey);
 for(const over of [{rig:{...base.rig,revision:'2'}},{action:{...base.action,sourceClip:'another'}},{environment:{...base.environment,occupiedSlots:[a.slotId]}}])
  assert.notEqual(resolveSeatInteraction({...base,...over}).cacheKey,a.cacheKey);
});
