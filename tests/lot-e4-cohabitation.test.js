/** LOT-E4: true cohabitation coverage absent in D3b's world-shape stress.
 * Headless movement/portal arrival is deliberately explicit: only a live
 * PlayCanvas browser can validate rendered motion and DOM dispatch.
 * No changes to runtime contracts, save v1, prices or autonomous rewards.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {newHousehold,loadHousehold,tickHousehold,getActor} from '../src/household.js';
import {outdoorCellAt} from '../src/lot-surface.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {gardenApproach,gardenView,gardenRequestStillValid,GARDEN_REPLANT_PRICE} from '../src/gardening.js';
import {beginPoolSwim,arrivePoolApproach,requestPoolExit} from '../src/pool-swim-runtime.js';
import {isWalkable,findPath,isClearLine} from '../src/navigation.js';
import {enqueueAction,dispatchActionQueues,pendingActions,MAX_ACTION_QUEUE} from '../src/action-queue.js';
import {hireCareer} from '../src/career-state.js';
import {arriveCareerPortal,finishCareerReturn} from '../src/career-work.js';
import {payHouseholdBill,householdBillView,BILL_AMOUNT} from '../src/household-bills.js';
import {sampleWorldLighting} from '../src/day-night-cycle.js';
import {SAVE_KEY} from '../src/simulation.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const base=outdoorCellAt(18.25,8.25);
const poolCells=Array.from({length:16},(_,i)=>base+Math.floor(i/4)*64+i%4).sort((a,b)=>a-b);
const fixture={fixtureId:'fixture-1',poolId:'pool-1',kind:'ladder',
 edgeCell:base,side:'west',purchasePriceCredits:120};
function household(){
 let root=newHousehold('2026-11-16');
 root.shop.credits=30000;
 root.world.outdoors={...root.world.outdoors,revision:1,
  pools:[{poolId:'pool-1',cells:poolCells}],poolFixtures:[fixture],
  nextPoolId:2,nextFixtureId:2,poolTxnSeq:1};
 const draft=previewOutdoorFeatureEdit(root,{operation:'place',
  itemId:'garden.herb.mint',pose:{x:19,z:11,yaw:0}});
 assert.equal(draft.ok,true,draft.reason);
 const placed=commitOutdoorFeatureEdit(root,draft);
 assert.equal(placed.ok,true,placed.reason);
 root=placed.root;
 root.careerSystem=hireCareer(root.careerSystem,'alex','editorial',root.minutes);
 root.careerSystem=hireCareer(root.careerSystem,'mira','business-center',root.minutes);
 return {root,plot:root.world.outdoors.features.find(f=>f.itemId==='garden.herb.mint').instanceId};
}
function invariant(root,expectedPool=true){
 assert.equal(SAVE_KEY,'lifesim.room01.v1');
 assert.equal(root.version,1);
 assert.equal(root.otherSim.minutes,root.minutes,'one clock, never double tick');
 assert.equal(root.otherSim.speed,root.speed);
 assert.equal(root.otherSim.autonomy.enabled,root.autonomy.enabled);
 assert.ok(Number.isSafeInteger(root.shop.credits)&&root.shop.credits>=0);
 if(expectedPool){
  assert.deepEqual(root.world.outdoors.pools[0].cells,poolCells);
  assert.deepEqual(root.world.outdoors.poolFixtures,[fixture]);
 }
 for(const id of ['alex','mira']){
  const actor=getActor(root,id);
  assert.ok(Number.isFinite(actor.position.x)&&Number.isFinite(actor.position.z));
  for(const [need,value] of Object.entries(actor.needs)){
   if(typeof value==='number')assert.ok(value>=0&&value<=100&&Number.isFinite(value),
    id+': '+need+' '+value);
  }
  const queue=pendingActions(root.actionQueues,id);
  assert.ok(queue.length<=MAX_ACTION_QUEUE);
  assert.equal(new Set(queue.map(x=>x.seq)).size,queue.length);
 }
 const entries=root.financialHistory.entries;
 assert.equal(new Set(entries.map(x=>x.id)).size,entries.length,'no duplicate finance receipt');
 for(const e of entries)assert.ok(Number.isSafeInteger(e.delta)&&Number.isSafeInteger(e.balanceAfter));
 assert.equal(new Set(root.careerSystem.settlementIds).size,root.careerSystem.settlementIds.length,
  'salary shift receipts never repeat');
}
function queue(root,id,cmd){
 const item=enqueueAction(root.actionQueues,id,cmd);
 assert.ok(item,'queue accepted '+id+' '+JSON.stringify(cmd));
 return item.seq;
}
/** Dispatch uses the real FIFO contract and production admission checks.
 * Node has no PlayCanvas movement, so snap ONLY after validating true A*.
 * Browser E4 separately verifies live 3D scene / state handoff.
 */
function dispatchHeadless(root,log){
 const dispatched=dispatchActionQueues(root.actionQueues,{
  canStart:(id)=>!getActor(root,id).action&&
   !['pending','departing','working','returning'].includes(
    root.careerSystem.byResident[id]?.currentShift?.phase==='working'?'working':
    root.careerSystem.byResident[id]?.currentShift?.phase==='departing'?'departing':''),
  start:(id,c)=>{
   const actor=getActor(root,id);
   if(c.type==='move'){
    const goal={x:c.x,z:c.z};
    if(!isWalkable(goal.x,goal.z,root.world))return false;
    const path=findPath(actor.position,goal,root.world);
    if(!path?.length)return false;
    for(let i=1;i<path.length;i++)assert.equal(isClearLine(path[i-1],path[i],root.world),true);
    actor.position={...goal};
   }else if(c.type==='pool'){
    const p=beginPoolSwim(root,id,c);
    if(!p)return false;
    const walk=findPath(actor.position,p.action.dryApproach,root.world);
    assert.ok(walk?.length,'A* path to real pool ladder');
    actor.position={...p.action.dryApproach};
    assert.equal(arrivePoolApproach(root,id),true);
   }else if(c.type==='garden'){
    if(!gardenRequestStillValid(root,id,c.instanceId,c.actionId))return false;
    const plan=gardenApproach(root.world,c.instanceId,actor.position);
    if(!plan)return false;
    const path=findPath(actor.position,plan.goal,root.world);
    assert.ok(path?.length,'A* path to garden work goal');
    actor.position={...plan.goal};
    actor.action={id:'garden',phase:'using',automatic:false,elapsed:0,
     targetInstanceId:c.instanceId,gardenActionId:c.actionId,
     gardenPlantedAt:root.world.outdoors.gardens[c.instanceId].plantedAt,
     gardenGoal:{...plan.goal}};
   }else return false;
   log.push({id,seq:c.seq,type:c.type,actionId:c.actionId||null,at:root.minutes});
   return true;
  }
 });
 return dispatched;
}
function workTransitions(root,counts){
 for(const id of ['alex','mira']){
  const shift=root.careerSystem.byResident[id]?.currentShift;
  if(shift?.phase==='departing'){
   assert.equal(arriveCareerPortal(root,id,root.minutes),true);
   counts.departures++;
  }
  if(shift?.phase==='returning'){
   assert.equal(finishCareerReturn(root,id),true);
   counts.returns++;
  }
 }
}
function reloadAndCompare(root){
 const raw=copy(root),next=loadHousehold(raw);
 assert.equal(next.minutes,root.minutes);
 assert.equal(next.shop.credits,root.shop.credits);
 assert.deepEqual(next.financialHistory,root.financialHistory);
 assert.deepEqual(next.actionQueues,root.actionQueues);
 assert.deepEqual(next.world.outdoors.gardens,root.world.outdoors.gardens);
 assert.deepEqual(next.careerSystem.settlementIds,root.careerSystem.settlementIds);
 invariant(next);
 return next;
}
test('E4 seven actual game days: two jobs, water -> growth -> harvest -> replant, safe swim, FIFO and wallet',()=>{
 const start=performance.now();
 let {root,plot}=household(),reloads=0,swimSeen=false,swimFinished=false;
 const balances={start:root.shop.credits};
 const counts={departures:0,returns:0,salaries:0,issued:0};
 const fifo=[],lighting=new Set(),first=[];
 const originalPlot=root.world.outdoors.gardens[plot].plantedAt;
 // Two independent queues remain in FIFO order during overlapping work,
 // garden care, pool use and save/reload; they are not auto-reordered.
 const schedule=new Map([
  [1080,[['alex',{type:'pool',poolId:'pool-1',actionId:'swim',fixtureId:'fixture-1'}],
   ['alex',{type:'move',x:16,z:6}],['mira',{type:'garden',instanceId:plot,actionId:'water'}],
   ['mira',{type:'move',x:16,z:-6}]]],
  [3960,[['mira',{type:'garden',instanceId:plot,actionId:'water'}]]],
  [6840,[['mira',{type:'garden',instanceId:plot,actionId:'harvest'}]]],
  [9720,[['mira',{type:'garden',instanceId:plot,actionId:'replant'}]]]
 ]);
 for(let n=0;n<7*48;n++){
  if(schedule.has(root.minutes)){
   if(root.minutes===1080){
    for(const id of ['alex','mira']){
     const actor=getActor(root,id);actor.needs.energy=90;actor.needs.bladder=90;
    }
   }
   for(const [id,c] of schedule.get(root.minutes))first.push(queue(root,id,c));
  }
  workTransitions(root,counts);
  const dispatched=dispatchHeadless(root,fifo);
  if(dispatched.length&&root.minutes===1080){
   root=reloadAndCompare(root);reloads++;
  }
  const light=sampleWorldLighting(root.calendar,root.minutes);
  lighting.add(light.phase);
  if(n===25){
   root.paused=true;
   const frozen=copy(root);tickHousehold(root,30);
   assert.deepEqual(root,frozen,'pause cannot charge, pay, grow or process FIFO');
   root.paused=false;
  }
  // Speed is a UI multiplier; the pure household tick sees ONLY the supplied
  // game minutes, regardless of selected display playback rate.
  root.speed=n%24<12?3:1;
  const events=tickHousehold(root,30)||[];
  counts.salaries+=events.filter(e=>e.type==='salary').length;
  counts.issued+=events.filter(e=>e.type==='bill-issued').length;
  swimSeen ||= ['entering','swimming','exiting','recovering'].includes(root.action?.stage);
  swimFinished ||= root.poolFirstSwimAt!==undefined&&root.poolFirstSwimAt!==null;
  if(n%24===23){root=reloadAndCompare(root);reloads++;}
  invariant(root);
 }
 assert.equal(root.minutes,480+7*1440);
 assert.ok(lighting.has('day')&&lighting.has('night'),'same clock crosses real day/night');
 assert.ok(counts.departures>=2&&counts.returns>=2,'both careers went to and returned from work');
 assert.ok(counts.salaries>=2,'both jobs settled at least one real shift');
 assert.ok(swimSeen,'real runtime swim stage reached after A* admission');
 assert.ok(swimFinished,'safe swim completed and first-swim marker settled');
 assert.equal(root.world.outdoors.gardens[plot].harvestedAt,null,'replanted after mature harvest');
 assert.ok(root.world.outdoors.gardens[plot].plantedAt>originalPlot,'replant created new growth cycle');
 assert.ok(root.world.outdoors.gardens[plot].progressWetMinutes<4320);
 assert.ok(root.kitchen.pantry.herbs>=2,'mature herbs harvested, no free crop');
 assert.equal(pendingActions(root.actionQueues,'alex').length,0,'Alex FIFO executed');
 assert.equal(pendingActions(root.actionQueues,'mira').length,0,'Mira FIFO executed');
 for(const id of ['alex','mira']){
  const started=fifo.filter(x=>x.id===id).map(x=>x.seq);
  assert.deepEqual(started,[...started].sort((a,b)=>a-b),'FIFO order '+id);
 }
 assert.equal(fifo.length,7,'all seven manual commands ran, not just saved');
 assert.equal(counts.issued,1,'one shared bill per seven-day cycle');
 // Payment commits wallet, history and bill state in the same production
 // transaction; retry (including reload) is strictly no-op.
 const pending=householdBillView(root);
 assert.equal(pending.unpaidCount,1);
 const payment=payHouseholdBill(root);
 assert.equal(payment.ok,true,payment.reason);
 const before=root.shop.credits;
 root.shop=payment.shop;root.financialHistory=payment.financialHistory;
 root.householdBills=payment.householdBills;
 assert.equal(root.shop.credits,before-BILL_AMOUNT);
 assert.equal(payHouseholdBill(root).ok,false,'same cycle cannot bill twice');
 root=reloadAndCompare(root);reloads++;
 assert.equal(payHouseholdBill(root).ok,false,'reload cannot replay bill');
 const replay=root.shop.credits;
 tickHousehold(root,0);
 assert.equal(root.shop.credits,replay,'zero delta never makes money');
 assert.equal(root.financialHistory.entries.reduce((sum,e)=>sum+e.delta,balances.start),
  root.shop.credits,'single chronological wallet matches all journal deltas');
 console.log('LOT-E4 7-day combined:',JSON.stringify({days:7,
  minutes:root.minutes-480,salaries:counts.salaries,workDepartures:counts.departures,
  workReturns:counts.returns,bills:counts.issued,queueStarted:fifo.length,
  reloads,dayNight:[...lighting],swimFinished,harvest:true,replant:true,
  receipts:root.financialHistory.entries.length,elapsedMs:Math.round(performance.now()-start)}));
});

test('E4 thirty days: repeated v1 reload mid-shift; settlement, finances and two residents stay bounded',()=>{
 const begin=performance.now();
 let {root,plot}=household(),reloads=0,events={salaries:0,bills:0,departures:0,returns:0};
 const initial=root.shop.credits,initialRecords=root.financialHistory.entries.length;
 for(let step=0;step<30*48;step++){
  workTransitions(root,events);
  if(step===13){
   root.paused=true;
   const snap=copy(root);tickHousehold(root,180);
   assert.deepEqual(root,snap);root.paused=false;
  }
  const emitted=tickHousehold(root,30)||[];
  events.salaries+=emitted.filter(e=>e.type==='salary').length;
  events.bills+=emitted.filter(e=>e.type==='bill-issued').length;
  if(step%24===0||step%48===47){
   root=reloadAndCompare(root);reloads++;
  }
  if(step%48===47)invariant(root);
 }
 assert.equal(root.minutes,480+30*1440);
 assert.ok(events.salaries>=4,'work salary across month');
 assert.ok(events.departures>=4&&events.returns>=4,'shift lifecycle repeated');
 assert.equal(events.bills,4,'one bill on each weekly issue, not per resident');
 assert.equal(root.householdBills.lastIssuedCycle,4);
 assert.ok(root.financialHistory.entries.length>initialRecords);
 assert.ok(root.shop.credits>initial,'work settlement accrued at least some salary');
 assert.equal(root.financialHistory.entries.reduce((sum,e)=>sum+e.delta,initial),
  root.shop.credits,'30-day wallet is conserved across reloads');
 const atEnd=copy(root);
 root=loadHousehold(atEnd);
 tickHousehold(root,1);
 assert.deepEqual(root.careerSystem.settlementIds,atEnd.careerSystem.settlementIds,
  'saved salary receipts cannot be regenerated');
 assert.equal(root.shop.credits,atEnd.shop.credits,'no phantom funds post reload');
 assert.equal(gardenView(root.world.outdoors,plot,root.minutes).mature,false,
  'without watering, herbs never mature just from 30 calendar days');
 console.log('LOT-E4 30-day combined:',JSON.stringify({days:30,
  minutes:30*1440,checks:30, reloads, salaries:events.salaries,
  workDepartures:events.departures,workReturns:events.returns,
  bills:events.bills,receipts:root.financialHistory.entries.length,
  credits:root.shop.credits,elapsedMs:Math.round(performance.now()-begin)}));
});

test('E4 interrupted in-water task plus persisted later FIFO commands never pay or complete phantom work',()=>{
 let {root,plot}=household();
 // A queued order must survive repeated rehydration even when one actor
 // is in a persisted manual pool stage and another garden task is using.
 root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
 const pool=beginPoolSwim(root,'alex',{poolId:'pool-1',actionId:'swim',fixtureId:'fixture-1'});
 assert.ok(pool);
 root.position={...pool.action.dryApproach};
 assert.equal(arrivePoolApproach(root,'alex'),true);
 queue(root,'alex',{type:'move',x:16,z:6});
 queue(root,'mira',{type:'garden',instanceId:plot,actionId:'water'});
 const toGarden=gardenApproach(root.world,plot,root.otherSim.position);
 assert.ok(findPath(root.otherSim.position,toGarden.goal,root.world)?.length);
 root.otherSim.position={...toGarden.goal};
 root.otherSim.action={id:'garden',phase:'using',automatic:false,elapsed:5,
  targetInstanceId:plot,gardenActionId:'water',
  gardenPlantedAt:root.world.outdoors.gardens[plot].plantedAt,
  gardenGoal:{...toGarden.goal}};
 const startCredits=root.shop.credits,receipts=root.financialHistory.entries.length;
 root=reloadAndCompare(root);
 assert.equal(root.action?.id,'swim','validated in-progress pool must resume');
 assert.equal(root.otherSim.action?.id,'garden','validated timed garden should resume');
 assert.equal(requestPoolExit(root,'alex','cancelled'),true);
 const afterCancel=root.needs.fun;
 tickHousehold(root,15);
 assert.ok(root.needs.fun<=afterCancel,'canceled swim must not mint unearned future Fun');
 assert.ok(root.world.outdoors.gardens[plot].lastWateredAt!==null,
  'other resident finishes legitimate garden independently');
 const reloaded=reloadAndCompare(root);
 assert.equal(reloaded.shop.credits,startCredits);
 assert.equal(reloaded.financialHistory.entries.length,receipts);
 assert.deepEqual(pendingActions(reloaded.actionQueues,'alex').map(x=>x.type),['move']);
 assert.deepEqual(pendingActions(reloaded.actionQueues,'mira').map(x=>x.type),['garden']);
});
