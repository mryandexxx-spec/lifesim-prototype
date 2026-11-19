/** LOT-B0: outdoor data + transaction foundation. No UI or paid object released yet. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold} from '../src/household.js';
import {newOutdoorsWorld,restoreOutdoorsWorld,outdoorCellAt,outdoorCellCenter,
  outdoorGroundKind,OUTDOOR_GROUND_LIMIT,outdoorFeatureFits} from '../src/lot-surface.js';
import {OUTDOOR_PRODUCTS,OUTDOOR_CATALOG,outdoorFeatureObstacles} from '../src/outdoor-catalog.js';
import {previewOutdoorPaint,previewOutdoorFeature,commitOutdoorPreview} from '../src/outdoor-proposals.js';
import {isWalkable,findPath} from '../src/navigation.js';

const clone=x=>JSON.parse(JSON.stringify(x));
test('LOT-B0: old root-v1 without outdoors still has one home and wallet',()=>{
  const old=newHousehold();delete old.world.outdoors;
  const next=loadHousehold(clone(old));
  assert.equal(next.version,1);
  assert.deepEqual(next.world.outdoors,newOutdoorsWorld());
  assert.deepEqual(next.shop,old.shop);
  assert.deepEqual(next.world.furniture,old.world.furniture);
  assert.deepEqual(next.world.construction,old.world.construction);
  assert.deepEqual(next.careerSystem,old.careerSystem);
});
test('LOT-B0: exact 3072 half-metre cells, default lawn and house ownership',()=>{
  assert.equal(outdoorCellAt(-9,-12),0);
  assert.equal(outdoorCellAt(22.99,11.99),3071);
  assert.equal(outdoorCellAt(23,0),null);
  assert.equal(outdoorCellAt(Infinity,8),null);
  assert.deepEqual(outdoorCellCenter(0),{x:-8.75,z:-11.75});
  assert.equal(outdoorCellCenter(-1),null);
  const h=newHousehold();
  assert.equal(outdoorGroundKind(h.world.outdoors,18,8),'lawn');
  assert.equal(outdoorGroundKind(h.world.outdoors,30,8),null);
  const painted=previewOutdoorPaint(h,{from:{x:18,z:8},to:{x:18.6,z:8.6},kind:'stone'});
  assert.ok(painted.ok,painted.reason);
  assert.equal(painted.changedCells,4);
  assert.equal(painted.cost,32);
  const commit=commitOutdoorPreview(h,painted);
  assert.ok(commit.ok,commit.reason);
  assert.equal(commit.root.shop.credits,h.shop.credits-32);
  assert.equal(commit.root.financialHistory.entries.at(-1).kind,'purchase');
  assert.equal(outdoorGroundKind(commit.root.world.outdoors,18,8),'stone');
  assert.equal(outdoorGroundKind(commit.root.world.outdoors,0,0),'lawn');
  assert.equal(outdoorGroundKind(loadHousehold(clone(commit.root)).world.outdoors,18,8),'stone');
  assert.equal(commit.root.world.construction.revision,h.world.construction.revision);
  assert.deepEqual(commitOutdoorPreview(commit.root,painted),{ok:false,reason:'stale-preview'});
  assert.deepEqual(previewOutdoorPaint(commit.root,{from:{x:18,z:8},to:{x:18.6,z:8.6},kind:'stone'}),
    {ok:false,reason:'unchanged'});
});
test('LOT-B0: repaint and returning to lawn charges only changes, no phantom refund',()=>{
  const h=newHousehold(),location={x:20,z:10};
  const soil=previewOutdoorPaint(h,{from:location,to:location,kind:'soil'});
  assert.equal(soil.cost,2);
  const first=commitOutdoorPreview(h,soil).root;
  const lawn=previewOutdoorPaint(first,{from:location,to:location,kind:'lawn'});
  assert.equal(lawn.cost,0);
  const last=commitOutdoorPreview(first,lawn).root;
  assert.equal(last.shop.credits,h.shop.credits-2);
  assert.equal(last.financialHistory.entries.length,1,'zero-credit lawn resets create no false ledger entry');
  assert.equal(last.world.outdoors.ground.length,0);
  assert.equal(previewOutdoorPaint(last,{from:{x:0,z:0},to:{x:0,z:0},kind:'stone'}).reason,'unchanged',
    'rooms are protected rather than painted');
  assert.equal(previewOutdoorPaint(last,{from:{x:100,z:0},to:{x:101,z:0},kind:'stone'}).reason,'outside-lot');
  assert.equal(previewOutdoorPaint(last,{from:location,to:location,kind:'not-real'}).reason,'unknown-ground');
});
test('LOT-B0: one original product registry and bounded distinct features',()=>{
  assert.equal(OUTDOOR_PRODUCTS.length,15);
  assert.equal(OUTDOOR_CATALOG['tree.round'].price,220);
  assert.equal(OUTDOOR_CATALOG['garden.bench'].price,240);
  assert.equal(OUTDOOR_CATALOG['light.path'].light,true);
  const h=newHousehold();h.autonomy.enabled=false;
  const planted=previewOutdoorFeature(h,'tree.round',{x:19,z:8,yaw:0});
  assert.ok(planted.ok,planted.reason);
  assert.equal(planted.cost,220);
  const done=commitOutdoorPreview(h,planted);
  assert.ok(done.ok,done.reason);
  assert.equal(done.root.world.outdoors.features[0].instanceId,'out-1');
  assert.equal(done.root.world.outdoors.nextId,2);
  assert.equal(outdoorFeatureObstacles(done.root.world).length,1);
  assert.equal(isWalkable(19,8,done.root.world),false);
  assert.ok(findPath({x:17,z:8},{x:21,z:8},done.root.world));
  assert.deepEqual(loadHousehold(clone(done.root)).world.outdoors,done.root.world.outdoors);
  assert.equal(previewOutdoorFeature(done.root,'tree.round',{x:19,z:8,yaw:0}).reason,'overlap-outdoor');
  assert.equal(previewOutdoorFeature(done.root,'tree.round',{x:0,z:0,yaw:0}).reason,'blocked-or-outside');
  assert.equal(previewOutdoorFeature(done.root,'tree.round',{x:23,z:8,yaw:0}).reason,'blocked-or-outside');
  assert.equal(previewOutdoorFeature(done.root,'magic.unknown',{x:18,z:8}).reason,'unknown-item');
  assert.equal(previewOutdoorFeature(done.root,'tree.round',{x:18.17,z:8}).reason,'blocked-or-outside');
  assert.deepEqual(commitOutdoorPreview(done.root,planted),{ok:false,reason:'stale-preview'});
});
test('LOT-B0: corrupt terrain and features are isolated from money and actors',()=>{
  const before=newHousehold();const raw=clone(before);
  raw.world.outdoors={schema:1,revision:2,nextId:1,
    ground:[{cell:0,kind:'stone'},{cell:0,kind:'gravel'},{cell:3300,kind:'stone'},
      {cell:400,kind:'invalid'},{cell:900,kind:'soil'}],
    features:[
      {instanceId:'out-4',itemId:'tree.broad',x:19,z:7,yaw:0,purchasePriceCredits:340},
      {instanceId:'out-4',itemId:'tree.broad',x:18,z:7,yaw:0,purchasePriceCredits:340},
      {instanceId:'out-5',itemId:'tree.broad',x:0,z:0,yaw:0,purchasePriceCredits:340},
      {instanceId:'out-6',itemId:'tree.broad',x:100,z:7,yaw:0,purchasePriceCredits:340},
      {instanceId:'out-7',itemId:'tree.broad',x:20,z:7,yaw:0,purchasePriceCredits:-1}
    ]};
  const restored=loadHousehold(raw);
  assert.equal(restored.world.outdoors.ground[0].kind,'gravel');
  assert.equal(restored.world.outdoors.features.length,1);
  assert.equal(restored.world.outdoors.nextId,5);
  assert.deepEqual(restored.position,before.position);
  assert.deepEqual(restored.otherSim.position,before.otherSim.position);
  assert.deepEqual(restored.shop,before.shop);
  assert.deepEqual(restored.financialHistory,before.financialHistory);
  assert.deepEqual(restored.world.furniture,before.world.furniture);
  assert.ok(outdoorFeatureFits(restored.world.outdoors.features[0],restored.world.construction));
  assert.equal(OUTDOOR_GROUND_LIMIT,1536);
  assert.deepEqual(restoreOutdoorsWorld({schema:999}),newOutdoorsWorld());
});
test('LOT-B0: wallet cannot be overspent and saves are schema-safe',()=>{
  const root=newHousehold();root.shop.credits=3;
  assert.equal(previewOutdoorPaint(root,{from:{x:19,z:8},to:{x:19,z:8},kind:'stone'}).reason,
    'insufficient-credits');
  assert.equal(previewOutdoorFeature(root,'light.path',{x:19,z:8}).reason,'insufficient-credits');
  assert.equal(root.world.outdoors.features.length,0);
  assert.equal(root.financialHistory.entries.length,0);
  const full=newHousehold();
  full.world.outdoors.ground=Array.from({length:OUTDOOR_GROUND_LIMIT},
    (_,cell)=>({cell,kind:'gravel'}));
  const clean=restoreOutdoorsWorld(full.world.outdoors,full.world.construction);
  assert.ok(clean.ground.length<=OUTDOOR_GROUND_LIMIT);
});
