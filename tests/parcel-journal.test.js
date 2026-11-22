import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold} from '../src/household.js';
import {createParcelJournal} from '../src/parcel-journal.js';

test('four editors share ordered history without copying household or financial ledger',()=>{
  const root=newHousehold(),h=createParcelJournal(),initial=root.shop.credits;
  const outdoor=h.snapshot(root);
  root.world.outdoors.revision++;
  root.world.outdoors.ground=[...root.world.outdoors.ground,{kind:'stone',i:1,j:1}];
  root.shop.credits-=32;
  assert.equal(h.record(outdoor,root,'yard'),true);
  const furniture=h.snapshot(root);
  root.world.furniture.revision++;
  root.world.furniture.instances.push({...root.world.furniture.instances[0],instanceId:'test-copy'});
  root.shop.credits-=70;
  assert.equal(h.record(furniture,root,'furniture'),true);
  assert.equal(h.canUndo,true);
  const last=h.preview(root,-1);assert.equal(last.ok,true,last.reason);
  assert.deepEqual(last.changed,['furniture']);assert.equal(last.credits,initial-32);
  assert.equal(Object.hasOwn(last.world,'outdoors'),false);
  root.world={...root.world,...last.world};root.shop.credits=last.credits;h.advance(-1);
  const first=h.preview(root,-1);assert.equal(first.ok,true,first.reason);
  assert.deepEqual(first.changed,['outdoors']);assert.equal(first.credits,initial);
  root.world={...root.world,...first.world};root.shop.credits=first.credits;h.advance(-1);
  assert.equal(h.canUndo,false);
  const redo=h.preview(root,1);assert.equal(redo.ok,true,redo.reason);
  assert.equal(redo.credits,initial-32);
});
test('external wallet or domain mutations block undo instead of overwriting life state',()=>{
  const root=newHousehold(),h=createParcelJournal(),before=h.snapshot(root);
  root.world.furniture.revision++;root.world.furniture.instances.push({
    ...root.world.furniture.instances[0],instanceId:'copy-1'});
  h.record(before,root,'furniture');
  const wallet=root.shop.credits;root.shop.credits+=5;
  assert.equal(h.preview(root,-1).reason,'balance-changed');
  root.shop.credits=wallet;root.world.furniture.instances.push({
    ...root.world.furniture.instances[0],instanceId:'copy-2'});
  assert.equal(h.preview(root,-1).reason,'world-changed');
  assert.equal(h.canUndo,true);
});
test('history preserves monotonic revisions and IDs and drops redo on new edit',()=>{
  const root=newHousehold(),h=createParcelJournal(),before=h.snapshot(root);
  root.world.outdoors.revision++;
  root.world.outdoors.nextFeatureId=(root.world.outdoors.nextFeatureId||1)+1;
  root.world.outdoors.features.push({instanceId:'feature-test',itemId:'garden.bench',x:8,z:-7,yaw:0});
  h.record(before,root,'yard');
  const oldRev=root.world.outdoors.revision,oldSeq=root.world.outdoors.nextFeatureId;
  const undo=h.preview(root,-1);assert.equal(undo.ok,true,undo.reason);
  assert.equal(undo.world.outdoors.revision,oldRev+1);
  assert.equal(undo.world.outdoors.nextFeatureId,oldSeq);
  root.world={...root.world,...undo.world};h.advance(-1);
  const next=h.snapshot(root);root.world.outdoors.revision++;
  root.world.outdoors.features.push({instanceId:'other-test',itemId:'garden.bench',x:9,z:-7,yaw:0});
  h.record(next,root,'yard');
  assert.equal(h.canRedo,false);
});
test('pool history is recognized but canonical pool model owns its transaction',()=>{
  const root=newHousehold(),h=createParcelJournal(),before=h.snapshot(root);
  root.world.outdoors.revision++;
  root.world.outdoors.pools=[{poolId:'pool-test',cells:['2:2']}];
  h.record(before,root,'pool');
  const back=h.preview(root,-1);assert.equal(back.ok,true,back.reason);
  assert.equal(back.poolChange,true);
});

test('legacy missing empty pool arrays are not a water edit and never enter pool-history',()=>{
  const root=newHousehold(),h=createParcelJournal();
  delete root.world.outdoors.pools;delete root.world.outdoors.poolFixtures;
  const before=h.snapshot(root);
  root.world.outdoors.revision++;
  root.world.outdoors.pools=[];root.world.outdoors.poolFixtures=[];
  root.world.outdoors.ground=[...root.world.outdoors.ground,{kind:'stone',i:2,j:2}];
  root.shop.credits-=32;
  assert.equal(h.record(before,root,'yard'),true);
  const undo=h.preview(root,-1);
  assert.equal(undo.ok,true,undo.reason);
  assert.equal(undo.poolChange,false);
  assert.deepEqual(undo.world.outdoors.pools,[]);
  assert.deepEqual(undo.world.outdoors.poolFixtures,[]);
  root.world={...root.world,...undo.world};
  root.shop.credits=undo.credits;h.advance(-1);
  const redo=h.preview(root,1);
  assert.equal(redo.ok,true,redo.reason);
  assert.equal(redo.poolChange,false);
});
