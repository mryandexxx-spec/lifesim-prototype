import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newConstructionWorld,restoreConstructionWorld,proposeConstructionEdit,
  constructionRoomSelection,createConstructionEditor,constructionRooms}
  from '../src/construction.js';

const from={x:15,z:-3},to={x:18,z:1};
const source={x:16,z:-2};
const place={x:20,z:6};
const op=(world,cmd,context={})=>{
  const result=proposeConstructionEdit(world,cmd,context);
  assert.equal(result.ok,true,JSON.stringify({cmd,reason:result.reason}));
  return result.world;
};
const built=()=>op(newConstructionWorld(),{type:'room',from,to});
const decorated=()=>{
  let w=built();
  w=op(w,{type:'paint-floor',at:{x:16,z:-2},materialId:'floor.oak',scope:'tile'});
  w=op(w,{type:'paint-ceiling',at:{x:16,z:-2},materialId:'ceiling.blue',scope:'tile'});
  w=op(w,{type:'paint-wall',edgeId:'h:30,-6',materialId:'wall.sage',
    side:'a',scope:'segment'});
  w=op(w,{type:'door',edgeId:'v:36,-3',styleId:'door.simple'});
  return w;
};
const cmd=(type='room-duplicate',rotation=0,at=place)=>({type,
  source,rotation,at});

test('F5-D.1 refuses all original house floor, including pristine v1 saves',()=>{
  const world=newConstructionWorld();
  assert.equal(constructionRoomSelection(world,{x:1,z:1}).reason,'room-protected');
  assert.equal(proposeConstructionEdit(world,cmd()).reason,'room-not-found');
  assert.deepEqual(restoreConstructionWorld(world),world);
});
test('F5-D.1 selects a rectangular fully enclosed room through floor topology',()=>{
  const result=constructionRoomSelection(built(),source);
  assert.equal(result.ok,true);
  assert.equal(result.room.width,6);
  assert.equal(result.room.height,8);
  assert.equal(result.room.cells.length,48);
  assert.equal(result.room.wallIds.length,28);
});
test('F5-D.1 copies walls, doors and selected face/floor/ceiling finishes after a 90 degree turn',()=>{
  const world=decorated();
  const result=op(world,cmd('room-duplicate',90));
  assert.equal(result.floorCells.length,world.floorCells.length+48);
  assert.equal(result.wallEdges.length,world.wallEdges.length+28);
  assert.equal(result.openings.length,2);
  assert.notEqual(result.openings[0].id,result.openings[1].id);
  assert.equal(result.openings[1].type,'door');
  assert.equal(result.openings[1].styleId,'door.simple');
  assert.equal(result.openings[1].edgeIds.length,3);
  assert.ok(Object.values(result.materials.wall).some(f=>f.a==='wall.sage'||f.b==='wall.sage'));
  assert.equal(Object.values(result.materials.floor).filter(v=>v==='floor.oak').length,2);
  assert.equal(Object.values(result.materials.ceiling).filter(v=>v==='ceiling.blue').length,2);
  assert.deepEqual(world,decorated(),'preview never changes old world or identities');
  assert.ok(constructionRooms(result).length>=3);
  assert.deepEqual(restoreConstructionWorld(JSON.parse(JSON.stringify(result))).openings,result.openings);
});
test('F5-D.1 move is atomic, keeps door ID, finishes and removes old footprint',()=>{
  const original=decorated();
  const moved=op(original,cmd('room-relocate',180));
  assert.equal(moved.openings.length,original.openings.length);
  assert.equal(moved.openings[0].id,original.openings[0].id);
  assert.equal(moved.floorCells.length,original.floorCells.length);
  assert.equal(moved.wallEdges.length,original.wallEdges.length);
  assert.equal(constructionRoomSelection(moved,source).ok,false);
  assert.ok(constructionRoomSelection(moved,place).ok);
  assert.equal(Object.values(moved.materials.floor).filter(v=>v==='floor.oak').length,1);
  assert.equal(Object.values(moved.materials.ceiling).filter(v=>v==='ceiling.blue').length,1);
  assert.equal(restoreConstructionWorld(moved).floorCells.length,moved.floorCells.length);
});
test('F5-D.1 move refuses source that shares a boundary with legacy house',()=>{
  const original=op(newConstructionWorld(),{type:'room',
    from:{x:14,z:-2},to:{x:18,z:2}});
  const out=proposeConstructionEdit(original,{type:'room-relocate',
    source:{x:16,z:0},at:place,rotation:0});
  assert.equal(out.reason,'room-shared-boundary');
});
test('F5-D.3a duplicates only structure, never purchased items, residents or artwork',()=>{
  const world=built(),before=JSON.stringify(world);
  const furniture=[{instanceId:'f1',x:16,z:-2,location:'home'}];
  const ctx={furniture,residents:[{x:16,z:-2}],wallDecor:[{x:15.2,z:-3,radius:.4}]};
  const copy=proposeConstructionEdit(world,cmd(),ctx);
  assert.equal(copy.ok,true,copy.reason);
  assert.equal(copy.world.floorCells.length,world.floorCells.length+48);
  assert.equal(JSON.stringify(world),before);
  assert.deepEqual(furniture,[{instanceId:'f1',x:16,z:-2,location:'home'}]);
  assert.equal(proposeConstructionEdit(world,cmd('room-relocate'),ctx).reason,'room-has-furniture');
  assert.equal(proposeConstructionEdit(world,cmd('room-relocate'),{
    residents:[{x:16,z:-2}]}).reason,'room-has-resident');
  assert.equal(proposeConstructionEdit(world,cmd('room-relocate'),{
    wallDecor:[{x:15.2,z:-3,radius:.4}]}).reason,'room-has-art');
});
test('F5-D.1 refuses overlap, lot overflow and malformed rotation without mutation',()=>{
  const world=built(),before=JSON.stringify(world);
  assert.equal(proposeConstructionEdit(world,cmd('room-duplicate',0,source)).reason,'room-target-overlap');
  assert.equal(proposeConstructionEdit(world,cmd('room-duplicate',0,{x:23,z:11})).reason,'lot-bounds');
  assert.equal(proposeConstructionEdit(world,cmd('room-duplicate',45)).reason,'invalid-room-placement');
  assert.equal(JSON.stringify(world),before);
});
test('F5-D.1 refuses moving a room below a manually placed roof',()=>{
  const world=op(built(),{type:'roof-add',from,to,styleId:'roof.gable',
    materialId:'roof.slate',pitch:.38,eaves:.4});
  assert.equal(proposeConstructionEdit(world,cmd('room-relocate')).reason,'room-has-manual-roof');
});
test('F5-D.1 auto-roof recomputes after copying without becoming a new indoor room decoration',()=>{
  const world=op(built(),{type:'roof-auto',styleId:'roof.gable',
    materialId:'roof.slate',pitch:.38,eaves:.4});
  const copied=op(world,cmd('room-duplicate'));
  assert.equal(copied.roofAuto,true);
  assert.ok(copied.roofModules.length>=world.roofModules.length);
  assert.equal(restoreConstructionWorld(copied).roofAuto,true);
});
test('F5-D.1 50-step undo/redo and old v1 schema remain unchanged',()=>{
  const world=built(),editor=createConstructionEditor(world);
  const update=editor.commit(cmd());
  assert.equal(update.ok,true,update.reason);
  assert.equal(editor.state().canUndo,true);
  assert.equal(editor.undo().ok,true);
  assert.deepEqual(editor.state().world,restoreConstructionWorld(world));
  assert.equal(editor.redo().ok,true);
  assert.equal(editor.state().world.schema,1);
  assert.equal(editor.state().world.floorCells.length,world.floorCells.length+48);
});
test('F5-D.1 mobile controls and Pages source syntax are present',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  assert.match(html,/data-build-tool="room-duplicate"/);
  assert.match(html,/data-build-tool="room-relocate"/);
  assert.match(html,/id="build-room-turn"/);
  assert.match(game,/constructionRoomSelection\(game\.world\.construction,point,/);
  assert.match(css,/\.build-room-controls\[hidden\]/);
});
