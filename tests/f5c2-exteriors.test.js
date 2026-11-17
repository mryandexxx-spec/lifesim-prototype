import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newConstructionWorld,restoreConstructionWorld,proposeConstructionEdit,
  createConstructionEditor,constructionContains,constructionWallAt,
  constructionExteriorSegments,constructionPorches,
  BUILD_WALL_HEIGHTS,BUILD_FACADE_FINISHES,BUILD_PORCH_FINISHES}
  from '../src/construction.js';
import {roofMeshGeometry} from '../src/roof-construction.js';
import {isWalkable} from '../src/navigation.js';
const op=(before,cmd)=>{
  const result=proposeConstructionEdit(before,cmd);
  assert.equal(result.ok,true,JSON.stringify({cmd,reason:result.reason}));
  return result.world;
};
const cfg={type:'roof-auto',styleId:'roof.gable',materialId:'roof.slate',pitch:.38,eaves:.4};
const setup=()=>{
  let world=op(newConstructionWorld(),{type:'room',
    from:{x:14,z:-2},to:{x:18,z:2}});
  const outer=world.wallEdges.find(e=>e.axis==='v'&&e.i===36&&e.j===0);
  assert.ok(outer);
  world=op(world,{type:'door',edgeId:outer.id});
  return {world,outer,door:world.openings.at(-1)};
};
const entrance=(world,door,extra={})=>({type:'porch-add',openingId:door.id,
  depthSections:3,materialId:'porch.stone',...extra});

test('F5-C.2 legacy v1 housing stays compatible: no exterior state on pristine save',()=>{
  const old=newConstructionWorld();
  const next=restoreConstructionWorld(JSON.parse(JSON.stringify(old)));
  assert.deepEqual(next.materials,{floor:{},wall:{}});
  assert.equal(next.wallHeightClass,undefined);
  assert.equal(next.porches,undefined);
  assert.equal(next.floorCells.length,old.floorCells.length);
  assert.equal(next.legacy,true);
});

test('F5-C.2 exactly three immutable heights and six original facade samples',()=>{
  assert.deepEqual(Object.keys(BUILD_WALL_HEIGHTS),['low','normal','tall']);
  assert.deepEqual(Object.values(BUILD_WALL_HEIGHTS).map(h=>h.value),[2.6,2.9,3.4]);
  assert.equal(Object.keys(BUILD_FACADE_FINISHES).length,6);
  assert.equal(Object.keys(BUILD_PORCH_FINISHES).length,3);
});

test('F5-C.2 height update is true v1 geometry; undo preserves original roofs',()=>{
  const initial=op(newConstructionWorld(),cfg),session=createConstructionEditor(initial);
  const low=session.commit({type:'set-wall-height',heightClass:'low'});
  assert.equal(low.ok,true,low.reason);
  assert.equal(low.world.wallHeightClass,'low');
  assert.deepEqual(low.world.roofModules,initial.roofModules);
  const tall=session.commit({type:'set-wall-height',heightClass:'tall'});
  assert.equal(tall.ok,true,tall.reason);
  const m=tall.world.roofModules[0];
  const roofLow=roofMeshGeometry(m,{wallHeight:2.6}),
    roofTall=roofMeshGeometry(m,{wallHeight:3.4});
  assert.ok(roofTall.minY>roofLow.minY);
  assert.ok(roofTall.maxY>roofLow.maxY);
  assert.equal(session.undo().world.wallHeightClass,'low');
  assert.equal(session.redo().world.wallHeightClass,'tall');
  assert.equal(restoreConstructionWorld(tall.world).wallHeightClass,'tall');
  const reset=op(tall.world,{type:'set-wall-height',heightClass:'normal'});
  assert.equal(reset.wallHeightClass,undefined);
  assert.equal(proposeConstructionEdit(reset,{type:'set-wall-height',
    heightClass:'not-real'}).reason,'unknown-wall-height');
});

test('F5-C.2 whole facade exterior excludes interior partition and cutaway',()=>{
  const home=newConstructionWorld();
  const walls=constructionExteriorSegments(home);
  assert.ok(walls.length>20);
  assert.ok(walls.every(w=>w.starterSide==='north'||w.starterSide==='west'));
  const painted=op(home,{type:'paint-facade',scope:'all',materialId:'facade.brick'});
  assert.ok(Object.keys(painted.materials.facade).length>20);
  assert.deepEqual(painted.materials.floor,{});
  assert.deepEqual(painted.materials.wall,{});
  assert.equal(painted.legacy,true);
  const restored=restoreConstructionWorld(JSON.parse(JSON.stringify(painted)));
  assert.deepEqual(restored.materials.facade,painted.materials.facade);
  assert.equal(proposeConstructionEdit(painted,{type:'paint-facade',
    scope:'all',materialId:'facade.brick'}).reason,'unchanged');
});

test('F5-C.2 facade segments paint independently and can be reset',()=>{
  const {world,outer}=setup();
  const exterior=constructionExteriorSegments(world);
  assert.ok(exterior.some(e=>e.id===outer.id));
  const one=op(world,{type:'paint-facade',scope:'segment',
    edgeId:outer.id,materialId:'facade.timber'});
  assert.equal(one.materials.facade[outer.id],'facade.timber');
  assert.equal(Object.keys(one.materials.facade).length,1);
  const reset=op(one,{type:'paint-facade',scope:'segment',
    edgeId:outer.id,materialId:'facade.default'});
  assert.equal(reset.materials.facade,undefined);
  assert.equal(proposeConstructionEdit(world,{type:'paint-facade',
    scope:'segment',edgeId:'h:0,0',materialId:'facade.stone'}).reason,'not-exterior-wall');
});

test('F5-C.2 facade finish follows moved new exterior wall, not interior',()=>{
  let home=op(newConstructionWorld(),{type:'room',
    from:{x:14,z:-2},to:{x:18,z:2}});
  const west=home.wallEdges.find(e=>e.axis==='v'&&e.i===36&&e.j===0);
  home=op(home,{type:'paint-facade',scope:'segment',
    edgeId:west.id,materialId:'facade.stone'});
  const moved=op(home,{type:'move-wall',edgeId:west.id,deltaI:1,deltaJ:0});
  assert.equal(moved.materials.facade['v:37,0'],'facade.stone');
  assert.equal(moved.materials.facade[west.id],undefined);
  assert.equal(restoreConstructionWorld(moved).materials.facade['v:37,0'],'facade.stone');
});

test('F5-C.2 true external door accepts navigable 1.5m porch, keeps roof indoor',()=>{
  const {world,door}=setup();
  const withRoof=op(world,cfg);
  const porch=op(withRoof,entrance(withRoof,door));
  const entries=constructionPorches(porch);
  assert.equal(entries.length,1);
  assert.equal(entries[0].footprint.axis,'v');
  assert.equal(entries[0].footprint.outward,1);
  assert.ok(entries[0].footprint.cells.every(k=>!porch.floorCells.includes(k)));
  assert.equal(constructionContains(porch,18.6,0),true);
  assert.equal(constructionWallAt(porch,18,0),false,'actual door must stay a passage');
  assert.equal(isWalkable(18.6,0,porch),true,'entrance deck traversable');
  assert.deepEqual(porch.roofModules,withRoof.roofModules,
    'automatic indoor roof must not cover outdoor porch');
  const restored=restoreConstructionWorld(JSON.parse(JSON.stringify(porch)));
  assert.deepEqual(restored.porches,porch.porches);
  assert.equal(constructionContains(restored,18.6,0),true);
});

test('F5-C.2 invalid entrances reject overlap and missing door',()=>{
  const {world,door}=setup();
  const porch=op(world,entrance(world,door));
  assert.equal(proposeConstructionEdit(porch,entrance(porch,door)).reason,'porch-exists');
  assert.equal(proposeConstructionEdit(porch,{type:'remove-opening',id:door.id})
    .reason,'porch-needs-exterior-door');
  assert.equal(proposeConstructionEdit(porch,{type:'change-opening',
    id:door.id,styleId:'window.classic'}).reason,'porch-needs-exterior-door');
  assert.equal(proposeConstructionEdit(world,entrance(world,door,{
    materialId:'porch.fake'})).reason,'unknown-porch');
  const bad=restoreConstructionWorld({...porch,porches:[{
    ...porch.porches[0],depthSections:900
  }]});
  assert.equal(bad.porches,undefined);
  assert.deepEqual(bad.floorCells,porch.floorCells);
});

test('F5-C.2 porch remove returns old floor nav and undo restores it',()=>{
  const {world,door}=setup(),session=createConstructionEditor(world);
  const made=session.commit(entrance(world,door));
  assert.equal(made.ok,true,made.reason);
  assert.equal(constructionContains(made.world,18.6,0),true);
  const removed=session.commit({type:'porch-remove',openingId:door.id});
  assert.equal(removed.ok,true,removed.reason);
  assert.equal(constructionContains(removed.world,18.6,0),false);
  assert.equal(session.undo().world.porches.length,1);
  assert.equal(session.redo().world.porches,undefined);
  assert.equal(proposeConstructionEdit(removed.world,{type:'porch-remove',
    openingId:door.id}).reason,'porch-not-found');
});

test('F5-C.2 facade/porch/wall-height are pure and reject unsafe values',()=>{
  const {world,door}=setup();
  const before=JSON.stringify(world);
  assert.equal(proposeConstructionEdit(world,{type:'paint-facade',
    scope:'all',materialId:'facade.unknown'}).reason,'unknown-facade');
  assert.equal(proposeConstructionEdit(world,{type:'set-wall-height',
    heightClass:'taller'}).reason,'unknown-wall-height');
  assert.equal(proposeConstructionEdit(world,entrance(world,door,{
    depthSections:50})).reason,'porch-needs-exterior-door');
  assert.equal(JSON.stringify(world),before,'all edits are immutable before Apply');
});

test('F5-C.2 real phone UI exposes finish, height, porch and cutaway controls',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  for(const id of ['paint-facade','paint-facade-all','wall-height','porch-add',
    'porch-remove','build-height-picker','build-height-choices',
    'build-porch-picker','build-porch-choices','build-porch-depth'])
    assert.ok(html.includes(id),id);
  assert.match(game,/roofMeshGeometry\(roof,\{wallHeight\}\)/);
  assert.match(game,/renderConstructionPorches\(state\)/);
  assert.match(game,/drawConstructionFacades\(state\)/);
  assert.match(game,/constructionWallMode='cut'/);
  assert.match(html,/f5c2/);
});
