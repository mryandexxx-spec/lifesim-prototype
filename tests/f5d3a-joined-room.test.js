import test from 'node:test';
import assert from 'node:assert/strict';
import {newConstructionWorld,proposeConstructionEdit,constructionSharedPartition,
  constructionRooms,constructionRoomSelection,createConstructionEditor,
  restoreConstructionWorld} from '../src/construction.js';

const edit=(world,command,context={})=>{
  const result=proposeConstructionEdit(world,command,context);
  assert.equal(result.ok,true,JSON.stringify({command,reason:result.reason}));
  return result.world;
};
const shared='v:36,-4'; // x=18m, z=-2m, between new 3 x 4m rooms
function adjacent(){
  let world=newConstructionWorld();
  world=edit(world,{type:'room',from:{x:15,z:-4},to:{x:18,z:0}});
  world=edit(world,{type:'room',from:{x:18,z:-4},to:{x:21,z:0}});
  return world;
}

test('F5-D joined: true two-room graph finds exactly contiguous shared run',()=>{
  const source=adjacent(),rooms=constructionRooms(source);
  assert.equal(rooms.length,3); // original starter + two new rooms
  const hit=constructionSharedPartition(source,shared);
  assert.equal(hit.ok,true,hit.reason);
  assert.equal(hit.edgeIds.length,8);
  assert.ok(hit.edgeIds.includes(shared));
  assert.ok(hit.edgeIds.every(id=>id.startsWith('v:36,')));
  assert.equal(constructionSharedPartition(source,'v:30,-4').reason,
    'partition-needs-two-rooms');
  assert.equal(constructionSharedPartition(source,'not-a-wall').reason,
    'partition-wall-not-found');
});

test('F5-D joined: one atomic tap merges whole partition, preserves floors, objects and finish, reversible',()=>{
  const source=adjacent(),snapshot=JSON.stringify(source);
  const target=edit(source,{type:'room-join',edgeId:shared},{
    furniture:[{instanceId:'paid-sofa',location:'home',x:17,z:-2}],
    residents:[{x:16,z:-2}]});
  assert.equal(constructionRooms(target).length,2);
  assert.equal(target.floorCells.length,source.floorCells.length);
  assert.equal(target.wallEdges.length,source.wallEdges.length-8);
  assert.equal(JSON.stringify(source),snapshot);
  assert.equal(target.schema,1);
  assert.equal(restoreConstructionWorld(JSON.parse(JSON.stringify(target))).wallEdges.length,
    target.wallEdges.length);
  const painter=edit(target,{type:'paint-floor',at:{x:16,z:-2},
    materialId:'floor.oak',scope:'room'});
  assert.equal(painter.materials.floor['38,-4'],'floor.oak',
    'room painting must reach the other side of the removed partition');
  assert.equal(constructionRoomSelection(target,{x:16,z:-2}).ok,true,
    'joined rectangular volume must remain a valid selectable blueprint');
  const session=createConstructionEditor(source);
  assert.equal(session.commit({type:'room-join',edgeId:shared}).ok,true);
  assert.equal(session.undo().world.wallEdges.length,source.wallEdges.length);
  assert.equal(session.redo().world.wallEdges.length,target.wallEdges.length);
});

test('F5-D joined: door on shared wall disappears with it but other openings stay',()=>{
  let source=adjacent();
  source=edit(source,{type:'door',edgeId:shared});
  const old=source.openings[0].id;
  const next=edit(source,{type:'room-join',edgeId:shared});
  assert.equal(next.openings.some(o=>o.id===old),false);
  assert.equal(next.openings.length,0);
  assert.equal(constructionRooms(next).length,2);
});

test('F5-D joined: art blocks removal without mutating the world',()=>{
  const source=adjacent(),snapshot=JSON.stringify(source);
  const result=proposeConstructionEdit(source,{type:'room-join',edgeId:shared},{
    wallDecor:[{x:18,z:-2,radius:.46}]});
  assert.equal(result.reason,'partition-has-art');
  assert.equal(JSON.stringify(source),snapshot);
});

test('F5-D joined: exterior and already-connected wall cannot be removed by merge',()=>{
  let source=adjacent();
  assert.equal(proposeConstructionEdit(source,{type:'room-join',edgeId:'v:30,-4'}).reason,
    'partition-needs-two-rooms');
  source=edit(source,{type:'erase-wall',edgeId:shared});
  assert.equal(constructionRooms(source).length,2);
  assert.equal(proposeConstructionEdit(source,{type:'room-join',edgeId:'v:36,-5'}).reason,
    'partition-already-connected');
});

test('F5-D joined: splitting uses original wall tool on same 0.5m grid, old saves remain',()=>{
  const source=adjacent();
  const joined=edit(source,{type:'room-join',edgeId:shared});
  const separated=edit(joined,{type:'wall',from:{x:18,z:-4},to:{x:18,z:0}});
  assert.equal(constructionRooms(separated).length,3);
  assert.deepEqual(new Set(separated.floorCells),new Set(source.floorCells));
  assert.deepEqual(new Set(separated.wallEdges.map(w=>w.id)),
    new Set(source.wallEdges.map(w=>w.id)));
  assert.equal(restoreConstructionWorld(separated).schema,1);
});
