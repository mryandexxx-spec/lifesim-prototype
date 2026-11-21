/** LOT-D3a: reversible editor transactions cannot overbuild a live pool. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold} from '../src/household.js';
import {outdoorCellAt} from '../src/lot-surface.js';
import {protectPoolFromWorldEdit} from '../src/pool-cross-editor.js';
import {proposeConstructionEdit} from '../src/construction.js';
import {createHouseholdConstructionEditor} from '../src/furnished-room.js';
import {previewOutdoorFeatureEdit,previewOutdoorPaint,
  commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {poolFixtureSite} from '../src/pool-equipment.js';
import {createFurnitureEditor} from '../src/furniture-editor.js';

const cell=(x,z)=>outdoorCellAt(x+.25,z+.25);
const base=cell(18,8);
const rectangle=()=>Array.from({length:16},(_,i)=>
  base+Math.floor(i/4)*64+i%4).sort((a,b)=>a-b);
const fixture=(kind,edgeCell,side,id)=>({
  fixtureId:id,poolId:'pool-1',kind,edgeCell,side,
  purchasePriceCredits:{ladder:120,steps:180,board:400}[kind]
});
const clone=x=>JSON.parse(JSON.stringify(x));
function swimmingHome(){
  const root=newHousehold();
  root.shop.credits=20000;
  root.world.outdoors={...root.world.outdoors,revision:1,
    pools:[{poolId:'pool-1',cells:rectangle()}],
    nextPoolId:2,poolTxnSeq:1,nextFixtureId:3,
    poolFixtures:[
      fixture('ladder',base,'west','fixture-1'),
      fixture('board',base+64,'west','fixture-2')
    ]};
  return root;
}
const worldEdit=(root,cmd)=>proposeConstructionEdit(root.world.construction,cmd,{
  residents:[root.position,root.otherSim.position],
  furniture:root.world.furniture.instances
});

test('D3a: pre-pool v1 household shape and unrelated construction remain compatible',()=>{
  const legacy=newHousehold(),before=clone(legacy);
  const candidate=worldEdit(legacy,{type:'room',
    from:{x:20,z:7},to:{x:23,z:10}});
  assert.equal(candidate.ok,true,candidate.reason);
  assert.deepEqual(protectPoolFromWorldEdit(legacy,{construction:candidate.world}),{ok:true});
  const loaded=loadHousehold(clone(legacy));
  assert.deepEqual(loaded.world.outdoors,before.world.outdoors);
  assert.deepEqual(loaded.shop,before.shop);
  assert.deepEqual(loaded.actionQueues,before.actionQueues);
  assert.equal(legacy.version,1);
});

test('D3a: new floor and room over real wet cells are denied without mutation',()=>{
  const root=swimmingHome(),before=clone(root);
  for(const type of ['floor','room']){
    const proposed=worldEdit(root,{type,
      from:{x:18,z:8},to:{x:20,z:10}});
    assert.equal(proposed.ok,true,proposed.reason);
    assert.equal(protectPoolFromWorldEdit(root,{construction:proposed.world}).reason,
      'pool-water-overlap');
  }
  assert.deepEqual(root,before,'preview must not change wallet, save or swim');
});

test('D3a: outward house extension not touching the pool remains allowed',()=>{
  const root=swimmingHome();
  const proposed=worldEdit(root,{type:'room',
    from:{x:21,z:7},to:{x:23,z:10}});
  assert.equal(proposed.ok,true,proposed.reason);
  assert.equal(protectPoolFromWorldEdit(root,{construction:proposed.world}).ok,true);
});

test('D3a: a fence cannot cover the ladder approach, board landing or be purchased',()=>{
  const root=swimmingHome();
  const site=poolFixtureSite(root.world.outdoors.pools[0],base,'west','ladder');
  assert.ok(site);
  const preview=previewOutdoorFeatureEdit(root,{
    operation:'place',itemId:'fence.wood',pose:{x:17.5,z:8.25,yaw:0}});
  assert.equal(preview.ok,false);
  assert.equal(preview.reason,'would-block-route');
  assert.equal(root.world.outdoors.features.length,0);
  assert.equal(root.shop.credits,20000);
  assert.equal(commitOutdoorFeatureEdit(root,preview).ok,false);
  const next={...root.world.outdoors,revision:2,features:[{
    instanceId:'out-1',itemId:'fence.wood',x:17.5,z:8.25,
    yaw:0,purchasePriceCredits:55}]};
  assert.equal(protectPoolFromWorldEdit(root,{outdoors:next}).reason,
    'pool-landing-blocked');
});

test('D3a: harmless flower/fence far from pool is still supported',()=>{
  const root=swimmingHome();
  const preview=previewOutdoorFeatureEdit(root,{
    operation:'place',itemId:'flower.daisy',pose:{x:22.5,z:8.25,yaw:0}});
  assert.equal(preview.ok,true,preview.reason);
  const applied=commitOutdoorFeatureEdit(root,preview);
  assert.equal(applied.ok,true,applied.reason);
  assert.equal(applied.root.world.outdoors.features.length,1);
  assert.equal(applied.root.world.outdoors.pools[0].cells.length,16);
});

test('D3a: landscape paint skips water and keeps pool original geometry',()=>{
  const root=swimmingHome(),before=clone(root);
  const skipped=previewOutdoorPaint(root,{from:{x:18.25,z:8.25},
    to:{x:18.25,z:8.25},kind:'gravel'});
  assert.equal(skipped.ok,false);
  assert.equal(skipped.reason,'unchanged');
  assert.deepEqual(root,before);
});

test('D3a: construction history cannot redo a house onto a newly built pool',()=>{
  const root=newHousehold(),editor=createHouseholdConstructionEditor(
    root.world.construction,root.world.furniture,
    (construction,furniture)=>protectPoolFromWorldEdit(root,{construction,furniture}));
  const first=editor.commit({type:'room',from:{x:18,z:8},to:{x:20,z:10}},{
    residents:[root.position,root.otherSim.position]});
  assert.equal(first.ok,true,first.reason);
  root.world.construction=first.world;
  const undo=editor.undo();
  assert.equal(undo.ok,true,undo.reason);
  root.world.construction=undo.world;
  const pool=swimmingHome();
  root.world.outdoors=pool.world.outdoors;
  const before=clone(root);
  const redo=editor.redo();
  assert.equal(redo.ok,false);
  assert.equal(redo.reason,'pool-water-overlap');
  assert.equal(redo.canRedo,true,'history pointer must not move on rejection');
  assert.deepEqual(root,before);
  assert.deepEqual(editor.state().world,root.world.construction);
});

test('D3a: furniture history validator vetoes unsafe traversal without side effects',()=>{
  const root=swimmingHome(),house=createFurnitureEditor(root.world.furniture,
    root.shop,world=>protectPoolFromWorldEdit(root,{furniture:world}));
  assert.equal(house.state().canUndo,false);
  const oldState=clone(house.state());
  // A corrupted or uncommitted shop draft outside the room must not bypass
  // the public validator on any editor transaction.
  const item=root.world.furniture.instances.find(x=>x.prefabId==='sofa');
  assert.ok(item);
  const bad=clone(root.world.furniture);
  bad.instances=bad.instances.map(i=>i.instanceId===item.instanceId
    ?{...i,x:17.5,z:8.25}:i);
  const rejected=house.transactMarket({ok:true,world:bad,shop:root.shop,
    instanceId:item.instanceId,amount:0});
  assert.equal(rejected.ok,false);
  assert.equal(rejected.reason,'pool-landing-blocked');
  assert.deepEqual(house.state(),oldState);
});

test('D3a: the pool is not an alternate editable mode for outdoor transactions',()=>{
  const root=swimmingHome();
  const next=clone(root.world.outdoors);
  next.pools[0].cells.pop();
  assert.equal(protectPoolFromWorldEdit(root,{outdoors:next}).reason,'pool-editor-required');
});
