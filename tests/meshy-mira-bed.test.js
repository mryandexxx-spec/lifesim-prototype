import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {advanceBedTransition,bedTransitionPose,createBedTransition}
  from '../src/bed-transition.js';
import {BED_SLOTS} from '../src/bed-layout.js';
import {MIRA_SLEEP_CLIP,MIRA_SLEEP_DURATION,
 MIRA_SLEEP_HIPS_TRANSLATIONS,MIRA_SLEEP_HIPS_ROTATIONS,
 miraSleepHipAt,miraSleepHipsRotationAt,miraBedPose,createMiraBedController}
  from '../src/meshy-mira-bed.js';
import {miraMeshPlacement,canShowMiraMeshy}
  from '../src/meshy-mira-policy.js';
const scale=miraMeshPlacement({min:{x:-.3,y:0,z:-.15},max:{x:.3,y:1.7,z:.15}}).scale;
const at=(p,side='left')=>{
  const f=bedTransitionPose({progress:p,slot:side});
  return miraBedPose(f,p,scale);
};
test('female sleep track samples are imported from original GLB, not invented animation',()=>{
  const buf=readFileSync(new URL('../assets/characters/meshy-mira-mobile-v1.glb',import.meta.url));
  const len=buf.readUInt32LE(12),gl=JSON.parse(buf.subarray(20,20+len).toString('utf8'));
  const bin=28+len,hipID=gl.nodes.findIndex(n=>n.name==='mixamorig:Hips');
  const sleep=gl.animations.find(a=>a.name===MIRA_SLEEP_CLIP);
  assert.ok(sleep);
  assert.ok(Math.abs(MIRA_SLEEP_DURATION-5.7)<.001);
  const keys=kind=>{
    const channel=sleep.channels.find(c=>c.target.node===hipID&&c.target.path===kind);
    const sampler=sleep.samplers[channel.sampler];
    const ts=gl.accessors[sampler.input],os=gl.accessors[sampler.output];
    const read=(acc,index)=>{
      const view=gl.bufferViews[acc.bufferView],n={SCALAR:1,VEC3:3,VEC4:4}[acc.type];
      const start=bin+view.byteOffset+(acc.byteOffset||0)+
        index*(view.byteStride||n*4);
      return Array.from({length:n},(_,k)=>Number(buf.readFloatLE(start+4*k).toFixed(6)));
    };
    return Array.from({length:os.count},(_,i)=>[read(ts,i)[0],...read(os,i)]);
  };
  assert.deepEqual(keys('translation'),MIRA_SLEEP_HIPS_TRANSLATIONS);
  assert.deepEqual(keys('rotation'),MIRA_SLEEP_HIPS_ROTATIONS);
});
test('native Hips pose is sampled deterministically without drifting on pause',()=>{
  assert.equal(MIRA_SLEEP_HIPS_TRANSLATIONS.length,62);
  assert.equal(MIRA_SLEEP_HIPS_ROTATIONS.length,59);
  const begin=miraSleepHipAt(0),end=miraSleepHipAt(MIRA_SLEEP_DURATION);
  assert.ok(Math.abs(begin.y-.72702)<1e-4);
  assert.ok(Math.abs(end.y-.675384)<1e-5);
  assert.ok(Math.abs(end.z+.410742)<1e-5);
  for(let i=0;i<=100;i++){
    const t=i*MIRA_SLEEP_DURATION/100,q=miraSleepHipsRotationAt(t);
    assert.ok(q.every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...q)-1)<1e-6);
    assert.deepEqual(q,miraSleepHipsRotationAt(t));
  }
});
test('female bed stages reuse two-sided game root; no duplicate source body tilt',()=>{
  for(const side of ['left','right']){
    assert.equal(BED_SLOTS[side].id,side);
    assert.equal(at(.14,side).clip,'Idle_7');
    assert.equal(at(.36,side).clip,'Look_Back_and_Sit');
    assert.equal(at(.51,side).clip,'sleep');
    assert.equal(at(.99,side).clip,'sleep');
    assert.ok(Math.abs(at(.99,side).pitch+78)<.01);
    assert.ok(Math.abs(at(.99,side).time-MIRA_SLEEP_DURATION)<1e-8);
    const a=at(.49,side),b=at(.51,side),end=at(.99,side);
    assert.ok(a.offset.z>.45&&a.offset.z<.52);
    assert.ok(b.offset.y<-.11&&b.offset.y>-.17);
    assert.ok(Math.abs(end.offset.y)<.10);
    assert.ok(end.offset.z>.45&&end.offset.z<.53);
    assert.equal(a.side,side);assert.equal(end.side,side);
  }
  assert.equal(miraBedPose(null,.5,scale),null);
  assert.equal(miraBedPose({bedSide:'left'},.5,-1),null);
});
test('bed source timeline remains reversible on exit and never writes save data',()=>{
  for(const side of ['left','right']){
    let state=createBedTransition();
    const source={x:BED_SLOTS[side].approach.x,y:0,
      z:BED_SLOTS[side].approach.z,yaw:BED_SLOTS[side].approachYaw,pitch:0};
    for(let i=0;i<90;i++)state=advanceBedTransition(state,true,side,.06,source);
    assert.ok(state.progress>.99);
    const inPose=bedTransitionPose(state);
    assert.equal(miraBedPose(inPose,state.progress,scale).clip,'sleep');
    for(let i=0;i<90;i++)state=advanceBedTransition(state,false,side,.06,source);
    assert.equal(state.progress,0);assert.equal(state.slot,null);
  }
});
test('post-Anim bed correction sets absolute Hips rotation even on paused frames',()=>{
  const record=[];
  class Q{constructor(x=0,y=0,z=0,w=1){this.set(x,y,z,w);}
    set(x,y,z,w){Object.assign(this,{x,y,z,w});return this;}
    setFromAxisAngle(_axis,a){this.set(Math.sin(a*Math.PI/360),0,0,
      Math.cos(a*Math.PI/360));return this;}
    mul2(a,b){return this.set(a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,
      a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,
      a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w,
      a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z);}
  }
  class V{constructor(x,y,z){Object.assign(this,{x,y,z});}}
  const bone={setLocalRotation(q){record.push([q.x,q.y,q.z,q.w]);}};
  const model={findByName:name=>name==='mixamorig:Hips'?bone:null,
    setPosition(){throw Error('model root must remain immutable');}};
  const ctrl=createMiraBedController({pc:{Quat:Q,Vec3:V},model});
  assert.equal(ctrl.ready,true);
  ctrl.setFrame(at(.99));
  assert.equal(ctrl.apply(),true);
  const first=record.at(-1);
  ctrl.apply();assert.deepEqual(record.at(-1),first,
    'absolute correction must never accumulate on paused/static Anim');
  ctrl.setFrame(null);assert.equal(ctrl.apply(),false);
  const fail=createMiraBedController({pc:{Quat:Q,Vec3:V},
    model:{findByName:()=>null}});
  assert.equal(fail.ready,false);
  assert.equal(fail.apply(),false);
});
test('guarded female bed and Pages game wiring preserve fallback, privacy and old saves',()=>{
  const ready={preferred:true,ready:true};
  assert.equal(canShowMiraMeshy({...ready,actionId:'bed',bedReady:true}),true);
  assert.equal(canShowMiraMeshy({...ready,bedBusy:true,bedReady:true}),true);
  assert.equal(canShowMiraMeshy({...ready,bedBusy:true,bedReady:false}),false);
  for(const actionId of ['fridge','shower'])
    assert.equal(canShowMiraMeshy({...ready,actionId,bedReady:true}),false);
  assert.equal(canShowMiraMeshy({...ready,actionId:'shower',
    showerReady:true,bedReady:true}),true);
  assert.equal(canShowMiraMeshy({...ready,actionId:'fridge',
    fridgeReady:true,bedReady:true}),true);
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const visual=readFileSync(new URL('../src/meshy-mira-visual.js',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(game,/bedFrame:miraBedPose/);
  assert.match(game,/bedProgress:bedStates\.mira\.progress/);
  assert.match(visual,/class MiraBedPostUpdate extends pc\.Script/);
  assert.match(visual,/postUpdate\(\)\{bed\.apply\(\);\}/);
  assert.ok(workflow.includes('node --check src/meshy-mira-bed.js'));
  assert.ok(workflow.includes('src/meshy-mira-bed.js src/meshy-mira-policy.js'));
});
