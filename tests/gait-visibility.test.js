import test from 'node:test';
import assert from 'node:assert/strict';
import {gaitTargets,WALK_PHASE_PER_METER} from '../src/locomotion.js';
import {createAnimationState,stepAnimation} from '../src/animations.js';
import {newHousehold,loadHousehold} from '../src/household.js';

const walk=(phase,moving=true)=>({
  id:'alex',walking:moving,gait:phase,energy:65,mood:65,using:null
});
const nearly=(a,b,eps=.0001)=>Math.abs(a-b)<eps;

test('polished gait bends lifted knee without exaggerated full-body flailing',()=>{
  const forward=gaitTargets(Math.PI/2,1,75);
  const backward=gaitTargets(-Math.PI/2,1,75);
  assert.ok(forward.hips[0]<-14,'lifting leg moves forward');
  assert.ok(forward.knees[0]>48,'swing knee clears ground');
  assert.ok(forward.knees[1]<20,'planted leg remains close to straight');
  assert.ok(forward.arms[0]<-16 && forward.arms[0]>-20);
  assert.ok(forward.elbows[0]>20&&forward.elbows[0]<25);
  assert.ok(Math.abs(forward.spineRoll-backward.spineRoll)>4);
  assert.ok(Math.abs(forward.spineTwist-backward.spineTwist)>5.8);
  assert.ok(Math.abs(forward.hipShift-backward.hipShift)>.045);
});

test('forward and backward steps move an articulated upper-body spine in opposite directions',()=>{
  let a=createAnimationState(),b=createAnimationState();
  for(let i=0;i<55;i++){
    a=stepAnimation(a,walk(Math.PI/2),.016);
    b=stepAnimation(b,walk(-Math.PI/2),.016);
  }
  assert.ok(a.spineTwist>2.5&&b.spineTwist< -2.5);
  assert.ok(a.spineRoll<-2&&b.spineRoll>2);
  assert.ok(a.hipShift>.02&&b.hipShift<-.02);
  assert.ok(a.elbows[0]>a.elbows[1]+8);
  assert.ok(b.elbows[1]>b.elbows[0]+8);
});

test('walk animation remains distance driven for either frame rate or x3 speed',()=>{
  const metres=1.3,phase=metres*WALK_PHASE_PER_METER;
  assert.ok(nearly(gaitTargets(phase,1).hips[0],
    gaitTargets(3*(metres/3)*WALK_PHASE_PER_METER,1).hips[0]));
  let state=createAnimationState();
  for(let i=0;i<100;i++)state=stepAnimation(state,walk(phase),.016);
  assert.ok(state.walkWeight>.99&&state.spineLean>2);
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
