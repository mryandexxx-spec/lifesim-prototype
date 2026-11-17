import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newConstructionWorld,restoreConstructionWorld,proposeConstructionEdit,
  createConstructionEditor} from '../src/construction.js';
import {ROOF_STYLES,ROOF_MATERIALS,roofMeshGeometry,roofContains,
  automaticRoofRects,roofAutomaticModules} from '../src/roof-construction.js';
const edit=(w,command)=>{
  const r=proposeConstructionEdit(w,command);
  assert.equal(r.ok,true,r.reason);return r.world;
};
const cfg={styleId:'roof.gable',materialId:'roof.slate',pitch:.38,eaves:.4};

test('F5-C.1 pristine legacy v1 save has no roof or roof-auto migration',()=>{
  const old=newConstructionWorld();
  assert.deepEqual(old.roofModules,[]);
  assert.equal(Object.hasOwn(old,'roofAuto'),false);
  const next=restoreConstructionWorld({...old,roofModules:[]});
  assert.deepEqual(next.roofModules,[]);
  assert.equal(Object.hasOwn(next,'roofAuto'),false);
  assert.deepEqual(next.materials,{floor:{},wall:{}});
});

test('F5-C.1 automatic roof covers entire original home in one module, persists',()=>{
  const home=newConstructionWorld();
  const full=edit(home,{type:'roof-auto',...cfg});
  assert.equal(full.roofAuto,true);
  assert.equal(full.roofModules.length,1);
  assert.deepEqual([full.roofModules[0].i0,full.roofModules[0].i1,
    full.roofModules[0].j0,full.roofModules[0].j1],[-10,28,-9,9]);
  assert.deepEqual(restoreConstructionWorld(JSON.parse(JSON.stringify(full))).roofModules,
    full.roofModules);
  assert.deepEqual(home.roofModules,[]);
  assert.equal(proposeConstructionEdit(full,{type:'roof-auto',...cfg}).reason,'unchanged');
});

test('F5-C.1 four roof profiles make finite, nonflat real 3D geometry',()=>{
  assert.equal(Object.keys(ROOF_STYLES).length,4);
  assert.equal(Object.keys(ROOF_MATERIALS).length,4);
  for(const styleId of Object.keys(ROOF_STYLES)){
    const data=roofMeshGeometry({i0:-10,i1:28,j0:-9,j1:9,
      ...cfg,styleId});
    assert.ok(data.triangleCount>=2);
    assert.equal(data.positions.length,data.indices.length*3);
    assert.ok(data.positions.every(Number.isFinite));
    assert.ok(data.maxY>=data.minY);
    if(styleId!=='roof.flat')assert.ok(data.maxY>3.07,styleId);
  }
  const gentle=roofMeshGeometry({...cfg,styleId:'roof.gable',
    i0:-10,i1:28,j0:-9,j1:9,pitch:.24});
  const steep=roofMeshGeometry({...cfg,styleId:'roof.gable',
    i0:-10,i1:28,j0:-9,j1:9,pitch:.55});
  assert.ok(steep.maxY>gentle.maxY);
});

test('F5-C.1 auto sections follow added room and original-wall expansion',()=>{
  const room=edit(newConstructionWorld(),{type:'room',
    from:{x:14,z:-2},to:{x:18,z:2}});
  const roof=edit(room,{type:'roof-auto',...cfg});
  const covered=new Set();
  for(const m of roof.roofModules)
    for(let j=m.j0;j<m.j1;j++)for(let i=m.i0;i<m.i1;i++){
      const key=i+','+j;
      assert.ok(!covered.has(key),'roof sections must not overlap');
      covered.add(key);
    }
  assert.equal(covered.size,roof.floorCells.length);
  assert.ok(roof.roofModules.some(m=>m.i1===36));
  const expanded=edit(roof,{type:'move-wall',
    edgeId:'starter:west:0',deltaI:-1,deltaJ:0});
  assert.equal(expanded.roofAuto,true);
  assert.ok(expanded.roofModules.some(m=>m.i0===-11));
  assert.deepEqual(restoreConstructionWorld(expanded).roofModules,expanded.roofModules);
});

test('F5-C.1 manual roofing edit, remove, overlap reject, undo/redo',()=>{
  const room=edit(newConstructionWorld(),{type:'room',
    from:{x:14,z:-2},to:{x:18,z:2}});
  const session=createConstructionEditor(room);
  const add=session.commit({type:'roof-add',from:{x:14,z:-2},to:{x:18,z:2},...cfg});
  assert.equal(add.ok,true,add.reason);
  const entry=add.world.roofModules[0];
  assert.ok(roofContains(entry,{x:16,z:0}));
  assert.equal(session.commit({type:'roof-add',
    from:{x:15,z:-1},to:{x:18,z:2},...cfg}).reason,'roof-overlap');
  const update=session.commit({type:'roof-update',id:entry.id,
    ...cfg,styleId:'roof.hip',materialId:'roof.clay',pitch:.55,eaves:.6});
  assert.equal(update.ok,true,update.reason);
  assert.equal(update.world.roofModules[0].id,entry.id);
  assert.equal(update.world.roofModules[0].styleId,'roof.hip');
  const remove=session.commit({type:'roof-remove',at:{x:16,z:0}});
  assert.equal(remove.ok,true,remove.reason);
  assert.equal(remove.world.roofModules.length,0);
  assert.equal(session.undo().world.roofModules[0].styleId,'roof.hip');
  assert.equal(session.redo().world.roofModules.length,0);
});

test('F5-C.1 roof footprint validator rejects void and corrupt saves sanely',()=>{
  const home=newConstructionWorld();
  assert.equal(proposeConstructionEdit(home,{type:'roof-add',
    from:{x:15,z:-2},to:{x:18,z:2},...cfg}).reason,'roof-needs-floor');
  assert.equal(proposeConstructionEdit(home,{type:'roof-add',
    from:{x:0,z:0},to:{x:.5,z:.5},...cfg}).reason,'invalid-roof-rectangle');
  assert.equal(proposeConstructionEdit(home,{type:'roof-auto',
    ...cfg,styleId:'roof.invalid'}).reason,'unknown-roof-style');
  const auto=edit(home,{type:'roof-auto',...cfg});
  const bad=restoreConstructionWorld({...auto,roofAuto:false,roofModules:[
    {...auto.roofModules[0],materialId:'roof.invalid'}
  ]});
  assert.deepEqual(bad.roofModules,[]);
  assert.deepEqual(bad.floorCells,auto.floorCells);
});

test('F5-C.1 manual roofs block floor demolition until section removed',()=>{
  let home=edit(newConstructionWorld(),{type:'room',
    from:{x:14,z:-2},to:{x:18,z:2}});
  home=edit(home,{type:'roof-add',from:{x:14,z:-2},to:{x:18,z:2},...cfg});
  assert.equal(proposeConstructionEdit(home,{type:'remove-floor',
    from:{x:16,z:-1},to:{x:18,z:1}}).reason,'roof-needs-floor');
  home=edit(home,{type:'roof-clear'});
  assert.equal(home.roofModules.length,0);
  assert.equal(edit(home,{type:'remove-floor',
    from:{x:16,z:-1},to:{x:18,z:1}}).floorCells.length<home.floorCells.length,true);
});

test('F5-C.1 web editor binds real roof controls and build-only meshes',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  for(const id of ['roof-auto','roof-add','roof-edit','roof-remove','roof-clear',
    'build-roof-picker','build-roof-toggle','build-roof-pitch','build-roof-eaves'])
    assert.ok(html.includes(id),id);
  assert.match(game,/if\(!buildMode\|\|!roofPreview\)return/);
  assert.match(game,/new pc.Mesh\(app.graphicsDevice\)/);
  assert.match(game,/roofMeshes\)mesh.destroy\(\)/);
  assert.match(game,/buildMode=false;ceilingPreview=false;roofPreview=false/);
  assert.match(html,/f5c1/);
});

test('F5-C.1 automatic rectangles are deterministic and never overlap',()=>{
  const first=newConstructionWorld();
  const a=automaticRoofRects(first.floorCells);
  const b=automaticRoofRects([...first.floorCells].reverse());
  assert.deepEqual(a,b);
  assert.deepEqual(roofAutomaticModules(first.floorCells,cfg).length,1);
});
