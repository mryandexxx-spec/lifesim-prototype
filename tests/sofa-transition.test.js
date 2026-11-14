import test from 'node:test';
import assert from 'node:assert/strict';
import {SOFA_APPROACH,SOFA_POSE,SOFA_LAYOUT,SOFA_FRONT_EDGE,LEG_GEOMETRY,
  SOFA_HIP_PITCH,SOFA_KNEE_PITCH} from '../src/pose-config.js';
import {createSofaTransition,advanceSofaTransition,sofaTransitionPose,
  SOFA_ENTER_SECONDS,SOFA_EXIT_SECONDS} from '../src/sofa-transition.js';
import {ACTIONS} from '../src/simulation.js';
import {FURNITURE,isWalkable,findPath} from '../src/navigation.js';
import {createAnimationState,stepAnimation} from '../src/animations.js';
import {newHousehold,loadHousehold} from '../src/household.js';
const near=(x,y,eps=.001)=>Math.abs(x-y)<=eps;
const rad=d=>d*Math.PI/180;
const at=p=>sofaTransitionPose({progress:p});
function run(state,engaged,seconds,dt=1/60){
  for(let i=0;i<Math.ceil(seconds/dt);i++)
    state=advanceSofaTransition(state,engaged,dt);
  return state;
}
test('sofa route is reachable at the FRONT with a clearance from the table',()=>{
  assert.deepEqual(ACTIONS.sofa.location,[SOFA_APPROACH.x,SOFA_APPROACH.z]);
  assert.ok(isWalkable(...ACTIONS.sofa.location));
  const table=FURNITURE.find(f=>f.id==='table');
  assert.ok(table.maxZ<.16&&table.minZ<-.60);
  assert.ok(findPath({x:-.48,z:1.46},SOFA_APPROACH)?.length>0);
  assert.ok(SOFA_APPROACH.z<SOFA_FRONT_EDGE);
});
test('step toward seat, then turn, bend, and lower in that order',()=>{
  const start=at(0),step=at(.20),turned=at(.43),bent=at(.67),end=at(1);
  assert.ok(near(start.z,SOFA_APPROACH.z)&&near(start.y,0));
  assert.ok(step.z>start.z&&near(step.y,0));
  assert.ok(step.yaw<1&&step.sofaWeight<.01);
  assert.ok(turned.yaw>179&&near(turned.y,0));
  assert.ok(bent.z>turned.z&&bent.sofaWeight>.5);
  assert.ok(bent.y<0&&bent.y>SOFA_POSE.y);
  assert.ok(near(end.y,SOFA_POSE.y)&&near(end.z,SOFA_POSE.z));
  assert.ok(near(end.sofaWeight,1));
});
test('the pelvis bottom rests ABOVE the cushion with shoes by the floor',()=>{
  const top=SOFA_LAYOUT.seatCenterY+SOFA_LAYOUT.seatHeight/2;
  const pelvisBottom=SOFA_POSE.y+.73-.30/2;
  assert.ok(pelvisBottom>=top&&pelvisBottom-top<.055);
  const hip=SOFA_POSE.y+LEG_GEOMETRY.hipHeight;
  const knee=hip+LEG_GEOMETRY.kneeOffsetY*Math.cos(rad(SOFA_HIP_PITCH));
  const sole=knee+LEG_GEOMETRY.shoeCenterY*
    Math.cos(rad(SOFA_HIP_PITCH+SOFA_KNEE_PITCH))-LEG_GEOMETRY.shoeHeight/2;
  assert.ok(sole>=0&&sole<.10);
});
test('pause freezes animation and sit-to-stand is fully reversible',()=>{
  const initial=createSofaTransition();
  assert.equal(advanceSofaTransition(initial,true,0),initial);
  assert.equal(advanceSofaTransition(initial,true,NaN),initial);
  const first=advanceSofaTransition(initial,true,.016);
  assert.ok(first.progress>0&&first.progress<.03);
  const seated=run(first,true,SOFA_ENTER_SECONDS+.1);
  assert.equal(seated.progress,1);
  const rising=advanceSofaTransition(seated,false,.016);
  assert.ok(rising.progress<1&&rising.progress>.97);
  const stood=run(rising,false,SOFA_EXIT_SECONDS+.1);
  assert.equal(stood.progress,0);
  assert.deepEqual(at(stood.progress),at(0));
});
test('animation has no teleport or jump larger than one small movement per frame',()=>{
  let state=createSofaTransition(),before=at(0);
  for(let i=0;i<135;i++){
    state=advanceSofaTransition(state,true,1/60);
    const next=sofaTransitionPose(state);
    assert.ok(Math.hypot(next.x-before.x,next.y-before.y,next.z-before.z)<.07);
    assert.ok(Math.abs(next.yaw-before.yaw)<19);
    assert.ok(next.z>=before.z-.00001);
    before=next;
  }
});
test('knee angles follow transition weight and straighten on exit',()=>{
  let seat=createSofaTransition(),legs=createAnimationState();
  for(let i=0;i<130;i++){
    seat=advanceSofaTransition(seat,true,1/60);
    legs=stepAnimation(legs,{using:'sofa',
      sofaWeight:sofaTransitionPose(seat).sofaWeight},1/60);
  }
  assert.ok(legs.knees[0]>SOFA_KNEE_PITCH-2);
  assert.ok(legs.legs[0]<SOFA_HIP_PITCH+2);
  for(let i=0;i<110;i++){
    seat=advanceSofaTransition(seat,false,1/60);
    legs=stepAnimation(legs,{using:null,
      sofaWeight:sofaTransitionPose(seat).sofaWeight},1/60);
  }
  assert.equal(seat.progress,0);
  assert.ok(Math.abs(legs.knees[0])<8&&Math.abs(legs.legs[0])<8);
});
test('each resident has independent purely visual progress and old saves work',()=>{
  const alex=advanceSofaTransition(createSofaTransition(),true,.06);
  const mira=advanceSofaTransition(createSofaTransition(),false,.06);
  assert.ok(alex.progress>0&&mira.progress===0);
  const saved=newHousehold(),json=JSON.stringify(saved);
  run(alex,true,SOFA_ENTER_SECONDS);
  assert.equal(JSON.stringify(saved),json);
  assert.equal(loadHousehold(JSON.parse(json)).version,1);
});
