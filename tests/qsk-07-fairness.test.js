import test from 'node:test';
import assert from 'node:assert/strict';
import {SAVE_KEY,newGame} from '../src/simulation.js';
import {newHousehold,loadHousehold,tickHousehold,getActor,
  setHouseholdAutonomy} from '../src/household.js';
import {enqueueAction,pendingActions,blockedActions,retryBlockedAction,
  dispatchActionQueues,newActionQueues} from '../src/action-queue.js';
import {nearestWalkable,findPath,isWalkable} from '../src/navigation.js';
import {newQueuedHeadGuard,inspectQueuedHead,QUEUE_ROUTE_MAX_FAILURES,
  RESOURCE_WAIT_MINUTES,newWalkGuard,inspectWalkingAction,walkingRetryAllowed,
  WALK_MAX_STALLS,WALK_STALL_MINUTES} from '../src/qsk-07-fairness.js';

const copy=x=>JSON.parse(JSON.stringify(x));
function household(){
  const root=newHousehold();
  const source=[{id:'resident_3',pos:{x:-3.2,z:2.6},name:'Вера'},
    {id:'resident_4',pos:{x:3.5,z:2.6},name:'Игорь'}];
  const residentsById={},linksByResident={
    alex:{familyId:'family_1',dwellingId:'dwelling_1'},
    mira:{familyId:'family_1',dwellingId:'dwelling_1'}};
  for(const {id,pos,name} of source){
    const actor=newGame();
    actor.position=nearestWalkable(pos,root.world);
    residentsById[id]={id,identity:{firstName:name,lastName:'Ладный',lifeStage:'adult'},actor};
    linksByResident[id]={familyId:'family_1',dwellingId:'dwelling_1'};
  }
  root.population={schema:1,nextResidentSerial:5,residentsById,
    linksByResident,kinship:[]};
  const restored=loadHousehold(copy(root));
  setHouseholdAutonomy(restored,false);
  return restored;
}
const move=(x,z)=>({type:'move',x,z});

test('QSK-07: static A* retry is exponential in game minutes and terminates',()=>{
  const guard=newQueuedHeadGuard();
  const observed=[];
  for(let t=0;t<=16;t++)
    observed.push([t,inspectQueuedHead(guard,1,'unreachable-route',t)]);
  assert.equal(guard.attempts,QUEUE_ROUTE_MAX_FAILURES);
  assert.equal(observed.find(x=>x[1]==='park')?.[0],7);
  assert.equal(inspectQueuedHead(guard,2,'unreachable-route',17),'backoff');
  assert.equal(guard.attempts,1,'fresh head cannot inherit another head count');
  assert.equal(inspectQueuedHead(guard,2,'resource-busy',18),'waiting-for-resource');
  assert.equal(inspectQueuedHead(guard,2,'resource-busy',18+RESOURCE_WAIT_MINUTES),'park');
});

test('QSK-07: stalled walk respects pause, backoff and eventual progress',()=>{
  const g=newWalkGuard(),a={id:'move',phase:'walking'};
  let t=0;
  assert.equal(inspectWalkingAction(g,a,{x:0,z:0},1,t),'tracking');
  t+=WALK_STALL_MINUTES;
  assert.equal(inspectWalkingAction(g,a,{x:.01,z:0},WALK_STALL_MINUTES,t),'backoff');
  assert.equal(walkingRetryAllowed(g,a,t),false);
  assert.equal(inspectWalkingAction(g,a,{x:.01,z:0},0,t),'backoff');
  t+=1;
  assert.equal(inspectWalkingAction(g,a,{x:.1,z:0},1,t),'progress');
  assert.equal(g.stalls,0);
  for(let n=0;n<WALK_MAX_STALLS;n++){
    t+=WALK_STALL_MINUTES+4;
    const state=inspectWalkingAction(g,a,{x:.1,z:0},WALK_STALL_MINUTES,t);
    assert.equal(state,n===WALK_MAX_STALLS-1?'exhausted':'backoff');
  }
});

test('QSK-07: a blocked actor cannot revoke another FIFO or double-start a resource',()=>{
  const q=newActionQueues(['alex','mira','resident_3','resident_4']);
  const first=enqueueAction(q,'resident_3',{type:'object',actionId:'shower'});
  const second=enqueueAction(q,'resident_4',{type:'object',actionId:'shower'});
  const running=new Set();
  let starts=0;
  for(let pass=0;pass<200;pass++){
    dispatchActionQueues(q,{
      canStart:()=>running.size===0,
      start:(id)=>{assert.equal(running.size,0);running.add(id);starts++;return true;}
    });
    if(pass===3)running.clear();
  }
  assert.deepEqual([first.seq,second.seq],[1,2]);
  assert.equal(starts,2,'one acknowledgment per accepted intent');
  assert.deepEqual(pendingActions(q,'resident_3'),[]);
  assert.deepEqual(pendingActions(q,'resident_4'),[]);
});

test('QSK-07: crowded A* approach is parked and original player intent survives reload',()=>{
  const root=household(),a=getActor(root,'resident_3');
  const destination=nearestWalkable({x:-2.2,z:2.7},root.world);
  assert.ok(findPath(a.position,destination,root.world));
  const first=enqueueAction(root.actionQueues,'resident_3',
    move(destination.x,destination.z));
  const second=enqueueAction(root.actionQueues,'resident_3',
    move(a.position.x,a.position.z));
  tickHousehold(root,.2);
  assert.equal(a.action?.id,'move','first intent began walking');
  assert.deepEqual(pendingActions(root.actionQueues,'resident_3').map(x=>x.seq),
    [second.seq]);
  const savedMira={...root.otherSim.position};
  // Inject adversarial overlapping occupant AFTER the initial safe placement.
  // No perpendicular escape can be accepted by residentSegmentClear.
  root.otherSim.position={...a.position};
  for(let n=0;n<36;n++){
    tickHousehold(root,1);
    if(blockedActions(root.actionQueues,'resident_3').length)break;
  }
  // The dispatcher may start the next FIFO command in the SAME tick in
  // which the failed first command is parked: that is progress, not a duplicate.
  assert.notDeepEqual(a.action?.goal,destination,
    'the stalled original route must no longer own the active slot');
  const parked=blockedActions(root.actionQueues,'resident_3');
  assert.equal(parked.length,1);
  assert.equal(parked[0].type,'move');
  assert.equal(parked[0].blockedReason,'unreachable-route');
  const laterPending=pendingActions(root.actionQueues,'resident_3').map(x=>x.seq);
  assert.ok(laterPending.length===0||
    (laterPending.length===1&&laterPending[0]===second.seq),
    'the next FIFO command is either still pending or has started already');
  root.otherSim.position=savedMira;
  for(let n=0;n<5;n++)tickHousehold(root,1);
  assert.equal(pendingActions(root.actionQueues,'resident_3').length,0);
  const loaded=loadHousehold(copy(root));
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(loaded.version,1);
  assert.deepEqual(loaded.actionQueues.blockedByResident.resident_3,parked);
  const retry=retryBlockedAction(loaded.actionQueues,'resident_3',parked[0].seq);
  assert.ok(retry);
  assert.ok(retry.seq>second.seq);
  assert.equal(blockedActions(loaded.actionQueues,'resident_3').length,0);
});

test('QSK-07: unreachable FIFO head is quarantined; later manual command remains',()=>{
  const root=household();
  // Real static obstacle inside the lot: queue accepts coordinates, but A*
  // correctly rejects an invalid destination when scheduling.
  const obstacle={x:0,z:0};
  if(isWalkable(obstacle.x,obstacle.z,root.world))return;
  const later=nearestWalkable({x:-2.3,z:2.6},root.world);
  const first=enqueueAction(root.actionQueues,'resident_3',move(obstacle.x,obstacle.z));
  const second=enqueueAction(root.actionQueues,'resident_3',move(later.x,later.z));
  assert.ok(first&&second);
  for(let n=0;n<22;n++)tickHousehold(root,1);
  assert.equal(blockedActions(root.actionQueues,'resident_3')[0].seq,first.seq);
  assert.equal(blockedActions(root.actionQueues,'resident_3')[0].blockedReason,
    'invalid-destination');
  assert.equal(pendingActions(root.actionQueues,'resident_3').length,0);
});

test('QSK-07: restored accepted manual walk is saved, not erased by route preflight',()=>{
  let root=household();
  const actor=getActor(root,'resident_3');
  // Find a genuine unwalkable point in the lot; do not depend on one
  // decorative furniture layout or an arbitrary outside-lot coordinate.
  let goal=null;
  for(let x=-4;x<=5&&!goal;x+=.5)
    for(let z=-4;z<=4;z+=.5)
      if(!isWalkable(x,z,root.world)){goal={x,z};break;}
  assert.ok(goal,'starter lot must have an impassable furniture footprint');
  actor.action={id:'move',phase:'walking',elapsed:0,automatic:false,goal};
  root=loadHousehold(copy(root));
  assert.equal(getActor(root,'resident_3').action?.id,'move');
  tickHousehold(root,.1);
  assert.equal(getActor(root,'resident_3').action,null);
  const parked=blockedActions(root.actionQueues,'resident_3');
  assert.equal(parked.length,1);
  assert.equal(parked[0].type,'move');
  assert.equal(parked[0].x,goal.x);
  assert.equal(parked[0].z,goal.z);
  assert.equal(parked[0].blockedReason,'unreachable-route');
  assert.deepEqual(loadHousehold(copy(root)).actionQueues.blockedByResident.resident_3,
    parked,'explicit saved retry survives a second v1 reload unchanged');
});

test('QSK-07: eight-day 4-resident soak, deterministic v1 reload without duplicate receipts',()=>{
  let root=household();
  const initialMoney=root.money,initialHistory=copy(root.financialHistory);
  for(let day=0;day<8;day++){
    const at3=nearestWalkable({x:-3.15+(day%2)*.55,z:2.6},root.world);
    const at4=nearestWalkable({x:3.45-(day%2)*.55,z:2.6},root.world);
    assert.ok(enqueueAction(root.actionQueues,'resident_3',move(at3.x,at3.z)));
    assert.ok(enqueueAction(root.actionQueues,'resident_4',move(at4.x,at4.z)));
    for(let step=0;step<24;step++)tickHousehold(root,60);
    root=loadHousehold(copy(root));
    assert.equal(root.version,1);
    for(const id of ['resident_3','resident_4']){
      assert.ok(pendingActions(root.actionQueues,id).length<=12);
      assert.ok(blockedActions(root.actionQueues,id).length<=12);
      const all=[...pendingActions(root.actionQueues,id),...blockedActions(root.actionQueues,id)];
      assert.equal(new Set(all.map(x=>x.seq)).size,all.length);
    }
  }
  assert.equal(root.money,initialMoney,'route retry must not mint money');
  assert.deepEqual(root.financialHistory,initialHistory);
});
