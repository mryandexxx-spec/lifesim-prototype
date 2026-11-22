import test from 'node:test';
import assert from 'node:assert/strict';
import {SAVE_KEY,newGame} from '../src/simulation.js';
import {newHousehold,loadHousehold,tickHousehold,getActor,
  furnitureAvailable,bedSlotFor} from '../src/household.js';
import {enqueueAction,pendingActions} from '../src/action-queue.js';
import {findPath,isClearLine,isWalkable,ACTOR_RADIUS,nearestWalkable}
  from '../src/navigation.js';
import {resolveActionFurniture} from '../src/furniture-catalog.js';
import {residentIdsForSimulation,residentCollisionFree,residentSegmentClear,
  savedAdditionalActor} from '../src/resident-activity-runtime.js';
import {restorePopulation,PopulationSaveError} from '../src/resident-population.js';

const clone=x=>JSON.parse(JSON.stringify(x));
function resident(id,name,position){
  const actor=newGame();
  actor.personality.name=name;
  actor.position={...position};
  return {id,identity:{firstName:name,lastName:'Ладный',lifeStage:'adult'},actor};
}
function withPopulation({fourthAtHome=true}={}){
  const root=newHousehold();
  root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
  const three=nearestWalkable({x:-3.2,z:2.6},root.world);
  const four=nearestWalkable({x:3.5,z:2.6},root.world);
  root.population={
    schema:1,nextResidentSerial:5,
    residentsById:{
      resident_3:resident('resident_3','Вера',three),
      resident_4:resident('resident_4','Игорь',four)
    },
    linksByResident:{
      alex:{familyId:'family_1',dwellingId:'dwelling_1'},
      mira:{familyId:'family_2',dwellingId:'dwelling_1'},
      resident_3:{familyId:'family_1',dwellingId:'dwelling_1'},
      resident_4:{familyId:'family_1',dwellingId:fourthAtHome?'dwelling_1':'dwelling_2'}
    },
    kinship:[]
  };
  return loadHousehold(clone(root));
}
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const action=(root,id)=>getActor(root,id)?.action;

test('CAS-01.4 old v1 household stays two-person, same SAVE_KEY and unknown IDs fail closed',()=>{
  const original=newHousehold();
  const saved=clone(original);
  const restored=loadHousehold(saved);
  assert.deepEqual(residentIdsForSimulation(restored),['alex','mira']);
  assert.equal(Object.hasOwn(restored,'population'),false);
  assert.deepEqual(Object.keys(restored.actionQueues.byResident),['alex','mira']);
  assert.equal(getActor(restored,'ghost'),null);
  assert.equal(getActor(restored,'resident_3'),null);
  tickHousehold(restored,1);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(restored.version,1);
  assert.equal(original.minutes+1,restored.minutes);
  assert.equal(Object.hasOwn(restored,'population'),false);
});

test('CAS-01.4 restores four stable IDs and isolated FIFOs without another shared clock',()=>{
  const root=withPopulation();
  assert.deepEqual(residentIdsForSimulation(root),
    ['alex','mira','resident_3','resident_4']);
  assert.deepEqual(Object.keys(root.actionQueues.byResident),
    ['alex','mira','resident_3','resident_4']);
  const a=getActor(root,'resident_3'),b=getActor(root,'resident_4');
  assert.equal(a,savedAdditionalActor(root,'resident_3'));
  assert.equal(b,savedAdditionalActor(root,'resident_4'));
  assert.notEqual(a,b);
  assert.notEqual(a,root);
  assert.equal(a.personality.name,'Вера');
  assert.equal(getActor(root,'resident_5'),null);
  const at=root.minutes,first=a.needs.hunger,second=b.needs.hunger;
  tickHousehold(root,.5);
  assert.equal(root.minutes,at+.5);
  assert.equal(a.minutes,root.minutes);
  assert.equal(b.minutes,root.minutes);
  assert.ok(a.needs.hunger<first);
  assert.ok(b.needs.hunger<second);
  assert.deepEqual(Object.keys(root.actionQueues.byResident),
    ['alex','mira','resident_3','resident_4']);
});

test('CAS-01.4 FIFO dispatches one per resident and does not skip a waiting head',()=>{
  const root=withPopulation();
  const p=nearestWalkable({x:-2.3,z:3.15},root.world);
  assert.ok(findPath(getActor(root,'resident_3').position,p,root.world));
  const first=enqueueAction(root.actionQueues,'resident_3',{type:'move',x:p.x,z:p.z});
  const second=enqueueAction(root.actionQueues,'resident_3',{type:'object',actionId:'sofa'});
  const other=enqueueAction(root.actionQueues,'resident_4',{type:'object',actionId:'fridge'});
  assert.ok(first&&second&&other);
  assert.deepEqual([first.seq,second.seq,other.seq],[1,2,3]);
  tickHousehold(root,.1);
  assert.equal(action(root,'resident_3')?.id,'move');
  assert.equal(action(root,'resident_4')?.id,'fridge');
  assert.deepEqual(pendingActions(root.actionQueues,'resident_3').map(a=>a.seq),[2]);
  assert.equal(pendingActions(root.actionQueues,'resident_4').length,0);
  let observedSecond=false;
  for(let k=0;k<30;k++){
    tickHousehold(root,.2);
    if(action(root,'resident_3')?.id==='sofa'){observedSecond=true;break;}
  }
  assert.equal(observedSecond,true,'next head starts only after first move finishes');
  assert.equal(pendingActions(root.actionQueues,'resident_3').length,0);
});

test('CAS-01.4 same sofa has one owner, blocked task remains FIFO, legacy actor sees reservation',()=>{
  const root=withPopulation();
  const sofa=resolveActionFurniture(root.world,'sofa');
  assert.ok(sofa);
  enqueueAction(root.actionQueues,'resident_3',{type:'object',actionId:'sofa',targetInstanceId:sofa.instanceId});
  enqueueAction(root.actionQueues,'resident_4',{type:'object',actionId:'sofa',targetInstanceId:sofa.instanceId});
  tickHousehold(root,.1);
  assert.equal(action(root,'resident_3')?.id,'sofa');
  assert.equal(action(root,'resident_4'),null);
  assert.equal(pendingActions(root.actionQueues,'resident_4').length,1);
  assert.equal(furnitureAvailable(root,'sofa','alex',sofa.instanceId),false);
  getActor(root,'resident_3').action=null;
  tickHousehold(root,.1);
  assert.equal(action(root,'resident_4')?.id,'sofa');
  assert.equal(pendingActions(root.actionQueues,'resident_4').length,0);
  assert.equal(furnitureAvailable(root,'sofa','alex',sofa.instanceId),false);
});

test('CAS-01.4 bedside occupancy stays per physical bed and side for up to four adults',()=>{
  const root=withPopulation();
  const bed=resolveActionFurniture(root.world,'bed');
  assert.ok(bed);
  enqueueAction(root.actionQueues,'resident_3',{type:'object',actionId:'bed',targetInstanceId:bed.instanceId});
  enqueueAction(root.actionQueues,'resident_4',{type:'object',actionId:'bed',targetInstanceId:bed.instanceId});
  tickHousehold(root,.1);
  assert.equal(action(root,'resident_3')?.id,'bed');
  assert.equal(action(root,'resident_4')?.id,'bed');
  assert.notEqual(action(root,'resident_3').bedSlot,action(root,'resident_4').bedSlot);
  assert.equal(bedSlotFor(root,'alex',bed.instanceId),null);
  assert.equal(furnitureAvailable(root,'bed','mira',bed.instanceId),false);
});

test('CAS-01.4 shared fridge reservation blocks both second extra and legacy resident',()=>{
  const root=withPopulation();
  const fridge=resolveActionFurniture(root.world,'fridge');
  assert.ok(fridge);
  enqueueAction(root.actionQueues,'resident_3',{type:'object',actionId:'fridge'});
  enqueueAction(root.actionQueues,'resident_4',{type:'object',actionId:'fridge'});
  tickHousehold(root,.1);
  assert.equal(action(root,'resident_3')?.id,'fridge');
  assert.equal(action(root,'resident_4'),null);
  assert.equal(pendingActions(root.actionQueues,'resident_4').length,1);
  assert.equal(furnitureAvailable(root,'fridge','alex',fridge.instanceId),false);
  assert.equal(furnitureAvailable(root,'cook','alex'),false);
  getActor(root,'resident_3').action=null;
  tickHousehold(root,.1);
  assert.equal(action(root,'resident_4')?.id,'fridge');
});

test('CAS-01.4 A* movement never crosses furniture or another resident collision disc',()=>{
  const root=withPopulation();
  const id='resident_3',actor=getActor(root,id);
  // A nearby genuinely free endpoint must complete; a crowded long corridor
  // is permitted to wait rather than intersect other actors.
  const goal=nearestWalkable({x:-2.3,z:3.15},root.world);
  assert.ok(findPath(actor.position,goal,root.world));
  const task=enqueueAction(root.actionQueues,id,{type:'move',x:goal.x,z:goal.z});
  assert.ok(task);
  tickHousehold(root,.1);
  assert.equal(action(root,id)?.id,'move');
  let advanced=false;
  for(let k=0;k<60;k++){
    const before={...actor.position};
    tickHousehold(root,.25);
    assert.equal(isWalkable(actor.position.x,actor.position.z,root.world),true);
    assert.ok(isClearLine(before,actor.position,root.world),'walking through static furniture');
    assert.equal(residentCollisionFree(root,id,actor.position),true,'overlap with another resident');
    if(dist(before,actor.position)>.001)advanced=true;
    if(!actor.action)break;
  }
  assert.equal(advanced,true,'A* route made physical progress');
  assert.ok(dist(actor.position,goal)<.07,'reached precise goal');
});

test('CAS-01.4 distant route stays safe if a person blocks the corridor',()=>{
  const root=withPopulation();
  const id='resident_3',actor=getActor(root,id);
  const goal=nearestWalkable({x:4.5,z:-2.75},root.world);
  assert.ok(findPath(actor.position,goal,root.world),'static A* route exists');
  assert.ok(enqueueAction(root.actionQueues,id,{type:'move',x:goal.x,z:goal.z}));
  tickHousehold(root,.1);
  let progressed=false;
  for(let k=0;k<80;k++){
    const before={...actor.position};
    tickHousehold(root,.25);
    assert.ok(isClearLine(before,actor.position,root.world),
      'no static obstacle may be crossed, including along a detour');
    assert.equal(residentCollisionFree(root,id,actor.position),true,
      'a queued route may wait, but never tunnel through another resident');
    if(dist(before,actor.position)>.001)progressed=true;
    if(!actor.action)break;
  }
  assert.equal(progressed,true,'route must at least approach the obstruction');
  if(!actor.action)assert.ok(dist(actor.position,goal)<.07,
    'an ended movement must mean real arrival, not a silent cancellation');
});

test('CAS-01.4 overlapping saved spawns are repaired on first tick, not during atomic preflight',()=>{
  const root=withPopulation();
  const a=getActor(root,'resident_3'),b=getActor(root,'resident_4');
  const shared={...root.position};
  a.position={...shared};b.position={...shared};
  const saved=clone(root),restored=loadHousehold(saved);
  assert.deepEqual(restored.population,saved.population,'load/preflight is byte-safe');
  tickHousehold(restored,.1);
  const r3=getActor(restored,'resident_3'),r4=getActor(restored,'resident_4');
  assert.ok(dist(r3.position,restored.position)>=ACTOR_RADIUS*2-.03);
  assert.ok(dist(r4.position,restored.position)>=ACTOR_RADIUS*2-.03);
  assert.ok(dist(r3.position,r4.position)>=ACTOR_RADIUS*2-.03);
  assert.equal(isWalkable(r3.position.x,r3.position.z,restored.world),true);
  assert.equal(isWalkable(r4.position.x,r4.position.z,restored.world),true);
  assert.equal(residentSegmentClear(restored,'alex',restored.position,r3.position,
    {additionalOnly:true}),false,'legacy paths see extra collision discs');
});

test('CAS-01.4 dwelling membership keeps off-lot fourth record and its queue inert',()=>{
  const root=withPopulation({fourthAtHome:false});
  const fourth=getActor(root,'resident_4');
  const initial=clone(fourth);
  assert.deepEqual(residentIdsForSimulation(root),['alex','mira','resident_3']);
  enqueueAction(root.actionQueues,'resident_4',{type:'move',x:1,z:2});
  tickHousehold(root,1);
  assert.deepEqual(clone(fourth),initial,'remote residents never tick on the home lot');
  assert.equal(pendingActions(root.actionQueues,'resident_4').length,1);
});

test('CAS-01.4 running action survives v1 save/reload; malformed action fails closed',()=>{
  const root=withPopulation();
  const sofa=resolveActionFurniture(root.world,'sofa');
  enqueueAction(root.actionQueues,'resident_3',{type:'object',actionId:'sofa',targetInstanceId:sofa.instanceId});
  tickHousehold(root,.1);
  assert.equal(action(root,'resident_3')?.id,'sofa');
  const snapshot=clone(root);
  const restored=loadHousehold(snapshot);
  assert.deepEqual(restored.population,snapshot.population);
  assert.equal(action(restored,'resident_3')?.targetInstanceId,sofa.instanceId);
  assert.deepEqual(restorePopulation(restored.population),restored.population);
  const invalid=clone(snapshot);
  invalid.population.residentsById.resident_3.actor.action={id:'cook',phase:'using',
    elapsed:0,automatic:false,targetInstanceId:'home-fridge-1'};
  assert.throws(()=>loadHousehold(invalid),PopulationSaveError);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
});
