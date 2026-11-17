import test from 'node:test';
import assert from 'node:assert/strict';
import {newConstructionWorld,constructionRoomSelection,proposeConstructionEdit,
  restoreConstructionWorld,constructionPorches,createConstructionEditor,STARTER_SHELL}
  from '../src/construction.js';

const source={x:1,z:1},target={x:18.5,z:0};
const copy=(rotation=90,at=target)=>({type:'room-duplicate',source,at,rotation});
const op=(world,command)=>{
  const result=proposeConstructionEdit(world,command);
  assert.equal(result.ok,true,JSON.stringify({command,reason:result.reason}));
  return result.world;
};

test('F5-D.3a original room is selectable for structure copy only, never relocation',()=>{
  const world=newConstructionWorld();
  assert.equal(constructionRoomSelection(world,source).reason,'room-protected');
  const selection=constructionRoomSelection(world,source,{allowStarter:true});
  assert.equal(selection.ok,true,selection.reason);
  assert.equal(selection.room.starter,true);
  assert.equal(selection.room.width,38);
  assert.equal(selection.room.height,18);
  assert.equal(selection.room.wallIds.length,112);
  assert.equal(proposeConstructionEdit(world,{type:'room-relocate',
    source,at:target,rotation:90}).reason,'room-protected');
});

test('F5-D.3a original 19x9m house can be copied 90 degrees alongside itself on existing lot',()=>{
  const original=newConstructionWorld(),before=JSON.stringify(original);
  const result=proposeConstructionEdit(original,copy(),{
    furniture:[{instanceId:'shop-old',location:'home',x:1,z:1}],
    residents:[{x:1,z:1},{x:2,z:2}],
    wallDecor:[{x:1.8,z:-4.1,radius:.45}]
  });
  assert.equal(result.ok,true,result.reason);
  const next=result.world;
  assert.equal(next.floorCells.length,original.floorCells.length*2);
  assert.equal(next.wallEdges.length,112);
  assert.equal(next.wallEdges.some(w=>w.starterSide),false);
  assert.deepEqual(next.starterShell,STARTER_SHELL);
  const copiedSelection=constructionRoomSelection(next,target);
  assert.equal(copiedSelection.ok,true,JSON.stringify(copiedSelection));
  assert.equal(next.openings.length,0);
  assert.equal(JSON.stringify(original),before,'copy must not mutate original shell');
  const restored=restoreConstructionWorld(JSON.parse(JSON.stringify(next)));
  assert.deepEqual(restored.floorCells,next.floorCells);
  assert.equal(restored.wallEdges.length,112);
  assert.equal(restored.schema,1);
});

test('F5-D.3a starter finishes, actual door and porch stay attached to original while copied door has new ID',()=>{
  let world=newConstructionWorld();
  world=op(world,{type:'paint-wall',edgeId:'starter:north:0',
    materialId:'wall.sage',side:'a',scope:'segment'});
  world=op(world,{type:'paint-floor',at:{x:1,z:1},
    materialId:'floor.oak',scope:'tile'});
  world=op(world,{type:'paint-ceiling',at:{x:1,z:1},
    materialId:'ceiling.blue',scope:'tile'});
  world=op(world,{type:'door',edgeId:'starter:west:6'});
  const door=world.openings.at(-1);
  world=op(world,{type:'porch-add',openingId:door.id,depthSections:3,
    materialId:'porch.wood'});
  const before=JSON.stringify(world);
  const result=proposeConstructionEdit(world,copy());
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.world.openings.length,2);
  assert.equal(result.world.openings[0].id,door.id);
  assert.notEqual(result.world.openings[1].id,door.id);
  assert.deepEqual(result.world.porches,world.porches);
  assert.equal(constructionPorches(result.world).length,1);
  assert.equal(Object.values(result.world.materials.floor).filter(x=>x==='floor.oak').length,2);
  assert.equal(Object.values(result.world.materials.ceiling).filter(x=>x==='ceiling.blue').length,2);
  assert.ok(Object.values(result.world.materials.wall).filter(v=>v.a==='wall.sage'||v.b==='wall.sage').length>=2);
  assert.equal(JSON.stringify(world),before);
  assert.deepEqual(restoreConstructionWorld(result.world).porches,world.porches);
});

test('F5-D.3a starter copy remains transactional, rejects impossible orientations and occupied destinations',()=>{
  const world=newConstructionWorld(),before=JSON.stringify(world);
  assert.equal(proposeConstructionEdit(world,copy(0)).reason,'room-target-overlap');
  assert.equal(proposeConstructionEdit(world,copy(45)).reason,'invalid-room-placement');
  const blocked=proposeConstructionEdit(world,copy(),{
    furnitureBoxes:[{instanceId:'already-there',minX:17.9,maxX:18.1,
      minZ:-1,maxZ:1}]});
  assert.equal(blocked.reason,'room-target-occupied');
  assert.equal(JSON.stringify(world),before);
  const editor=createConstructionEditor(world);
  const done=editor.commit(copy());
  assert.equal(done.ok,true,done.reason);
  assert.equal(editor.undo().ok,true);
  assert.deepEqual(editor.state().world,restoreConstructionWorld(world));
  assert.equal(editor.redo().ok,true);
  assert.equal(editor.state().world.floorCells.length,world.floorCells.length*2);
});
