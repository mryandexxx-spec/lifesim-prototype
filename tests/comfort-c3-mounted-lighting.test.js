import test from 'node:test';
import assert from 'node:assert/strict';
import {newConstructionWorld,starterShellSegments,constructionRooms} from '../src/construction.js';
import {newFurnitureWorld,restoreFurnitureWorld} from '../src/furniture-catalog.js';
import {newFurnitureShop,buyMarketItem,storeMarketItem,restoreMarketItem,sellMarketItem} from '../src/furniture-shop.js';
import {proposeFurnitureMove} from '../src/furniture-layout.js';
import {createFurnitureEditor} from '../src/furniture-editor.js';
import {createCalendar} from '../src/calendar-core.js';
import {MOUNTED_LIGHTS,lightingMountPose,lightingRoomAt,mountedLightIsOn,
  setMountedLightMode,mountedFixturesSurviveEdit,prioritizeVisibleLights} from '../src/mounted-lighting.js';

const c=()=>newConstructionWorld();
const calendar=createCalendar('2026-11-18');
test('C3 four independently priced, original SKU identities and mounting modes',()=>{
  assert.deepEqual(Object.keys(MOUNTED_LIGHTS),['sconce.halo','sconce.leaf','ceiling.globe','ceiling.ring']);
  assert.equal(new Set(Object.values(MOUNTED_LIGHTS).map(x=>x.modelKey)).size,4);
  assert.deepEqual(Object.values(MOUNTED_LIGHTS).map(x=>x.mount),['wall','wall','ceiling','ceiling']);
});
test('C3 ceiling and wall anchors are derived from real construction, never renderer cutaway',()=>{
  const world=c(),room=constructionRooms(world)[0];
  assert.ok(room);
  const ceiling=lightingMountPose(world,'ceiling.globe',{x:0,z:0});
  assert.ok(ceiling&&ceiling.y>1.5&&ceiling.roomId);
  assert.equal(lightingMountPose(world,'ceiling.globe',{x:100,z:100}),null);
  const north=starterShellSegments(world).find(w=>w.starterSide==='north'&&w.i===0);
  assert.ok(north);
  const wall=lightingMountPose(world,'sconce.halo',{edgeId:north.id,side:1,t:.5});
  assert.ok(wall&&wall.y>1.5&&wall.roomId);
  assert.equal(lightingMountPose(world,'sconce.halo',{edgeId:'missing',side:1}),null);
  assert.equal(lightingMountPose(world,'sconce.halo',{edgeId:north.id,side:0}),null);
});
test('C3 auto obeys true game night, same room, proximity, absence and manual overrides',()=>{
  const construction=c(),fixture={instanceId:'shop-ceilinglight-1',itemDefinitionId:'ceiling.globe',
    prefabId:'ceilinglight',x:0,z:0,location:'home',mount:{x:0,z:0},lightMode:'auto'};
  const state=(minutes,residents,extra={})=>mountedLightIsOn({
    fixture:{...fixture,...extra},construction,calendar,minutes,residents});
  assert.equal(state(0,[{x:0,z:0}]),true);
  assert.equal(state(720,[{x:0,z:0}]),false);
  assert.equal(state(0,[{x:12,z:0}]),false);
  assert.equal(state(0,[{x:0,z:0,away:true}]),false);
  assert.equal(state(0,[{x:0,z:0,home:false}]),false);
  assert.equal(state(0,[]),false);
  assert.equal(state(720,[],{lightMode:'on'}),true);
  assert.equal(state(0,[{x:0,z:0}],{lightMode:'off'}),false);
  assert.equal(state(0,[{x:0,z:0}],{location:'storage'}),false);
});
test('C3 mode edit is immutable and rejects malformed saved control commands',()=>{
  const world={schema:1,revision:1,instances:[{instanceId:'light-1',itemDefinitionId:'sconce.leaf'}]};
  const result=setMountedLightMode(world,'light-1','off');
  assert.equal(result.ok,true);assert.equal(result.world.instances[0].lightMode,'off');
  assert.equal(world.instances[0].lightMode,undefined);
  assert.equal(setMountedLightMode(world,'light-1','random').ok,false);
  assert.equal(setMountedLightMode(world,'light-2','on').ok,false);
});
test('C3 refuses construction changes that would orphan a paid wall fixture',()=>{
  const before=c(),edge=starterShellSegments(before).find(w=>w.starterSide==='north'&&w.i===0);
  const pose=lightingMountPose(before,'sconce.halo',{edgeId:edge.id,side:1});
  assert.ok(pose);
  const furniture={instances:[{instanceId:'light-1',itemDefinitionId:'sconce.halo',
    location:'home',mount:{edgeId:edge.id,side:1},x:pose.x,z:pose.z}]};
  assert.equal(mountedFixturesSurviveEdit(before,before,furniture).ok,true);
  const after={...before,starterRemoved:[edge.id]};
  assert.equal(mountedFixturesSurviveEdit(before,after,furniture).reason,
    'mounted-light-blocks-construction');
});

test('C3 purchased ceiling SKU is truly mounted, charged once, saved, stored and resold',()=>{
  const construction=c(),initial=newFurnitureWorld(),shop=newFurnitureShop();
  const bought=buyMarketItem(initial,shop,'ceiling.globe',{x:0,z:0,yaw:0},{construction});
  assert.equal(bought.ok,true);assert.equal(bought.shop.credits,shop.credits-340);
  const fixture=bought.world.instances.find(x=>x.instanceId===bought.instanceId);
  assert.equal(fixture.itemDefinitionId,'ceiling.globe');
  assert.equal(fixture.lightMode,'auto');
  assert.deepEqual(fixture.mount,{x:0,z:0});
  assert.ok(restoreFurnitureWorld(bought.world).instances.some(x=>x.instanceId===fixture.instanceId));
  const storage=storeMarketItem(bought.world,bought.shop,fixture.instanceId);
  assert.equal(storage.ok,true);
  const restored=restoreMarketItem(storage.world,storage.shop,fixture.instanceId,
    {x:1,z:0,yaw:0},{construction});
  assert.equal(restored.ok,true);
  const installed=restored.world.instances.find(x=>x.instanceId===fixture.instanceId);
  assert.equal(installed.mount.x,1);assert.equal(installed.lightMode,'auto');
  const sold=sellMarketItem(restored.world,restored.shop,fixture.instanceId);
  assert.equal(sold.ok,true);assert.equal(sold.amount,238);
  assert.equal(sold.world.instances.some(x=>x.instanceId===fixture.instanceId),false);
});
test('C3 wall light purchase carries real side, cell and paid identity across restore',()=>{
  const construction=c();
  const transaction=buyMarketItem(newFurnitureWorld(),newFurnitureShop(),
    'sconce.leaf',{x:.25,z:-3.65,yaw:0},{construction});
  assert.equal(transaction.ok,true);
  const fixture=transaction.world.instances.find(x=>x.instanceId===transaction.instanceId);
  assert.equal(fixture.mount.side,1);
  assert.match(fixture.mount.edgeId,/^starter:north:/);
  const restored=restoreFurnitureWorld(transaction.world).instances.find(
    x=>x.instanceId===fixture.instanceId);
  assert.deepEqual(restored.mount,fixture.mount);
  assert.equal(restored.purchasePriceCredits,215);
});
test('C3 floor navigation remains unchanged by mounted fixtures; no free purchase on bad mount',()=>{
  const construction=c(),world=newFurnitureWorld(),shop=newFurnitureShop();
  const bad=buyMarketItem(world,shop,'sconce.halo',
    {x:0,z:0,yaw:0},{construction});
  assert.equal(bad.ok,false);assert.equal(bad.reason,'missing-light-mount');
  assert.equal(shop.credits,5000);assert.equal(world.instances.length,newFurnitureWorld().instances.length);
  const bought=buyMarketItem(world,shop,'ceiling.ring',
    {x:0,z:0,yaw:0},{construction});
  assert.equal(bought.ok,true);
  const mine=bought.world.instances.find(x=>x.instanceId===bought.instanceId);
  const moved=proposeFurnitureMove(bought.world,bought.instanceId,
    {x:1,z:0,yaw:0},{construction});
  assert.equal(moved.ok,true);
  assert.equal(moved.world.instances.find(x=>x.instanceId===mine.instanceId).mount.x,1);
  const edit=createFurnitureEditor(bought.world,bought.shop);
  const update=edit.commit(bought.instanceId,{x:2,z:0,yaw:0},{construction});
  assert.equal(update.ok,true);
  assert.equal(edit.undo().ok,true);assert.equal(edit.redo().ok,true);
});

test('C3 nearest five lamp sources share GPU budget without mutating saved switches',()=>{
  const lights=Array.from({length:8},(_,i)=>({instanceId:'light-'+i,
    x:i,z:0,on:true}));
  lights[0].on=false;
  const ids=prioritizeVisibleLights(lights,[{x:7,z:0}],5);
  assert.deepEqual(ids,['light-7','light-6','light-5','light-4','light-3']);
  assert.equal(lights[0].on,false);
  assert.deepEqual(prioritizeVisibleLights(lights,[{x:1,z:0,away:true}],2),
    ['light-1','light-2']);
  assert.deepEqual(prioritizeVisibleLights(lights,[{x:7,z:0}],0),[]);
});
