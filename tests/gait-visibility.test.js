import test from 'node:test';
import assert from 'node:assert/strict';
import {gaitTargets,WALK_PHASE_PER_METER} from '../src/locomotion.js';
import {createAnimationState,stepAnimation} from '../src/animations.js';
import {newHousehold,loadHousehold} from '../src/household.js';

const walk=(phase,moving=true)=>({
  id:'alex',walking:moving,gait:phase,energy:65,mood:65,using:null
});
const nearly=(a,b,eps=.0001)=>Math.abs(a-b)<eps;

test('new gait has visibly larger knee, arm and upper-body excursion than 0.6b',()=>{
  const forward=gaitTargets(Math.PI/2,1,75);
  const backward=gaitTargets(-Math.PI/2,1,75);
  assert.ok(forward.hips[0]>35,'hip swings beyond previous 27-degree target');
  assert.ok(forward.knees[1]>48,'swing knee bends beyond old 35-degree target');
  assert.ok(forward.arms[0]<-28,'arm reaches a clear swing');
  assert.ok(forward.elbows[0]>38 && forward.elbows[1]<25);
  assert.ok(Math.abs(forward.spineRoll-backward.spineRoll)>10);
  assert.ok(Math.abs(forward.spineTwist-backward.spineTwist)>14);
  assert.ok(Math.abs(forward.hipShift-backward.hipShift)>.11);
});

test('forward and backward steps move an articulated upper-body spine in opposite directions',()=>{
  let a=createAnimationState(),b=createAnimationState();
  for(let i=0;i<55;i++){
    a=stepAnimation(a,walk(Math.PI/2),.016);
    b=stepAnimation(b,walk(-Math.PI/2),.016);
  }
  assert.ok(a.spineTwist>4&&b.spineTwist< -4);
  assert.ok(a.spineRoll<-3&&b.spineRoll>3);
  assert.ok(a.hipShift>.035&&b.hipShift<-.035);
  assert.ok(a.elbows[0]>a.elbows[1]+18);
  assert.ok(b.elbows[1]>b.elbows[0]+18);
});

test('walk animation remains distance driven for either frame rate or x3 speed',()=>{
  const metres=1.3,phase=metres*WALK_PHASE_PER_METER;
  assert.ok(nearly(gaitTargets(phase,1).hips[0],
    gaitTargets(3*(metres/3)*WALK_PHASE_PER_METER,1).hips[0]));
  let state=createAnimationState();
  for(let i=0;i<100;i++)state=stepAnimation(state,walk(phase),.016);
  assert.ok(state.walkWeight>.99&&state.spineLean>4);
});

test('idle, sofa and bedtime release spine/elbow motion to the neutral rig',()=>{
  let a=createAnimationState();
  for(let i=0;i<65;i++)a=stepAnimation(a,walk(Math.PI/2),.016);
  for(let i=0;i<100;i++)a=stepAnimation(a,{
    walking:false,using:'sofa',sofaWeight:1,gait:Math.PI/2},.016);
  assert.ok(a.legs[0]<-70&&a.knees[0]>70);
  assert.ok(Math.abs(a.spineLean)<.05);
  assert.ok(Math.abs(a.spineRoll)<.05);
  assert.ok(Math.abs(a.hipShift)<.0008);
  assert.ok(Math.abs(a.elbows[0])<.05);
  for(let i=0;i<100;i++)a=stepAnimation(a,{walking:false,using:'bed'},.016);
  assert.ok(a.eyeOpen<.2&&Math.abs(a.spineTwist)<.05);
});

test('pause freezes strong gait without disturbing persisted needs or relation',()=>{
  const game=newHousehold(),saved=JSON.stringify(game);
  let a=createAnimationState();
  for(let i=0;i<25;i++)a=stepAnimation(a,walk(i*.14),.016);
  const frozen=stepAnimation(a,walk(7),0);
  assert.equal(frozen,a);
  assert.equal(JSON.stringify(game),saved);
  const restored=loadHousehold(JSON.parse(saved));
  assert.equal(restored.version,1);
});
