import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold} from '../src/household.js';
import {proposeConstructionEdit,constructionRoomSelection} from '../src/construction.js';
import {proposeFurnishedRoomMove,createHouseholdConstructionEditor}
  from '../src/furnished-room.js';
import {restoreFurnitureWorld,instanceRect,FURNITURE_CATALOG}
  from '../src/furniture-catalog.js';
import {cameraPlacementPose,dragShopPlacement} from '../src/furniture-placement-preview.js';

const source={x:16,z:-2},destination={x:20,z:6};
const room={type:'room',from:{x:15,z:-3},to:{x:19,z:1}};
const move=(rotation=0,at=destination)=>({type:'room-relocate',
  source,at,rotation});
const setup=()=>{
  const root=newHousehold();
  const r=proposeConstructionEdit(root.world.construction,room);
  assert.ok(r.ok,r.reason);root.world.construction=r.world;
  root.world.furniture=restoreFurnitureWorld({
    ...root.world.furniture,revision:1,
    instances:[...root.world.furniture.instances,
      {instanceId:'shop-plant-a',prefabId:'plant',
        x:16,z:-2,yaw:0,location:'home',itemDefinitionId:'plant.amber',purchasePriceCredits:100},
      {instanceId:'shop-rug-b',prefabId:'rug',
        x:17,z:-1,yaw:90,location:'home',itemDefinitionId:'rug.geo',purchasePriceCredits:45}]
  });
  assert.equal(root.world.furniture.instances.length,12);
  return root;
};
const item=(state,id)=>state.world.furniture.instances.find(x=>x.instanceId===id);
const get=(furniture,id)=>furniture.instances.find(x=>x.instanceId===id);
test('F5-D.2 moves a furnished detached room at 90° without cloning IDs or modifying paid items',()=>{
  const state=setup(),before=JSON.stringify(state);
  const result=proposeFurnishedRoomMove(state.world,move(90),{
    residents:[state.position,state.otherSim.position]});
  assert.equal(result.ok,true,result.reason);
  assert.deepEqual(new Set(result.movedIds),new Set(['shop-plant-a','shop-rug-b']));
  assert.equal(result.furniture.instances.length,state.world.furniture.instances.length);
  assert.equal(result.furniture.instances[0].instanceId,'home-bed-1');
  assert.equal(get(result.furniture,'shop-plant-a').instanceId,'shop-plant-a');
  assert.equal(get(result.furniture,'shop-plant-a').yaw,90);
  assert.equal(get(result.furniture,'shop-rug-b').yaw,180);
  assert.equal(get(result.furniture,'shop-plant-a').purchasePriceCredits,100);
  assert.equal(state.shop.credits,5000);
  assert.equal(constructionRoomSelection(result.world,source).ok,false);
  assert.equal(constructionRoomSelection(result.world,destination).ok,true);
  assert.equal(JSON.stringify(state),before,'preview is read-only');
});
test('F5-D.2 all four rotations preserve exact furniture geometry and directions',()=>{
  for(const rotation of [0,90,180,270]){
    const state=setup(),result=proposeFurnishedRoomMove(state.world,move(rotation));
    assert.equal(result.ok,true,JSON.stringify({rotation,reason:result.reason}));
    const room=constructionRoomSelection(result.world,destination).room;
    for(const id of result.movedIds){
      const it=get(result.furniture,id),def=FURNITURE_CATALOG[it.prefabId];
      const box=instanceRect(it,def.footprint);
      assert.ok(box.minX>=room.i0*.5-.005&&box.maxX<=room.i1*.5+.005);
      assert.ok(box.minZ>=room.j0*.5-.005&&box.maxZ<=room.j1*.5+.005);
    }
  }
});
test('F5-D.2 unified undo and redo includes furniture and walls in one transaction',()=>{
  const state=setup(),initial=structuredClone(state.world);
  const editor=createHouseholdConstructionEditor(state.world.construction,state.world.furniture);
  let result=editor.commit(move(90),{
    residents:[state.position,state.otherSim.position]});
  assert.equal(result.ok,true,result.reason);
  assert.notDeepEqual(result.furniture,initial.furniture);
  assert.notDeepEqual(result.world,initial.construction);
  result=editor.undo();assert.equal(result.ok,true);
  assert.deepEqual(result.world,initial.construction);
  assert.deepEqual(result.furniture,initial.furniture);
  result=editor.redo();assert.equal(result.ok,true);
  assert.notDeepEqual(result.furniture,initial.furniture);
  assert.equal(get(result.furniture,'shop-rug-b').yaw,180);
});
test('F5-D.2 build room copy does not duplicate paid furniture',()=>{
  const state=setup();
  const result=proposeConstructionEdit(state.world.construction,{
    type:'room-duplicate',source,at:destination,rotation:90
  },{furniture:state.world.furniture.instances});
  assert.equal(result.reason,'room-has-furniture');
});
test('F5-D.2 rejects reserved furniture and leaves both worlds unchanged',()=>{
  const state=setup(),before=JSON.stringify(state.world);
  const result=proposeFurnishedRoomMove(state.world,move(),{
    lockedInstanceIds:['shop-rug-b']});
  assert.equal(result.reason,'room-item-busy');
  assert.equal(JSON.stringify(state.world),before);
});
test('F5-D.2 refuses residents in the room and unconnected floor overlap',()=>{
  const state=setup();
  assert.equal(proposeFurnishedRoomMove(state.world,move(),{
    residents:[{x:16,z:-2}]}).reason,'room-has-resident');
  assert.equal(proposeFurnishedRoomMove(state.world,move(0,source)).reason,'room-target-overlap');
});
test('F5-D.2 blocks hanging or studio paintings in the source, without relocating art IDs',()=>{
  const state=setup();
  const result=proposeFurnishedRoomMove(state.world,move(),{
    wallDecor:[{x:15.4,z:-3,radius:.45}]});
  assert.equal(result.reason,'room-has-art');
});
test('F5-D.2 protects original starter furnished room',()=>{
  const state=setup();
  assert.equal(proposeFurnishedRoomMove(state.world,{
    type:'room-relocate',source:{x:1,z:1},at:destination}).reason,
    'room-protected');
});
test('F5-D.2 permits purchased furniture on built floor beyond old limits, restoring v1',()=>{
  const state=setup(),r=proposeFurnishedRoomMove(state.world,move(90));
  assert.equal(r.ok,true,r.reason);
  const loaded=loadHousehold({...state,world:{...state.world,
    construction:r.world,furniture:r.furniture}});
  assert.deepEqual(loaded.world.construction.floorCells,r.world.floorCells);
  assert.equal(loaded.world.furniture.instances.length,12);
  assert.equal(get(loaded.world.furniture,'shop-plant-a').yaw,90);
});
test('F5-D.2 shop preview uses the full lot but preserves normal initial camera center',()=>{
  assert.deepEqual(cameraPlacementPose({centerX:18,centerZ:7},null,'lot'),{x:18,z:7,yaw:0});
  assert.deepEqual(cameraPlacementPose({centerX:0,centerZ:0}),{x:0,z:0,yaw:0});
  const drag=dragShopPlacement({yaw:0,pitch:60,distance:18,centerX:10,centerZ:0},
    {x:20,z:7,yaw:90},300,300,800,'lot');
  assert.ok(drag&&drag.x<=22.75&&drag.z<=11.75);
});
test('F5-D.2 browser wiring and Pages deployment includes atomic mover',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const ci=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(game,/createHouseholdConstructionEditor\(game\.world\.construction,game\.world\.furniture\)/);
  assert.match(game,/proposeFurnishedRoomMove\(game\.world,cmd,buildContext\(\)\)/);
  assert.match(game,/if\(result\.furniture\)/);
  assert.match(ci,/cp src\/furnished-room\.js site\/src\//);
});
