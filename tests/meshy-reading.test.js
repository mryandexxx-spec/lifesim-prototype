import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readingMotion,createMeshyReadingController} from '../src/meshy-reading-runtime.js';
import {canShowMeshy} from '../src/meshy-visual-policy.js';
import {canShowMiraMeshy} from '../src/meshy-mira-policy.js';
const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('H1 Meshy book gesture is deterministic from real action minutes',()=>{
  assert.equal(readingMotion({active:false,elapsed:8}),null);
  for(const elapsed of [-1,NaN,Infinity])assert.equal(readingMotion({active:true,elapsed}),null);
  assert.deepEqual(readingMotion({active:true,elapsed:0}),{weight:0,pageTurn:0});
  assert.equal(readingMotion({active:true,elapsed:2}).weight,1);
  assert.equal(readingMotion({active:true,elapsed:12}).weight,1);
  assert.ok(Math.abs(readingMotion({active:true,elapsed:5.9}).pageTurn-1)<1e-9);
  const first=readingMotion({active:true,elapsed:5.9});
  const second=readingMotion({active:true,elapsed:12.9});
  assert.ok(Math.abs(first.pageTurn-second.pageTurn)<1e-9);
});
test('H1 Meshy book gate prevents unsupported skeletons for both residents',()=>{
  for(const gate of [canShowMeshy,canShowMiraMeshy]){
    const ready={preferred:true,ready:true,actionId:'hobby'};
    assert.equal(gate(ready),false);
    assert.equal(gate({...ready,readingReady:true}),true);
    assert.equal(gate({...ready,readingReady:true,ready:false}),false);
    assert.equal(gate({...ready,readingReady:true,bedBusy:true}),false);
    assert.equal(gate({...ready,readingReady:true,showerBusy:true}),false);
    assert.equal(gate({...ready,readingReady:true,fridgeBusy:true}),false);
    assert.equal(gate({...ready,readingReady:true,preferred:false}),false);
    assert.equal(gate({...ready,actionId:'other',readingReady:true}),false);
  }
});
test('missing skeleton or incompatible runtime cannot claim reading ready',()=>{
  assert.equal(createMeshyReadingController({}).ready,false);
  const fake={Entity:class{},Vec3:class{},Quat:class{},Color:class{},
    StandardMaterial:class{}};
  assert.equal(createMeshyReadingController({pc:fake,
    model:{findByName(){return null;},getWorldTransform(){}},
    avatar:{getWorldTransform(){}}}).ready,false);
});
test('both Meshy visuals mount post-Anim controller and hide obsolete elbow book',()=>{
  const alex=source('../src/meshy-visual.js');
  const mira=source('../src/meshy-mira-visual.js');
  const game=source('../src/game.js');
  for(const code of [alex,mira]){
    assert.match(code,/createMeshyReadingController/);
    assert.match(code,/readingReady:Boolean\(state\.readingRuntime\?\.ready\)/);
    assert.match(code,/state\.readingRuntime\?\.setFrame\(actionId==='hobby'/);
    assert.match(code,/if\(actionId==='hobby'\)/);
  }
  assert.match(game,/miraMeshShown&&\(miraUseId==='sofa'\|\|miraUseId==='hobby'\)/);
  assert.match(game,/meshyShown&&\(useId==='sofa'\|\|useId==='hobby'\)/);
  const workflow=source('../.github/workflows/pages.yml');
  assert.match(workflow,/node --check src\/meshy-reading-runtime\.js/);
  assert.match(workflow,/cp src\/meshy-reading-runtime\.js site\/src\//);
});
