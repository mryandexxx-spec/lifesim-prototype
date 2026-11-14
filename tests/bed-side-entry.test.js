import test from 'node:test';
import assert from 'node:assert/strict';
import {BED_SLOTS,BED_SLOT_IDS} from '../src/bed-layout.js';
import {FURNITURE,ACTOR_RADIUS,isWalkable,findPath,isClearLine}
  from '../src/navigation.js';
import {bedTransitionPose} from '../src/bed-transition.js';
import {stepAnimation,createAnimationState} from '../src/animations.js';
import {newHousehold,chooseResidentAction,bedSlotFor} from '../src/household.js';

const epsilon=(x,y,t=.005)=>Math.abs(x-y)<t;
const bed=FURNITURE.find(x=>x.id==='bed');
const worldHip=pose=>{
  const pitch=pose.pitch*Math.PI/180,yaw=pose.yaw*Math.PI/180,roll=pose.roll*Math.PI/180;
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const cr=Math.cos(roll),sr=Math.sin(roll);
  return {
    x:pose.x+.72*(-cy*sr+sy*cr*sp),
    y:pose.y+.72*cr*cp,
    z:pose.z+.72*(sy*sr+cy*cr*sp)
  };
};
const sample=(slot,p)=>bedTransitionPose({slot,progress:p});

test('both approaches are at the LONG SIDE, in the mattress middle, never near its foot',()=>{
  const middle=(bed.minZ+bed.maxZ)/2;
  for(const slot of BED_SLOT_IDS){
    const spec=BED_SLOTS[slot];
    assert.ok(Math.abs(spec.approach.z-middle)<.28,
      'approach should face the long side at the mattress center');
    assert.ok(Math.abs(spec.edgeZ-middle)<.28,'seat should not be at mattress foot');
    assert.ok(spec.approach.z<bed.maxZ-.9,'not at the bottom edge');
    assert.ok(spec.approach.z>bed.minZ+.9,'not at the headboard');
    assert.ok(isWalkable(spec.approach.x,spec.approach.z),
      'outside approach should be collision free');
    if(slot==='left'){
      assert.ok(spec.approach.x<bed.minX-ACTOR_RADIUS);
      assert.ok(spec.edgeX<spec.pose.x-.45);
      assert.equal(spec.approachYaw,-90);
    }else{
      assert.ok(spec.approach.x>bed.maxX+ACTOR_RADIUS);
      assert.ok(spec.edgeX>spec.pose.x+.45);
      assert.equal(spec.approachYaw,90);
    }
  }
});
test('nightstand no longer blocks the left-side access corridor',()=>{
  const table=FURNITURE.find(x=>x.id==='nightstand');
  assert.ok(table.maxZ<bed.minZ+.05,'table is beside headboard, not mid-rail');
  for(const z of [-.65,-.9,-1.1,-1.42,-1.65,-1.9,-2.2]){
    assert.ok(isWalkable(BED_SLOTS.left.approach.x,z),
      'long side left corridor must be open at z='+z);
  }
});
test('both residents can reach either bedside via collision-safe A* from living area',()=>{
  for(const origin of [{x:-.8,z:2.95},{x:1.2,z:.5},{x:0,z:-.8}]){
    for(const side of BED_SLOT_IDS){
      const dest=BED_SLOTS[side].approach;
      const route=findPath(origin,dest);
      assert.ok(route && route.length,
        side+' long-side route missing from '+JSON.stringify(origin));
      let previous=origin;
      for(const waypoint of route){
        assert.ok(isClearLine(previous,waypoint),
          side+' navigation intersects furniture');
        previous=waypoint;
      }
      assert.deepEqual(previous,dest);
    }
  }
});
test('during the SIT, both hips are by the long rails with feet facing outside',()=>{
  const a=sample('left',.45),b=sample('right',.45);
  for(const side of BED_SLOT_IDS){
    const actual=sample(side,.49),geometry=BED_SLOTS[side],hip=worldHip(actual);
    assert.ok(epsilon(hip.x,geometry.edgeX,.013));
    assert.ok(epsilon(hip.z,-1.42,.01));
    assert.ok(epsilon(hip.y,.65,.02));
    assert.ok(epsilon(actual.pitch,0));
    assert.ok(epsilon(actual.yaw,geometry.approachYaw));
    assert.ok(actual.bedSitWeight>.75&&actual.bedReclineWeight===0);
  }
  assert.ok(a.yaw<0&&b.yaw>0);
});
test('during RECLINE, hip moves across bed width, never toward its foot',()=>{
  for(const side of BED_SLOT_IDS){
    let last=null;
    for(let i=0;i<=100;i++){
      const p=.53+i/100*.47;
      const pose=sample(side,p),hip=worldHip(pose),geometry=BED_SLOTS[side];
      assert.ok(epsilon(hip.z,-1.42,.002),'hip must stay centered lengthwise');
      assert.ok(epsilon(hip.y,.65,.002),'hip stays supported on mattress');
      if(side==='left'){
        assert.ok(hip.x>=geometry.edgeX-.005&&hip.x<=geometry.pose.x+.005);
        if(last)assert.ok(hip.x>=last-.005);
      }else{
        assert.ok(hip.x<=geometry.edgeX+.005&&hip.x>=geometry.pose.x-.005);
        if(last)assert.ok(hip.x<=last+.005);
      }
      last=hip.x;
    }
  }
});
test('a short sideways step is animated before sitting, with opposite leg direction',()=>{
  const result={};
  for(const side of BED_SLOT_IDS){
    const pose=sample(side,.16);
    assert.ok(pose.bedStepWeight>.7);
    assert.equal(pose.bedSitWeight,0);
    let state=createAnimationState();
    for(let i=0;i<70;i++)state=stepAnimation(state,{
      using:'bed',bedSide:side,bedStepWeight:pose.bedStepWeight,
      bedSitWeight:0,bedReclineWeight:0,bedSwingWeight:0},.016);
    result[side]=state;
    assert.ok(Math.abs(state.legs[0])>10);
  }
  assert.ok(result.left.legs[0]*result.right.legs[0]<0,
    'left and right side step should mirror legs');
});
test('left/right side entries and exit remain reserved by availability, not by name',()=>{
  for(const actorId of ['alex','mira']){
    for(const side of BED_SLOT_IDS){
      const game=newHousehold(),resident=actorId==='alex'?game:game.otherSim;
      resident.position={...BED_SLOTS[side].approach};
      assert.equal(bedSlotFor(game,actorId),side);
      assert.ok(chooseResidentAction(game,'bed',false,actorId));
      assert.equal(resident.action.bedSlot,side);
    }
  }
});
test('direct phase samples remain continuous without a second render spring',()=>{
  for(const side of BED_SLOT_IDS){
    let p=sample(side,0);
    for(let i=1;i<=260;i++){
      const next=sample(side,i/260);
      const blended=next;
      assert.ok(Number.isFinite(blended.x)&&Number.isFinite(blended.yaw));
      assert.ok(Math.hypot(blended.x-p.x,blended.y-p.y,blended.z-p.z)<.04);
      p=blended;
    }
  }
});
