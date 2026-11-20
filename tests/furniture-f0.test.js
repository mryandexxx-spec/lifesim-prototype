import test from 'node:test';
import assert from 'node:assert/strict';
import {FURNITURE_CATALOG,LEGACY_FURNITURE_IDS,ORIGINAL_FURNITURE,
  newFurnitureWorld,restoreFurnitureWorld,furnitureObstacles,
  resolveActionFurniture,furnitureActionApproach} from '../src/furniture-catalog.js';
import {FURNITURE,ROOM,isWalkable,findPath,nearestWalkable} from '../src/navigation.js';
import {proposeFurnitureMove} from '../src/furniture-layout.js';
import {newHousehold,loadHousehold,chooseResidentAction} from '../src/household.js';
import {enqueueAction,restoreActionQueues} from '../src/action-queue.js';
import {ACTIONS,SAVE_KEY} from '../src/simulation.js';
const copy=v=>JSON.parse(JSON.stringify(v));

test('F0 legacy geometry is exact and every old obstacle comes from instances',()=>{
  const world=newFurnitureWorld();
  assert.equal(world.instances.length,10);
  assert.equal(new Set(world.instances.map(x=>x.instanceId)).size,10);
  assert.deepEqual(furnitureObstacles(world),FURNITURE);
  assert.equal(FURNITURE.length,11); // fridge swept door
  assert.equal(FURNITURE_CATALOG.toilet.actionId,'toilet');
  assert.equal(FURNITURE_CATALOG.tv.actionId,'tv'); // F3a real TV action, legacy geometry unchanged
  assert.deepEqual(ORIGINAL_FURNITURE.map(x=>x.instanceId),world.instances.map(x=>x.instanceId));
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(newFurnitureWorld().instances.some(x=>x.prefabId==='bookcase'),false);
});
test('unmodified household retains all interactions and frozen baseline A* routes',()=>{
  const s=newHousehold();
  for(const [id,action] of Object.entries(ACTIONS).filter(([id])=>!['hobby','music','paint','seat','bench','dining','cook','prep','wash','lamp','mirror','dresser','wardrobe','garden','swim'].includes(id))){
    const instance=resolveActionFurniture(s.world,id);
    assert.ok(instance,id);
    assert.equal(instance.instanceId,LEGACY_FURNITURE_IDS[id]);
    const goal=id==='bed'?{x:action.location[0],z:action.location[1]}:
      furnitureActionApproach(s.world,id,instance.instanceId);
    assert.ok(goal,id);
    assert.ok(isWalkable(goal.x,goal.z,s.world),id);
    assert.ok(findPath(s.position,goal,s.world)?.length,id);
  }
});
test('old root1 save gains stable furniture without changing existing needs or FIFO',()=>{
  const old=newHousehold();
  delete old.world;
  old.needs.bladder=11;
  old.minutes=2200;
  enqueueAction(old.actionQueues,'alex',{type:'object',actionId:'toilet'});
  const after=loadHousehold(copy(old));
  assert.equal(after.minutes,2200);
  assert.equal(after.needs.bladder,11);
  assert.equal(after.actionQueues.byResident.alex.length,1);
  assert.equal(after.actionQueues.byResident.alex[0].targetInstanceId,LEGACY_FURNITURE_IDS.toilet);
  assert.equal(after.world.furniture.instances.length,10);
  assert.deepEqual(loadHousehold(copy(after)).world,after.world);
});
test('active old v1 actions migrate deterministic instance IDs without interrupting work',()=>{
  const old=newHousehold();
  delete old.world;
  old.otherSim.action={id:'shower',phase:'using',elapsed:4,automatic:false};
  const after=loadHousehold(copy(old));
  assert.equal(after.otherSim.action.targetInstanceId,LEGACY_FURNITURE_IDS.shower);
  assert.equal(after.otherSim.action.elapsed,4);
  assert.ok(chooseResidentAction(after,'fridge',false,'alex'));
  assert.equal(after.action.targetInstanceId,LEGACY_FURNITURE_IDS.fridge);
});
test('multiple prefab instances have distinct ids and explicit commands never change target',()=>{
  const s=newHousehold();
  s.world.furniture.instances.push({...s.world.furniture.instances.find(x=>x.prefabId==='sofa'),
    instanceId:'home-sofa-2',x:-.8,z:2.15});
  s.world.furniture.revision++;
  const second='home-sofa-2';
  assert.equal(resolveActionFurniture(s.world,'sofa',second)?.instanceId,second);
  assert.equal(resolveActionFurniture(s.world,'toilet',second),null);
  assert.equal(resolveActionFurniture(s.world,'sofa','missing-sofa'),null);
  const q=enqueueAction(s.actionQueues,'alex',{type:'object',actionId:'sofa',targetInstanceId:second});
  assert.equal(q.targetInstanceId,second);
  const restored=restoreActionQueues(copy(s.actionQueues),['alex','mira']);
  assert.equal(restored.byResident.alex[0].targetInstanceId,second);
  assert.equal(enqueueAction(s.actionQueues,'alex',{type:'object',actionId:'sofa',
    targetInstanceId:'<script>'}),null);
});
test('layout rotation transforms exact footprint and approach without moving source',()=>{
  const world=newFurnitureWorld();
  const fridge=world.instances.find(x=>x.prefabId==='fridge');
  const original=furnitureActionApproach(world,'fridge');
  const moved={...fridge,x:1,z:-1,yaw:90};
  const future={...world,revision:1,instances:world.instances.map(x=>
    x.instanceId===fridge.instanceId?moved:x)};
  const newApproach=furnitureActionApproach(future,'fridge',fridge.instanceId);
  const dx=original.x-fridge.x,dz=original.z-fridge.z;
  assert.ok(Math.abs(newApproach.x-(1-dz))<1e-9);
  assert.ok(Math.abs(newApproach.z-(-1+dx))<1e-9);
  assert.equal(fridge.yaw,0);
  assert.notDeepEqual(furnitureObstacles(future),furnitureObstacles(world));
});
test('revisioned A* reacts to an actual new obstacle and survives save/restore',()=>{
  const world=newFurnitureWorld();
  const before=findPath({x:-.5,z:-1.0},{x:.3,z:-1},world);
  assert.ok(before?.length);
  world.instances.push({instanceId:'home-extra-table-2',prefabId:'table',
    x:-.1,z:-1,yaw:0,location:'home'});
  world.revision++;
  assert.equal(isWalkable(-.1,-1,world),false);
  assert.equal(findPath({x:-.5,z:-1},{x:.3,z:-1},world),null); // destination blocked
  assert.deepEqual(restoreFurnitureWorld(copy(world)),world);
});
test('corrupt duplicate ids, malformed geometry, and unknown prefabs fallback safely',()=>{
  const world=newFurnitureWorld();
  for(const bad of [
    {...world,instances:[...world.instances,world.instances[0]]},
    {...world,instances:[{...world.instances[0],prefabId:'unknown'}]},
    {...world,instances:[{...world.instances[0],x:Infinity}]},
    {...world,instances:[{...world.instances[0],yaw:22}]}
  ]) assert.deepEqual(restoreFurnitureWorld(bad),newFurnitureWorld());
});
test('a safe move is atomic; occupied items and illegal walls do not change the world',()=>{
  const world=newFurnitureWorld();
  const copyBefore=copy(world);
  const table=LEGACY_FURNITURE_IDS.table;
  assert.deepEqual(proposeFurnitureMove(world,table,{x:500,z:0,yaw:0}).ok,false);
  assert.equal(proposeFurnitureMove(world,table,{x:1,z:0,yaw:0},
    {lockedInstanceIds:[table]}).reason,'reserved');
  const result=proposeFurnitureMove(world,table,{x:0,z:-1.35,yaw:0},
    {residents:[{x:-.8,z:2.95}]});
  assert.ok(result.ok,JSON.stringify(result));
  assert.equal(result.world.revision,1);
  assert.deepEqual(world,copyBefore);
  assert.notDeepEqual(result.world.instances,world.instances);
});
test('no future placement can seal an occupied resident inside a solid object',()=>{
  const world=newFurnitureWorld();
  const table=LEGACY_FURNITURE_IDS.table;
  const result=proposeFurnitureMove(world,table,{x:-.7,z:2.9,yaw:0},
    {residents:[{x:-.8,z:2.95}]});
  assert.equal(result.ok,false);
  assert.ok(['resident-blocked','collision','unreachable-fridge','room-bounds'].includes(result.reason));
});
