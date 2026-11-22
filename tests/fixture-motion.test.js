import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold} from '../src/household.js';
import {previewPoolTiles,previewPoolFixture,previewRotatedPoolFixture,commitPoolPreview} from '../src/pool-editor.js';
import {poolCellIndex} from '../src/pool-topology.js';
import {wateringFrame} from '../src/outdoor-character-motion.js';

test('original textured fixtures have a separately movable indexed part',()=>{
  for(const [slug,name,count] of [['cream_fridge','upper-door',1329],['glass_shower','sliding-panel',148],
    ['bathroom_toilet','flush-lever',68]]){
    const bytes=readFileSync(new URL('../assets/furniture/meshy-room-v2/'+slug+'.glb',import.meta.url));
    const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
    const body=gltf.meshes[0].primitives[0];
    const part=gltf.meshes[gltf.nodes.find(n=>n.name===name).mesh].primitives[0];
    assert.deepEqual(part.attributes,body.attributes);
    assert.equal(part.material,body.material);
    assert.notEqual(part.indices,body.indices);
    assert.equal(gltf.accessors[part.indices].count,count*3);
  }
});

for(const kind of ['ladder','steps','board'])test(kind+' rotates between four walls without charging again',()=>{
  let root=newHousehold();root.shop.credits=30000;
  const at=poolCellIndex(17.25,6.25);
  const cells=Array.from({length:36},(_,i)=>at+64*Math.floor(i/6)+i%6);
  root=commitPoolPreview(root,previewPoolTiles(root,{operation:'paint',cells})).root;
  root=commitPoolPreview(root,previewPoolFixture(root,{operation:'fixture-add',
    kind,side:'north',edgeCell:at+3})).root;
  for(const expected of ['east','south','west','north']){
    const old=root.world.outdoors.poolFixtures[0];
    const draft=previewRotatedPoolFixture(root,old,'fixture-move');
    assert.ok(draft.ok,draft.reason);assert.equal(draft.cost,0);
    const next=commitPoolPreview(root,draft).root;
    assert.equal(next.world.outdoors.poolFixtures[0].fixtureId,old.fixtureId);
    assert.equal(next.world.outdoors.poolFixtures[0].side,expected);
    assert.equal(next.shop.credits,root.shop.credits);
    root=next;
  }
});

test('watering follows the occupied bed and only the using phase',()=>{
  const world={outdoors:{features:[{instanceId:'lot-1',itemId:'garden.herb.mint',x:2,z:3}]}};
  const actor={position:{x:2,z:4},action:{id:'garden',gardenActionId:'water',targetInstanceId:'lot-1',
    phase:'walking',elapsed:0}};
  assert.equal(wateringFrame(world,actor),null);
  actor.action.phase='using';assert.equal(wateringFrame(world,actor).weight,0);
  actor.action.elapsed=6;assert.equal(wateringFrame(world,actor).weight,1);
  assert.equal(wateringFrame(world,actor).yaw,180);
  actor.action.gardenActionId='inspect';assert.equal(wateringFrame(world,actor),null);
});
