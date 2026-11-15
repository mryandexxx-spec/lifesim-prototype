import test from 'node:test';
import assert from 'node:assert/strict';
import {BED_SLOTS,BED_SLOT_IDS} from '../src/bed-layout.js';
import {newHousehold,loadHousehold,chooseResidentAction,tickHousehold,
  bedSlotFor,chooseFreeBedSlot} from '../src/household.js';
import {createBedTransition,advanceBedTransition,bedTransitionPose} from '../src/bed-transition.js';
import {arrive,ACTIONS} from '../src/simulation.js';
import {createAnimationState,stepAnimation} from '../src/animations.js';

const close=(a,b,t=.01)=>Math.abs(a-b)<=t;
const near=(p,x,z)=>{p.x=x;p.z=z;};
test('either resident chooses the nearest free bed side, never by name',()=>{
  for(const id of ['alex','mira']){
    for(const slot of BED_SLOT_IDS){
      const g=newHousehold();
      const who=id==='alex'?g:g.otherSim;
      near(who,BED_SLOTS[slot].approach.x,BED_SLOTS[slot].approach.z);
      // Position is on the actor, not the household root.
      who.position={...BED_SLOTS[slot].approach};
      assert.equal(bedSlotFor(g,id),slot);
      assert.equal(chooseResidentAction(g,'bed',false,id),true);
      assert.equal(who.action.bedSlot,slot);
    }
  }
});
test('an occupied half is unavailable, but the other is selectable by either person',()=>{
  for(const firstId of ['alex','mira']){
    const g=newHousehold(),secondId=firstId==='alex'?'mira':'alex';
    const first=firstId==='alex'?g:g.otherSim;
    first.position={...BED_SLOTS.right.approach};
    assert.ok(chooseResidentAction(g,'bed',false,firstId));
    assert.equal(first.action.bedSlot,'right');
    const other=secondId==='alex'?g:g.otherSim;
    other.position={...BED_SLOTS.right.approach};
    assert.equal(bedSlotFor(g,secondId),'left');
    assert.ok(chooseResidentAction(g,'bed',false,secondId));
    assert.equal(other.action.bedSlot,'left');
  }
});
test('same resident can select the other half on a later sleep',()=>{
  const g=newHousehold();
  g.position={...BED_SLOTS.left.approach};
  assert.ok(chooseResidentAction(g,'bed',false,'alex'));
  assert.equal(g.action.bedSlot,'left');
  assert.equal(chooseResidentAction(g,'sofa',false,'alex'),false,
    'a new request must not replace ongoing sleep');
  arrive(g);tickHousehold(g,ACTIONS.bed.duration+1);
  g.position={...BED_SLOTS.right.approach};
  assert.ok(chooseResidentAction(g,'bed',false,'alex'));
  assert.equal(g.action.bedSlot,'right');
});
test('legacy saves with absent and duplicate slots preserve v1 without personal assignments',()=>{
  const g=newHousehold();
  g.position={...BED_SLOTS.right.approach};
  g.otherSim.position={...BED_SLOTS.left.approach};
  assert.ok(chooseResidentAction(g,'bed',false,'alex'));
  assert.ok(chooseResidentAction(g,'bed',false,'mira'));
  const old=JSON.parse(JSON.stringify(g));
  delete old.action.bedSlot;delete old.otherSim.action.bedSlot;
  const loaded=loadHousehold(old);
  assert.equal(loaded.version,1);
  assert.equal(loaded.action.bedSlot,'right');
  assert.equal(loaded.otherSim.action.bedSlot,'left');
  const dup=JSON.parse(JSON.stringify(g));
  dup.otherSim.action.bedSlot=dup.action.bedSlot;
  const restored=loadHousehold(dup);
  assert.notEqual(restored.action.bedSlot,restored.otherSim.action.bedSlot);
});
test('the character first sits with knees bent BEFORE beginning to lie down',()=>{
  for(const slot of BED_SLOT_IDS){
    const start=bedTransitionPose({slot,progress:.001});
    const perch=bedTransitionPose({slot,progress:.45});
    const midway=bedTransitionPose({slot,progress:.85});
    const lie=bedTransitionPose({slot,progress:1});
    assert.ok(close(start.x,BED_SLOTS[slot].approach.x,.01));
    assert.ok(close(start.y,0,.01));
    assert.ok(perch.bedSitWeight>.55);
    assert.ok(perch.bedReclineWeight<.01);
    assert.ok(close(perch.pitch,0,.01),'sit before reclining');
    assert.ok(midway.pitch< -20&&midway.pitch> -78);
    assert.ok(midway.roll===0,'reclines in a stable sagittal plane');
    assert.ok(close(lie.pitch,-78));
    assert.ok(close(lie.x,BED_SLOTS[slot].pose.x));
    assert.ok(close(lie.bedSitWeight,0));
    assert.ok(close(lie.bedReclineWeight,1));
  }
});
test('hip stays supported while avatar reclines, preventing sinking/teleport',()=>{
  for(const slot of BED_SLOT_IDS){
    let before=null;
    for(let i=0;i<=180;i++){
      const progress=.53+i/180*.47;
      const p=bedTransitionPose({slot,progress});
      const hipHeight=p.y+.72*Math.cos(p.pitch*Math.PI/180)*
        Math.cos(p.roll*Math.PI/180);
      assert.ok(Math.abs(hipHeight-.65)<.008,'hip tracks mattress plane with mirrored roll');
      if(before)assert.ok(Math.hypot(p.x-before.x,p.y-before.y,p.z-before.z)<.035);
      before=p;
    }
  }
});
test('knee, elbow and torso animate on entering bed and reverse on standing',()=>{
  let state=createAnimationState();
  for(const progress of [.34,.39,.45,.49,.51]){
    const pose=bedTransitionPose({slot:'left',progress});
    for(let i=0;i<15;i++)
      state=stepAnimation(state,{using:'bed',bedSitWeight:pose.bedSitWeight,
        bedReclineWeight:pose.bedReclineWeight},.016);
  }
  assert.ok(state.legs[0]<-40&&state.knees[0]>40);
  assert.ok(state.elbows[0]>12);
  const laid=bedTransitionPose({slot:'left',progress:1});
  for(let i=0;i<80;i++)state=stepAnimation(state,{using:'bed',
    bedSitWeight:laid.bedSitWeight,bedReclineWeight:laid.bedReclineWeight},.016);
  assert.ok(state.legs[0]>-12 && state.knees[0]<18);
  assert.ok(state.eyeOpen<.2);
  let trans={progress:1,slot:'left'};
  for(let i=0;i<320;i++){
    trans=advanceBedTransition(trans,false,null,.016);
    const pose=bedTransitionPose(trans);
    state=stepAnimation(state,{using:null,bedSitWeight:pose?.bedSitWeight||0,
      bedReclineWeight:pose?.bedReclineWeight||0},.016);
  }
  assert.equal(trans.progress,0);
  assert.ok(Math.abs(state.legs[0])<.2&&Math.abs(state.knees[0])<.2);
});
test('paused entry and interrupted exit do not move or change reserved halves',()=>{
  const start=createBedTransition();
  const enter=advanceBedTransition(start,true,'right',.016);
  assert.equal(advanceBedTransition(enter,true,'right',0),enter);
  assert.equal(advanceBedTransition(enter,true,'right',NaN),enter);
  const rising=advanceBedTransition({progress:1,slot:'right'},false,null,.016);
  assert.equal(rising.slot,'right');
  assert.ok(rising.progress<1);
});
