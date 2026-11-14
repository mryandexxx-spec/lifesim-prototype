import test from 'node:test';
import assert from 'node:assert/strict';
import {BED_SLOTS,BED_SLOT_IDS} from '../src/bed-layout.js';
import {createBedTransition,advanceBedTransition,bedTransitionPose,
  BED_ENTER_SECONDS,BED_EXIT_SECONDS} from '../src/bed-transition.js';
import {createAnimationState,stepAnimation} from '../src/animations.js';

const close=(a,b,t=.001)=>Math.abs(a-b)<=t;
const pose=(slot,p)=>bedTransitionPose({slot,progress:p});
const hipY=p=>p.y+.72*Math.cos(p.pitch*Math.PI/180)*Math.cos(p.roll*Math.PI/180);

test('left and right approaches use opposite rotations and matched mirrored trajectories',()=>{
  for(const p of [.05,.15,.27,.34,.45,.58,.73,.85,.99,1]){
    const l=pose('left',p),r=pose('right',p);
    assert.equal(l.bedSide,'left');assert.equal(r.bedSide,'right');
    assert.ok(close(l.yaw,-r.yaw,.002),'opposite side yaw');
    assert.ok(close(l.roll,-r.roll,.002),'opposite side roll');
    assert.ok(close(l.x+r.x,BED_SLOTS.left.x+BED_SLOTS.right.x,.06),
      'mirrored x tracks separate halves instead of using one canned x trajectory');
    assert.ok(close(l.z,r.z,.002));
    assert.ok(close(l.pitch,r.pitch,.002));
  }
});
test('both side-sitters face OUTWARD until seated, and rotate toward pillows only afterward',()=>{
  for(const slot of BED_SLOT_IDS){
    const approach=pose(slot,.03),turning=pose(slot,.3),perch=pose(slot,.49),
      swinging=pose(slot,.61),lying=pose(slot,1);
    assert.equal(approach.pitch,0);
    assert.ok(close(Math.abs(turning.yaw),90), 'turn is not toward foot before sitting');
    assert.ok(close(Math.abs(perch.yaw),90), 'both legs dangle OUTSIDE long edge');
    assert.ok(perch.z<-1.2,'sit beside mattress, not at bed foot');
    assert.equal(perch.pitch,0);
    assert.ok(perch.bedSitWeight>.8 && perch.bedReclineWeight===0);
    assert.ok(swinging.bedReclineWeight===0&&swinging.bedSwingWeight>.8);
    assert.ok(Math.abs(swinging.yaw)<90,'turn follows seated leg swing');
    assert.ok(Math.abs(swinging.roll)===0);
    assert.ok(close(lying.pitch,-78));
    assert.ok(close(lying.roll,0));
    assert.ok(close(lying.x,BED_SLOTS[slot].pose.x,.02));
  }
});
test('world pelvis remains supported throughout the sit and reclining arc',()=>{
  for(const slot of BED_SLOT_IDS){
    for(let i=0;i<=500;i++){
      const p=i/500,body=pose(slot,p);
      assert.ok(Number.isFinite(body.x)&&Number.isFinite(body.y));
      assert.ok(hipY(body)>=.65-.001&&hipY(body)<=.7201);
      if(p>.54)assert.ok(close(hipY(body),.65,.002));
    }
  }
});
test('sampled left and right movement is continuous at actual frame cadence',()=>{
  for(const slot of BED_SLOT_IDS){
    let previous=pose(slot,0);
    for(let i=1;i<=Math.ceil(BED_ENTER_SECONDS*60);i++){
      const current=pose(slot,Math.min(1,i/(BED_ENTER_SECONDS*60)));
      const motion=Math.hypot(current.x-previous.x,current.y-previous.y,current.z-previous.z);
      assert.ok(motion<.037,'root moved too far in a single animation frame');
      assert.ok(Math.abs(current.pitch-previous.pitch)<2.1);
      assert.ok(Math.abs(current.yaw-previous.yaw)<3.3);
      assert.ok(Math.abs(current.roll-previous.roll)<1.3);
      previous=current;
    }
  }
});
test('pause freezes the same sampled contact pose without a second render filter',()=>{
  const state={slot:'left',progress:.80};
  const held=advanceBedTransition(state,true,'left',0);
  assert.equal(held,state);
  assert.deepEqual(bedTransitionPose(held),bedTransitionPose(state));
});
test('left and right legs, body twist, and brace arm animate in opposite directions',()=>{
  const result={};
  for(const side of BED_SLOT_IDS){
    let s=createAnimationState();
    const p=pose(side,.61);
    for(let i=0;i<65;i++){
      s=stepAnimation(s,{using:'bed',bedSide:side,
        bedSitWeight:p.bedSitWeight,bedReclineWeight:p.bedReclineWeight,
        bedSwingWeight:p.bedSwingWeight},.016);
    }
    result[side]=s;
  }
  assert.ok(result.left.bedHipYaw[0]>14);
  assert.ok(result.right.bedHipYaw[0]<-14);
  assert.ok(result.left.spineTwist>8&&result.right.spineTwist< -8);
  assert.ok(result.left.elbows[0]>result.left.elbows[1]+10);
  assert.ok(result.right.elbows[1]>result.right.elbows[0]+10);
});
test('exit reverses each side without swapping its reserved mattress half',()=>{
  for(const side of BED_SLOT_IDS){
    let state=createBedTransition();
    const start=advanceBedTransition(state,true,side,.016);
    assert.equal(advanceBedTransition(start,true,side,0),start);
    const ignored=advanceBedTransition(start,true,side==='left'?'right':'left',.016);
    assert.equal(ignored.slot,side);
    for(let i=0;i<360;i++)state=advanceBedTransition(state,true,side,1/60);
    assert.equal(state.progress,1);
    for(let i=0;i<360;i++)state=advanceBedTransition(state,false,null,1/60);
    assert.equal(state.progress,0);
    assert.equal(bedTransitionPose(state),null);
  }
});
test('no bed gesture leaks into standing state after completed exit',()=>{
  let s=createAnimationState();
  const at=pose('right',.77);
  for(let i=0;i<70;i++)s=stepAnimation(s,{using:'bed',bedSide:'right',
    bedSitWeight:at.bedSitWeight,bedReclineWeight:at.bedReclineWeight,
    bedSwingWeight:at.bedSwingWeight},.016);
  for(let i=0;i<110;i++)s=stepAnimation(s,{using:null,bedSide:null,
    bedSitWeight:0,bedReclineWeight:0,bedSwingWeight:0},.016);
  assert.ok(Math.abs(s.bedHipYaw[0])<.001);
  assert.ok(Math.abs(s.bedHipRoll[1])<.001);
  assert.ok(Math.abs(s.spineTwist)<.001);
  assert.ok(Math.abs(s.elbows[0])<.02);
});
