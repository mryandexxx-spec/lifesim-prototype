// GC-06 isolated recurring task proof probe. No runtime entry point or save field.
import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarAt,createCalendar,MINUTES_PER_GAME_DAY as DAY} from '../src/calendar-core.js';
import {restoreFinancialHistory,recordFinanceChange,FINANCE_HISTORY_LIMIT} from '../src/finance-ledger.js';
import {newHousehold,loadHousehold,chooseResidentAction,getActor,tickHousehold,enableArtMarketPilot} from '../src/household.js';
import {residentIdsForSimulation} from '../src/resident-activity-runtime.js';
import {arrive} from '../src/simulation.js';
import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {PAINT_ACTIVITY_ID} from '../src/painting.js';
import {quoteArtSale,projectArtSale} from '../src/art-market.js';
import {transactPainting} from '../src/painting-gallery.js';
import {hireCareer} from '../src/career-state.js';
import {nextCareerShift} from '../src/career-scheduler.js';
import {progressCareerWork} from '../src/career-work.js';
const copy=x=>JSON.parse(JSON.stringify(x));
const theme='painting.hills';

// Proposed calendar policy: daily at midnight, weekly Monday; no device time.
// Half-open intervals, clipped only at the beginning of playable time.
function period(calendar,minutes,kind){
  if(!['day','week'].includes(kind))throw new RangeError('unknown period');
  const view=calendarAt(calendar,minutes);
  const offset=kind==='week'?view.weekday:0;
  const rawStart=(view.dayIndex-offset)*DAY;
  return {key:kind+':'+calendar.startCivilDate+':'+(view.serial-offset),
    start:Math.max(0,rawStart),end:rawStart+(kind==='week'?7:1)*DAY};
}
function begin(root,id,kind,receiptKind){
  if(!residentIdsForSimulation(root).includes(id)||!['salary','art-sale'].includes(receiptKind))
    throw new RangeError('unsupported actor or receipt');
  return {id,kind,receiptKind,window:period(root.calendar,root.minutes,kind),
    at:root.minutes,oldIds:restoreFinancialHistory(root.financialHistory).entries.map(x=>x.id)};
}
function read(root,task){
  if(!residentIdsForSimulation(root).includes(task.id))return {status:'unavailable'};
  const now=root.minutes;
  if(now<task.at||period(root.calendar,now,task.kind).key!==task.window.key)
    return {status:'expired'};
  const receipt=restoreFinancialHistory(root.financialHistory).entries.find(x=>
    x.actorId===task.id&&x.kind===task.receiptKind&&x.delta>0&&
    x.atGameMinute>=Math.max(task.window.start,Math.floor(task.at))&&
    x.atGameMinute<task.window.end&&x.atGameMinute<=Math.floor(now)&&
    !task.oldIds.includes(x.id));
  return receipt?{status:'observed',receiptId:receipt.id}:{status:'unverified'};
}
function post(root,kind,id,delta,receiptId,at=root.minutes){
  const tx=recordFinanceChange(root,{...root.shop,credits:root.shop.credits+delta},{
    kind,sourceId:receiptId,actorId:id,atGameMinute:Math.floor(at),receiptId});
  assert.equal(tx.ok,true,tx.reason);
  root.shop=tx.shop;root.financialHistory=tx.financialHistory;
  return tx;
}
function artFixture(){
  const root=newHousehold('2026-11-26');
  root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
  const pose=findMarketPlacement(root.world.furniture,root.shop,'easel.starter');
  assert.ok(pose);
  const buy=buyMarketItem(root.world.furniture,root.shop,'easel.starter',pose);
  assert.ok(buy.ok);
  root.world.furniture=buy.world;root.shop=buy.shop;
  assert.ok(enableArtMarketPilot(root));
  return {root,easel:buy.instanceId};
}
function artTrace(id,observe){
  let {root,easel}=artFixture();
  const daily=begin(root,id,'day','art-sale'),weekly=begin(root,id,'week','art-sale');
  const wrong=begin(root,id==='alex'?'mira':'alex','day','art-sale');
  const check=(status)=>{
    if(!observe)return;
    const before=copy(root);
    for(const task of [daily,weekly])assert.equal(read(root,task).status,status);
    assert.equal(read(root,wrong).status,'unverified');
    assert.deepEqual(root,before);
  };
  check('unverified');
  assert.ok(chooseResidentAction(root,'paint',false,id,easel,PAINT_ACTIVITY_ID,theme,null,null,null,false,false,'speculative',20));
  check('unverified'); // admission/material debit is not a sale
  const actor=getActor(root,id),spot=furnitureActionApproach(root.world,'paint',easel);
  assert.ok(spot);actor.position={x:spot.x,z:spot.z};arrive(actor);
  for(let i=0;i<45;i++)tickHousehold(root,1);
  check('unverified'); // painting completed but not sold
  const person=getActor(root,id);
  const work=person.createdWorks[0];assert.ok(work);
  const stored=transactPainting(root,id,work.id,'store');assert.ok(stored.ok);
  person.createdWorks=stored.works;
  check('unverified');
  const quote=quoteArtSale(root,id,work.id);
  const sale=projectArtSale(root,id,work.id,quote);assert.ok(sale.ok,sale.reason);
  Object.assign(root,{artMarket:sale.artMarket,shop:sale.shop,financialHistory:sale.financialHistory});
  person.createdWorks=sale.works;
  check('observed');
  assert.equal(projectArtSale(root,id,work.id,quote).ok,false);
  root=loadHousehold(copy(root));check('observed');
  if(observe){
    assert.equal(read(root,daily).receiptId,'art:'+id+':'+work.id);
    assert.equal(read(root,begin(root,id,'day','art-sale')).status,'unverified');
  }
  return root;
}

test('GC-06: Gregorian daily and Monday weekly boundaries including leap/year; custom weekend has no effect',()=>{
 const c=createCalendar('2026-12-31');
 assert.equal(period(c,DAY-0.01,'day').end,DAY);
 assert.equal(period(c,DAY,'day').start,DAY);
 assert.equal(period(c,0,'week').end,4*DAY); // Thu -> Monday
 assert.equal(period(c,4*DAY,'week').start,4*DAY);
 assert.notEqual(period(c,4*DAY-1,'week').key,period(c,4*DAY,'week').key);
 const leap=createCalendar('2028-02-28');
 assert.equal(calendarAt(leap,DAY).iso,'2028-02-29');
 assert.equal(calendarAt(leap,2*DAY).iso,'2028-03-01');
 assert.equal(period(leap,DAY,'week').key,period(leap,2*DAY,'week').key);
 assert.deepEqual(period({...leap,weekendDays:[1,2]},DAY,'week'),period(leap,DAY,'week'));
 assert.notEqual(period(createCalendar('2028-02-29'),DAY,'week').key,period(leap,DAY,'week').key);
});
for(const id of ['alex','mira'])test('GC-06: real painting sale '+id+' / matched observer vs no observer',()=>{
 assert.deepEqual(artTrace(id,true),artTrace(id,false));
});
test('GC-06: actual settled shift is proof, not hiring or partial shift',()=>{
 const root=newHousehold('2026-11-26');
 root.careerSystem=hireCareer(root.careerSystem,'alex','city-services',root.minutes);
 const contract=root.careerSystem.byResident.alex;
 const shift=nextCareerShift(root.calendar,contract,root.minutes);assert.ok(shift);
 contract.currentShift={...shift,phase:'working',departedAt:shift.start,warn60:true,warn15:true,readiness:75};
 root.minutes=shift.end-1;
 const task=begin(root,'alex','day','salary');
 assert.equal(read(root,task).status,'unverified');
 const wallet=root.shop.credits;
 const events=progressCareerWork(root,shift.end-1,shift.end);
 assert.ok(events.some(e=>e.type==='salary'));
 root.minutes=shift.end;
 assert.equal(read(root,task).status,'observed');
 assert.equal(read(root,task).receiptId,'salary:'+shift.id);
 assert.equal(root.shop.credits-wallet,Math.round(shift.duration*shift.hourlyCredits/60));
 assert.equal(read(root,begin(root,'mira','day','salary')).status,'unverified');
});
test('GC-06: same-minute activation baseline, future proof, wrong type, no-op, duplicate and reset',()=>{
 const root=newHousehold('2026-11-26');
 post(root,'art-sale','alex',1,'prior');
 const t=begin(root,'alex','day','art-sale');
 assert.equal(read(root,t).status,'unverified');
 post(root,'salary','alex',1,'salary');
 post(root,'art-sale','mira',1,'other');
 post(root,'art-sale','alex',1,'future',root.minutes+10);
 assert.equal(post(root,'art-sale','alex',0,'zero').recorded,false);
 assert.equal(read(root,t).status,'unverified');
 post(root,'art-sale','alex',1,'actual');
 const duplicate=recordFinanceChange(root,{...root.shop,credits:root.shop.credits+1},{
  kind:'art-sale',sourceId:'actual',actorId:'alex',receiptId:'actual',atGameMinute:Math.floor(root.minutes)});
 assert.equal(duplicate.ok,false);
 const before=copy(root);
 assert.deepEqual(read(root,t),{status:'observed',receiptId:'actual'});
 assert.deepEqual(root,before);
 root.minutes=t.window.end;assert.equal(read(root,t).status,'expired');
 assert.equal(read(root,begin(root,'alex','day','art-sale')).status,'unverified');
 root.minutes=t.at-1;assert.equal(read(root,t).status,'expired');
});
test('GC-06: missing legacy journal and eviction remain unverified, never invent completion',()=>{
 const root=newHousehold();
 const t=begin(root,'alex','week','art-sale');
 delete root.financialHistory;assert.equal(read(root,t).status,'unverified');
 post(root,'art-sale','alex',1,'actual');
 assert.equal(read(root,t).status,'observed');
 for(let i=0;i<FINANCE_HISTORY_LIMIT;i++)post(root,'purchase','alex',-1,'filler-'+i);
 assert.equal(root.financialHistory.entries.length,FINANCE_HISTORY_LIMIT);
 assert.equal(read(root,t).status,'unverified'); // durable production proof explicitly not implemented
});
test('GC-06: negative sign in malformed legacy proof and unknown resident fail closed',()=>{
 const root=newHousehold();
 const t=begin(root,'alex','day','art-sale');
 const tx=post(root,'art-sale','alex',1,'actual');
 root.financialHistory.entries[0]={...tx.entry,delta:-1};
 assert.equal(read(root,t).status,'unverified');
 assert.throws(()=>begin(root,'foreign','day','art-sale'),RangeError);
 assert.throws(()=>begin(root,'alex','day','purchase'),RangeError);
});
