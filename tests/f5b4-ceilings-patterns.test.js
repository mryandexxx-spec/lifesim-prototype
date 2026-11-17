import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BUILD_FINISHES,newConstructionWorld,restoreConstructionWorld,
  proposeConstructionEdit,createConstructionEditor} from '../src/construction.js';

const edit=(world,command)=>{
  const result=proposeConstructionEdit(world,command);
  assert.equal(result.ok,true,result.reason);
  return result.world;
};

test('F5-B.4 legacy construction keeps old material schema without any ceiling entries',()=>{
  const old=newConstructionWorld();
  assert.deepEqual(old.materials,{floor:{},wall:{}});
  assert.deepEqual(restoreConstructionWorld(old).materials,{floor:{},wall:{}});
  assert.equal(Object.keys(BUILD_FINISHES.ceiling).length,5);
});

test('F5-B.4 painting entire old house ceiling survives v1 JSON save/restore',()=>{
  const original=newConstructionWorld();
  const room=edit(original,{type:'paint-ceiling',at:{x:0,z:0},
    scope:'room',materialId:'ceiling.cream'});
  assert.equal(room.legacy,true);
  assert.equal(Object.keys(room.materials.ceiling).length,room.floorCells.length);
  assert.equal(room.materials.ceiling['0,0'],'ceiling.cream');
  assert.deepEqual(original.materials,{floor:{},wall:{}});
  const saved=restoreConstructionWorld(JSON.parse(JSON.stringify(room)));
  assert.deepEqual(saved.materials,room.materials);
  const cleared=edit(saved,{type:'paint-ceiling',at:{x:0,z:0},
    scope:'room',materialId:'ceiling.default'});
  assert.deepEqual(cleared.materials,{floor:{},wall:{}});
  assert.equal(proposeConstructionEdit(cleared,{type:'paint-ceiling',
    at:{x:0,z:0},scope:'room',materialId:'ceiling.default'}).reason,'unchanged');
});

test('F5-B.4 ceiling one tile versus a bounded new room and no cross-room leaking',()=>{
  const room=edit(newConstructionWorld(),{type:'room',
    from:{x:14,z:-2},to:{x:18,z:2}});
  const single=edit(room,{type:'paint-ceiling',scope:'tile',
    at:{x:16.2,z:0.2},materialId:'ceiling.blue'});
  assert.equal(Object.keys(single.materials.ceiling).length,1);
  assert.equal(single.materials.ceiling['32,0'],'ceiling.blue');
  const filled=edit(single,{type:'paint-ceiling',scope:'room',
    at:{x:16.2,z:0.2},materialId:'ceiling.sage'});
  assert.equal(filled.materials.ceiling['32,0'],'ceiling.sage');
  assert.equal(filled.materials.ceiling['0,0'],undefined);
});

test('F5-B.4 validation and corrupt ceiling save sanitization',()=>{
  const world=newConstructionWorld();
  for(const [at,materialId,scope,reason] of [
    [{x:99,z:99},'ceiling.blue','tile','finish-needs-floor'],
    [{x:0,z:0},'ceiling.bad','tile','unknown-finish'],
    [{x:0,z:0},'ceiling.blue','bad','invalid-finish-target']
  ])assert.equal(proposeConstructionEdit(world,
    {type:'paint-ceiling',at,materialId,scope}).reason,reason);
  const restored=restoreConstructionWorld({...world,materials:{floor:{},wall:{},
    ceiling:{'0,0':'ceiling.blue','400,400':'ceiling.cream','1,1':'unknown'}}});
  assert.deepEqual(restored.materials.ceiling,{'0,0':'ceiling.blue'});
});

test('F5-B.4 ceiling follows demolished floor and editor undo/redo',()=>{
  let world=edit(newConstructionWorld(),{type:'room',
    from:{x:14,z:-2},to:{x:18,z:2}});
  world=edit(world,{type:'paint-ceiling',at:{x:17.2,z:0.2},
    scope:'tile',materialId:'ceiling.chalk'});
  assert.equal(world.materials.ceiling['34,0'],'ceiling.chalk');
  const editor=createConstructionEditor(world);
  const removed=editor.commit({type:'remove-floor',
    from:{x:17,z:0},to:{x:18,z:1}});
  assert.equal(removed.ok,true,removed.reason);
  assert.equal(removed.world.materials.ceiling?.['34,0'],undefined);
  assert.equal(editor.undo().world.materials.ceiling['34,0'],'ceiling.chalk');
  assert.equal(editor.redo().world.materials.ceiling?.['34,0'],undefined);
});

test('F5-B.4 patterned walls and directional floors use existing stable material IDs',()=>{
  const old=newConstructionWorld();
  const floor=edit(old,{type:'paint-floor',at:{x:0,z:0},
    scope:'tile',materialId:'floor.planks-x'});
  const rotated=edit(floor,{type:'paint-floor',at:{x:0,z:0},
    scope:'tile',materialId:'floor.planks-z'});
  assert.equal(BUILD_FINISHES.floor['floor.planks-x'].pattern,'planks-x');
  assert.equal(BUILD_FINISHES.floor['floor.planks-z'].pattern,'planks-z');
  assert.equal(rotated.materials.floor['0,0'],'floor.planks-z');
  const mosaic=edit(rotated,{type:'paint-floor',at:{x:0,z:0},
    scope:'tile',materialId:'floor.mosaic'});
  const wall=edit(mosaic,{type:'paint-wall',edgeId:'starter:north',
    side:'both',materialId:'wall.panels'});
  assert.equal(BUILD_FINISHES.wall['wall.stripes'].pattern,'stripes');
  assert.equal(wall.materials.wall['starter:north'].b,'wall.panels');
  assert.deepEqual(restoreConstructionWorld(wall).materials,wall.materials);
});

test('F5-B.4 ceiling touch controls and view isolation remain integrated',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  for(const id of ['paint-ceiling-room','paint-ceiling-tile',
    'build-ceiling-toggle','build-finish-tip'])assert.ok(html.includes(id),id);
  assert.match(game,/if\(buildMode&&ceilingPreview\)/);
  assert.match(game,/type:'paint-ceiling'/);
  assert.match(game,/buildMode=false;ceilingPreview=false/);
  assert.match(html,/f5b4/);
});
