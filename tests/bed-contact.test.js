import test from 'node:test';
import assert from 'node:assert/strict';
import * as pc from 'playcanvas';
import {createCharacterRig} from '../src/characters.js';
import {createAnimationState,stepAnimation,applyCharacterAnimation} from '../src/animations.js';
import {bedTransitionPose,advanceBedTransition,createBedTransition,rotateBedVector,
  BED_ENTER_SECONDS,BED_EXIT_SECONDS,bedBeddingPose} from '../src/bed-transition.js';
import {BED_SLOTS,BED_LAYOUT} from '../src/bed-layout.js';

function scene(id){
  const meshes=[];const root=new pc.Entity();
  const shape=(name,x,y,z,sx,sy,sz,material,parent=root)=>{
    const e=new pc.Entity(name);parent.addChild(e);e.setLocalPosition(x,y,z);
    e.setLocalScale(sx,sy,sz);meshes.push(e);return e;
  };
  const rig=createCharacterRig({pc,root,ball:shape,box:shape,cylinder:shape,
    mat:()=>null,materials:{}},id);
  let animation=createAnimationState();
  return {rig,meshes,sample(p,slot,dt=1/60){
    const pose=bedTransitionPose({progress:p,slot});
    rig.avatar.setPosition(pose.x,pose.y,pose.z);
    rig.avatar.setEulerAngles(pose.pitch,pose.yaw,pose.roll);
    animation=stepAnimation(animation,{using:'bed',...pose},dt);
    applyCharacterAnimation(rig,animation);return pose;
  }};
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

test('combined Euler compensation agrees with pinned PlayCanvas, including opposite side yaw',()=>{
  for(const pitch of [-78,-40,0])for(const yaw of [-90,-43,0,90])for(const roll of [-11,0,11]){
    const v={x:.15,y:.72,z:.08},p={pitch,yaw,roll};
    const actual=new pc.Quat().setFromEulerAngles(pitch,yaw,roll)
      .transformVector(new pc.Vec3(v.x,v.y,v.z));
    assert.ok(distance(actual,rotateBedVector(v,p))<1e-6);
    assert.ok(distance(v,rotateBedVector(actual,p,true))<1e-6);
  }
});
test('both actual rigs hit ankle targets on every entry AND exit frame without independent joint lag',()=>{
  for(const id of ['alex','mira'])for(const slot of ['left','right']){
    const s=scene(id);
    for(const direction of [1,-1])for(let i=0;i<=320;i++){
      const p=direction===1?i/320:1-i/320,pose=s.sample(p,slot);
      for(let k=0;k<2;k++){
        assert.ok(distance(s.rig.anklePivot[k].getPosition(),pose.bedAnkles[k])<.00001,
          `${id}/${slot}/${p}: shin cannot reach target or animator lags root`);
        const up=s.rig.anklePivot[k].getWorldTransform().getY().normalize();
        assert.ok(up.y>.9999,'soles stay horizontal');
      }
    }
  }
});
test('feet remain planted during sitting and reverse standing, while pelvis moves to the rail',()=>{
  for(const slot of ['left','right']){
    const s=scene('alex');let first=null;
    for(let i=0;i<=80;i++){
      const p=.25+i/80*.24;s.sample(p,slot);
      const feet=s.rig.anklePivot.map(e=>e.getPosition().clone());
      if(!first)first=feet;
      for(let k=0;k<2;k++)assert.ok(distance(feet[k],first[k])<1e-5);
    }
  }
});
test('actual pelvis is fixed throughout reclining, after leg transfer has finished',()=>{
  for(const slot of ['left','right']){
    const s=scene('mira');let anchor;
    for(let i=0;i<=120;i++){
      s.sample(.71+i/120*.29,slot);
      const pelvis=s.rig.pelvis.getPosition().clone();
      // Geometry centre is .01 above the .72 waist anchor; remove that rotation.
      const hip=s.rig.avatar.getWorldTransform().transformPoint(new pc.Vec3(0,.72,0));
      if(!anchor)anchor=hip;
      assert.ok(distance(hip,anchor)<1e-5,'recline must not drag pelvis across bed');
      assert.ok(pelvis.y>.64);
    }
  }
});
test('sampled real mesh surfaces stay outside mattress solid and above floor, for both bodies and sides',()=>{
  const surface=Array.from({length:100},(_,n)=>{
    const y=1-2*(n+.5)/100,r=Math.sqrt(1-y*y),a=n*2.399963;
    return new pc.Vec3(.5*r*Math.cos(a),.5*y,.5*r*Math.sin(a));
  });
  for(const id of ['alex','mira'])for(const slot of ['left','right']){
    const s=scene(id);
    for(let i=0;i<=120;i++){
      s.sample(i/120,slot);
      for(const e of s.meshes){
        if(!e.enabled||/selected|book|apple/.test(e.name))continue;
        const m=e.getWorldTransform();
        for(const v of surface){
          const w=m.transformPoint(v);
          assert.ok(w.y>-.008,`${e.name} penetrates floor at ${i/120}`);
          if(Math.abs(w.x-BED_LAYOUT.centerX)<BED_LAYOUT.width/2&&
            Math.abs(w.z-BED_LAYOUT.centerZ)<BED_LAYOUT.depth/2)
            assert.ok(w.y>=BED_LAYOUT.mattressY+BED_LAYOUT.mattressHeight/2-.002,`${id}/${slot}/${i/120}: ${e.name} penetrates mattress at ${w.y}`);
        }
      }
    }
  }
});
test('entry captures current facing smoothly, pause and cancellation retain the same side',()=>{
  for(const slot of ['left','right'])for(const yaw of [-175,-40,0,80,175]){
    const a=BED_SLOTS[slot].approach,origin={...a,y:0,pitch:0,yaw,roll:0};
    let state=advanceBedTransition(createBedTransition(),true,slot,1/60,origin);
    const p=bedTransitionPose(state);
    assert.ok(Math.abs(((p.yaw-yaw+540)%360)-180)<.9,'initial facing snaps');
    assert.ok(distance(p,origin)<.002);
    const held=advanceBedTransition(state,true,slot,0);assert.equal(state,held);
    state=advanceBedTransition(state,false,null,1/60);
    assert.equal(state.progress,0);
  }
});
test('contact motion is bounded at 30/60/120 fps in entry and reverse exit',()=>{
  for(const fps of [30,60,120])for(const seconds of [BED_ENTER_SECONDS,BED_EXIT_SECONDS]){
    const frames=Math.ceil(seconds*fps);
    for(const slot of ['left','right']){
      const s=scene('alex');let previous,rotations;
      for(let i=0;i<=frames;i++){
        const p=s.sample(i/frames,slot,1/fps);
        const positions=[s.rig.pelvis,...s.rig.anklePivot].map(e=>e.getPosition().clone());
        if(previous)for(let k=0;k<positions.length;k++)
          assert.ok(distance(positions[k],previous[k])<.13,`contact jumps at ${fps} fps / ${p.bedSide}`);
        const current=s.rig.legPivot.map(e=>e.getRotation().clone());
        if(rotations)current.forEach((q,k)=>{
          const a=rotations[k],dot=Math.abs(q.x*a.x+q.y*a.y+q.z*a.z+q.w*a.w);
          const angle=2*Math.acos(Math.min(1,dot))*180/Math.PI;
          assert.ok(angle<24,`thigh flips at ${fps} fps: ${angle} degrees`);
        });
        rotations=current;previous=positions;
      }
    }
  }
});

test('quilts leave the sitting zone clear and retract before standing',()=>{
  for(const p of [0,.25,.49,.6,.74,.9,.96]){
    const q=bedBeddingPose(p);
    assert.ok(q.z-q.depth/2>-.73,'folded quilt must not swallow pelvis/torso');
  }
  const q=bedBeddingPose(1);
  assert.ok(q.z-q.depth/2< -1.6&&q.depth>1.4);
});
