import test from 'node:test';
import assert from 'node:assert/strict';
import {newFurnitureWorld,LEGACY_FURNITURE_IDS,restoreFurnitureWorld,
  furnitureObstacles} from '../src/furniture-catalog.js';
import {F1_MOVEABLE_PREFABS,createFurnitureEditor,canMoveFurniture,
  snapFurnitureCoordinate,furnitureFloorPoint} from '../src/furniture-editor.js';
import {newHousehold,loadHousehold} from '../src/household.js';
import {isWalkable,findPath} from '../src/navigation.js';
const copy=x=>JSON.parse(JSON.stringify(x));
const item=(w,type)=>w.instances.find(x=>x.prefabId===type);
test('F1b functional prefab groups are selectable, while built-in counter stays fixed',()=>{
  assert.deepEqual(F1_MOVEABLE_PREFABS.slice(0,11),
    ['nightstand','table','tv','plant','bed','sofa','fridge','shower','toilet','bookcase','music']);
  const w=newFurnitureWorld();
  for(const x of w.instances)
    assert.equal(canMoveFurniture(x),F1_MOVEABLE_PREFABS.includes(x.prefabId),x.prefabId);
  assert.equal(canMoveFurniture(null),false);
});
test('F1 move is atomic and leaves original household untouched until committed',()=>{
  const world=newFurnitureWorld(),before=copy(world);
  const session=createFurnitureEditor(world);
  const table=item(world,'table');
  const result=session.commit(table.instanceId,{x:0,z:-1.35,yaw:0},
    {residents:[{x:-.8,z:2.95}]});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.world.instances.find(x=>x.instanceId===table.instanceId).x,0);
  assert.deepEqual(world,before);
  assert.equal(result.world.revision,1);
  assert.equal(session.state().canUndo,true);
  assert.notDeepEqual(furnitureObstacles(result.world),furnitureObstacles(world));
});
test('undo redo restore layout and always invalidate A* grid cache revision',()=>{
  const source=newFurnitureWorld(),target=item(source,'table');
  const session=createFurnitureEditor(source);
  const opts={residents:[{x:-.8,z:2.95}]};
  const a=session.commit(target.instanceId,{x:0,z:-1.35,yaw:90},opts);
  assert.equal(a.ok,true);
  const undone=session.undo();
  assert.equal(undone.ok,true);
  assert.deepEqual(undone.world.instances,source.instances);
  assert.ok(undone.world.revision>a.world.revision);
  assert.equal(session.state().canRedo,true);
  const redone=session.redo();
  assert.equal(redone.ok,true);
  assert.deepEqual(redone.world.instances,a.world.instances);
  assert.ok(redone.world.revision>undone.world.revision);
  assert.ok(findPath({x:-.5,z:-1},{x:.3,z:-1},redone.world)!==undefined);
});
test('after undo a different commit cuts off redo but not earlier history',()=>{
  const world=newFurnitureWorld(),table=item(world,'table'),session=createFurnitureEditor(world);
  const opts={residents:[{x:-.8,z:2.95}]};
  assert.equal(session.commit(table.instanceId,{x:0,z:-1.35,yaw:0},opts).ok,true);
  assert.equal(session.undo().ok,true);
  assert.equal(session.commit(table.instanceId,{x:-.1,z:-1.35,yaw:0},opts).ok,true);
  assert.equal(session.redo().ok,false);
});
test('can access functional fixture transactions, but cannot move locked target or kitchen unit',()=>{
  const w=newFurnitureWorld(),editor=createFurnitureEditor(w);
  for(const type of ['bed','fridge','sofa','shower','toilet']){
    const i=item(w,type);
    assert.equal(canMoveFurniture(i),true);
    assert.equal(editor.commit(i.instanceId,{x:i.x,z:i.z,yaw:0}).reason,'unchanged');
    assert.equal(editor.commit(i.instanceId,{x:i.x+.25,z:i.z,yaw:0},
      {lockedInstanceIds:[i.instanceId]}).reason,'reserved');
  }
  const counter=item(w,'counter');
  assert.equal(editor.commit(counter.instanceId,{x:0,z:-1,yaw:0}).reason,'fixed-or-missing');
  assert.deepEqual(editor.state().world,w);
});
test('invalid edge, occupied resident, overlap, and no-op cannot modify state',()=>{
  const w=newFurnitureWorld(),editor=createFurnitureEditor(w),table=item(w,'table');
  assert.equal(editor.commit(table.instanceId,{x:Infinity,z:1,yaw:0}).ok,false);
  assert.equal(editor.commit(table.instanceId,{x:8,z:1,yaw:0}).ok,false);
  assert.equal(editor.commit(table.instanceId,{x:1,z:0,yaw:5}).ok,false);
  assert.equal(editor.commit(table.instanceId,{x:table.x,z:table.z,yaw:0}).reason,'unchanged');
  assert.equal(editor.commit(table.instanceId,{x:-.8,z:2.95,yaw:0},
    {residents:[{x:-.8,z:2.95}]}).ok,false);
  assert.equal(editor.state().canUndo,false);
  assert.deepEqual(editor.state().world,w);
});
test('legacy/root1 furniture survives save reload with exact permanent identities',()=>{
  const old=newHousehold();
  const table=old.world.furniture.instances.find(x=>x.prefabId==='table');
  const editor=createFurnitureEditor(old.world.furniture);
  const res=editor.commit(table.instanceId,{x:0,z:-1.35,yaw:0},
    {residents:[{x:-.8,z:2.95}]});
  assert.equal(res.ok,true);
  old.world.furniture=res.world;
  const saved=loadHousehold(copy(old));
  assert.equal(saved.world.furniture.instances.find(x=>x.instanceId===table.instanceId).x,0);
  assert.equal(saved.version,1);
  assert.deepEqual(restoreFurnitureWorld(copy(saved.world.furniture)),saved.world.furniture);
  assert.equal(saved.world.furniture.instances.length,10);
  assert.equal(saved.needs.bladder,old.needs.bladder);
});
test('floor ray rejects invalid geometry and keeps world-space x/z precise',()=>{
  assert.deepEqual(furnitureFloorPoint({x:-2,y:10,z:2},{x:2,y:-10,z:-2}),{x:0,z:0});
  assert.equal(furnitureFloorPoint({x:1,y:4,z:3},{x:2,y:3,z:2}),null);
  assert.equal(furnitureFloorPoint({x:0,y:0,z:0},{x:1,y:0,z:2}),null);
  assert.equal(furnitureFloorPoint({x:NaN,y:1,z:0},{x:1,y:-1,z:0}),null);
  assert.equal(snapFurnitureCoordinate(.31),.25);
  assert.equal(snapFurnitureCoordinate(-.4),-.5);
});
