import test from 'node:test';
import assert from 'node:assert/strict';
import * as pc from 'playcanvas';
import {FRIDGE_LAYOUT,FRIDGE_EAT_START,FRIDGE_FACING_YAW,fridgeSequence,
  fridgeDoorSegment,fridgeDoorClearance,closeFridgeDoor} from '../src/fridge-interaction.js';
import {ACTIONS,arrive,tick} from '../src/simulation.js';
import {isWalkable,isClearLine,findPath,FURNITURE} from '../src/navigation.js';
import {newHousehold,loadHousehold,chooseResidentAction,furnitureAvailable,
  setHouseholdAutonomy,tickHousehold} from '../src/household.js';
import {createAnimationState,stepAnimation} from '../src/animations.js';

test('fridge stand is walkable, faces the handle, and is reachable from all initial positions',()=>{
  const a=FRIDGE_LAYOUT.approach;
  assert.deepEqual(ACTIONS.fridge.location,[a.x,a.z]);
  assert.ok(isWalkable(a.x,a.z));
  for(const from of [{x:-.25,z:.35},{x:-.8,z:2.95},{x:1.35,z:.52}]){
    const route=findPath(from,a);
    assert.ok(route?.length,'missing route from '+JSON.stringify(from));
    let prev=from;
    for(const next of route){assert.ok(isClearLine(prev,next));prev=next;}
    assert.deepEqual(prev,a);
  }
  const dx=FRIDGE_LAYOUT.handle.x-a.x,dz=FRIDGE_LAYOUT.handle.z-a.z;
  assert.ok(Math.abs(FRIDGE_FACING_YAW-Math.atan2(dx,dz)*180/Math.PI)<1e-10);
  assert.ok(FRIDGE_FACING_YAW>100&&FRIDGE_FACING_YAW<160);
});
test('door swept envelope preserves body clearance at every opening angle',()=>{
  for(let i=0;i<=100;i++){
    const f=i/100,{hinge,tip}=fridgeDoorSegment(f);
    assert.equal(hinge.x,FRIDGE_LAYOUT.hinge.x);
    assert.ok(tip.x>=FRIDGE_LAYOUT.sweep.minX-.001&&tip.x<=FRIDGE_LAYOUT.sweep.maxX);
    assert.ok(tip.z>=FRIDGE_LAYOUT.sweep.minZ&&tip.z<=FRIDGE_LAYOUT.sweep.maxZ+.001);
    assert.ok(fridgeDoorClearance(FRIDGE_LAYOUT.approach,f)>.1,'door hit at '+f);
  }
  assert.ok(FURNITURE.some(o=>o.id==='fridge-door-sweep'));
  const s=FRIDGE_LAYOUT.sweep;
  assert.equal(isWalkable((s.minX+s.maxX)/2,(s.minZ+s.maxZ)/2),false);
});
test('PlayCanvas door and handle rotate on a single right-hand hinge',()=>{
  const root=new pc.Entity('root'),hinge=new pc.Entity('hinge');
  const blade=new pc.Entity('door'),handle=new pc.Entity('handle');
  root.addChild(hinge);
  hinge.setPosition(FRIDGE_LAYOUT.hinge.x,FRIDGE_LAYOUT.hinge.y,FRIDGE_LAYOUT.hinge.z);
  hinge.addChild(blade);blade.setLocalPosition(-FRIDGE_LAYOUT.doorWidth/2,0,.055);
  hinge.addChild(handle);handle.setLocalPosition(-.94,.07,.13);
  const before={x:handle.getPosition().x,z:handle.getPosition().z};
  hinge.setEulerAngles(0,FRIDGE_LAYOUT.doorAngle,0);
  const after={x:handle.getPosition().x,z:handle.getPosition().z};
  assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>.4);
  const tip=fridgeDoorSegment(1).tip;
  assert.ok(Math.hypot(after.x-tip.x,after.z-tip.z)<.21);
});
test('one stage timeline opens, takes food from shelf, closes, then eats',()=>{
  const d=ACTIONS.fridge.duration,at=p=>fridgeSequence(p*d,d);
  assert.equal(at(0).doorOpen,0);
  assert.ok(at(.25).doorOpen>.99);
  assert.ok(at(.34).reach>.2);
  assert.ok(at(.31).shelfFood>.8);
  assert.equal(at(.31).handFood,0);
  assert.ok(at(.49).handFood>.9&&at(.49).shelfFood<.02);
  assert.equal(at(.66).doorOpen,0);
  assert.ok(at(.80).eat>.9&&at(.80).handFood>.3);
  assert.equal(at(1).handFood,0);
  assert.equal(at(1).doorOpen,0);
  for(let i=0;i<=1000;i++){
    const values=Object.values(at(i/1000));
    assert.ok(values.every(v=>Number.isFinite(v)&&v>=0&&v<=1.000001));
  }
});
test('interrupt closes fridge in active real seconds, pause freezes it',()=>{
  let open=1;
  assert.equal(closeFridgeDoor(open,0),open);
  assert.equal(closeFridgeDoor(open,NaN),open);
  for(let i=0;i<22;i++)open=closeFridgeDoor(open,.016);
  assert.equal(open,0);
  assert.equal(closeFridgeDoor(-10,.01),0);
});
test('two-stage right arm raises hand to mouth without an angle snap',()=>{
  let state=createAnimationState();
  for(let i=0;i<25;i++)state=stepAnimation(state,{using:'fridge',fridgeReach:1,fridgeEat:0,id:'alex'},.016);
  assert.ok(state.arms[1]<-50);
  const old=state.arms[1];
  for(let i=0;i<27;i++)state=stepAnimation(state,{using:'fridge',fridgeReach:0,fridgeEat:1,fridgeChew:.7,id:'alex'},.016);
  assert.ok(state.arms[1]<old-25);
  assert.ok(state.elbows[1]<-72);
  assert.ok(state.mouthHeight>.02);
});
test('hunger starts growing only after food reaches mouth',()=>{
  const state=newHousehold();state.needs.hunger=15;
  assert.ok(chooseResidentAction(state,'fridge',false,'alex'));
  arrive(state);const before=state.needs.hunger;
  tickHousehold(state,ACTIONS.fridge.duration*FRIDGE_EAT_START-1);
  assert.ok(state.needs.hunger<before);
  assert.equal(state.action.id,'fridge');
  tickHousehold(state,5);
  assert.ok(state.needs.hunger>before);
  tickHousehold(state,30);
  assert.equal(state.action,null);
  assert.ok(state.needs.hunger>before+25);
});
test('nearly full hunger does not end an open-door animation early',()=>{
  const s=newHousehold();s.needs.hunger=99;
  assert.ok(chooseResidentAction(s,'fridge',false,'alex'));arrive(s);
  tickHousehold(s,24);
  assert.equal(s.action.id,'fridge');
  tickHousehold(s,2);
  assert.equal(s.action,null);
});
test('fridge belongs to one user at a time, then can be used by the other',()=>{
  const s=newHousehold();
  assert.ok(chooseResidentAction(s,'fridge',false,'mira'));
  assert.equal(furnitureAvailable(s,'fridge','alex'),false);
  assert.equal(chooseResidentAction(s,'fridge',false,'alex'),false);
  assert.ok(chooseResidentAction(s,'sofa',false,'alex'));
  arrive(s.otherSim);tickHousehold(s,ACTIONS.fridge.duration);
  assert.equal(s.otherSim.action,null);
  assert.ok(chooseResidentAction(s,'fridge',false,'alex'));
});
test('reload mid-snack v1 reconstructs door and food stage without new schema',()=>{
  const s=newHousehold();
  s.autonomy.enabled=false;s.otherSim.autonomy.enabled=false;
  assert.ok(chooseResidentAction(s,'fridge',false,'mira'));arrive(s.otherSim);
  tickHousehold(s,11.6);
  const before=fridgeSequence(s.otherSim.action.elapsed,ACTIONS.fridge.duration);
  const restored=loadHousehold(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.version,1);
  assert.equal(restored.otherSim.action.id,'fridge');
  assert.deepEqual(fridgeSequence(restored.otherSim.action.elapsed,ACTIONS.fridge.duration),before);
  assert.equal(restored.autonomy.enabled,false);
});
test('legacy save loads and auto-off cancellation still works',()=>{
  const old={version:1,minutes:600,needs:{hunger:21,energy:72,hygiene:68,fun:70},
    position:{x:3.4,z:-1.6},action:{id:'fridge',phase:'walking',elapsed:0,automatic:true}};
  const s=loadHousehold(old);
  assert.equal(s.action.id,'fridge');
  setHouseholdAutonomy(s,false);
  assert.equal(s.action,null);
  const restored=loadHousehold(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.version,1);
  assert.equal(restored.action,null);
});
test('timeline is deterministic under 1×/3×, paused frames and boundary values',()=>{
  const d=ACTIONS.fridge.duration;
  assert.deepEqual(fridgeSequence(15,d),fridgeSequence(15,d));
  assert.equal(fridgeSequence(d+100,d).doorOpen,0);
  assert.equal(fridgeSequence(-999,d).handFood,0);
});
