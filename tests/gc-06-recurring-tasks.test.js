import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,getActor,chooseResidentAction,tickHousehold,enableArtMarketPilot} from '../src/household.js';
import {newGame,arrive,ACTIONS,SAVE_KEY} from '../src/simulation.js';
import {createCalendar,MINUTES_PER_GAME_DAY as DAY} from '../src/calendar-core.js';
import {taskPeriod,syncRecurringTasks,changeRecurringTask,taskView,recordTaskOutcome} from '../src/recurring-tasks.js';
import {resolveActionFurniture,furnitureActionApproach} from '../src/furniture-catalog.js';
import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {enqueueAction} from '../src/action-queue.js';
import {hireCareer} from '../src/career-state.js';
import {nextCareerShift} from '../src/career-scheduler.js';
import {progressCareerWork} from '../src/career-work.js';
import {PAINT_ACTIVITY_ID} from '../src/painting.js';
import {MIRROR_SPEECH_DURATION} from '../src/furniture-interactions.js';
import {FINANCE_HISTORY_LIMIT,recordFinanceChange} from '../src/finance-ledger.js';
const copy=x=>JSON.parse(JSON.stringify(x));
const slot=(r,id,p='day')=>r.recurringTasks.byResident[id][p];
function select(r,id,p,kind){
 for(let i=0;i<7&&slot(r,id,p).kind!==kind;i++)assert.equal(changeRecurringTask(r,id,p,'replace'),true,'replace '+kind);
 assert.equal(slot(r,id,p).kind,kind);
}
function advanceTo(r,at){r.minutes=r.otherSim.minutes=at;syncRecurringTasks(r);}
function setup(){const r=newHousehold('2026-11-23');r.autonomy.enabled=r.otherSim.autonomy.enabled=false;return r;}
function buy(r,sku){
 const pose=findMarketPlacement(r.world.furniture,r.shop,sku);assert.ok(pose,sku);
 const b=buyMarketItem(r.world.furniture,r.shop,sku,pose);assert.ok(b.ok,b.reason);
 r.world.furniture=b.world;r.shop=b.shop;return b.instanceId;
}
function rest(r,id='alex'){
 const item=resolveActionFurniture(r.world,'sofa');assert.ok(item);
 assert.ok(chooseResidentAction(r,'sofa',false,id,item.instanceId));
 const a=getActor(r,id);a.position=furnitureActionApproach(r.world,'sofa',item.instanceId);arrive(a);
 return a;
}
function withoutTasks(r){const x=copy(r);delete x.recurringTasks;return x;}
test('GC-06: Gregorian windows Monday/midnight, leap and year transitions; no wall clock',()=>{
 const c=createCalendar('2026-12-31');
 assert.equal(taskPeriod(c,DAY-.01,'day').end,DAY);
 assert.equal(taskPeriod(c,DAY,'day').start,DAY);
 assert.equal(taskPeriod(c,0,'week').end,4*DAY);
 assert.equal(taskPeriod(c,4*DAY,'week').start,4*DAY);
 assert.notEqual(taskPeriod(c,4*DAY-1,'week').key,taskPeriod(c,4*DAY,'week').key);
 const leap=createCalendar('2028-02-28');
 assert.equal(taskPeriod(leap,DAY,'week').key,taskPeriod(leap,2*DAY,'week').key);
 assert.deepEqual(taskPeriod({...leap,weekendDays:[1,2]},DAY,'week'),taskPeriod(leap,DAY,'week'));
});
test('GC-06: legacy v1 migration adds only tasks, never imports old proof; malformed optional tasks repaired',()=>{
 const old=setup();delete old.recurringTasks;old.shop.credits=2719;old.skills.xpById.painting=123;
 const restored=loadHousehold(copy(old));
 assert.equal(restored.version,1);assert.equal(SAVE_KEY,'lifesim.room01.v1');
 assert.equal(restored.shop.credits,2719);assert.equal(restored.skills.xpById.painting,123);
 assert.deepEqual(Object.keys(restored.recurringTasks.byResident),['alex','mira']);
 for(const id of ['alex','mira'])for(const p of ['day','week']){
   assert.equal(slot(restored,id,p).proofs.length,0);assert.equal(slot(restored,id,p).startedAt,restored.minutes);
 }
 const malformed=copy(restored);malformed.recurringTasks.byResident.alex.day.proofs=[{id:'forged',at:99999999}];
 malformed.recurringTasks.byResident.ghost={};
 const fixed=loadHousehold(malformed);
 assert.equal(slot(fixed,'alex').proofs.length,0);assert.equal(Object.hasOwn(fixed.recurringTasks.byResident,'ghost'),false);
 assert.deepEqual(loadHousehold(copy(fixed)).recurringTasks,fixed.recurringTasks);
});
test('GC-06: replacement/dismissal changes only own slot; ignore costs nothing and no queue commands',()=>{
 const r=setup(),before=withoutTasks(r),mira=copy(r.recurringTasks.byResident.mira);
 const initial=slot(r,'alex').kind;
 assert.equal(changeRecurringTask(r,'alex','day','replace'),true);
 assert.notEqual(slot(r,'alex').kind,initial);
 assert.deepEqual(r.recurringTasks.byResident.mira,mira);
 assert.equal(changeRecurringTask(r,'alex','day','dismiss'),true);
 assert.equal(taskView(r,'alex')[0].status,'dismissed');
 assert.equal(changeRecurringTask(r,'alex','day','replace'),true);
 assert.equal(taskView(r,'alex')[0].status,'active');
 assert.deepEqual(withoutTasks(r),before);
 assert.equal(changeRecurringTask(r,'ghost','day','dismiss'),false);
});
test('GC-06: actual full leisure only, not arrival, partial, cancellation or removed furniture; actor isolation',()=>{
 for(const id of ['alex','mira']){
  const r=setup();select(r,id,'day','rest');
  const other=id==='alex'?'mira':'alex',otherTasks=copy(r.recurringTasks.byResident[other]);
  const a=rest(r,id);tickHousehold(r,20);assert.equal(slot(r,id).proofs.length,0);
  a.action=null;tickHousehold(r,1);assert.equal(slot(r,id).proofs.length,0);
  const a2=rest(r,id);const item=resolveActionFurniture(r.world,'sofa');item.location='storage';
  tickHousehold(r,ACTIONS.sofa.duration);assert.equal(slot(r,id).proofs.length,0);
  a2.action=null;item.location='home';
  rest(r,id);tickHousehold(r,ACTIONS.sofa.duration-1);assert.equal(slot(r,id).proofs.length,0);
  tickHousehold(r,1);assert.equal(taskView(r,id)[0].status,'complete');
  assert.deepEqual(r.recurringTasks.byResident[other],otherTasks);
  assert.deepEqual(loadHousehold(copy(r)).recurringTasks,r.recurringTasks);
 }
});
test('GC-06: same real action with tasks vs ignored tasks leaves identical canonical simulation',()=>{
 const a=setup(),b=setup();select(a,'alex','day','rest');select(b,'alex','day','rest');
 for(const p of ['day','week'])changeRecurringTask(b,'alex',p,'dismiss');
 rest(a);rest(b);
 tickHousehold(a,ACTIONS.sofa.duration);tickHousehold(b,ACTIONS.sofa.duration);
 assert.equal(slot(a,'alex').proofs.length,1);assert.equal(slot(b,'alex').proofs.length,0);
 assert.deepEqual(withoutTasks(a),withoutTasks(b));
});
test('GC-06: weekly distinct game days, no duplicate; day/week reset and pause',()=>{
 const r=setup();select(r,'alex','week','rest');assert.equal(slot(r,'alex','week').target,3);
 rest(r);tickHousehold(r,ACTIONS.sofa.duration);
 rest(r);tickHousehold(r,ACTIONS.sofa.duration);
 assert.equal(slot(r,'alex','week').proofs.length,1);
 const first=slot(r,'alex','week').proofs[0].id;
 const initialDay=slot(r,'alex').key;
 advanceTo(r,DAY+480);assert.notEqual(slot(r,'alex').key,initialDay);
 rest(r);tickHousehold(r,ACTIONS.sofa.duration);assert.equal(slot(r,'alex','week').proofs.length,2);
 assert.equal(recordTaskOutcome(r,'alex','rest',first),false);
 advanceTo(r,2*DAY+480);rest(r);tickHousehold(r,ACTIONS.sofa.duration);
 assert.equal(taskView(r,'alex')[1].status,'complete');
 r.paused=true;const snapshot=copy(r);tickHousehold(r,DAY*7);assert.deepEqual(r,snapshot);
 r.paused=false;advanceTo(r,7*DAY+1);
 assert.equal(slot(r,'alex','week').proofs.length,0);
});
test('GC-06: real painting session and speech, no award for queue/arrival/partial',()=>{
 const r=setup(),easel=buy(r,'easel.starter'),mirror=buy(r,'mirror.panel');
 assert.ok(enableArtMarketPilot(r));
 select(r,'alex','day','paint');
 assert.ok(chooseResidentAction(r,'paint',false,'alex',easel,PAINT_ACTIVITY_ID,'painting.hills',null,null,null,false,false,'practice',0));
 assert.equal(slot(r,'alex').proofs.length,0);
 r.position=furnitureActionApproach(r.world,'paint',easel);arrive(r);
 for(let i=0;i<44;i++)tickHousehold(r,1);
 assert.equal(slot(r,'alex').proofs.length,0);
 tickHousehold(r,1);assert.equal(slot(r,'alex').proofs.length,1);
 assert.equal(r.createdWorks.length,0);assert.equal(r.financialHistory.entries.length,0);
 select(r,'mira','day','speech');
 const m=r.otherSim;assert.ok(chooseResidentAction(r,'mirror',false,'mira',mirror,null,null,null,null,null,true));
 m.position=furnitureActionApproach(r.world,'mirror',mirror);arrive(m);
 tickHousehold(r,MIRROR_SPEECH_DURATION-1);assert.equal(slot(r,'mira').proofs.length,0);
 tickHousehold(r,1);assert.equal(slot(r,'mira').proofs.length,1);
});
test('GC-06: actual work settlement only, completion survives finance ledger eviction and reload',()=>{
 const r=setup();r.careerSystem=hireCareer(r.careerSystem,'alex','city-services',r.minutes);
 const shift=nextCareerShift(r.calendar,r.careerSystem.byResident.alex,r.minutes);assert.ok(shift);
 advanceTo(r,shift.end-1);select(r,'alex','day','work');
 const c=r.careerSystem.byResident.alex;
 c.currentShift={...shift,phase:'working',departedAt:shift.start,warn60:true,warn15:true,readiness:75};
 const money=r.shop.credits;
 const result=progressCareerWork(r,shift.end-1,shift.end);assert.ok(result.some(e=>e.type==='salary'));
 r.minutes=r.otherSim.minutes=shift.end;
 assert.equal(slot(r,'alex').proofs[0].id,'shift:'+shift.id);
 assert.equal(r.shop.credits-money,Math.round(shift.duration*shift.hourlyCredits/60));
 for(let i=0;i<FINANCE_HISTORY_LIMIT;i++){
  const tx=recordFinanceChange(r,{...r.shop,credits:r.shop.credits-1},{
   kind:'purchase',sourceId:'filler-'+i,actorId:'alex',atGameMinute:Math.floor(r.minutes)});
  assert.ok(tx.ok);r.shop=tx.shop;r.financialHistory=tx.financialHistory;
 }
 assert.equal(r.financialHistory.entries.some(e=>e.kind==='salary'),false);
 assert.equal(taskView(loadHousehold(copy(r)),'alex')[0].status,'complete');
});
test('GC-06: extra residents own their slots; unsupported hobbies not offered; actual speech settles',()=>{
 const r=setup(),mirror=buy(r,'mirror.panel'),point=furnitureActionApproach(r.world,'mirror',mirror);
 const make=(id,name)=>{const a=newGame();a.position={...point};return {id,identity:{firstName:name,lastName:'Тест',lifeStage:'adult'},actor:a};};
 r.population={schema:1,nextResidentSerial:5,residentsById:{resident_3:make('resident_3','Вера'),resident_4:make('resident_4','Игорь')},
  linksByResident:Object.fromEntries(['alex','mira','resident_3','resident_4'].map(id=>[id,{familyId:'family_1',dwellingId:'dwelling_1'}])),kinship:[]};
 const root=loadHousehold(copy(r));assert.equal(Object.keys(root.recurringTasks.byResident).length,4);
 select(root,'resident_3','day','speech');
 const other=copy(root.recurringTasks.byResident.resident_4);
 assert.ok(enqueueAction(root.actionQueues,'resident_3',{type:'object',actionId:'mirror',targetInstanceId:mirror,mirrorPractice:true}));
 tickHousehold(root,.1);
 const actor=getActor(root,'resident_3');assert.ok(actor.action?.mirrorPractice);
 actor.position={...point};arrive(actor);
 tickHousehold(root,MIRROR_SPEECH_DURATION);
 assert.equal(slot(root,'resident_3').proofs.length,1);
 assert.deepEqual(root.recurringTasks.byResident.resident_4,other);
});
test('GC-06: empty unavailable catalog has no forced purchases; restore across calendar anchor',()=>{
 const r=setup();r.world.furniture.instances.forEach(i=>i.location='storage');
 delete r.recurringTasks;syncRecurringTasks(r);
 assert.ok(taskView(r,'alex').every(x=>x.status==='empty'&&!x.canReplace));
 const old=slot(r,'alex').key;r.calendar=createCalendar('2028-02-29');syncRecurringTasks(r);
 assert.notEqual(slot(r,'alex').key,old);assert.equal(slot(r,'alex').proofs.length,0);
});
