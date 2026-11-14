import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTIONS,arrive,newGame,loadGame} from '../src/simulation.js';
import {newHousehold,loadHousehold,getActor,chooseResidentAction,
  furnitureAvailable,bedSlotFor,bedDestinationFor,tickHousehold,setHouseholdAutonomy}
  from '../src/household.js';
import {BED_CAPACITY,BED_SLOTS,BED_SLOT_IDS,availableBedSlot,validBedSlot}
  from '../src/bed-layout.js';
import {findPath,isWalkable,isClearLine} from '../src/navigation.js';
import {createBedTransition,advanceBedTransition,bedTransitionPose,
  BED_ENTER_SECONDS,BED_EXIT_SECONDS} from '../src/bed-transition.js';

const near=(a,b,t=.00001)=>Math.abs(a-b)<=t;
const advance=(state,using,slot,seconds)=>{
  for(let i=0;i<Math.ceil(seconds*60);i++)state=advanceBedTransition(state,using,slot,1/60);
  return state;
};
test('bed has two geometrically distinct halves, two quilt/pillow alignments',()=>{
  assert.equal(BED_CAPACITY,2);
  assert.deepEqual(BED_SLOT_IDS,['left','right']);
  assert.ok(BED_SLOTS.left.x<BED_SLOTS.right.x);
  assert.ok(BED_SLOTS.right.x-BED_SLOTS.left.x>1);
  assert.ok(BED_SLOTS.left.pose.x!==BED_SLOTS.right.pose.x);
  assert.ok(BED_SLOTS.left.approach.x<-3.83);
  assert.ok(BED_SLOTS.right.approach.x>-1.41);
  for(const id of BED_SLOT_IDS){
    const slot=BED_SLOTS[id];
    assert.equal(slot.pose.pitch,-85);
    assert.ok(slot.pose.z<slot.approach.z);
  }
});
test('each side has a real collision-free A* route from the living room',()=>{
  for(const slot of Object.values(BED_SLOTS)){
    assert.ok(isWalkable(slot.approach.x,slot.approach.z),slot.id+' approach blocked');
    const from={x:-.25,z:.35};
    const path=findPath(from,slot.approach);
    assert.ok(path?.length,slot.id+' has no A* path');
    let prev=from;
    for(const next of path){
      assert.ok(isClearLine(prev,next),slot.id+' route crosses furniture');
      prev=next;
    }
    assert.deepEqual(prev,slot.approach);
  }
});
test('manual Alex and Mira can reserve separate halves and recover energy together',()=>{
  const game=newHousehold();
  game.needs.energy=8;game.otherSim.needs.energy=10;
  assert.equal(chooseResidentAction(game,'bed',false,'alex'),true);
  assert.equal(chooseResidentAction(game,'bed',false,'mira'),true);
  assert.equal(game.action.bedSlot,'left');
  assert.equal(game.otherSim.action.bedSlot,'right');
  assert.equal(furnitureAvailable(game,'bed','alex'),true);
  assert.deepEqual(bedDestinationFor(game,'alex'),BED_SLOTS.left.approach);
  assert.deepEqual(bedDestinationFor(game,'mira'),BED_SLOTS.right.approach);
  arrive(game);arrive(game.otherSim);
  tickHousehold(game,9);
  assert.ok(game.needs.energy>8&&game.otherSim.needs.energy>10);
  assert.equal(game.action.phase,'using');
  assert.equal(game.otherSim.action.phase,'using');
});
test('capacity 2 rejects a third claimant; all other furniture remain single-capacity',()=>{
  assert.equal(availableBedSlot(['left','right'],'left'),null);
  assert.equal(availableBedSlot(['right'],'left'),'left');
  assert.equal(availableBedSlot(['left'],'left'),'right');
  assert.equal(availableBedSlot(['left','garbage'],'right'),'right');
  const game=newHousehold();
  assert.equal(chooseResidentAction(game,'fridge',false,'alex'),true);
  assert.equal(furnitureAvailable(game,'fridge','mira'),false);
  assert.equal(chooseResidentAction(game,'fridge',false,'mira'),false);
});
test('save/reload preserves occupied halves and old v1 action objects migrate',()=>{
  const s=newHousehold();
  assert.ok(chooseResidentAction(s,'bed',false,'alex'));
  assert.ok(chooseResidentAction(s,'bed',false,'mira'));
  s.otherSim.needs.energy=17;
  const serialized=JSON.stringify(s);
  const restored=loadHousehold(JSON.parse(serialized));
  assert.equal(restored.version,1);
  assert.equal(restored.action.bedSlot,'left');
  assert.equal(restored.otherSim.action.bedSlot,'right');
  assert.equal(restored.otherSim.needs.energy,17);
  assert.equal(restored.selectedSim,'alex');
  const old=JSON.parse(serialized);
  delete old.action.bedSlot;delete old.otherSim.action.bedSlot;
  const migrated=loadHousehold(old);
  assert.equal(migrated.action.bedSlot,'left');
  assert.equal(migrated.otherSim.action.bedSlot,'right');
  const corrupt=JSON.parse(serialized);
  corrupt.action.bedSlot='right';corrupt.otherSim.action.bedSlot='right';
  const fixed=loadHousehold(corrupt);
  assert.equal(fixed.action.bedSlot,'right');
  assert.equal(fixed.otherSim.action.bedSlot,'left');
  const lone=loadGame({ ...newGame(),action:{id:'bed',phase:'using',elapsed:3,bedSlot:'right'} });
  assert.equal(lone.action.bedSlot,'right');
});
test('one resident leaves bed and frees only their half; other stays asleep',()=>{
  const s=newHousehold();
  chooseResidentAction(s,'bed',false,'alex');
  chooseResidentAction(s,'bed',false,'mira');
  arrive(s);arrive(s.otherSim);
  assert.ok(chooseResidentAction(s,'fridge',false,'alex'));
  assert.equal(s.action.id,'fridge');
  assert.equal(s.otherSim.action.id,'bed');
  assert.equal(s.otherSim.action.bedSlot,'right');
  assert.equal(bedSlotFor(s,'alex'),'left');
  assert.ok(chooseResidentAction(s,'bed',false,'alex'));
  assert.equal(s.action.bedSlot,'left');
});
test('disabling autonomy removes only automatic beds and retains manual sleep',()=>{
  const s=newHousehold();
  assert.ok(chooseResidentAction(s,'bed',true,'alex'));
  assert.ok(chooseResidentAction(s,'bed',false,'mira'));
  setHouseholdAutonomy(s,false);
  assert.equal(s.action,null);
  assert.equal(s.otherSim.action.id,'bed');
  assert.equal(s.otherSim.action.bedSlot,'right');
  assert.equal(s.autonomy.enabled,false);
});
test('two independent staged bed entries and exits produce smooth bounded motion',()=>{
  for(const slot of BED_SLOT_IDS){
    let state=createBedTransition();
    assert.equal(advanceBedTransition(state,true,slot,0),state);
    assert.equal(advanceBedTransition(state,true,slot,NaN),state);
    let prior=null;
    for(let i=0;i<160;i++){
      state=advanceBedTransition(state,true,slot,1/60);
      const p=bedTransitionPose(state);
      assert.ok(p);
      if(prior){
        assert.ok(Math.hypot(p.x-prior.x,p.y-prior.y,p.z-prior.z)<.065);
        assert.ok(Math.abs(p.pitch-prior.pitch)<9);
      }
      prior=p;
    }
    assert.equal(state.progress,1);
    assert.equal(state.slot,slot);
    const lying=bedTransitionPose(state);
    assert.ok(near(lying.x,BED_SLOTS[slot].pose.x));
    assert.ok(near(lying.pitch,-85));
    state=advance(state,false,null,BED_EXIT_SECONDS+.10);
    assert.equal(state.progress,0);
    assert.equal(bedTransitionPose(state),null);
  }
});
test('bed approach starts on own side and turns toward own mattress, never shares a pose',()=>{
  const left=bedTransitionPose({progress:.2,slot:'left'});
  const right=bedTransitionPose({progress:.2,slot:'right'});
  assert.ok(left.x<-3.85&&right.x>-1.38);
  assert.equal(left.y,0);assert.equal(right.y,0);
  assert.ok(left.yaw>0&&right.yaw<0);
  const lateLeft=bedTransitionPose({progress:.85,slot:'left'});
  const lateRight=bedTransitionPose({progress:.85,slot:'right'});
  assert.ok(lateLeft.x<lateRight.x);
  assert.ok(lateLeft.bedWeight>.6&&lateRight.bedWeight>.6);
  assert.equal(validBedSlot('alien'),false);
});
