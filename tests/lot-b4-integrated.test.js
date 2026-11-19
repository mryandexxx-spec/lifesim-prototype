/** LOT-B4: combined construction, furnishing and outdoor regression at root-v1 boundaries. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold} from '../src/household.js';
import {proposeConstructionEdit,constructionContains} from '../src/construction.js';
import {createFurnitureEditor} from '../src/furniture-editor.js';
import {previewOutdoorPaint,commitOutdoorPreview,
  previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {outdoorGroundKind} from '../src/lot-surface.js';
import {outdoorBenchApproach} from '../src/outdoor-interactions.js';
import {findPath,isWalkable} from '../src/navigation.js';

const copy=x=>JSON.parse(JSON.stringify(x));
function paint(root,from,to,kind){
  const proposed=previewOutdoorPaint(root,{from,to,kind});
  assert.ok(proposed.ok,proposed.reason);
  const applied=commitOutdoorPreview(root,proposed);
  assert.ok(applied.ok,applied.reason);
  return applied.root;
}
function edit(root,operation,itemId,pose,instanceId){
  const proposed=previewOutdoorFeatureEdit(root,{operation,itemId,pose,instanceId});
  assert.ok(proposed.ok,proposed.reason);
  const applied=commitOutdoorFeatureEdit(root,proposed);
  assert.ok(applied.ok,applied.reason);
  return applied.root;
}
const position=(x,z,yaw=0)=>({x,z,yaw});

test('LOT-B4: one save combines room construction, moved indoor table, yard paint and trees',()=>{
  const original=newHousehold();
  const room=proposeConstructionEdit(original.world.construction,{
    type:'room',from:{x:14,z:-2},to:{x:18,z:2}});
  assert.ok(room.ok,room.reason);
  const table=original.world.furniture.instances.find(x=>x.prefabId==='table');
  const moved=createFurnitureEditor(original.world.furniture).commit(
    table.instanceId,{x:0,z:-1.35,yaw:0},
    {residents:[original.position,original.otherSim.position]});
  assert.ok(moved.ok,moved.reason);
  const changed=copy(original);
  changed.world.construction=room.world;
  changed.world.furniture=moved.world;
  let root=paint(changed,position(20,9),position(20,9),'stone');
  root=edit(root,'place','tree.round',position(20,8));
  assert.equal(root.shop.credits,original.shop.credits-228);
  assert.equal(root.financialHistory.entries.length,2);
  assert.equal(outdoorGroundKind(root.world.outdoors,20,9),'stone');
  assert.equal(constructionContains(root.world.construction,16,0),true);
  assert.equal(root.world.furniture.instances.find(x=>x.instanceId===table.instanceId).x,0);
  const saved=loadHousehold(copy(root));
  assert.equal(saved.version,1);
  assert.deepEqual(saved.world.construction,root.world.construction);
  assert.deepEqual(saved.world.furniture,root.world.furniture);
  assert.deepEqual(saved.world.outdoors,root.world.outdoors);
  assert.deepEqual(saved.shop,root.shop);
  assert.deepEqual(saved.financialHistory,root.financialHistory);
  assert.deepEqual(saved.position,root.position);
  assert.deepEqual(saved.otherSim.position,root.otherSim.position);
  assert.equal(isWalkable(20,8,saved.world),false);
  assert.equal(isWalkable(20,9,saved.world),true);
  assert.equal(original.world.outdoors.features.length,0,'source save must remain immutable');
});

test('LOT-B4: mixed garden decor and bench stay navigable from both residents',()=>{
  const start=newHousehold();
  let root=paint(start,position(18,9),position(18,9),'gravel');
  root=edit(root,'place','garden.bench',position(19,8));
  root=edit(root,'place','fence.wood',position(21,9));
  root=edit(root,'place','light.path',position(18,6));
  root=edit(root,'place','flower.daisy',position(20,10));
  assert.equal(root.world.outdoors.features.length,4);
  assert.equal(root.financialHistory.entries.length,5);
  assert.equal(root.shop.credits,start.shop.credits-(5+240+55+120+40));
  const id=root.world.outdoors.features.find(f=>f.itemId==='garden.bench').instanceId;
  const approach=outdoorBenchApproach(root.world,id);
  assert.ok(approach,'bench has an accessible physical approach');
  assert.ok(isWalkable(approach.x,approach.z,root.world));
  for(const resident of [root,root.otherSim]){
    assert.ok(findPath(resident.position,approach,root.world),'resident can reach bench');
    assert.ok(findPath(resident.position,{x:18,z:8},root.world),'resident can reach outdoor yard');
  }
  assert.equal(isWalkable(21,9,root.world),false,'fence must block A*');
  assert.equal(isWalkable(20,10,root.world),true,'walk-through flowers must not block');
  assert.deepEqual(loadHousehold(copy(root)).world.outdoors,root.world.outdoors);
});

test('LOT-B4: queued bench locks sale/move; stale drafts and reload do not mint credits',()=>{
  const start=newHousehold();
  const bought=edit(start,'place','garden.bench',position(19,8));
  const id=bought.world.outdoors.features[0].instanceId;
  const queued=copy(bought);
  queued.actionQueues.byResident.mira.push({type:'outdoor',instanceId:id,seq:1});
  assert.equal(previewOutdoorFeatureEdit(queued,{operation:'sell',instanceId:id}).reason,'reserved-bench');
  assert.equal(previewOutdoorFeatureEdit(queued,{operation:'move',instanceId:id,
    pose:position(21,8)}).reason,'reserved-bench');
  assert.deepEqual(queued.shop,bought.shop);
  queued.actionQueues.byResident.mira.length=0;
  const proposed=previewOutdoorFeatureEdit(queued,{operation:'sell',instanceId:id});
  assert.ok(proposed.ok,proposed.reason);
  assert.equal(proposed.cost,-168);
  const sold=commitOutdoorFeatureEdit(queued,proposed);
  assert.ok(sold.ok,sold.reason);
  assert.equal(sold.root.shop.credits,start.shop.credits-72);
  assert.equal(sold.root.financialHistory.entries.length,2);
  assert.equal(sold.root.financialHistory.entries.at(-1).kind,'sale');
  assert.equal(commitOutdoorFeatureEdit(sold.root,proposed).reason,'stale-preview');
  const recovered=loadHousehold(copy(sold.root));
  assert.equal(recovered.world.outdoors.features.length,0);
  assert.equal(recovered.world.outdoors.nextId,2,'sold IDs cannot be recycled');
  assert.equal(recovered.shop.credits,sold.root.shop.credits);
  assert.equal(recovered.financialHistory.entries.length,2);
});

test('LOT-B4: damaged outdoor payload cannot reset construction, actors, finance or furniture',()=>{
  let root=edit(newHousehold(),'place','garden.table',position(19,8));
  const before=copy(root);
  root.world.outdoors={schema:1,revision:99,nextId:1,
    ground:[{cell:99999,kind:'stone'},{cell:0,kind:'not-a-tile'}],
    features:[{instanceId:'out-1',itemId:'garden.table',x:0,z:0,yaw:0,purchasePriceCredits:220},
      {instanceId:'out-1',itemId:'garden.table',x:999,z:999,yaw:0,purchasePriceCredits:220}]};
  const recovered=loadHousehold(copy(root));
  assert.equal(recovered.version,1);
  assert.equal(recovered.world.outdoors.features.length,0);
  assert.equal(recovered.world.outdoors.ground.length,0);
  for(const field of ['construction','furniture'])
    assert.deepEqual(recovered.world[field],before.world[field]);
  for(const field of ['shop','financialHistory','actionQueues','position','needs',
    'careerSystem','otherSim'])assert.deepEqual(recovered[field],before[field],field);
});

test('LOT-B4: restoring old root-v1 without an outdoor record keeps both residents',()=>{
  const legacy=copy(newHousehold());
  delete legacy.world.outdoors;
  const restored=loadHousehold(copy(legacy));
  assert.equal(restored.version,1);
  assert.equal(restored.world.outdoors.schema,1);
  assert.deepEqual(restored.world.outdoors.features,[]);
  assert.deepEqual(restored.world.furniture,legacy.world.furniture);
  assert.deepEqual(restored.world.construction,legacy.world.construction);
  assert.deepEqual(restored.actionQueues,legacy.actionQueues);
  assert.deepEqual(restored.shop,legacy.shop);
  assert.deepEqual(restored.otherSim.position,legacy.otherSim.position);
});
