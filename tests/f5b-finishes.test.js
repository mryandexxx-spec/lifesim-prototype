import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILD_FINISHES,newConstructionWorld,restoreConstructionWorld,
  proposeConstructionEdit,createConstructionEditor} from '../src/construction.js';

const edit=(world,command)=>proposeConstructionEdit(world,command);
const painted=(world,command)=>{const result=edit(world,command);
  assert.equal(result.ok,true,result.reason);return result.world;};

test('F5-B legacy save gains optional sanitized surfaces without changing its coordinates',()=>{
  const baseline=newConstructionWorld();
  const world=restoreConstructionWorld({...baseline,materials:{floor:{
    '0,0':'floor.oak','400,400':'floor.tile','1,1':'invalid','__proto__':'floor.clay'},
    wall:{'starter:north':{a:'wall.cream',b:'wall.sage'},
      'h:999,999':{a:'wall.olive'}}}});
  assert.equal(world.floorCells.length,baseline.floorCells.length);
  assert.equal(world.materials.floor['0,0'],'floor.oak');
  assert.equal(Object.hasOwn(world.materials.floor,'400,400'),false);
  assert.equal(Object.hasOwn(world.materials.floor,'1,1'),false);
  assert.deepEqual(world.materials.wall['starter:north'],{a:'wall.cream',b:'wall.sage'});
  assert.equal(world.materials.wall['h:999,999'],undefined);
  assert.equal(world.starterShell.west,-10);
  assert.equal(Object.keys(BUILD_FINISHES.floor).length>=5,true);
});

test('F5-B paint one tile versus whole connected room, reset to default and preserve legacy gameplay',()=>{
  const initial=newConstructionWorld();
  const tile=painted(initial,{type:'paint-floor',scope:'tile',at:{x:0.15,z:0.12},materialId:'floor.oak'});
  assert.equal(tile.legacy,true);
  assert.equal(Object.keys(tile.materials.floor).length,1);
  assert.equal(tile.materials.floor['0,0'],'floor.oak');
  assert.deepEqual(initial.materials,{});
  const room=painted(tile,{type:'paint-floor',scope:'room',at:{x:0.1,z:0.1},materialId:'floor.tile'});
  assert.equal(Object.keys(room.materials.floor).length,room.floorCells.length);
  assert.equal(room.materials.floor['0,0'],'floor.tile');
  assert.equal(room.materials.floor['15,2'],'floor.tile');
  const restored=restoreConstructionWorld(JSON.parse(JSON.stringify(room)));
  assert.deepEqual(restored.materials,room.materials);
  const cleared=painted(room,{type:'paint-floor',scope:'room',at:{x:0.1,z:0.1},materialId:'floor.default'});
  assert.equal(Object.keys(cleared.materials.floor).length,0);
  assert.equal(edit(cleared,{type:'paint-floor',scope:'room',at:{x:0,z:0},materialId:'floor.default'}).reason,'unchanged');
});

test('F5-B connected room flood fill respects partitions and does not paint neighbouring room',()=>{
  const room=painted(newConstructionWorld(),{type:'room',
    from:{x:14,z:-2},to:{x:18,z:2}});
  const finished=painted(room,{type:'paint-floor',scope:'room',at:{x:16,z:0},materialId:'floor.clay'});
  assert.equal(finished.materials.floor['32,0'],'floor.clay');
  assert.equal(finished.materials.floor['0,0'],undefined);
  assert.equal(finished.materials.floor['34,1'],'floor.clay');
});

test('F5-B wall two-sided finish persists on legacy original perimeter',()=>{
  const initial=newConstructionWorld();
  const wall=painted(initial,{type:'paint-wall',edgeId:'starter:north',materialId:'wall.blue',side:'b'});
  assert.deepEqual(wall.materials.wall['starter:north'],{b:'wall.blue'});
  assert.equal(wall.starterShell.north,-9);
  const both=painted(wall,{type:'paint-wall',edgeId:'starter:north',materialId:'wall.sage',side:'both'});
  assert.deepEqual(both.materials.wall['starter:north'],{b:'wall.sage',a:'wall.sage'});
  assert.deepEqual(restoreConstructionWorld(both).materials,both.materials);
  const clear=painted(both,{type:'paint-wall',edgeId:'starter:north',materialId:'wall.default'});
  assert.equal(clear.materials.wall['starter:north'],undefined);
});

test('F5-B long continuous structural wall supports run finish and selective side reset',()=>{
  const room=painted(newConstructionWorld(),{type:'room',from:{x:14,z:-2},to:{x:18,z:2}});
  const edge=room.wallEdges.find(w=>w.axis==='h'&&w.j===-4);
  assert.ok(edge);
  const finished=painted(room,{type:'paint-wall',edgeId:edge.id,materialId:'wall.rose',
    side:'both',scope:'run'});
  assert.equal(Object.keys(finished.materials.wall).length,8);
  assert.equal(finished.materials.wall[edge.id].a,'wall.rose');
  const changed=painted(finished,{type:'paint-wall',edgeId:edge.id,materialId:'wall.default',
    side:'a',scope:'segment'});
  assert.equal(changed.materials.wall[edge.id].a,undefined);
  assert.equal(changed.materials.wall[edge.id].b,'wall.rose');
});

test('F5-B finish validation, undo/redo and refresh protect original save',()=>{
  const editor=createConstructionEditor(newConstructionWorld());
  const invalid=editor.commit({type:'paint-floor',at:{x:99,z:99},scope:'tile',materialId:'floor.ash'});
  assert.equal(invalid.reason,'finish-needs-floor');
  assert.equal(editor.state().canUndo,false);
  assert.equal(edit(editor.state().world,{type:'paint-floor',at:{x:0,z:0},scope:'tile',
    materialId:'wall.olive'}).reason,'unknown-finish');
  const applied=editor.commit({type:'paint-floor',at:{x:.1,z:.1},scope:'tile',materialId:'floor.ash'});
  assert.equal(applied.ok,true);
  assert.equal(editor.undo().world.materials.floor['0,0'],undefined);
  assert.equal(editor.redo().world.materials.floor['0,0'],'floor.ash');
});

test('F5-B moving, demolishing walls or removing floor does not orphan finish IDs',()=>{
  const first=painted(newConstructionWorld(),{type:'room',from:{x:14,z:-2},to:{x:18,z:2}});
  const edge=first.wallEdges.find(w=>w.axis==='h'&&w.j===-4);
  const paintedWall=painted(first,{type:'paint-wall',edgeId:edge.id,scope:'segment',materialId:'wall.cream'});
  const erased=painted(paintedWall,{type:'erase-wall',edgeId:edge.id});
  assert.equal(erased.materials.wall[edge.id],undefined);
  const tile=painted(erased,{type:'paint-floor',scope:'tile',at:{x:17.1,z:0.1},materialId:'floor.slate'});
  const removed=edit(tile,{type:'remove-floor',from:{x:17,z:0},to:{x:18,z:1}});
  assert.equal(removed.ok,true,removed.reason);
  assert.equal(removed.world.materials.floor['34,0'],undefined);
});
