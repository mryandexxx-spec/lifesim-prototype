import test from 'node:test';
import assert from 'node:assert/strict';
import {SAVE_KEY,newGame} from '../src/simulation.js';
import {newHousehold,loadHousehold,tickHousehold,getActor,setHouseholdAutonomy}
  from '../src/household.js';
import {enqueueAction,pendingActions} from '../src/action-queue.js';
import {nearestWalkable} from '../src/navigation.js';
import {resolveActionFurniture,furnitureActionApproach} from '../src/furniture-catalog.js';
import {isWalkable,findPath} from '../src/navigation.js';
import {ADDITIONAL_AUTONOMOUS_ACTIONS,validAdditionalAction,
  residentIdsForSimulation} from '../src/resident-activity-runtime.js';
import {restorePopulation,PopulationSaveError,
  proposePopulationSave} from '../src/resident-population.js';

const clone=x=>JSON.parse(JSON.stringify(x));
const extra=(id,name,pos)=>{
  const actor=newGame();
  actor.personality.name=name;
  actor.position={...pos};
  return {id,identity:{firstName:name,lastName:'Ладный',lifeStage:'adult'},actor};
};
function household({away=false}={}){
  const root=newHousehold();
  const at3=nearestWalkable({x:-3.2,z:2.6},root.world);
  const at4=nearestWalkable({x:3.5,z:2.6},root.world);
  root.population={
    schema:1,nextResidentSerial:5,
    residentsById:{
      resident_3:extra('resident_3','Вера',at3),
      resident_4:extra('resident_4','Игорь',at4)
    },
    linksByResident:{
      alex:{familyId:'family_1',dwellingId:'dwelling_1'},
      mira:{familyId:'family_1',dwellingId:'dwelling_1'},
      resident_3:{familyId:'family_1',dwellingId:'dwelling_1'},
      resident_4:{familyId:'family_2',dwellingId:away?'dwelling_2':'dwelling_1'}
    },kinship:[]
  };
  return loadHousehold(clone(root));
}

test('CAS-01.5 autonomous resident needs choose ordinary physical furniture, never free rewards',()=>{
  const root=household();
  const a=getActor(root,'resident_3'),b=getActor(root,'resident_4');
  a.needs.hunger=8;b.needs.bladder=9;
  // This test isolates actual self-care timing. Dynamic A* detours and
  // corridor blocking already have their own CAS-01.4 regression suite.
  const foodGoal=furnitureActionApproach(root.world,'fridge');
  const toiletGoal=furnitureActionApproach(root.world,'toilet');
  assert.ok(foodGoal&&toiletGoal);
  a.position={...foodGoal};b.position={...toiletGoal};
  for(const key of ['energy','hygiene','fun']){a.needs[key]=91;b.needs[key]=91;}
  const clock=root.minutes,hunger=a.needs.hunger,bladder=b.needs.bladder;
  tickHousehold(root,.1);
  assert.equal(root.minutes,clock+.1,'one canonical clock');
  assert.equal(a.action?.id,'fridge');
  assert.equal(b.action?.id,'toilet');
  assert.equal(a.action?.automatic,true);
  assert.equal(b.action?.automatic,true);
  assert.equal(a.action?.phase,'walking');
  assert.ok(a.needs.hunger<=hunger,'starting/walking cannot feed');
  assert.ok(b.needs.bladder<=bladder,'starting/walking cannot grant relief');
  assert.deepEqual(Object.keys(root.actionQueues.byResident),
    ['alex','mira','resident_3','resident_4']);
  assert.equal(pendingActions(root.actionQueues,'resident_3').length,0);
  assert.equal(pendingActions(root.actionQueues,'resident_4').length,0);
  let food=false,relief=false;
  for(let n=0;n<240;n++){
    tickHousehold(root,.5);
    if(a.needs.hunger>hunger+1)food=true;
    if(b.needs.bladder>bladder+1)relief=true;
    if(food&&relief)break;
  }
  assert.equal(food,true,'fridge raises hunger only from verified use');
  assert.equal(relief,true,'toilet raises bladder only from verified use');
  assert.equal(a.minutes,root.minutes);
  assert.equal(b.minutes,root.minutes);
  assert.equal(root.version,1);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
});

test('CAS-01.5 manual FIFO preempts ONLY that resident auto action and keeps strict order',()=>{
  const root=household();
  const actor=getActor(root,'resident_3'),other=getActor(root,'resident_4');
  actor.needs.hunger=8;other.needs.bladder=9;
  tickHousehold(root,.1);
  assert.equal(actor.action?.automatic,true);
  assert.equal(other.action?.automatic,true);
  const destination=nearestWalkable({x:-2.3,z:3.15},root.world);
  const first=enqueueAction(root.actionQueues,'resident_3',
    {type:'move',x:destination.x,z:destination.z});
  const second=enqueueAction(root.actionQueues,'resident_3',
    {type:'object',actionId:'sofa'});
  tickHousehold(root,.1);
  assert.equal(actor.action?.id,'move');
  assert.equal(actor.action?.automatic,false);
  assert.equal(other.action?.automatic,true,'another resident remains autonomous');
  assert.deepEqual(pendingActions(root.actionQueues,'resident_3').map(x=>x.seq),
    [second.seq]);
  assert.ok(first.seq<second.seq);
  assert.equal(root.autonomy.enabled,true);
});

test('CAS-01.5 unavailable FIFO head suppresses new autonomy; manual task wins on release',()=>{
  const root=household();
  const sofa=resolveActionFurniture(root.world,'sofa');
  const actor=getActor(root,'resident_3');
  actor.needs.hunger=6;
  root.action={id:'sofa',phase:'using',elapsed:0,automatic:false,
    targetInstanceId:sofa.instanceId};
  enqueueAction(root.actionQueues,'resident_3',
    {type:'object',actionId:'sofa',targetInstanceId:sofa.instanceId});
  tickHousehold(root,.1);
  assert.equal(actor.action,null,'cannot skip blocked manual head to feed autonomously');
  assert.equal(pendingActions(root.actionQueues,'resident_3').length,1);
  root.action=null;
  tickHousehold(root,.1);
  assert.equal(actor.action?.id,'sofa');
  assert.equal(actor.action?.automatic,false);
  assert.equal(pendingActions(root.actionQueues,'resident_3').length,0);
});

test('CAS-01.5 disabling autonomy cancels automatic only, honors manual and remote residents',()=>{
  const root=household({away:true}),a=getActor(root,'resident_3');
  const remote=getActor(root,'resident_4'),remoteBefore=clone(remote);
  a.needs.energy=3;
  tickHousehold(root,.1);
  assert.equal(a.action?.id,'bed');
  assert.equal(a.action?.automatic,true);
  setHouseholdAutonomy(root,false);
  assert.equal(a.action,null);
  assert.equal(a.autonomy.enabled,false);
  const goal=nearestWalkable({x:-2.3,z:3.15},root.world);
  enqueueAction(root.actionQueues,'resident_3',{type:'move',x:goal.x,z:goal.z});
  tickHousehold(root,.1);
  assert.equal(a.action?.id,'move');
  assert.equal(a.action?.automatic,false);
  tickHousehold(root,.2);
  assert.equal(a.autonomy.enabled,false);
  assert.deepEqual(clone(remote),remoteBefore,'off-lot actor remains inert');
  assert.deepEqual(residentIdsForSimulation(root),['alex','mira','resident_3']);
});

test('CAS-01.5 autonomous snapshots and atomic v1 preflight survive reload',()=>{
  const root=household(),a=getActor(root,'resident_3');
  a.needs.energy=8;
  tickHousehold(root,.1);
  assert.equal(a.action?.id,'bed');
  assert.equal(a.action?.automatic,true);
  assert.equal(validAdditionalAction(a.action),true);
  const serialized=clone(root);
  const restored=loadHousehold(serialized);
  assert.equal(getActor(restored,'resident_3').action?.automatic,true);
  assert.deepEqual(restorePopulation(restored.population),serialized.population);
  const proposal=proposePopulationSave(root,clone(root.population),loadHousehold);
  assert.equal(proposal.ok,true);
  assert.equal(proposal.root.population.residentsById.resident_3.actor.action.automatic,true);
  const invalid=clone(serialized);
  invalid.population.residentsById.resident_3.actor.action={
    id:'cook',phase:'using',elapsed:2,automatic:true,targetInstanceId:'fake'
  };
  assert.throws(()=>loadHousehold(invalid),PopulationSaveError);
  assert.equal(ADDITIONAL_AUTONOMOUS_ACTIONS.includes('cook'),false);
});

test('CAS-01.5 a removed furniture target never produces phantom need recovery',()=>{
  const root=household(),actor=getActor(root,'resident_3');
  actor.needs.hunger=15;
  actor.action={id:'fridge',phase:'using',elapsed:12,automatic:true,
    targetInstanceId:'missing-removed-fridge'};
  const before=actor.needs.hunger;
  tickHousehold(root,.5);
  assert.ok(actor.needs.hunger<=before);
  assert.notEqual(actor.action?.targetInstanceId,'missing-removed-fridge');
});

test('CAS-01.5 legacy v1 saves have no population and unchanged autonomy semantics',()=>{
  const old=newHousehold(),reloaded=loadHousehold(clone(old));
  tickHousehold(reloaded,.5);
  assert.equal(reloaded.population,undefined);
  assert.deepEqual(Object.keys(reloaded.actionQueues.byResident),['alex','mira']);
  assert.equal(reloaded.version,1);
});

test('CAS-01.5 shared fridge is exclusively reserved across two autonomous residents',()=>{
  const root=household();
  const a=getActor(root,'resident_3'),b=getActor(root,'resident_4');
  a.needs.hunger=5;b.needs.hunger=5;
  for(const actor of [a,b])for(const k of ['energy','hygiene','fun'])
    actor.needs[k]=90;
  tickHousehold(root,.1);
  assert.equal(a.action?.id,'fridge');
  assert.equal(b.action,null,'later claimant never steals a busy fridge');
  assert.equal(pendingActions(root.actionQueues,'resident_4').length,0,
    'autonomous intentions are not inserted into manual FIFO');
});

test('CAS-01.5 low Social may use a real installed mirror without pair or free XP',()=>{
  const root=household(),actor=getActor(root,'resident_3');
  for(const k of ['energy','hygiene','fun','hunger','bladder'])
    actor.needs[k]=95;
  actor.needs.social=9;
  // Purchased fixture, not a magical social-sofa: find a reachable,
  // collision-free mirror approach in the same physical home world.
  let installed=false;
  for(let x=-5;x<=5&&!installed;x+=1){
    for(let z=-5;z<=5&&!installed;z+=1){
      const item={instanceId:'cas15-mirror-1',prefabId:'mirror',
        x,z,yaw:0,location:'home'};
      root.world.furniture.instances.push(item);
      const goal=furnitureActionApproach(root.world,'mirror',item.instanceId);
      if(goal&&isWalkable(goal.x,goal.z,root.world)&&
        findPath(actor.position,goal,root.world)&&
        Math.hypot(goal.x-root.position.x,goal.z-root.position.z)>1&&
        Math.hypot(goal.x-root.otherSim.position.x,goal.z-root.otherSim.position.z)>1){
        actor.position={...goal};installed=true;
      }else root.world.furniture.instances.pop();
    }
  }
  assert.equal(installed,true,'a reachable purchased mirror exists');
  const first=actor.needs.social;
  tickHousehold(root,.1);
  assert.equal(actor.action?.id,'mirror');
  assert.equal(actor.action?.mirrorPractice,true);
  assert.equal(actor.action?.automatic,true);
  assert.ok(actor.needs.social<first,'no social reward at queue/decision time');
  for(let n=0;n<60;n++){
    tickHousehold(root,.5);
    if(actor.needs.social>first+1)break;
  }
  assert.ok(actor.needs.social>first+1,
    'social benefit earned only during verified self-talk');
  assert.equal(Object.hasOwn(root.population.residentsById.resident_3.actor,'socialGraph'),
    false,'self-talk never invents interpersonal relationship');
});

test('CAS-01.5 occupied sofa can fall back to physical standalone television',()=>{
  const root=household(),actor=getActor(root,'resident_3');
  const sofa=resolveActionFurniture(root.world,'sofa');
  const tvGoal=furnitureActionApproach(root.world,'tv');
  assert.ok(sofa&&tvGoal);
  root.action={id:'sofa',phase:'using',elapsed:0,automatic:false,
    targetInstanceId:sofa.instanceId};
  actor.position={...tvGoal};
  for(const k of ['energy','hygiene','hunger','bladder'])actor.needs[k]=95;
  actor.needs.fun=8;
  tickHousehold(root,.1);
  assert.equal(actor.action?.id,'tv');
  assert.equal(actor.action?.automatic,true);
});
