import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {enqueueAction,restoreActionQueues,dispatchActionQueues} from '../src/action-queue.js';
import {outdoorCellAt} from '../src/lot-surface.js';
import {isWalkable} from '../src/navigation.js';
import {beginPoolSwim,canBeginPoolSwim,arrivePoolApproach,requestPoolExit,
  SWIM_MINUTES,SWIM_EFFECTS,SWIM_MAX_WAIT_MINUTES} from '../src/pool-swim-runtime.js';

const cell=outdoorCellAt(18.25,8.25);
const shape=(width=4,height=4)=>Array.from({length:width*height},(_,i)=>
  cell+Math.floor(i/width)*64+i%width).sort((a,b)=>a-b);
const fixture=(kind,edgeCell=cell,side='west',n=1)=>({
  fixtureId:'fixture-'+n,poolId:'pool-1',kind,edgeCell,side,
  purchasePriceCredits:kind==='ladder'?120:kind==='steps'?180:400
});
function home({width=4,height=4,equipment=[fixture('ladder')]}={}){
  const root=newHousehold();
  root.world.outdoors={...root.world.outdoors,
    revision:root.world.outdoors.revision+1,
    pools:[{poolId:'pool-1',cells:shape(width,height)}],
    poolFixtures:equipment};
  return root;
}
function begin(root,id='alex',command={poolId:'pool-1',actionId:'swim'}){
  const plan=beginPoolSwim(root,id,command);
  assert.ok(plan, 'must have dry path and a valid D2a pool slot');
  const actor=id==='alex'?root:root.otherSim;
  // Headless arrival mirrors the existing game.js land A* follower.
  assert.ok(plan.landPath.length>0);
  actor.position={...plan.action.dryApproach};
  assert.equal(arrivePoolApproach(root,id),true);
  return plan;
}
function reach(root,id='alex',stage='swimming',limit=100){
  const actor=id==='alex'?root:root.otherSim;
  for(let i=0;i<limit&&actor.action?.stage!==stage;i++)tickHousehold(root,1);
  assert.equal(actor.action?.stage,stage);
  return actor.action;
}
function finish(root,id='alex',limit=160){
  const actor=id==='alex'?root:root.otherSim;
  for(let i=0;i<limit&&actor.action;i++)tickHousehold(root,1);
  assert.equal(actor.action,null);
}
const copy=o=>JSON.parse(JSON.stringify(o));

test('D2b full lifecycle: real D2a land/wet route, 45 credited water minutes, safe dry exit',()=>{
  const s=home(),start=begin(s);
  assert.equal(start.action.stage,'waiting');
  assert.equal(start.action.phase,'using');
  const a=reach(s);
  assert.equal(a.waterCell,a.slotAnchor);
  assert.ok(a.entryWetPath.length>1);
  assert.equal(a.waterElapsed,0);
  const before=copy(s),control=copy(s);
  control.action=null;
  tickHousehold(control,SWIM_MINUTES);
  tickHousehold(s,SWIM_MINUTES);
  assert.equal(s.action.stage,'exiting');
  assert.equal(s.action.waterElapsed,SWIM_MINUTES);
  for(const [need,delta] of Object.entries(SWIM_EFFECTS))
    assert.ok(Math.abs((s.needs[need]-control.needs[need])-delta)<.02,
      need+' effect only during verified swim');
  assert.ok(s.action.waterCell!==undefined);
  finish(s);
  assert.ok(isWalkable(s.position.x,s.position.z,s.world));
  assert.equal(s.version,1);
  assert.equal(s.shop.credits,before.shop.credits);
});

test('D2b one ladder serializes transitions, but two non-overlapping slots permit concurrency',()=>{
  const s=home();
  begin(s,'alex');
  tickHousehold(s,1); // first actor has entered the exclusive transition
  assert.equal(s.action.stage,'entering');
  assert.equal(canBeginPoolSwim(s,'mira',{poolId:'pool-1',actionId:'swim'}),false);
  reach(s);
  const b=begin(s,'mira');
  assert.ok(!s.action.slotCells.some(c=>b.action.slotCells.includes(c)));
  assert.notEqual(s.action.slotId,b.action.slotId);
  reach(s,'mira');
  assert.equal(s.action.stage,'swimming');
  assert.equal(s.otherSim.action.stage,'swimming');
  tickHousehold(s,4);
  assert.ok(s.action.waterElapsed>0&&s.otherSim.action.waterElapsed>0);
});

test('D2b minimum footprint has one slot, second resident remains queued without overtaking',()=>{
  const s=home({width:2,height:4});
  begin(s);
  reach(s);
  assert.equal(canBeginPoolSwim(s,'mira',{poolId:'pool-1',actionId:'swim'}),false);
  const queued=enqueueAction(s.actionQueues,'mira',{
    type:'pool',poolId:'pool-1',actionId:'swim',queuedAt:s.minutes});
  assert.ok(queued);
  assert.equal(s.actionQueues.byResident.mira.length,1);
  assert.equal(s.otherSim.action,null);
  finish(s);
  assert.ok(canBeginPoolSwim(s,'mira',{poolId:'pool-1',actionId:'swim'}));
});

test('D2b rejects tired or toilet-critical swimmers without touching needs',()=>{
  const s=home(),before=copy(s);
  s.needs.energy=29;
  assert.equal(canBeginPoolSwim(s,'alex',{poolId:'pool-1',actionId:'swim'}),false);
  s.needs.energy=85;s.needs.bladder=24;
  assert.equal(beginPoolSwim(s,'alex',{poolId:'pool-1',actionId:'swim'}),null);
  assert.equal(s.action,null);
  assert.deepEqual(s.world,before.world);
});

test('D2b emergency energy and bladder requests exit instead of clearing actor underwater',()=>{
  for(const need of ['energy','bladder']){
    const s=home();
    begin(s);reach(s);
    s.needs[need]=need==='energy'?11:9;
    tickHousehold(s,1);
    assert.equal(s.action?.stage,'exiting');
    assert.equal(s.action?.exitRequested,'urgent-needs');
    finish(s);
    assert.ok(isWalkable(s.position.x,s.position.z,s.world));
  }
});

test('D2b player cancellation before entry and during water does not award future benefits',()=>{
  const waiting=home();
  begin(waiting);
  assert.equal(requestPoolExit(waiting,'alex','cancelled'),true);
  assert.equal(waiting.action,null);
  const s=home();begin(s);reach(s);
  const before=s.needs.fun;
  assert.equal(requestPoolExit(s,'alex','cancelled'),true);
  assert.equal(s.action.stage,'exiting');
  finish(s);
  assert.ok(s.needs.fun<=before,'no extra fun granted after cancellation');
});

test('D2b removal of pool or ladder during swim recovers to safe dry ground without reward',()=>{
  const s=home();begin(s);reach(s);
  const before=s.needs.fun;
  s.world.outdoors.pools=[];
  s.world.outdoors.poolFixtures=[];
  s.world.outdoors.revision++;
  tickHousehold(s,1);
  assert.equal(s.action,null);
  assert.ok(isWalkable(s.position.x,s.position.z,s.world));
  assert.ok(s.needs.fun<=before);
  const t=home();begin(t);reach(t);
  t.world.outdoors.poolFixtures=[];
  tickHousehold(t,1);
  assert.equal(t.action.stage,'recovering');
  for(let i=0;i<SWIM_MAX_WAIT_MINUTES+20&&t.action;i++)tickHousehold(t,1);
  assert.equal(t.action,null);
  assert.ok(isWalkable(t.position.x,t.position.z,t.world));
});

test('D2b pause freezes all actors, elapsed water rewards and clock',()=>{
  const s=home();begin(s);reach(s);
  s.paused=true;
  const snap=copy(s);
  tickHousehold(s,50);
  assert.deepEqual(s,snap);
  s.paused=false;
  tickHousehold(s,3);
  assert.equal(s.action.waterElapsed,3);
});

test('D2b fixed simulation time is invariant under x3 frame budgets',()=>{
  const s=home();begin(s);reach(s);
  const t=copy(s);
  tickHousehold(s,3);
  for(let i=0;i<3;i++)tickHousehold(t,1);
  assert.ok(Math.abs(s.action.waterElapsed-t.action.waterElapsed)<1e-6);
  for(const key of ['fun','energy','hygiene','bladder'])
    assert.ok(Math.abs(s.needs[key]-t.needs[key])<1e-5,key);
});

test('D2b v1 reload resumes validated wet position and rejects conflicting/corrupt saved slots',()=>{
  const s=home();begin(s);reach(s);tickHousehold(s,7);
  const restored=loadHousehold(copy(s));
  assert.equal(restored.version,1);
  assert.equal(restored.action?.id,'swim');
  assert.equal(restored.action.waterElapsed,7);
  assert.equal(restored.action.waterCell,s.action.waterCell);
  tickHousehold(restored,1);
  assert.equal(restored.action.waterElapsed,8);
  assert.deepEqual(restored.shop,s.shop);
  const corrupt=copy(s);
  corrupt.action.slotCells=[-1,-2];
  const repaired=loadHousehold(corrupt);
  assert.equal(repaired.action,null);
  assert.ok(isWalkable(repaired.position.x,repaired.position.z,repaired.world));
  assert.equal(repaired.otherSim.needs.energy,s.otherSim.needs.energy);
});

test('D2b older saves, existing queues and ordinary furniture action remain functional',()=>{
  const old=newHousehold();
  const r=loadHousehold(copy(old));
  assert.equal(r.action,null);
  assert.equal((r.world.outdoors.pools||[]).length,0);
  const item=enqueueAction(r.actionQueues,'alex',{type:'object',actionId:'sofa'});
  assert.equal(item.type,'object');
  assert.equal(restoreActionQueues(copy(r.actionQueues),['alex','mira']).byResident.alex[0].seq,item.seq);
  tickHousehold(r,1);
  assert.equal(r.version,1);
  assert.equal(r.otherSim.minutes,r.minutes);
});

test('D2b pool FIFO persisted timestamp and cancellation during approach are bounded',()=>{
  const s=home();
  const item=enqueueAction(s.actionQueues,'alex',{type:'pool',poolId:'pool-1',
    actionId:'swim',queuedAt:s.minutes});
  const next=enqueueAction(s.actionQueues,'mira',{type:'pool',poolId:'pool-1',
    actionId:'swim',queuedAt:s.minutes});
  assert.ok(next.seq>item.seq);
  assert.deepEqual(restoreActionQueues(copy(s.actionQueues),['alex','mira']),s.actionQueues);
  const begun=beginPoolSwim(s,'alex',item);
  assert.ok(begun);
  assert.equal(s.action.stage,'approaching');
  assert.equal(requestPoolExit(s,'alex','player'),true);
  assert.equal(s.action,null);
  assert.equal(s.otherSim.action,null);
});
