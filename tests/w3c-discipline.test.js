/** W3-C: pure discipline, real shift integration and v1 reemployment invariants. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {hireCareer,separateCareer} from '../src/career-state.js';
import {recordCareerDiscipline,restoreCareerDiscipline,disciplineRisk,
  disciplineStatus} from '../src/career-discipline.js';
import {acceptCareerOffer,careerVacancies,careerRehireRetry,
  leaveCareer} from '../src/career-job-board.js';
import {submitCareerApplication} from '../src/career-recruitment.js';
import {upcomingCareerTimeOff,bookCareerTimeOff,claimPortableCareerLeave}
  from '../src/career-timeoff.js';
import {progressCareerWork,skipCareerShift,arriveCareerPortal,finishCareerReturn}
  from '../src/career-work.js';
import {nextCareerShift} from '../src/career-scheduler.js';
import {careerRankForContract} from '../src/career-specializations.js';
import {financeRows} from '../src/finance-presentation.js';

const clone=x=>JSON.parse(JSON.stringify(x));
const fresh=()=>{
  const root=newHousehold('2026-11-16');
  root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
  root.careerSystem=hireCareer(root.careerSystem,'alex','editorial',root.minutes);
  return root;
};
const record=(c,n,outcome,late=0)=>{
  const start=n*1440+540;
  return recordCareerDiscipline(c,{id:c.employmentId+'@'+n+'@'+start,
    start,end:start+480},outcome,late,start+480);
};
test('W3-C: graduated warnings, last chance, dismissal only after prior final',()=>{
  const c=fresh().careerSystem.byResident.alex;
  const statuses=[];
  for(let i=0;i<6;i++){
    const r=record(c,i,'missed');
    statuses.push(r.transition);
    assert.equal(r.risk,(i+1)*2);
  }
  assert.deepEqual(statuses,[null,'warning',null,'final',null,'dismissal']);
  assert.equal(disciplineStatus(c.discipline).stage,'dismissal');
  assert.equal(c.discipline.entries.length,6);
  assert.equal(record(c,5,'missed').newEvent,false,'same shift never sanctions twice');
  assert.equal(disciplineRisk(c.discipline),12);
  const old=restoreCareerDiscipline(clone(c.discipline),c.employmentId);
  assert.equal(old.pendingDismissal,true,'pending discharge persists on Safari reload');
});
test('W3-C: exact 29/30/89/90 minutes, one penalty per shift',()=>{
  const c=fresh().careerSystem.byResident.alex;
  [29,30,89,90].forEach((late,i)=>record(c,i,'worked',late));
  assert.deepEqual(c.discipline.entries.map(x=>x.points),[0,1,1,2]);
  assert.equal(disciplineRisk(c.discipline),4);
  assert.equal(disciplineStatus(c.discipline).stage,'warning');
  assert.equal(record(c,4,'missed',190).entry.points,2);
  assert.equal(c.discipline.entries.at(-1).lateMinutes,0);
});
test('W3-C: clean attendance mitigates risk, ten-shift window drops stale faults',()=>{
  const c=fresh().careerSystem.byResident.alex;
  record(c,0,'missed');record(c,1,'missed');
  assert.equal(disciplineRisk(c.discipline),4);
  record(c,2,'worked',0);record(c,3,'worked',7);
  assert.equal(disciplineRisk(c.discipline),3);
  for(let i=4;i<=13;i++)record(c,i,'worked',0);
  assert.equal(c.discipline.entries.length,10);
  assert.equal(disciplineRisk(c.discipline),0);
  assert.equal(disciplineStatus(c.discipline).stage,'clear');
  assert.equal(c.discipline.finalWarningId,null);
});
test('W3-C: malformed and legacy discipline never destroy an old employed contract',()=>{
  const root=fresh(),c=root.careerSystem.byResident.alex;
  c.missedShifts=91;c.lateShifts=76;
  delete c.discipline;
  let loaded=loadHousehold(clone(root));
  assert.equal(disciplineRisk(loaded.careerSystem.byResident.alex.discipline),0);
  assert.equal(loaded.careerSystem.byResident.alex.missedShifts,91);
  const victim=clone(root);
  victim.careerSystem.byResident.alex.discipline={entries:[{
    id:'e999@0@0',points:20,lateMinutes:0,outcome:'missed',at:0
  }],pendingDismissal:true,finalWarningId:'bad'};
  loaded=loadHousehold(victim);
  assert.ok(loaded.careerSystem.byResident.alex);
  assert.equal(disciplineRisk(loaded.careerSystem.byResident.alex.discipline),0);
});
test('W3-C: real explicitly missed shifts cause one discharge, no financial penalties',()=>{
  const root=fresh(),money=root.shop.credits;
  let alerts=[];
  for(let i=0;i<6;i++){
    const c=root.careerSystem.byResident.alex;
    const shift=nextCareerShift(root.calendar,c,root.minutes);
    assert.ok(shift);
    root.minutes=shift.start-1;root.otherSim.minutes=root.minutes;
    progressCareerWork(root,shift.start-40,root.minutes);
    assert.equal(c.currentShift?.phase,'pending');
    assert.equal(skipCareerShift(root,'alex'),true);
    assert.equal(c.currentShift,null);
    root.minutes=shift.end+1;root.otherSim.minutes=root.minutes;
  }
  assert.equal(root.careerSystem.byResident.alex.discipline.pendingDismissal,true);
  alerts=progressCareerWork(root,root.minutes,root.minutes+1);
  assert.equal(alerts.filter(e=>e.type==='dismissed').length,1);
  assert.equal(root.careerSystem.byResident.alex,null);
  assert.equal(root.careerSystem.endedContracts.alex.length,1);
  assert.equal(root.careerSystem.endedContracts.alex[0].reason,'dismissed');
  assert.equal(root.shop.credits,money,'discipline does not deduct credits');
  assert.equal(financeRows(root).length,0,'no invented salary or fine');
  assert.deepEqual(progressCareerWork(root,root.minutes+1,root.minutes+2)
    .filter(e=>e.type==='dismissed'),[]);
});
test('W3-C: rehire same profession after 3 game days, other profession immediately',()=>{
  const root=fresh(),first=root.careerSystem.byResident.alex;
  const id=first.employmentId;
  root.careerSystem=separateCareer(root.careerSystem,'alex','dismissed',root.minutes).careerSystem;
  assert.equal(careerRehireRetry(root,'alex','editorial').remaining,4320);
  assert.equal(acceptCareerOffer(root,'alex','editorial').ok,false,'instant hiring bypass blocked');
  assert.equal(submitCareerApplication(root,'alex','editorial').ok,false);
  assert.equal(submitCareerApplication(root,'alex','city-services').ok,true);
  root.recruitmentSystem.byResident.alex=null;
  root.minutes+=4320;root.otherSim.minutes=root.minutes;
  assert.equal(careerRehireRetry(root,'alex','editorial').blocked,false);
  assert.equal(submitCareerApplication(root,'alex','editorial').ok,true);
  root.recruitmentSystem.byResident.alex=null;
  const offer=acceptCareerOffer(root,'alex','editorial');
  assert.equal(offer.ok,true);
  assert.notEqual(offer.contract.employmentId,id);
  assert.equal(offer.contract.performance,60);
  assert.equal(offer.contract.rankShifts,0);
});
test('W3-C: eight-rank branch rehire preserves identity, never old incident receipts',()=>{
  const root=fresh(),c=root.careerSystem.byResident.alex;
  c.level=7;c.workedShifts=25;c.rankShifts=8;
  c.specialization={schema:1,id:'investigations',chosenAt:root.minutes,
    workedShiftsAtChoice:0,focusReceiptId:null,focusScenarioId:null,focusAt:null};
  c.timeOff.balance=3;
  root.careerSystem=separateCareer(root.careerSystem,'alex','resigned',root.minutes).careerSystem;
  assert.equal(root.careerSystem.portableLeave.alex,3);
  assert.equal(root.careerSystem.endedContracts.alex[0].level,7);
  const offer=acceptCareerOffer(root,'alex','editorial');
  assert.equal(offer.ok,true);
  const re=offer.contract;
  assert.equal(re.level,6);
  assert.equal(re.specialization.id,'investigations');
  assert.equal(re.specialization.focusReceiptId,null);
  assert.equal(re.seniorProofs.positiveReceipts.length,0);
  assert.equal(re.timeOff.balance,3);
  assert.equal(re.performance,60);
  assert.ok(careerRankForContract(re)?.hourlyCredits>0);
  const loaded=loadHousehold({...clone(root),careerSystem:offer.careerSystem});
  assert.equal(loaded.careerSystem.byResident.alex.level,6);
  assert.equal(loaded.careerSystem.byResident.alex.specialization.id,'investigations');
});
test('W3-C: paid bookings carry forward without payout or lost reserve',()=>{
  const root=fresh(),c=root.careerSystem.byResident.alex;
  c.timeOff.balance=3;
  const shift=upcomingCareerTimeOff(root,'alex')[0].shift;
  assert.equal(bookCareerTimeOff(root,'alex',shift.id,'paid').ok,true);
  assert.equal(c.timeOff.balance,2);
  const before=root.shop.credits;
  root.careerSystem=separateCareer(root.careerSystem,'alex','resigned',root.minutes).careerSystem;
  assert.equal(root.careerSystem.portableLeave.alex,3,'two banked + one booked');
  assert.equal(root.shop.credits,before);
  root.careerSystem=acceptCareerOffer(root,'alex','city-services').careerSystem;
  assert.equal(root.careerSystem.byResident.alex.timeOff.balance,3);
  assert.equal(root.shop.credits,before);
});
test('W3-C: portable reserve beyond bank cap can be reclaimed later',()=>{
  const root=fresh();
  root.careerSystem.portableLeave.alex=7;
  const old=root.careerSystem.byResident.alex;
  root.careerSystem=separateCareer(root.careerSystem,'alex','resigned',root.minutes).careerSystem;
  const offer=acceptCareerOffer(root,'alex','city-services');
  root.careerSystem=offer.careerSystem;
  assert.equal(offer.contract.timeOff.balance,3);
  assert.equal(root.careerSystem.portableLeave.alex,4);
  const shift=upcomingCareerTimeOff(root,'alex')[0].shift;
  assert.equal(bookCareerTimeOff(root,'alex',shift.id,'paid').ok,true);
  assert.equal(claimPortableCareerLeave(root,'alex').count,1);
  assert.equal(root.careerSystem.byResident.alex.timeOff.balance,3);
  assert.equal(root.careerSystem.portableLeave.alex,3);
  assert.notEqual(old.employmentId,offer.contract.employmentId);
});
test('W3-C: high-watermark rejects old shift replay after rolling history eviction',()=>{
  const c=fresh().careerSystem.byResident.alex;
  for(let i=0;i<14;i++)record(c,i,'worked',0);
  const once=c.discipline.entries.length;
  assert.equal(once,10);
  assert.equal(record(c,0,'missed').newEvent,false,'evicted oldest shift cannot replay');
  const copy=loadHousehold({...clone(fresh()),
    careerSystem:{...clone(fresh().careerSystem),byResident:{
      alex:{...clone(fresh().careerSystem.byResident.alex),discipline:clone(c.discipline)},
      mira:null
    }}});
  const restored=copy.careerSystem.byResident.alex;
  assert.equal(record(restored,0,'missed').newEvent,false,'reload keeps watermark');
});
test('W3-C: resignation before physical departure does not create a fake missed shift',()=>{
  const root=fresh(),contract=root.careerSystem.byResident.alex;
  const shift=nextCareerShift(root.calendar,contract,root.minutes);
  root.minutes=shift.start-20;
  progressCareerWork(root,shift.start-59,root.minutes);
  assert.equal(contract.currentShift?.phase,'pending');
  const leave=leaveCareer(root,'alex');
  assert.equal(leave.ok,true);
  assert.equal(leave.careerSystem.byResident.alex,null);
  assert.equal(leave.careerSystem.endedContracts.alex[0].reason,'resigned');
});
test('W3-C: two independent employees, no retro discipline on leave',()=>{
  const root=fresh();
  root.careerSystem=hireCareer(root.careerSystem,'mira','civic-service',root.minutes);
  const mira=root.careerSystem.byResident.mira;
  const leave=upcomingCareerTimeOff(root,'mira')[0].shift;
  assert.equal(bookCareerTimeOff(root,'mira',leave.id,'unpaid').ok,true);
  progressCareerWork(root,leave.end-20,leave.end+1);
  assert.equal(disciplineRisk(mira.discipline),0);
  assert.equal(root.careerSystem.byResident.alex.discipline.entries.length,0);
  record(root.careerSystem.byResident.alex,0,'missed');
  assert.equal(disciplineRisk(mira.discipline),0);
});
test('W3-C: real completed shift is once-only discipline + existing salary',()=>{
  const root=fresh(),c=root.careerSystem.byResident.alex;
  const planned=nextCareerShift(root.calendar,c,root.minutes);
  root.minutes=planned.start;root.otherSim.minutes=root.minutes;
  progressCareerWork(root,planned.start-1,planned.start);
  assert.equal(arriveCareerPortal(root,'alex',root.minutes),true);
  const balance=root.shop.credits;
  tickHousehold(root,planned.end-root.minutes);
  assert.equal(c.discipline.entries.length,1);
  assert.equal(c.discipline.entries[0].outcome,'worked');
  assert.equal(c.discipline.entries[0].points,0);
  assert.equal(root.careerSystem.settlementIds.length,1);
  assert.equal(root.shop.credits,balance+c.lastShift.salary);
  assert.equal(finishCareerReturn(root,'alex'),true);
  const after=root.shop.credits;
  tickHousehold(root,1);
  assert.equal(root.shop.credits,after);
  assert.equal(c.discipline.entries.length,1);
});
