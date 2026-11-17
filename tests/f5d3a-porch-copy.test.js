import test from 'node:test';
import assert from 'node:assert/strict';
import {newConstructionWorld,proposeConstructionEdit,restoreConstructionWorld,
  constructionPorches,constructionRoomSelection,createConstructionEditor}
  from '../src/construction.js';

const from={x:14,z:-2},to={x:18,z:2};
const source={x:16,z:0},at={x:20,z:6};
const dup=(rotation=0)=>({type:'room-duplicate',source,at,rotation});
const op=(world,command,context)=>{
  const result=proposeConstructionEdit(world,command,context);
  assert.equal(result.ok,true,result.reason);
  return result.world;
};
const porchHouse=()=>{
  let world=op(newConstructionWorld(),{type:'room',from,to});
  world=op(world,{type:'door',edgeId:'v:36,0'});
  const door=world.openings.at(-1);
  world=op(world,{type:'porch-add',openingId:door.id,depthSections:3,
    materialId:'porch.timber'});
  world=op(world,{type:'paint-floor',at:source,scope:'tile',materialId:'floor.oak'});
  world=op(world,{type:'paint-ceiling',at:source,scope:'tile',materialId:'ceiling.blue'});
  return {world,door};
};

test('F5-D.3a copies a room with a porch, intentionally omitting porch and keeping original intact',()=>{
  const {world,door}=porchHouse(),before=JSON.stringify(world);
  const furniture=[{instanceId:'paid-1',location:'home',x:16,z:0}];
  const context={furniture,residents:[{x:16,z:0}],
    wallDecor:[{x:14.1,z:0,radius:.45}]};
  const result=proposeConstructionEdit(world,dup(90),context);
  assert.equal(result.ok,true,result.reason);
  const copied=result.world;
  assert.equal(copied.porches.length,1,'only source porch persists');
  assert.deepEqual(copied.porches,world.porches,'original porch attachment unchanged');
  assert.equal(constructionPorches(copied).length,1);
  assert.ok(copied.openings.some(o=>o.id===door.id));
  const copiedDoors=copied.openings.filter(o=>o.id!==door.id);
  assert.equal(copiedDoors.length,1);
  assert.notEqual(copiedDoors[0].id,door.id);
  assert.equal(copiedDoors[0].type,'door');
  assert.equal(constructionRoomSelection(copied,at).ok,true);
  assert.equal(copied.floorCells.length,world.floorCells.length+64);
  assert.equal(Object.values(copied.materials.floor).filter(x=>x==='floor.oak').length,2);
  assert.equal(Object.values(copied.materials.ceiling).filter(x=>x==='ceiling.blue').length,2);
  assert.equal(JSON.stringify(world),before,'preview must not mutate origin');
  assert.deepEqual(furniture,[{instanceId:'paid-1',location:'home',x:16,z:0}]);
  assert.deepEqual(restoreConstructionWorld(JSON.parse(JSON.stringify(copied))).porches,world.porches);
});

test('F5-D.3a porch blocks room relocation but not geometry-only duplication',()=>{
  const {world}=porchHouse();
  const move={type:'room-relocate',source,at,rotation:0};
  assert.equal(proposeConstructionEdit(world,move).reason,'room-has-porch');
  const result=proposeConstructionEdit(world,dup());
  assert.equal(result.ok,true,result.reason);
});

test('F5-D.3a porch duplicate undo/redo restores exactly the source and copied geometry',()=>{
  const {world}=porchHouse(),editor=createConstructionEditor(world);
  const done=editor.commit(dup(180));
  assert.equal(done.ok,true,done.reason);
  assert.equal(done.world.porches.length,1);
  assert.deepEqual(editor.undo().world,restoreConstructionWorld(world));
  assert.equal(editor.redo().world.porches.length,1);
  assert.equal(editor.redo().ok,false);
});

test('F5-D.3a refuses occupied destinations even for blueprint-only copies',()=>{
  const {world}=porchHouse(),before=JSON.stringify(world);
  const result=proposeConstructionEdit(world,dup(),{
    furnitureBoxes:[{instanceId:'paid-2',minX:19,maxX:20,minZ:5,maxZ:6}]});
  assert.equal(result.reason,'room-target-occupied');
  assert.equal(JSON.stringify(world),before);
});
