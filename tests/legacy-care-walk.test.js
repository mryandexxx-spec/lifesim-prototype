import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold,getActor,chooseResidentAction} from '../src/household.js';
import {newGame} from '../src/simulation.js';
import {newWalkGuard,walkingRetryAllowed} from '../src/qsk-07-fairness.js';
import {isLegacyCareWalk,legacyCareArrivalClear,recoverLegacyCareWalk,recoverableLegacyCareCommand} from '../src/legacy-care-walk.js';
import {enqueueAction,blockedActions,pendingActions,parkInterruptedAction,retryBlockedAction,MAX_BLOCKED_QUEUE} from '../src/action-queue.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {nearestWalkable,isClearLine} from '../src/navigation.js';
import {residentSegmentClear} from '../src/resident-activity-runtime.js';

const copy=x=>JSON.parse(JSON.stringify(x));
function fixture(id='alex',automatic=false){
  const root=newHousehold('2026-11-27');
  root.calendar.anchorConfirmed=true;
  const peer='resident_3',goal=furnitureActionApproach(root.world,'sofa');
  root.population={schema:1,nextResidentSerial:4,residentsById:{[peer]:{id:peer,identity:{firstName:'Вера',lastName:'Ладный',lifeStage:'adult'},actor:{...newGame(),position:goal}}},linksByResident:Object.fromEntries(['alex','mira',peer].map(id=>[id,{familyId:'family_1',dwellingId:'dwelling_1'}])),kinship:[]};
  const r=loadHousehold(copy(root));r.minutes=900;r.paused=false;
  for(const name of ['alex','mira',peer]){const a=getActor(r,name);a.minutes=900;a.paused=false;a.autonomy.enabled=true;a.autonomy.nextAt=900;a.action=null;}
  const a=getActor(r,id);a.position={x:2.05,z:.52};a.needs.fun=8;
  getActor(r,peer).position={...goal};
  assert.ok(chooseResidentAction(r,'sofa',automatic,id));
  return {r,id,a,peer,goal,guard:newWalkGuard()};
}
function observe(x,minutes=.3,routeValid=true){
  x.r.minutes+=minutes;
  return recoverLegacyCareWalk(x.r,x.id,x.a,x.guard,x.goal,minutes,{routeValid});
}
function stall(x){
  const statuses=[];
  for(let i=0;i<100&&x.a.action;i++)if(walkingRetryAllowed(x.guard,x.a.action,x.r.minutes+.3))statuses.push(observe(x).status);else x.r.minutes+=.3;
  return statuses;
}
for(const id of ['alex','mira']){
  test(id+': occupied approach never snaps; stalled manual intent parks and survives reload',()=>{
    const x=fixture(id),{r,a,goal,peer}=x,before=copy(a.needs),wallet=r.shop.credits;
    const pending=enqueueAction(r.actionQueues,id,{type:'move',x:2,z:.5});
    assert.ok(pending);
    assert.equal(legacyCareArrivalClear(r,id,a,goal),false);
    assert.equal(legacyCareArrivalClear(r,id,{position:goal},goal),false);
    assert.ok(stall(x).includes('parked'));assert.equal(a.action,null);
    assert.equal(r.shop.credits,wallet);assert.deepEqual(a.needs,before);
    assert.deepEqual(getActor(r,peer).position,goal);
    assert.equal(blockedActions(r.actionQueues,id).length,1);
    const task=blockedActions(r.actionQueues,id)[0];
    assert.equal(task.actionId,'sofa');assert.equal(task.targetInstanceId,'home-sofa-1');
    assert.equal(task.blockedReason,'unreachable-route');
    assert.deepEqual(pendingActions(r.actionQueues,id).map(t=>t.seq),[pending.seq]);
    const restored=loadHousehold(copy(r));
    assert.deepEqual(blockedActions(restored.actionQueues,id),[task]);
    const retry=retryBlockedAction(restored.actionQueues,id,task.seq);
    assert.ok(retry.seq>pending.seq);assert.equal(blockedActions(restored.actionQueues,id).length,0);
  });
  test(id+': automatic stall releases action with cooldown, no player task or reward',()=>{
    const x=fixture(id,true),before=copy(x.a.needs);
    assert.ok(stall(x).includes('cancelled'));assert.equal(x.a.action,null);
    assert.ok(x.a.autonomy.nextAt>=x.r.minutes+4);
    assert.deepEqual(blockedActions(x.r.actionQueues,id),[]);
    assert.deepEqual(x.a.needs,before);
  });
}
test('pause and zero time do not spend stall budget; real progress resets it',()=>{
  const x=fixture();observe(x);const before=copy(x.guard);
  x.r.paused=true;assert.equal(observe(x,5).status,'suspended');x.r.paused=false;
  assert.equal(observe(x,0).status,'suspended');assert.deepEqual(x.guard,before);
  observe(x,3);assert.equal(x.guard.stalls,1);
  getActor(x.r,x.peer).position=nearestWalkable({x:10,z:0},x.r.world);
  x.a.position={x:1.75,z:.52};observe(x,1);
  assert.equal(x.guard.stalls,0);x.a.position={...x.goal};
  assert.equal(legacyCareArrivalClear(x.r,x.id,x.a,x.goal),true);
});
test('full review tray retains exact action until space is available',()=>{
  const x=fixture(),original=x.a.action;
  for(let i=0;i<MAX_BLOCKED_QUEUE;i++)assert.ok(parkInterruptedAction(x.r.actionQueues,x.id,{type:'move',x:2,z:.5},'unreachable-route',900));
  assert.ok(stall(x).includes('retained'));assert.equal(x.a.action,original);
  blockedActions(x.r.actionQueues,x.id).pop();
  assert.ok(stall(x).includes('parked'));assert.equal(x.a.action,null);
  assert.equal(blockedActions(x.r.actionQueues,x.id).length,MAX_BLOCKED_QUEUE);
});
test('bounded detour uses existing constrained A* and cannot move peer',()=>{
  const x=fixture(),{r,a,id,peer}=x;
  let lane=null;
  for(let xx=4;xx<=10&&!lane;xx+=.5)for(let z=-2;z<=2&&!lane;z+=.5){
    const from={x:xx,z},goal={x:xx+2.6,z},mid={x:xx+1.3,z};
    if([-.9,0,.9].every(d=>isClearLine({x:xx,z:z+d},{x:xx+2.6,z:z+d},r.world))&&
      [xx,xx+1.3,xx+2.6].every(q=>isClearLine({x:q,z:z-.9},{x:q,z:z+.9},r.world)))lane={from,goal,mid};
  }
  assert.ok(lane);a.position=lane.from;x.goal=lane.goal;a.action={id:'move',phase:'walking',automatic:false,goal:lane.goal};
  getActor(r,peer).position=lane.mid;
  observe(x);const result=observe(x,3);
  assert.equal(result.status,'rerouted');
  let from=a.position;
  for(const to of result.points){assert.ok(residentSegmentClear(r,id,from,to,{additionalOnly:true}));assert.ok(isClearLine(from,to,r.world));from=to;}
  assert.deepEqual(from,lane.goal);assert.deepEqual(getActor(r,peer).position,lane.mid);
});
test('only simple single-leg care is eligible; preserve manual shower variant',()=>{
  for(const id of ['cook','dining','grill','hobby','swim','garden','music','paint','tv','mirror'])
    assert.equal(isLegacyCareWalk({id,phase:'walking'}),false,id);
  assert.deepEqual(recoverableLegacyCareCommand({id:'shower',phase:'walking',automatic:false,targetInstanceId:'home-shower-1',showerSinging:true}),{type:'object',actionId:'shower',targetInstanceId:'home-shower-1',showerSinging:true});
  assert.equal(isLegacyCareWalk({id:'bed',phase:'using'}),false);
});
test('live game invokes guard and persists parked intent; module URL updated',()=>{
  const source=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  assert.match(source,/recoverLegacyCareWalk\(game,residentId,resident,careGuard,goal,legacyCareMinutes/);
  assert.match(source,/legacyCareArrivalClear\(game,residentId,resident/);
  assert.match(source,/walkingRetryAllowed\(careGuard,resident.action,game.minutes\)/);
  assert.match(source,/game.minutes-legacyCareFrameStart/);
  assert.match(readFileSync(new URL('../index.html',import.meta.url),'utf8'),/gc-08-legacy-care-walk/);
});
