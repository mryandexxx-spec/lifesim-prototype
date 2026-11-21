/** LOT-E0: integration gap between B4 indoor/outdoor, C3 garden and D3 pool.
 * Save/loader and queued intents only; no new mechanics or reward contract.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold} from '../src/household.js';
import {outdoorCellAt,outdoorGroundKind} from '../src/lot-surface.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit,
  previewOutdoorPaint,commitOutdoorPreview} from '../src/outdoor-proposals.js';
import {enqueueAction} from '../src/action-queue.js';
import {SAVE_KEY} from '../src/simulation.js';

const json=x=>JSON.parse(JSON.stringify(x));
const base=outdoorCellAt(18.25,8.25);
const cells=Array.from({length:16},(_,i)=>base+Math.floor(i/4)*64+i%4).sort((a,b)=>a-b);

function place(root,itemId,x,z){
  const draft=previewOutdoorFeatureEdit(root,{
    operation:'place',itemId,pose:{x,z,yaw:0}
  });
  assert.equal(draft.ok,true,'place '+itemId+': '+draft.reason);
  const next=commitOutdoorFeatureEdit(root,draft);
  assert.equal(next.ok,true,'commit '+itemId+': '+next.reason);
  return next.root;
}

function mixedHousehold(){
  let root=newHousehold('2026-11-21');
  root.shop.credits=30000;
  root.autonomy.enabled=false;
  root.otherSim.autonomy.enabled=false;
  root.world.outdoors={...root.world.outdoors,revision:1,
    pools:[{poolId:'pool-1',cells}],
    poolFixtures:[{fixtureId:'fixture-1',poolId:'pool-1',kind:'ladder',
      edgeCell:base,side:'west',purchasePriceCredits:120}],
    nextPoolId:2,nextFixtureId:2,poolTxnSeq:1};
  root=place(root,'garden.herb.mint',19,11);
  root=place(root,'garden.bench',18,-8);
  const paint=previewOutdoorPaint(root,{
    from:{x:21,z:5},to:{x:21,z:5},kind:'stone'});
  assert.equal(paint.ok,true,paint.reason);
  const applied=commitOutdoorPreview(root,paint);
  assert.equal(applied.ok,true,applied.reason);
  root=applied.root;

  const plot=root.world.outdoors.features.find(f=>f.itemId==='garden.herb.mint');
  assert.ok(plot&&root.world.outdoors.gardens[plot.instanceId]);
  assert.ok(enqueueAction(root.actionQueues,'alex',{
    type:'pool',poolId:'pool-1',actionId:'swim',fixtureId:'fixture-1'}));
  assert.ok(enqueueAction(root.actionQueues,'alex',{
    type:'move',x:16,z:6}));
  assert.ok(enqueueAction(root.actionQueues,'mira',{
    type:'garden',instanceId:plot.instanceId,actionId:'water'}));
  assert.ok(enqueueAction(root.actionQueues,'mira',{
    type:'move',x:16,z:-6}));
  return root;
}

function assertMixed(root){
  assert.equal(root.version,1);
  assert.equal(root.world.outdoors.pools.length,1);
  assert.deepEqual(root.world.outdoors.pools[0].cells,cells);
  assert.equal(root.world.outdoors.poolFixtures.length,1);
  assert.equal(root.world.outdoors.features.length,2);
  assert.equal(root.world.outdoors.features.filter(x=>x.itemId==='garden.herb.mint').length,1);
  assert.equal(root.world.outdoors.features.filter(x=>x.itemId==='garden.bench').length,1);
  assert.equal(outdoorGroundKind(root.world.outdoors,21,5),'stone');
  assert.deepEqual(root.actionQueues.byResident.alex.map(x=>x.type),['pool','move']);
  assert.deepEqual(root.actionQueues.byResident.mira.map(x=>x.type),['garden','move']);
  assert.equal(root.otherSim.minutes,root.minutes);
}

test('E0: real mixed B/C/D ownership persists with two independent FIFO queues and one ledger',()=>{
  const root=mixedHousehold();
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assertMixed(root);
  const reloaded=loadHousehold(json(root));
  assertMixed(reloaded);
  assert.deepEqual(reloaded.actionQueues,root.actionQueues);
  assert.deepEqual(reloaded.world.furniture,root.world.furniture);
  assert.deepEqual(reloaded.world.construction,root.world.construction);
  assert.deepEqual(reloaded.shop,root.shop);
  assert.deepEqual(reloaded.financialHistory,root.financialHistory);
  assert.deepEqual(reloaded.careerSystem,root.careerSystem);
  assert.deepEqual(reloaded.world.outdoors.gardens,root.world.outdoors.gardens);
  assert.equal(reloaded.shop.credits,root.shop.credits);
});

test('E0: malformed optional yard records do not delete the pool, garden, home, household or tasks',()=>{
  const root=mixedHousehold();
  const bad=json(root);
  bad.world.outdoors.ground.push({cell:999999,kind:'stone'});
  bad.world.outdoors.features.push({
    instanceId:'out-999',itemId:'tree.round',x:999,z:999,yaw:0,
    purchasePriceCredits:140
  });
  const clean=loadHousehold(bad);
  assertMixed(clean);
  for(const field of ['shop','financialHistory','actionQueues','careerSystem','kitchen']){
    assert.deepEqual(clean[field],root[field],field);
  }
  assert.deepEqual(clean.otherSim.position,root.otherSim.position);
  assert.deepEqual(clean.world.furniture,root.world.furniture);
  assert.deepEqual(clean.world.construction,root.world.construction);
  assert.equal(clean.world.outdoors.features.some(x=>x.instanceId==='out-999'),false);
});

test('E0: other editor cannot build over live pool; safe new paint survives reload without duplicate money',()=>{
  const root=loadHousehold(json(mixedHousehold()));
  const before=json(root);
  const blocked=previewOutdoorFeatureEdit(root,{operation:'place',itemId:'fence.wood',
    pose:{x:17.5,z:8.25,yaw:0}});
  assert.equal(blocked.ok,false);
  assert.equal(commitOutdoorFeatureEdit(root,blocked).ok,false);
  assert.deepEqual(root,before,'rejected edit must be completely side effect free');

  const draft=previewOutdoorPaint(root,{from:{x:21,z:6},to:{x:21,z:6},kind:'gravel'});
  assert.equal(draft.ok,true,draft.reason);
  const applied=commitOutdoorPreview(root,draft);
  assert.equal(applied.ok,true,applied.reason);
  const next=loadHousehold(json(applied.root));
  assert.equal(outdoorGroundKind(next.world.outdoors,21,6),'gravel');
  assert.equal(next.world.outdoors.pools.length,1);
  assert.equal(next.world.outdoors.features.length,2);
  assert.deepEqual(next.actionQueues,root.actionQueues);
  assert.equal(next.shop.credits,applied.root.shop.credits);
  assert.equal(next.financialHistory.entries.length,root.financialHistory.entries.length+1);
  assert.equal(commitOutdoorPreview(applied.root,draft).ok,false,'stale financial replay rejected');
});
