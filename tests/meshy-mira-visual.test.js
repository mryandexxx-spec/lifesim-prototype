import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
  bedClips=false,bedDuration=MIRA_SLEEP_DURATION,missingHip=false}={}){
  const events=[];
  class Entity{
    constructor(name){this.name=name;this.enabled=true;this.children=[];}
    addChild(child){this.children.push(child);child.parent=this;}
    destroy(){this.destroyed=true;}
    findComponents(type){return type==='render'?this.renderers||[]:[];}
    setLocalScale(...s){this.scale=s;}
    setLocalPosition(...p){this.position=p;}
    addComponent(type){
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
  const model=new Entity('Meshy Mira');
  if(bedClips){
    const hip={rotation:null,setLocalRotation(q){
      this.rotation={x:q.x,y:q.y,z:q.z,w:q.w};}};
    model.findByName=name=>name==='mixamorig:Hips'&&!missingHip?hip:null;
    model.mockHip=hip;
  }
  const staticBounds={getMin:()=>({...validBounds.min}),getMax:()=>({...validBounds.max})};
  model.renderers=[{entity:model,meshInstances:[{aabb:{getMin:()=>({y:-99}),getMax:()=>({y:99})},
    mesh:noStaticBounds?{}:{aabb:staticBounds}}]}];
  class Quat{
    constructor(x=0,y=0,z=0,w=1){this.set(x,y,z,w);}
    set(x,y,z,w){Object.assign(this,{x,y,z,w});return this;}
    setFromAxisAngle(_axis,deg){this.set(Math.sin(deg*Math.PI/360),0,0,
      Math.cos(deg*Math.PI/360));return this;}
    mul2(a,b){this.set(a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,
      a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,
      a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w,
      a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z);return this;}
  }
  class Vec3{constructor(x,y,z){Object.assign(this,{x,y,z});}}
  const pc={Entity,Quat,Vec3,Script:class {},Asset:class {
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
          name===MIRA_SLEEP_CLIP?bedDuration:6.2}}))};
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
  assert.match(html,/сборка \/ 0\.7j/);
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
  assert.ok(workflow.includes('src/meshy-mira-sofa.js src/meshy-mira-policy.js'));
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
  assert.ok(f.events.some(([kind,name])=>kind==='transition'&&name==='sleep'));
  assert.ok(f.model.anim.baseLayer.activeStateCurrentTime>0);
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
