import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bedTransitionPose} from '../src/bed-transition.js';
import {fridgeSequence} from '../src/fridge-interaction.js';
import {showerSequence,advanceShowerTransition,showerPrivacyInvariant}
  from '../src/shower-interaction.js';
import {meshyShowerPose,MESHY_SHOWER_BONES,showerWalkClipTime}
  from '../src/meshy-shower-runtime.js';
import {MIRA_MESHY_URL,MIRA_REQUIRED_CLIPS,MIRA_DISPLAY_HEIGHT,
  MIRA_IDLE_GROUND_OFFSET,miraHasClips,miraClipFor,
  miraMeshPlacement,canShowMiraMeshy} from '../src/meshy-mira-policy.js';
import {createMiraMeshyVisual,miraStaticSourceBounds} from '../src/meshy-mira-visual.js';
import {MIRA_SOFA_CLIP,MIRA_SOFA_DURATION,MIRA_IDLE_HIP,MIRA_SOFA_HIPS,
  miraSofaClipTime,miraSofaHipAt,miraSofaOffset} from '../src/meshy-mira-sofa.js';
import {MIRA_SLEEP_CLIP,MIRA_SLEEP_DURATION,
  MIRA_SLEEP_HIPS_TRANSLATIONS,MIRA_SLEEP_HIPS_ROTATIONS,
  miraSleepHipAt,miraSleepHipsRotationAt,miraBedPose} from '../src/meshy-mira-bed.js';

const validBounds={min:{x:-.3,y:0,z:-.15},max:{x:.3,y:1.7,z:.15}};
test('female source asset has its own clips and separate 2.05 game-height placement',()=>{
  assert.equal(MIRA_MESHY_URL,'./assets/characters/meshy-mira-mobile-v1.glb');
  assert.equal(MIRA_DISPLAY_HEIGHT,2.05);
  assert.ok(miraHasClips(['Running',...MIRA_REQUIRED_CLIPS]));
  assert.equal(miraHasClips(['Idle_3','Walking']),false);
  assert.equal(miraClipFor({}),'Idle_7');
  assert.equal(miraClipFor({walking:true}),'Walking_Woman');
  assert.equal(miraClipFor({social:'talk'}),'Listening_Gesture');
  assert.equal(miraClipFor({social:'argue'}),'Hand_on_Hip_Gesture');
  const fit=miraMeshPlacement(validBounds);
  assert.ok(Math.abs(fit.scale*1.7-2.05)<1e-10);
  assert.equal(fit.y,MIRA_IDLE_GROUND_OFFSET);
  assert.deepEqual(miraMeshPlacement(validBounds),fit);
  assert.throws(()=>miraMeshPlacement({min:{x:0,y:1,z:0},max:{x:0,y:1,z:0}}),RangeError);
});
test('female visuals use a guarded authored sofa, but retain fallback elsewhere',()=>{
  const ready={preferred:true,ready:true};
  assert.equal(canShowMiraMeshy(ready),true);
  assert.equal(canShowMiraMeshy({...ready,ready:false}),false);
  for(const name of ['sofa','bed','fridge','shower'])
    assert.equal(canShowMiraMeshy({...ready,actionId:name}),false);
  assert.equal(canShowMiraMeshy({...ready,actionId:'sofa',sofaReady:true}),true);
  assert.equal(canShowMiraMeshy({...ready,sofaBusy:true,sofaReady:true}),true);
  assert.equal(canShowMiraMeshy({...ready,sofaBusy:true,sofaReady:false}),false);
  assert.equal(canShowMiraMeshy({...ready,actionId:'bed',bedReady:true}),true);
  assert.equal(canShowMiraMeshy({...ready,bedBusy:true,bedReady:true}),true);
  assert.equal(canShowMiraMeshy({...ready,bedBusy:true,bedReady:false}),false);
  for(const busy of ['sofaBusy','bedBusy','fridgeBusy','showerBusy'])
    assert.equal(canShowMiraMeshy({...ready,[busy]:true}),false);
  assert.equal(canShowMiraMeshy({...ready,preferred:false}),false);
});
function fixture({loadError=false,missingClip=false,noStaticBounds=false,
  sofaClip=false,sofaDuration=MIRA_SOFA_DURATION,
  bedClips=false,bedDuration=MIRA_SLEEP_DURATION,missingHip=false,
  fridgeBones=false,missingFridgeHand=false,
  showerBones=false,missingShowerBone=false,walkDuration=1.8}={}){
  const events=[];
  class Entity{
    constructor(name){this.name=name;this.enabled=true;this.children=[];}
    addChild(child){this.children.push(child);child.parent=this;}
    destroy(){this.destroyed=true;}
    findComponents(type){return type==='render'?this.renderers||[]:[];}
    setLocalScale(...s){this.scale=s;}
    setLocalPosition(...p){this.position=p;}
    addComponent(type){
      if(type==='render'){
        this.renderComponent={enabled:true};
        return;
      }
      if(type==='script'){
        this.script={instances:[],create:(Script)=>{
          const instance=new Script();
          this.script.instances.push(instance);
          return instance;
        }};
        return;
      }
      assert.equal(type,'anim');
      this.anim={playing:false,assignAnimation:(name)=>events.push(['assign',name]),
        baseLayer:{play:(name)=>events.push(['play',name]),
          transition:(name)=>events.push(['transition',name])}};
    }
  }
  const selection=new Entity('ring'),snack=new Entity('snack'),book=new Entity('book'),showerWrap=new Entity('cover'),body=new Entity('body');
  const renderers=[body,selection,snack,book,showerWrap].map(entity=>({entity,enabled:true}));
  const avatar=new Entity('Mira');avatar.renderers=renderers;
  const rig={avatar,selected:selection,snack,book,showerWrap};
  avatar.getWorldTransform=()=>({transformVector:(v,out)=>out.set(v.x,v.y,v.z)});
  const model=new Entity('Meshy Mira');
  if(bedClips){
    const hip={rotation:null,setLocalRotation(q){
      this.rotation={x:q.x,y:q.y,z:q.z,w:q.w};}};
    model.findByName=name=>name==='mixamorig:Hips'&&!missingHip?hip:null;
    model.mockHip=hip;
  }
  if(showerBones){
    const showerJoints=Object.fromEntries(MESHY_SHOWER_BONES.map(name=>[
      name,{angles:[],getLocalRotation:()=>new Quat(),
        setLocalRotation(q){this.angles.push(q.x);}}
    ]));
    if(missingShowerBone)delete showerJoints['mixamorig:LeftForeArm'];
    const previous=model.findByName?.bind(model);
    model.findByName=name=>showerJoints[name]||previous?.(name)||null;
    model.mockShowerBones=showerJoints;
  }
  if(fridgeBones){
    const point=(x,y,z)=>({x,y,z});
    const skeleton={
      'mixamorig:RightArm':point(2.62,1.46,-1.78),
      'mixamorig:RightForeArm':point(2.81,1.25,-1.88),
      'mixamorig:RightHand':point(2.99,1.05,-1.99),
      'mixamorig:Head':point(2.55,1.72,-1.77)
    };
    const bones=Object.fromEntries(Object.entries(skeleton).map(([key,position])=>
      [key,{getPosition:()=>new Vec3(position.x,position.y,position.z),
        getRotation:()=>new Quat(),setRotation(){},
        addChild(child){child.parent=this;this.child=child;}}]));
    if(missingFridgeHand)delete bones['mixamorig:RightHand'];
    const previous=model.findByName?.bind(model);
    model.findByName=name=>bones[name]||previous?.(name)||null;
    model.mockFridgeBones=bones;
  }
  const staticBounds={getMin:()=>({...validBounds.min}),getMax:()=>({...validBounds.max})};
  model.renderers=[{entity:model,meshInstances:[{aabb:{getMin:()=>({y:-99}),getMax:()=>({y:99})},
    mesh:noStaticBounds?{}:{aabb:staticBounds}}]}];
  class Quat{
    constructor(x=0,y=0,z=0,w=1){this.set(x,y,z,w);}
    set(x,y,z,w){Object.assign(this,{x,y,z,w});return this;}
    setFromAxisAngle(_axis,deg){this.set(Math.sin(deg*Math.PI/360),0,0,
      Math.cos(deg*Math.PI/360));return this;}
    setFromDirections(){return this;}
    slerp(a){return this.set(a.x,a.y,a.z,a.w);}
    mul2(a,b){this.set(a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,
      a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,
      a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w,
      a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z);return this;}
  }
  class Vec3{
    constructor(x=0,y=0,z=0){this.set(x,y,z);}
    set(x,y,z){Object.assign(this,{x,y,z});return this;}
    length(){return Math.hypot(this.x,this.y,this.z);}
    normalize(){const n=this.length()||1;
      this.x/=n;this.y/=n;this.z/=n;return this;}
    dot(b){return this.x*b.x+this.y*b.y+this.z*b.z;}
  }
  const pc={Entity,Quat,Vec3,Color:class{},StandardMaterial:class{update(){}},
    Script:class {},Asset:class {
    constructor(name,type,file){this.file=file;}
    ready(cb){this.onReady=cb;}
    once(type,cb){this.onError=cb;}
  }};
  const app={root:new Entity('root'),assets:{add(){},load(asset){
    if(loadError){asset.onError(Error('network unavailable'));return;}
    const clips=missingClip?['Idle_7','Walking_Woman']:
      [...MIRA_REQUIRED_CLIPS,...(sofaClip||bedClips?[MIRA_SOFA_CLIP]:[]),
        ...(bedClips?[MIRA_SLEEP_CLIP]:[])];
    asset.resource={instantiateRenderEntity(){return model;},
      animations:clips.map(name=>({resource:{name,
        duration:name===MIRA_SOFA_CLIP?sofaDuration:
          name===MIRA_SLEEP_CLIP?bedDuration:
          name==='Walking_Woman'?walkDuration:6.2}}))};
    asset.onReady();
  }}};
  return {pc,app,rig,model,events,renderers};
}
test('static POSITION-space mesh bounds are used, not animated 99-metre AABB',()=>{
  const f=fixture();const source=miraStaticSourceBounds(f.model);
  assert.deepEqual(source,validBounds);
  const v=createMiraMeshyVisual(f);
  assert.equal(v.ready,true);
  assert.ok(Math.abs(f.model.scale[0]-2.05/1.7)<1e-10);
  assert.ok(f.model.position[1]>.02&&f.model.position[1]<.04);
});
test('Mira controls walking, social, pause and returns to legacy on furniture',()=>{
  const f=fixture();const visual=createMiraMeshyVisual(f);
  visual.update({preferred:true,walking:true});
  assert.equal(f.renderers[0].enabled,false);
  assert.ok(f.renderers.slice(1).every(x=>x.enabled));
  assert.ok(f.events.some(x=>x[0]==='transition'&&x[1]==='Walking_Woman'));
  visual.update({preferred:true,social:'talk',paused:true});
  assert.equal(f.model.anim.playing,false);
  visual.update({preferred:true,social:'argue'});
  assert.ok(f.events.some(x=>x[0]==='transition'&&x[1]==='Hand_on_Hip_Gesture'));
  visual.update({preferred:true,actionId:'sofa'});
  assert.equal(f.renderers[0].enabled,true);
  visual.update({preferred:true,sofaBusy:true});
  assert.equal(f.renderers[0].enabled,true);
  visual.update({preferred:true,actionId:'bed'});
  assert.equal(f.renderers[0].enabled,true);
  visual.update({preferred:true,showerBusy:true});
  assert.equal(f.renderers[0].enabled,true);
  visual.update({preferred:true});
  assert.equal(f.renderers[0].enabled,false);
  visual.reset();assert.ok(f.events.some(x=>x[0]==='play'&&x[1]==='Idle_7'));
  visual.update({preferred:false});
  assert.equal(f.renderers[0].enabled,true);
});
test('female network, static bounds and missing animation clip each fail safe',()=>{
  for(const config of [{loadError:true},{missingClip:true},{noStaticBounds:true}]){
    const f=fixture(config),events=[];
    const v=createMiraMeshyVisual({...f,onStatus:(status)=>events.push(status)});
    v.update({preferred:true,walking:true});
    assert.equal(v.ready,false);
    assert.equal(v.status,'error');
    assert.equal(f.renderers[0].enabled,true);
    assert.deepEqual(events,['error']);
  }
});
test('game supplies both independent visual adapters and includes the female module in Pages',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(game,/createMiraMeshyVisual/);
  assert.match(game,/meshyMira\.update/);
  assert.match(game,/meshyMira\.reset/);
  assert.ok(workflow.includes('src/meshy-mira-visual.js src/meshy-mira-sofa.js src/meshy-mira-bed.js src/meshy-mira-policy.js site/src/'));
  assert.match(workflow,/node --check src\/meshy-mira-visual\.js/);
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/Блин<span>’С<\/span>/);
  assert.match(html,/сборка \/ 1\.0d/);
});

test('audited female sit track interpolates measured pelvic translation, no per-sofa offsets',()=>{
  assert.equal(MIRA_SOFA_CLIP,'Look_Back_and_Sit');
  assert.ok(Math.abs(MIRA_SOFA_DURATION-2.26666665)<.0001);
  assert.ok(MIRA_SOFA_HIPS.length>=30);
  assert.deepEqual(miraSofaHipAt(0),{x:.00492,z:-.01003});
  const last=miraSofaHipAt(MIRA_SOFA_DURATION);
  assert.ok(Math.abs(last.x-.00013)<1e-6);
  assert.ok(Math.abs(last.z+.41930)<1e-6);
  assert.ok(Math.abs(miraSofaHipAt(1.0333).z+.2328)<.0001);
  const scale=2.05/1.7;
  const sitting=miraSofaOffset(1,scale);
  const starting=miraSofaOffset(0,scale);
  assert.ok(Math.abs(starting.z)<.006);
  assert.ok(sitting.z>.48&&sitting.z<.51);
  assert.ok(Math.abs(sitting.x)<.02);
  assert.equal(miraSofaClipTime(0),0);
  assert.ok(Math.abs(miraSofaClipTime(1)-MIRA_SOFA_DURATION)<1e-9);
  assert.throws(()=>miraSofaOffset(.5,0),RangeError);
  assert.ok(Math.abs(MIRA_IDLE_HIP.z)<.01);
});
test('Mira keeps her 3D skin on sofa during sit, pause, rise and clean release',()=>{
  const f=fixture({sofaClip:true});
  const visual=createMiraMeshyVisual(f);
  visual.update({preferred:true,actionId:'sofa',sofaBusy:true,sofaWeight:0});
  assert.equal(f.renderers[0].enabled,false);
  assert.ok(f.events.some(x=>x[0]==='play'&&x[1]===MIRA_SOFA_CLIP));
  assert.equal(f.model.anim.baseLayer.activeStateCurrentTime,0);
  visual.update({preferred:true,actionId:'sofa',sofaBusy:true,sofaWeight:1});
  assert.ok(Math.abs(f.model.anim.baseLayer.activeStateCurrentTime-MIRA_SOFA_DURATION)<1e-8);
  assert.ok(f.model.position[2]>.45,'female source hip drift is compensated in model space');
  visual.update({preferred:true,sofaBusy:true,sofaWeight:.55,paused:true,dt:0});
  const hold=f.model.position.slice();
  visual.update({preferred:true,sofaBusy:true,sofaWeight:.55,paused:true,dt:0});
  assert.deepEqual(f.model.position,hold);
  visual.update({preferred:true,sofaBusy:true,sofaWeight:.06});
  visual.update({preferred:true,dt:.1});
  assert.equal(f.renderers[0].enabled,false);
  assert.equal(f.model.anim.playing,true);
  visual.update({preferred:true,dt:.1});
  assert.ok(Math.abs(f.model.position[2]-miraMeshPlacement(validBounds).z)<1e-7);
  visual.reset();
  assert.equal(f.model.position[2],miraMeshPlacement(validBounds).z);
});
test('female clip duration mismatch keeps procedural sofa rather than unsafe retarget',()=>{
  const f=fixture({sofaClip:true,sofaDuration:1.1});
  const visual=createMiraMeshyVisual(f);
  visual.update({preferred:true,actionId:'sofa',sofaBusy:true,sofaWeight:.8});
  assert.equal(f.renderers[0].enabled,true);
  const old=fixture();
  const fallback=createMiraMeshyVisual(old);
  fallback.update({preferred:true,actionId:'sofa',sofaBusy:true,sofaWeight:.8});
  assert.equal(old.renderers[0].enabled,true);
});
test('game feeds female sofa bend and conceals old elbow book',()=>{
  const source=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(source,/sofaWeight:miraSeatPose\.sofaWeight/);
  assert.match(source,/if\(miraMeshShown&&miraUseId==='sofa'\)miraBook\.enabled=false/);
  assert.ok(workflow.includes('node --check src/meshy-mira-sofa.js'));
  assert.ok(workflow.includes('src/meshy-mira-sofa.js src/meshy-mira-bed.js src/meshy-mira-policy.js'));
});
 
test('Mira bed uses original female sit-to-sleep clips without swapping skin',()=>{
  const f=fixture({bedClips:true});
  const v=createMiraMeshyVisual(f);
  const bedPose=p=>bedTransitionPose({progress:p,slot:'left'});
  v.update({preferred:true,actionId:'bed',bedBusy:true,bedFrame:bedPose(.33),
    bedProgress:.33,paused:false});
  assert.equal(f.renderers[0].enabled,false);
  assert.ok(f.events.some(([kind,name])=>kind==='play'&&name==='Look_Back_and_Sit'));
  v.update({preferred:true,actionId:'bed',bedBusy:true,bedFrame:bedPose(.73),
    bedProgress:.73,paused:false});
  assert.ok(f.events.some(([kind,name])=>kind==='play'&&name==='sleep'));
  assert.ok(!f.events.some(([kind,name])=>kind==='transition'&&name==='sleep'),
    'a timed crossfade freezes while both bed clips are scrubbed at speed=0');
  assert.ok(f.model.anim.baseLayer.activeStateCurrentTime>0);
  assert.equal(f.model.anim.speed,0,'native sleep time is game-progress driven');
  assert.ok(f.model.script.instances.length>0);
  f.model.script.instances[0].postUpdate();
  const rotation=f.model.mockHip.rotation;
  assert.ok(rotation&&Number.isFinite(rotation.w));
  v.update({preferred:true,actionId:null,bedBusy:true,bedFrame:bedPose(.98),
    bedProgress:.98,paused:true,dt:0});
  f.model.script.instances[0].postUpdate();
  assert.ok(f.model.mockHip.rotation);
  v.update({preferred:true,bedBusy:true,bedFrame:bedPose(.36),bedProgress:.36});
  assert.equal(f.renderers[0].enabled,false);
  v.update({preferred:true,bedBusy:false});
  assert.equal(f.renderers[0].enabled,false);
  v.reset();
  assert.equal(f.model.position[1],miraMeshPlacement(validBounds).y);
});
test('missing hip, changed sleep duration or absent clips fall back only on bed',()=>{
  for(const setup of [{bedClips:true,missingHip:true},
    {bedClips:true,bedDuration:1.2},{sofaClip:true}]){
    const f=fixture(setup),v=createMiraMeshyVisual(f);
    v.update({preferred:true,actionId:'bed',bedBusy:true,
      bedFrame:bedTransitionPose({progress:.9,slot:'right'}),bedProgress:.9});
    assert.equal(f.renderers[0].enabled,true);
  }
});

test('Mira bed seeks final native lying frame directly even from sitting and on pause',()=>{
  for(const side of ['left','right']){
    const f=fixture({bedClips:true}),v=createMiraMeshyVisual(f);
    const frame=p=>bedTransitionPose({progress:p,slot:side});
    v.update({preferred:true,actionId:'bed',bedBusy:true,
      bedFrame:frame(.49),bedProgress:.49,paused:true,dt:0});
    assert.ok(f.events.some(([kind,clip])=>kind==='play'&&clip===MIRA_SOFA_CLIP));
    v.update({preferred:true,actionId:'bed',bedBusy:true,
      bedFrame:frame(1),bedProgress:1,paused:true,dt:0});
    assert.ok(f.events.some(([kind,clip])=>kind==='play'&&clip==='sleep'),
      'bed must activate sleep immediately, not wait for a frozen transition');
    assert.ok(!f.events.some(([kind,clip])=>kind==='transition'&&clip==='sleep'));
    assert.equal(f.model.anim.speed,0);
    assert.ok(Math.abs(f.model.anim.baseLayer.activeStateCurrentTime-MIRA_SLEEP_DURATION)<1e-8);
    assert.equal(f.renderers[0].enabled,false);
    const count=f.events.length;
    v.update({preferred:true,actionId:'bed',bedBusy:true,
      bedFrame:frame(1),bedProgress:1,paused:true,dt:0});
    assert.equal(f.events.length,count,'frozen sleep clip must not restart');
    v.update({preferred:true,actionId:'bed',bedBusy:true,
      bedFrame:frame(.40),bedProgress:.40});
    assert.ok(f.events.some(([kind,clip])=>kind==='play'&&clip===MIRA_SOFA_CLIP));
  }
});

test('Mira fridge uses the actual skinned right hand and retains 3D on entry, food and exit',()=>{
  const f=fixture({fridgeBones:true}),v=createMiraMeshyVisual(f);
  assert.equal(v.ready,true);
  const hands=f.model.mockFridgeBones;
  const scripts=f.model.script.instances;
  assert.ok(scripts.some(x=>typeof x.postUpdate==='function'));
  const update=(elapsed,extra={})=>v.update({
    preferred:true,actionId:'fridge',fridgeFrame:fridgeSequence(elapsed,26),
    ...extra
  });
  update(26*.16);
  assert.equal(f.renderers[0].enabled,false);
  assert.ok(f.events.some(([kind,name])=>kind==='transition'&&name==='Idle_7')||
    f.events.some(([kind,name])=>kind==='play'&&name==='Idle_7'));
  // The food is a child of the right-hand bone, never the game root.
  const foodEntity=f.model.mockFridgeBones['mixamorig:RightHand'].child;
  assert.ok(foodEntity);
  assert.equal(foodEntity.parent,hands['mixamorig:RightHand']);
  assert.equal(foodEntity.name,'Meshy Mira hand snack');
  scripts.forEach(script=>script.postUpdate());
  assert.equal(foodEntity.enabled,false,'snack is not shown during door contact');
  update(26*.77);
  scripts.forEach(script=>script.postUpdate());
  assert.equal(foodEntity.enabled,true,'snack is attached to imported hand while eating');
  assert.equal(f.renderers[0].enabled,false,'no procedural Mira body swap');
  v.update({preferred:true,fridgeBusy:true,fridgeFrame:null});
  scripts.forEach(script=>script.postUpdate());
  assert.equal(f.renderers[0].enabled,false,'3D body remains on door closing');
  assert.equal(foodEntity.enabled,false,'food is cleared after interrupted action');
  v.update({preferred:true,fridgeBusy:false});
  assert.equal(f.renderers[0].enabled,false);
  v.reset();
  scripts.forEach(script=>script.postUpdate());
  assert.equal(foodEntity.enabled,false);
});
test('female fridge feature gates missing bones and keeps bed/sofa independent',()=>{
  for(const f of [fixture(),fixture({fridgeBones:true,missingFridgeHand:true})]){
    const visual=createMiraMeshyVisual(f);
    visual.update({preferred:true,actionId:'fridge',
      fridgeFrame:fridgeSequence(26*.77,26),fridgeBusy:true});
    assert.equal(f.renderers[0].enabled,true,
      'incomplete imported skeleton must fall back to old fridge');
  }
  const ready={preferred:true,ready:true};
  assert.equal(canShowMiraMeshy({...ready,actionId:'fridge',fridgeReady:false}),false);
  assert.equal(canShowMiraMeshy({...ready,actionId:'fridge',fridgeReady:true}),true);
  assert.equal(canShowMiraMeshy({...ready,fridgeBusy:true,fridgeReady:true}),true);
  assert.equal(canShowMiraMeshy({...ready,fridgeBusy:true,fridgeReady:false}),false);
  assert.equal(canShowMiraMeshy({...ready,actionId:'bed',bedReady:true,
    fridgeReady:true}),true);
  assert.equal(canShowMiraMeshy({...ready,actionId:'sofa',sofaReady:true,
    fridgeReady:true}),true);
  assert.equal(canShowMiraMeshy({...ready,actionId:'shower',
    fridgeReady:true}),false);
});
test('Mira fridge post-Anim script uses shared prefab contact and hides procedural snack',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const visual=readFileSync(new URL('../src/meshy-mira-visual.js',import.meta.url),'utf8');
  const male=readFileSync(new URL('../src/meshy-fridge-runtime.js',import.meta.url),'utf8');
  assert.match(visual,/class MiraFridgePostUpdate extends pc\.Script/);
  assert.match(visual,/postUpdate\(\)\{fridge\.apply\(\);\}/);
  assert.match(visual,/fridgeReady:Boolean\(state\.fridgeRuntime\?\.ready\)/);
  assert.match(visual,/resident:'Mira'/);
  assert.match(game,/fridgeFrame:miraFridge/);
  assert.match(game,/if\(miraMeshShown&&miraUseId==='fridge'\)miraSnack\.enabled=false/);
  assert.match(male,/layout=FRIDGE_LAYOUT,resident='Alex'/);
});
 
test('Mira keeps the same skinned body on shower entry and dressed exit',()=>{
  const f=fixture({showerBones:true});
  const visual=createMiraMeshyVisual(f);
  assert.equal(visual.ready,true);
  assert.ok(f.model.script.instances.some(x=>typeof x.postUpdate==='function'));
  const phase=p=>showerSequence(p*32,32);
  const entry=phase(.12);
  visual.update({preferred:true,actionId:'shower',showerBusy:true,
    showerFrame:entry});
  assert.equal(f.renderers[0].enabled,false,'not the old body on entry');
  assert.equal(f.model.anim.speed,0);
  assert.ok(f.events.some(([kind,clip])=>kind==='play'&&clip==='Walking_Woman'),
    'scrubbed walk MUST switch immediately, not use a frozen crossfade');
  assert.ok(!f.events.some(([kind,clip])=>kind==='transition'&&clip==='Walking_Woman'));
  assert.ok(Math.abs(f.model.anim.baseLayer.activeStateCurrentTime-
    showerWalkClipTime(entry.gaitMeters,1.8))<1e-9);
  // Shared game privacy mask hides the entire avatar, including Meshy.
  const wet=phase(.53);
  assert.ok(wet.privacy&&wet.water&&showerPrivacyInvariant(wet));
  visual.update({preferred:true,actionId:'shower',showerBusy:true,
    showerFrame:wet});
  assert.equal(f.renderers[0].enabled,false);
  f.model.script.instances.forEach(script=>script.postUpdate());
  for(const joint of Object.values(f.model.mockShowerBones))
    assert.ok(joint.angles.length>0,'wash bone postUpdate is active only in private');
  const out=advanceShowerTransition({active:true,enterYaw:-90,
    frame:wet,exit:null},false,0,32,1);
  assert.ok(out.frame.privacy===false||out.frame.bathing===false);
  visual.update({preferred:true,actionId:null,showerBusy:true,
    showerFrame:out.frame});
  assert.equal(f.renderers[0].enabled,false,'no skin swap during exit');
  visual.update({preferred:true,actionId:null,showerBusy:true,
    showerFrame:out.frame,paused:true});
  assert.equal(f.model.anim.playing,false,
    'before the exit walk starts, a pause freezes idle pose');
  let exiting=out;
  for(let i=0;i<16;i++)
    exiting=advanceShowerTransition(exiting,false,0,32,.06);
  assert.ok(exiting.frame.stepWeight>.025,'exit has reached the walking phase');
  visual.update({preferred:true,actionId:null,showerBusy:true,
    showerFrame:exiting.frame,paused:true});
  assert.equal(f.model.anim.speed,0);
  assert.equal(f.model.anim.playing,true,
    'paused walking frame is sampled from distance, never a timed transition');
  const hold=f.model.anim.baseLayer.activeStateCurrentTime;
  visual.update({preferred:true,actionId:null,showerBusy:true,
    showerFrame:exiting.frame,paused:true});
  assert.equal(f.model.anim.baseLayer.activeStateCurrentTime,hold);
  visual.update({preferred:true,actionId:null,showerBusy:false,
    showerFrame:null});
  assert.equal(f.renderers[0].enabled,false);
  visual.reset();
  assert.equal(f.model.anim.speed,1);
});
test('Mira shower guard falls back on unsupported bones or invalid walking duration',()=>{
  for(const opt of [{},{showerBones:true,missingShowerBone:true},
    {showerBones:true,walkDuration:0}]){
    const f=fixture(opt),v=createMiraMeshyVisual(f);
    v.update({preferred:true,actionId:'shower',
      showerBusy:true,showerFrame:showerSequence(32*.50,32)});
    assert.equal(f.renderers[0].enabled,true);
  }
  const ready={preferred:true,ready:true};
  assert.equal(canShowMiraMeshy({...ready,actionId:'shower'}),false);
  assert.equal(canShowMiraMeshy({...ready,actionId:'shower',showerReady:true}),true);
  assert.equal(canShowMiraMeshy({...ready,showerBusy:true,showerReady:true}),true);
  assert.equal(canShowMiraMeshy({...ready,showerBusy:true,showerReady:false}),false);
  assert.equal(canShowMiraMeshy({...ready,actionId:'bed',
    bedReady:true,showerReady:true}),true);
  assert.equal(canShowMiraMeshy({...ready,actionId:'fridge',
    fridgeReady:true,showerReady:true}),true);
});
test('female shower never animates visible washing and freezes on pause',()=>{
  const f=fixture({showerBones:true}),v=createMiraMeshyVisual(f);
  const phase=p=>showerSequence(p*32,32);
  const bones=f.model.mockShowerBones;
  const show=(frame,paused=false)=>v.update({preferred:true,
    actionId:'shower',showerBusy:true,showerFrame:frame,paused});
  show(phase(.12));
  f.model.script.instances.forEach(x=>x.postUpdate());
  assert.ok(Object.values(bones).every(x=>x.angles.length===0),
    'visible walking has no wash motion');
  show(phase(.50),true);
  f.model.script.instances.forEach(x=>x.postUpdate());
  assert.ok(Object.values(bones).every(x=>x.angles.length===0),
    'paused wash produces no extra joint rotations');
  show(phase(.50),false);
  f.model.script.instances.forEach(x=>x.postUpdate());
  assert.ok(Object.values(bones).every(x=>x.angles.length===1));
  show({...phase(.50),privacy:false},false);
  f.model.script.instances.forEach(x=>x.postUpdate());
  assert.ok(Object.values(bones).every(x=>x.angles.length===1),
    'a missing privacy mask forbids washing joints');
  show(null);
  f.model.script.instances.forEach(x=>x.postUpdate());
  assert.ok(Object.values(bones).every(x=>x.angles.length===1));
});
test('female shower preserves the game enforced opaque privacy boundary',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const chars=readFileSync(new URL('../src/characters.js',import.meta.url),'utf8');
  const visual=readFileSync(new URL('../src/meshy-mira-visual.js',import.meta.url),'utf8');
  const shower=readFileSync(new URL('../src/shower-interaction.js',import.meta.url),'utf8');
  assert.match(game,/applyShowerAppearance\(miraRig,Boolean\(miraShower\?\.privacy\)/);
  assert.match(game,/showerPrivacy\.enabled=Boolean\(alexShower\?\.privacy\|\|miraShower\?\.privacy\)/);
  assert.match(game,/showerFrame:miraShower/);
  assert.match(chars,/rig\.avatar\.enabled=!masked/);
  assert.match(shower,/const privacy=p>=\.23&&p<\.94/);
  assert.match(visual,/class MiraShowerPostUpdate extends pc\.Script/);
  assert.match(visual,/postUpdate\(\)\{shower\.apply\(\);\}/);
  assert.match(visual,/showerReady:Boolean\(state\.showerRuntime\?\.ready\)/);
  assert.match(visual,/if\(gait\)anim\.baseLayer\.play\(target\)/);
  for(let i=0;i<=100;i++){
    const frame=showerSequence(i/100*32,32);
    assert.equal(showerPrivacyInvariant(frame),true);
    const pose=meshyShowerPose(frame);
    assert.equal(Boolean(pose.washing>0)&&!frame.privacy,false);
  }
});
