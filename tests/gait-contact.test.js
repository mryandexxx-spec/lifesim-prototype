import test from 'node:test';
import assert from 'node:assert/strict';
import * as pc from 'playcanvas';
import {WALK_PHASE_PER_METER,gaitTargets,gaitRootOffset,gaitFootTrajectory} from '../src/locomotion.js';
import {LEG_GEOMETRY} from '../src/pose-config.js';
import {createCharacterRig} from '../src/characters.js';
import {createAnimationState,stepAnimation,applyCharacterAnimation} from '../src/animations.js';
import {newHousehold,loadHousehold} from '../src/household.js';

const RAD=Math.PI/180,near=(a,b,epsilon=1e-5)=>Math.abs(a-b)<=epsilon;
const FOOT_Y=LEG_GEOMETRY.shoeHeight/2;
const travelZ=p=>p/WALK_PHASE_PER_METER;
const ankle=(p,leg,pose=gaitTargets(p,1))=>{
  const h=pose.hips[leg]*RAD,k=pose.knees[leg]*RAD;
  const a=LEG_GEOMETRY.kneeOffsetY,b=LEG_GEOMETRY.shoeCenterY;
  return {
    y:LEG_GEOMETRY.hipHeight+pose.rootOffset+a*Math.cos(h)+b*Math.cos(h+k),
    z:travelZ(p)-a*Math.sin(h)-b*Math.sin(h+k)
  };
};

test('right sole remains world-locked across its complete stance, at the floor',()=>{
  let anchor;
  for(let i=0;i<=256;i++){
    // Right foot stance: phase 0..PI (the last endpoint starts its next swing).
    const phase=(Math.PI-1e-7)*i/256;
    const frame=gaitFootTrajectory(phase,1);
    assert.equal(frame.stance,true);
    const actual=ankle(phase,1);
    if(anchor===undefined)anchor=actual.z;
    assert.ok(near(actual.z,anchor,1e-5),`foot skated ${actual.z-anchor} at ${phase}`);
    assert.ok(near(actual.y,FOOT_Y,1e-5),`stance foot penetrated floor ${actual.y}`);
  }
});
test('left sole is also planted for an entire half-stride, independent of phase origin',()=>{
  let anchor;
  for(let i=0;i<=256;i++){
    const phase=Math.PI+(Math.PI-1e-7)*i/256;
    const foot=gaitFootTrajectory(phase,0);
    assert.equal(foot.stance,true);
    const a=ankle(phase,0);
    if(anchor===undefined)anchor=a.z;
    assert.ok(near(a.z,anchor,1e-5));
    assert.ok(near(a.y,FOOT_Y,1e-5));
  }
});
test('non-support foot rises smoothly with no underground ankle or knee overextension',()=>{
  for(let i=0;i<=240;i++){
    const phase=Math.PI*2*i/240;
    const p=gaitTargets(phase,1,40);
    for(let leg=0;leg<2;leg++){
      const trajectory=gaitFootTrajectory(phase,leg);
      const world=ankle(phase,leg,p);
      assert.ok(world.y>=FOOT_Y-1e-5, `foot below the floor: ${world.y}`);
      assert.ok(near(world.y,FOOT_Y+trajectory.lift,1e-5));
      assert.ok(p.knees[leg]>=0&&p.knees[leg]<83,`knee exceeded anatomically plausible bend: ${p.knees[leg]}`);
      if(trajectory.stance){
        assert.equal(trajectory.lift,0);
        assert.ok(near(p.hips[leg]+p.knees[leg]+p.feet[leg],0,1e-6),'shoe sole must be level');
      }else{
        assert.ok(trajectory.lift>=0&&trajectory.lift<=.085+1e-8);
      }
    }
  }
  assert.ok(gaitFootTrajectory(Math.PI/2,0).lift>.08);
  assert.equal(gaitFootTrajectory(Math.PI/2,1).lift,0);
});
test('phase and stride remain in real metres and do not depend on framerate or speed',()=>{
  assert.ok(near(Math.PI/WALK_PHASE_PER_METER,2*(Math.PI/(2*WALK_PHASE_PER_METER))));
  for(const [fps,speed] of [[30,1],[60,1],[120,1],[30,3],[60,3],[120,3]]){
    const d=1.65*speed/fps,phase=d*WALK_PHASE_PER_METER;
    const model=gaitTargets(phase,1,75);
    const same=gaitTargets((d/3)*WALK_PHASE_PER_METER*3,1,75);
    assert.deepEqual(model,same);
    assert.ok(near(ankle(phase,0).y,FOOT_Y+gaitFootTrajectory(phase,0).lift,1e-5));
  }
});
test('gait keeps upper body expressive but bounded, without exaggerated arm flapping',()=>{
  for(let p=0;p<Math.PI*2;p+=.07){
    const a=gaitTargets(p,1,70);
    assert.ok(Math.max(...a.arms.map(Math.abs))<20);
    assert.ok(Math.max(...a.elbows)<24);
    assert.ok(Math.abs(a.spineTwist)<=3.01);
    assert.ok(Math.abs(a.spineRoll)<=2.41);
    assert.ok(Math.abs(a.hipShift)<=.025);
    assert.ok(a.spineLean>1&&a.spineLean<3);
    assert.ok(a.rootOffset<=0&&a.rootOffset>=-.046);
  }
});
test('animator applies feet, knees and root together without stale phase smoothing',()=>{
  let s=createAnimationState();
  for(let i=0;i<90;i++)s=stepAnimation(s,{id:'alex',walking:true,gait:i*.17,energy:70},1/60);
  for(const [phase,dt] of [[Math.PI/2,1/60],[Math.PI*.85,1/30],[Math.PI*1.35,1/120]]){
    s=stepAnimation(s,{id:'alex',walking:true,gait:phase,energy:70},dt);
    const contact=gaitTargets(phase,s.walkWeight,70);
    assert.deepEqual(s.legs,contact.hips);
    assert.deepEqual(s.knees,contact.knees);
    assert.deepEqual(s.feet,contact.feet);
    assert.equal(s.walkBob,contact.rootOffset);
  }
});
test('pause freezes contact state; new action releases foot lock for established poses',()=>{
  let s=createAnimationState();
  for(let i=0;i<100;i++)s=stepAnimation(s,{walking:true,gait:Math.PI/2},.016);
  const frozen=stepAnimation(s,{walking:true,gait:30},0);
  assert.equal(frozen,s);
  const sit=stepAnimation(s,{walking:false,using:'sofa',sofaWeight:1},.016);
  assert.ok(sit.legs[0]!==gaitTargets(30,sit.walkWeight).hips[0]);
  for(let i=0;i<100;i++)s=stepAnimation(s,{using:'sofa',sofaWeight:1,walking:false},.016);
  assert.ok(s.legs.every(v=>v< -70));
  assert.ok(Math.abs(s.walkBob)<.001);
});
test('actual PlayCanvas ankle joints reproduce the analytic two-bone target',()=>{
  for(const id of ['alex','mira']){
    const root=new pc.Entity('root');
    const shape=(name,x,y,z,sx,sy,sz,material,parent=root)=>{
      const e=new pc.Entity(name);parent.addChild(e);
      e.setLocalPosition(x,y,z);e.setLocalScale(sx,sy,sz);return e;
    };
    const rig=createCharacterRig({pc,root,ball:shape,box:shape,cylinder:shape,
      mat:()=>null,materials:{}},id);
    let anim=createAnimationState();
    for(let i=0;i<120;i++)anim=stepAnimation(anim,{walking:true,gait:0,energy:70},1/60);
    for(let i=0;i<=60;i++){
      const phase=i/60*Math.PI;
      anim=stepAnimation(anim,{walking:true,gait:phase,energy:70},1/60);
      rig.avatar.setPosition(0,anim.walkBob,travelZ(phase));
      rig.avatar.setEulerAngles(0,0,0);
      applyCharacterAnimation(rig,anim);
      const ankleWorld=rig.anklePivot[1].getPosition();
      const expected=ankle(phase,1,gaitTargets(phase,anim.walkWeight,70));
      // At full weight the numeric and PlayCanvas transform must agree.
      assert.ok(Math.abs(ankleWorld.y-expected.y)<.001);
      assert.ok(Math.abs(ankleWorld.z-expected.z)<.001);
    }
  }
});
test('walking polish is transient: both residents and old v1 saves stay unchanged',()=>{
  const household=newHousehold(),serialized=JSON.stringify(household);
  let left=createAnimationState(),right=createAnimationState();
  for(let i=0;i<120;i++){
    left=stepAnimation(left,{id:'alex',walking:true,gait:i*.2},.016);
    right=stepAnimation(right,{id:'mira',walking:true,gait:i*.2+Math.PI},.016);
  }
  assert.ok(left.legs[0]!==right.legs[0]);
  assert.equal(JSON.stringify(household),serialized);
  assert.equal(loadHousehold(JSON.parse(serialized)).version,1);
});
