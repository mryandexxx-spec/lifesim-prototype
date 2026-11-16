import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readingMotion,createMeshyReadingController} from '../src/meshy-reading-runtime.js';
import {canShowMeshy} from '../src/meshy-visual-policy.js';
import {canShowMiraMeshy} from '../src/meshy-mira-policy.js';
const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('H1 Meshy book gesture is deterministic from real action minutes',()=>{
  for(const value of [null,undefined,false,0,'',NaN,42]) {
    assert.doesNotThrow(()=>readingMotion(value));
    assert.equal(readingMotion(value),null);
  }
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
    assert.match(code,/state\.readingRuntime\?\.setFrame\(readingStage\|\|actionId==='hobby'/);
    assert.match(code,/if\(actionId==='hobby'\)/);
  }
  assert.match(game,/miraMeshShown&&\(miraUseId==='sofa'\|\|game\.otherSim\.action\?\.id==='hobby'\)/);
  assert.match(game,/meshyShown&&\(useId==='sofa'\|\|game\.action\?\.id==='hobby'\)/);
  const workflow=source('../.github/workflows/pages.yml');
  assert.match(workflow,/node --check src\/meshy-reading-runtime\.js/);
  assert.match(workflow,/cp src\/meshy-reading-runtime\.js site\/src\//);
  assert.match(source('../index.html'),/src\/game\.js\?v=1\.2t-seated-reader/);
  for(const code of [alex,mira])assert.match(code,/meshy-reading-runtime\.js\?v=1\.2t/);
});

test('P0 Safari boot: loaded Meshy reading controller accepts idle, reset and reload frames',()=>{
  // Exercise the REAL controller entry point. Prior headless tests only called
  // readingMotion(active=true), missing the first-frame setFrame(null) crash.
  class Vec3 {
    constructor(x=0,y=0,z=0){this.set(x,y,z);}
    set(x,y,z){Object.assign(this,{x,y,z});return this;}
    length(){return Math.hypot(this.x,this.y,this.z);}
    normalize(){const n=this.length()||1;this.x/=n;this.y/=n;this.z/=n;return this;}
    dot(v){return this.x*v.x+this.y*v.y+this.z*v.z;}
  }
  class Quat {
    setFromDirections(){return this;}
    mul2(){return this;}
    slerp(){return this;}
    setFromEulerAngles(){return this;}
  }
  const transform={
    transformPoint:(v,target)=>target.set(v.x,v.y,v.z),
    transformVector:(v,target)=>target.set(v.x,v.y,v.z)
  };
  class Entity {
    constructor(name){this.name=name;this.children=[];this.enabled=true;}
    addChild(child){this.children.push(child);}
    addComponent(){this.render=true;}
    setLocalPosition(x,y,z){this.position={x,y,z};}
    setPosition(x,y,z){this.position={x,y,z};}
    setEulerAngles(x,y,z){this.euler={x,y,z};}
    setLocalEulerAngles(x,y,z){this.euler={x,y,z};}
    setLocalScale(x,y,z){this.scale={x,y,z};}
    getWorldTransform(){return transform;}
  }
  class StandardMaterial {update(){}}
  class Color {constructor(r,g,b){Object.assign(this,{r,g,b});}}
  const pc={Entity,Vec3,Quat,StandardMaterial,Color};
  const bones=new Map();
  for(const side of ['Left','Right'])
    for(const [part,pos] of [
      ['Arm',[side==='Left'?-.25:.25,1.4,0]],
      ['ForeArm',[side==='Left'?-.30:.30,1.1,0]],
      ['Hand',[side==='Left'?-.32:.32,.9,.12]]
    ])bones.set('mixamorig:'+side+part,{
      getPosition:()=>new Vec3(...pos),getRotation:()=>new Quat(),
      setRotation(){},getLocalRotation:()=>new Quat(),setLocalRotation(){}
    });
  const model=new Entity('mesh');
  model.findByName=name=>bones.get(name)||null;
  const avatar=new Entity('game root');
  for(const resident of ['Alex','Mira']){
    const controller=createMeshyReadingController({pc,model,avatar,resident});
    assert.equal(controller.ready,true);
    const book=model.children.at(-1);
    const closed=book.children.find(e=>e.name==='closed hardcover');
    const openCover=book.children.find(e=>e.name==='open green cover');
    const leftPage=book.children.find(e=>e.name==='left story pages');
    const rightPage=book.children.find(e=>e.name==='right story pages');
    assert.ok(closed&&openCover&&leftPage&&rightPage);
    assert.equal(closed.children.length,4,'closed hardcover is a solid, single-volume book');
    const front=closed.children.find(e=>e.name==='front green cover');
    assert.ok(front.scale.x<.3,'closed book width is less than a single spread');
    // Immediately after GLB load there is NO reading activity at all.
    for(const frame of [null,undefined,{active:false},{active:true,elapsed:0}]){
      assert.doesNotThrow(()=>controller.setFrame(frame));
      assert.equal(controller.apply(),false);
    }
    assert.equal(book.enabled,true,'valid zero-minute activity still has a prop');
    controller.setFrame({active:true,elapsed:6});
    assert.equal(book.enabled,true);
    assert.doesNotThrow(()=>controller.apply());
    controller.setFrame({active:true,elapsed:6},true);
    assert.equal(controller.apply(),false,'pause is truly read-only for skinned bones');
    controller.setFrame(null);
    assert.equal(book.enabled,false);
    assert.equal(controller.apply(),false);
    // The real H1n stages must swap GEOMETRY, not merely hide white
    // pages while retaining a double-width, flat green open cover.
    for(const stage of ['taking','toSeat','sitting','standing','returnShelf','returning']){
      controller.setFrame({active:true,stage,elapsed:0,stepElapsed:1.2});
      assert.equal(book.enabled,true,stage+' keeps borrowed book visible');
      assert.equal(closed.enabled,true,stage+' displays the compact hardcover');
      assert.equal(openCover.enabled,false,stage+' hides the entire open cover');
      assert.equal(leftPage.enabled,false,stage+' hides open pages');
      assert.equal(rightPage.enabled,false,stage+' hides open pages');
      assert.doesNotThrow(()=>controller.apply(),stage+' follows the right hand');
      assert.equal(book.euler.x,67,'carry pose tilts the closed book, not a flat spread');
    }
    controller.setFrame({active:true,stage:'opening',elapsed:0,stepElapsed:0});
    assert.equal(closed.enabled,true,'book starts closed while sitting');
    controller.setFrame({active:true,stage:'opening',elapsed:0,stepElapsed:1.2});
    assert.equal(closed.enabled,false,'opening switches to actual double-page model');
    assert.equal(openCover.enabled,true);
    assert.equal(leftPage.enabled,true);
    assert.equal(rightPage.enabled,true);
    controller.setFrame({active:true,stage:'reading',elapsed:6});
    assert.equal(closed.enabled,false,'only seated reading uses the open book');
    assert.equal(openCover.enabled,true);
    assert.doesNotThrow(()=>controller.apply());
    controller.setFrame({active:true,stage:'closing',elapsed:36,stepElapsed:2.4});
    assert.equal(closed.enabled,true,'closing completes with hardcover shut');
    assert.equal(openCover.enabled,false,'no flat cover after closing');
    controller.setFrame({active:true,stage:'returnShelf',elapsed:36});
    assert.doesNotThrow(()=>controller.apply());
    assert.equal(closed.enabled,true,'book remains closed on return route');
    assert.equal(openCover.enabled,false);
    controller.setFrame({active:true,elapsed:6});
    assert.equal(book.enabled,true,'same rig can restart after stopping');
    controller.setFrame();
    assert.equal(book.enabled,false,'reset/no frame never crashes renderer');
    assert.equal(closed.enabled,false,'no ghost book after cancellation');
    assert.equal(openCover.enabled,false,'no ghost open spread after cancellation');
  }
});
