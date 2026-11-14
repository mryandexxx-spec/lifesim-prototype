import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMeshyVisual} from '../src/meshy-visual.js';
import {REQUIRED_MESHY_CLIPS,meshPlacement} from '../src/meshy-visual-policy.js';

function fixture({loadError=false,missClip=false,alternateIdle=false}={}){
  const events=[];
  const vertex=(x,y,z)=>({x,y,z,clone(){return vertex(x,y,z);}});
  class Entity{
    constructor(name){this.name=name;this.children=[];this.enabled=true;}
    addChild(entity){this.children.push(entity);entity.parent=this;}
    destroy(){this.destroyed=true;}
    setLocalScale(...values){this.scale=values;}
    setLocalPosition(...values){this.position=values;}
    findComponents(kind){return kind==='render'?this.renderers||[]:[];}
    addComponent(kind){
      assert.equal(kind,'anim');
      this.anim={
        playing:false,
        assignAnimation(name){events.push(['assigned',name]);},
        baseLayer:{
          play(name){events.push(['play',name]);},
          transition(name){events.push(['transition',name]);}
        }
      };
    }
  }
  const selected=new Entity('selection');
  const snack=new Entity('apple');
  const book=new Entity('book');
  const showerWrap=new Entity('privacy costume');
  const body=new Entity('Alex body');
  const renderers=[body,selected,snack,book,showerWrap].map(entity=>({entity,enabled:true}));
  const avatar=new Entity('Alex');avatar.renderers=renderers;
  const rig={avatar,selected,snack,book,showerWrap};
  const pc={
    Entity,
    Asset:class{
      constructor(name,kind,file){this.file=file;}
      ready(callback){this.onReady=callback;}
      once(kind,callback){if(kind==='error')this.onError=callback;}
    }
  };
  const model=new Entity('Imported Meshy model');
  model.renderers=[{entity:model,enabled:true,meshInstances:[{aabb:{
    getMin(){return vertex(-.3,.05,-.2);},
    getMax(){return vertex(.3,1.05,.2);}
  }}]}];
  const app={
    root:new Entity('Scene root'),
    assets:{
      add(){},
      load(asset){
        if(loadError){asset.onError(Error('network failed'));return;}
        const names=missClip?['Idle_3','Walking']:REQUIRED_MESHY_CLIPS;
        asset.resource={
          instantiateRenderEntity(){return model;},
          animations:[...new Set([...names,'Wave_One_Hand',
            ...(alternateIdle?['Idle_4']:[])])].map(name=>({resource:{
            name,duration:name==='Wave_One_Hand'?2.4:6.167
          }}))
        };
        asset.onReady();
      }
    }
  };
  return {events,rig,pc,app,renderers,model};
}

test('Meshy adapter hides only legacy body renderer; selection, items and privacy costume remain managed by game',()=>{
  const f=fixture();
  const statuses=[];
  const visual=createMeshyVisual({pc:f.pc,app:f.app,rig:f.rig,onStatus:status=>statuses.push(status)});
  assert.equal(visual.ready,true);
  assert.deepEqual(statuses,['ready']);
  assert.equal(f.model.scale[0],meshPlacement().scale);
  assert.equal(f.model.position[1],meshPlacement().y);
  visual.update({preferred:true,walking:true});
  assert.equal(f.renderers[0].enabled,false);
  assert.ok(f.renderers.slice(1).every(r=>r.enabled));
  assert.ok(f.events.some(e=>e[0]==='transition'&&e[1]==='Walking'));
  visual.update({preferred:true,paused:true,social:'talk'});
  assert.equal(f.model.anim.playing,false);
  visual.update({preferred:true,paused:false,social:'argue'});
  assert.ok(f.events.some(e=>e[0]==='transition'&&e[1]==='Stand_Talking_Angry'));
  assert.equal(f.model.anim.playing,true);
  visual.update({preferred:true,actionId:'bed'});
  assert.equal(f.renderers[0].enabled,true);
  visual.update({preferred:true,showerBusy:true});
  assert.equal(f.renderers[0].enabled,true);
  visual.update({preferred:false});
  assert.equal(f.renderers[0].enabled,true);
  visual.reset();
  assert.ok(f.events.some(e=>e[0]==='play'&&e[1]==='Idle_3'));
});

test('GLB failure or incompatible animation track falls back to legacy rendering',()=>{
  for(const mode of [{loadError:true},{missClip:true}]){
    const f=fixture(mode);
    const statuses=[];
    const visual=createMeshyVisual({pc:f.pc,app:f.app,rig:f.rig,
      onStatus:status=>statuses.push(status)});
    visual.update({preferred:true,walking:true});
    assert.equal(visual.ready,false);
    assert.equal(visual.status,'error');
    assert.equal(f.renderers[0].enabled,true);
    assert.deepEqual(statuses,['error']);
  }
});

test('Meshy sofa plays backwards from exact progress without swapping body, even on exit',()=>{
  const f=fixture();
  const visual=createMeshyVisual({pc:f.pc,app:f.app,rig:f.rig});
  visual.update({preferred:true,actionId:'sofa',sofaBusy:true,sofaWeight:0,dt:.016});
  assert.equal(f.renderers[0].enabled,false,'old body remains hidden');
  assert.ok(f.events.some(e=>e[0]==='play'&&e[1]==='Sit_to_Stand_Transition_M'));
  assert.equal(f.model.anim.speed,0);
  assert.ok(Math.abs(f.model.anim.baseLayer.activeStateCurrentTime-6.16667)<.002);
  const standingZ=f.model.position[2];
  visual.update({preferred:true,actionId:'sofa',sofaBusy:true,sofaWeight:1,dt:.016});
  assert.equal(f.model.anim.baseLayer.activeStateCurrentTime,0);
  assert.ok(f.model.position[2]>standingZ+.2,'X/Z translation from sit animation cancelled');
  visual.update({preferred:true,sofaBusy:true,sofaWeight:.6,paused:true,dt:0});
  assert.equal(f.renderers[0].enabled,false);
  assert.equal(f.model.anim.speed,0,'game pause does not advance authored sit clip');
  assert.ok(Math.abs(f.model.anim.baseLayer.activeStateCurrentTime-6.16667*.4)<.0001);
  visual.update({preferred:true,dt:.10});
  assert.equal(f.renderers[0].enabled,false,'stand-up does not switch back to old avatar');
  assert.ok(f.events.some(e=>e[0]==='transition'&&e[1]==='Idle_3'));
  assert.equal(f.model.anim.speed,1);
  const releasingZ=f.model.position[2];
  visual.update({preferred:true,dt:.10});
  assert.notEqual(f.model.position[2],releasingZ);
  assert.equal(f.model.position[2],meshPlacement().z,'root offset fully released');
  visual.update({preferred:true,actionId:'fridge'});
  assert.equal(f.renderers[0].enabled,true,'missing Mixamo arm rig uses safe legacy fridge');
});

test('new Meshy sofa seat correction stays off when standing and clears the cushion at rest',()=>{
  const f=fixture();
  const visual=createMeshyVisual({pc:f.pc,app:f.app,rig:f.rig});
  const base=meshPlacement();
  visual.update({preferred:true,actionId:'sofa',sofaBusy:true,sofaWeight:0,dt:.016});
  assert.ok(Math.abs(f.model.position[1]-base.y)<1e-10);
  visual.update({preferred:true,actionId:'sofa',sofaBusy:true,sofaWeight:1,dt:.016});
  const seatedY=f.model.position[1];
  assert.ok(seatedY>base.y,'seat height correction must lift mesh, not lower it');
  assert.ok(seatedY-base.y<.07,'no visible jump or feet flying above couch');
  visual.update({preferred:true,sofaBusy:true,sofaWeight:.5,paused:true,dt:0});
  const hold=f.model.position[1];
  visual.update({preferred:true,sofaBusy:true,sofaWeight:.5,paused:true,dt:0});
  assert.equal(f.model.position[1],hold,'pause holds corrected seat height');
  visual.update({preferred:true,dt:.20});
  assert.ok(Math.abs(f.model.position[1]-base.y)<1e-8,'standing restores ground reference');
});

test('Alex waves on approaching friendly social, pauses, then returns to listening',()=>{
  const f=fixture();
  const visual=createMeshyVisual({pc:f.pc,app:f.app,rig:f.rig});
  const talk={preferred:true,social:'talk',socialInitiator:true,actionId:null};
  visual.update({...talk,socialElapsed:0,dt:.05});
  assert.ok(f.events.some(e=>e[0]==='play'&&e[1]==='Wave_One_Hand'));
  assert.equal(f.model.anim.baseLayer.activeStateCurrentTime,0);
  assert.equal(f.model.anim.speed,0);
  assert.equal(f.renderers[0].enabled,false);
  visual.update({...talk,socialElapsed:1.8,paused:true,dt:0});
  assert.ok(Math.abs(f.model.anim.baseLayer.activeStateCurrentTime-1.2)<.001);
  visual.update({...talk,socialElapsed:1.8,paused:true,dt:0});
  assert.ok(Math.abs(f.model.anim.baseLayer.activeStateCurrentTime-1.2)<.001);
  visual.update({...talk,socialElapsed:3.6,dt:.1});
  assert.ok(f.events.some(e=>e[0]==='transition'&&e[1]==='Listening_Gesture'));
  assert.equal(f.model.anim.speed,1);
  visual.update({preferred:true,social:'argue',socialInitiator:true,socialElapsed:0});
  assert.ok(f.events.some(e=>e[0]==='transition'&&e[1]==='Stand_Talking_Angry'));
  visual.update({...talk,socialElapsed:0,socialInitiator:false});
  assert.ok(f.events.some(e=>e[0]==='transition'&&e[1]==='Listening_Gesture'));
});

test('optional Idle_4 crossfades while free, pauses, and yields to social and walking',()=>{
  const f=fixture({alternateIdle:true});
  const visual=createMeshyVisual({pc:f.pc,app:f.app,rig:f.rig});
  const idle={preferred:true,worldMinutes:483,mood:70,energy:70};
  visual.update(idle);
  assert.ok(f.events.some(([type,clip])=>type==='transition'&&clip==='Idle_4'));
  assert.equal(f.renderers[0].enabled,false);
  const count=f.events.length;
  visual.update({...idle,paused:true,dt:0});
  assert.equal(f.model.anim.playing,false);
  assert.equal(f.events.length,count,'idle selection cannot switch when the clock freezes');
  visual.update({...idle,walking:true});
  assert.equal(f.events.at(-1)[1],'Walking');
  visual.update({...idle,social:'argue',walking:false});
  assert.equal(f.events.at(-1)[1],'Stand_Talking_Angry');
  visual.update({...idle,worldMinutes:488,social:null});
  assert.equal(f.events.at(-1)[1],'Idle_3');
});
test('optional idle is a safe fallback if older animation asset lacks Idle_4',()=>{
  const f=fixture();
  const visual=createMeshyVisual({pc:f.pc,app:f.app,rig:f.rig});
  visual.update({preferred:true,worldMinutes:484,mood:20,energy:20});
  assert.equal(f.renderers[0].enabled,false);
  assert.ok(!f.events.some(([_,name])=>name==='Idle_4'));
});
test('game supplies saved simulation clock and preserves walk during pause',()=>{
  const source=readFileSync(
    new URL('../src/game.js',import.meta.url),'utf8');
  assert.match(source,/worldMinutes:game\.minutes/);
  assert.match(source,/mood:game\.mind\?\.mood\?\.value/);
  assert.match(source,/energy:game\.needs\.energy/);
  assert.match(source,/walking:\(game\.action\?\.phase==='walking'/);
});
