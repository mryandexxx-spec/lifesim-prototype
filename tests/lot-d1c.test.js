/** LOT-D1c: freeform bowl render topology is deterministic and no pool = legacy lawn. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPoolVisualGeometry,poolFixtureVisualPose} from '../src/pool-visual.js';
import {poolCellIndex,poolCellBounds} from '../src/pool-topology.js';
import {newHousehold} from '../src/household.js';
import {previewPoolTiles,previewPoolFixture,commitPoolPreview} from '../src/pool-editor.js';

const quads=group=>group.indices.length/6;
const at=poolCellIndex(7.25,-7.25);
const geometry=cells=>buildPoolVisualGeometry({pools:cells.length?[{poolId:'pool-1',cells}]:[]});

test('D1c: empty pool keeps original lawn untouched, no new render geometry',()=>{
  const g=geometry([]);
  assert.equal(g.active,false);
  for(const group of Object.values(g.groups))assert.equal(group.indices.length,0);
});
test('D1c: L shape cuts exact lawn tiles and produces only exterior walls',()=>{
  const g=geometry([at,at+1,at+64]);
  assert.equal(g.active,true);
  assert.equal(g.waterCells,3);
  assert.equal(quads(g.groups.lawn),3072-3);
  assert.equal(quads(g.groups.water),3);
  assert.equal(quads(g.groups.floor),3);
  assert.equal(g.boundaryEdges,8);
  assert.equal(quads(g.groups.walls),8);
  assert.equal(quads(g.groups.rim),8);
  for(const group of Object.values(g.groups)){
    assert.equal(group.vertices.length,group.normals.length);
    assert.ok(group.vertices.every(Number.isFinite));
    assert.ok(group.indices.every(i=>i>=0&&i<group.vertices.length/3));
  }
});
test('D1c: concave 512-cell tile budget remains five batched groups',()=>{
  const cells=Array.from({length:512},(_,i)=>i);
  const g=geometry(cells);
  assert.equal(g.waterCells,512);
  assert.equal(quads(g.groups.lawn),2560);
  assert.equal(quads(g.groups.water),512);
  assert.equal(Object.keys(g.groups).length,5);
});
test('D1c: fixture visuals derive ONLY from canonical edge and never move collision',()=>{
  const b=poolCellBounds(at);
  const p=poolFixtureVisualPose({edgeCell:at,side:'west'});
  assert.equal(p.x,b.minX);
  assert.equal(p.z,(b.minZ+b.maxZ)/2);
  assert.equal(p.dx,1);
  assert.equal(p.tx,0);
  assert.equal(poolFixtureVisualPose({edgeCell:-1,side:'west'}),null);
});
test('D1c: saved water stays on same root-v1; visuals never create exits',()=>{
  const root=newHousehold();root.shop.credits=10000;
  const preview=previewPoolTiles(root,{operation:'paint',cells:[at,at+1,at+64]});
  assert.equal(preview.ok,true,preview.reason);
  const result=commitPoolPreview(root,preview);
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.root.version,1);
  assert.equal(result.root.world.outdoors.pools.length,1);
  assert.deepEqual(result.root.world.outdoors.poolFixtures,[]);
  assert.equal(geometry(result.root.world.outdoors.pools[0].cells).boundaryEdges,8);
  const bad=previewPoolFixture(result.root,{operation:'fixture-add',
    kind:'board',edgeCell:at,side:'west'});
  assert.equal(bad.ok,false,'low board needs true 2m water landing');
});
