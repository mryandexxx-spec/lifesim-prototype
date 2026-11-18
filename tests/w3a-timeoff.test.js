import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {acceptCareerOffer} from '../src/career-job-board.js';
import {creditCareerPaidLeave,bookCareerTimeOff,cancelCareerTimeOff,
  careerTimeOffForShift,upcomingCareerTimeOff,restoreCareerTimeOff}
  from '../src/career-timeoff.js';
import {progressCareerWork} from '../src/career-work.js';
import {financeRows,financeAnalytics} from '../src/finance-presentation.js';
const make=()=>{
  const root=newHousehold('2026-11-17');
  root.careerSystem=acceptCareerOffer(root,'alex','city-services').careerSystem;
  return root;
};
test('W3-A: five actual work credits earn one paid day, capped at three',()=>{
  const root=make(),c=root.careerSystem.byResident.alex;
  assert.equal(c.timeOff.balance,0);
  for(let i=0;i<20;i++)creditCareerPaidLeave(c);
  assert.equal(c.timeOff.balance,3);
  assert.equal(c.timeOff.progress,0);
  assert.equal(c.workedShifts,0,'Leave accounting cannot invent a work shift');
});
test('W3-A: unpaid day does not count as missed or reduce performance',()=>{
  const root=make(),c=root.careerSystem.byResident.alex;
  const shift=upcomingCareerTimeOff(root,'alex')[0].shift;
  const prior=c.performance,missed=c.missedShifts;
  assert.equal(bookCareerTimeOff(root,'alex',shift.id,'unpaid').ok,true);
  root.minutes=shift.start-61;
  progressCareerWork(root,root.minutes,shift.end+1);
  assert.equal(c.currentShift,null);
  assert.equal(c.missedShifts,missed);
  assert.equal(c.performance,prior);
  assert.equal(c.timeOff.bookings[0].settled,true);
  assert.equal(root.shop.credits,5000);
});
test('W3-A: paid vacation settles exactly once into shared wallet and finance',()=>{
  const root=make(),c=root.careerSystem.byResident.alex;
  for(let i=0;i<5;i++)creditCareerPaidLeave(c);
  const shift=upcomingCareerTimeOff(root,'alex')[0].shift;
  assert.equal(bookCareerTimeOff(root,'alex',shift.id,'paid').ok,true);
  assert.equal(c.timeOff.balance,0);
  assert.equal(bookCareerTimeOff(root,'alex',shift.id,'paid').ok,false);
  root.minutes=shift.end-1;
  progressCareerWork(root,root.minutes,shift.end+1);
  const amount=Math.round(shift.duration*shift.hourlyCredits/60);
  assert.equal(root.shop.credits,5000+amount);
  assert.equal(c.workedShifts,0);
  assert.equal(c.rankShifts,0);
  assert.equal(financeRows(root).filter(e=>e.kind==='paid-leave').length,1);
  assert.equal(financeAnalytics(root,{mode:'all'}).income,amount);
  progressCareerWork(root,shift.end+1,shift.end+600);
  assert.equal(root.shop.credits,5000+amount);
  assert.equal(financeRows(root).filter(e=>e.kind==='paid-leave').length,1);
});
test('W3-A: cancellation before shift refunds reserved paid day',()=>{
  const root=make(),c=root.careerSystem.byResident.alex;
  for(let i=0;i<5;i++)creditCareerPaidLeave(c);
  const shift=upcomingCareerTimeOff(root,'alex')[0].shift;
  assert.equal(bookCareerTimeOff(root,'alex',shift.id,'paid').ok,true);
  assert.equal(cancelCareerTimeOff(root,'alex',shift.id).ok,true);
  assert.equal(c.timeOff.balance,1);
  assert.equal(careerTimeOffForShift(c,shift.id),null);
  root.minutes=shift.start;
  assert.equal(bookCareerTimeOff(root,'alex',shift.id,'unpaid').ok,false);
});
test('W3-A: two residents and a cross-midnight leave survive v1 reload',()=>{
  let root=make();
  root.careerSystem=acceptCareerOffer(root,'mira','civic-service').careerSystem;
  const shift=upcomingCareerTimeOff(root,'mira')[0].shift;
  assert.ok(shift.end>Math.ceil(shift.start/1440)*1440,'night shift crosses midnight');
  assert.equal(bookCareerTimeOff(root,'mira',shift.id,'unpaid').ok,true);
  root=loadHousehold(JSON.parse(JSON.stringify(root)),'2026-12-01');
  assert.equal(root.careerSystem.byResident.alex.timeOff.bookings.length,0);
  assert.equal(root.careerSystem.byResident.mira.timeOff.bookings[0].id,shift.id);
  tickHousehold(root,1);
  assert.equal(root.careerSystem.byResident.mira.timeOff.bookings[0].settled,false);
});
test('W3-A: migration never grants retrospective leave from past work',()=>{
  const root=make(),c=root.careerSystem.byResident.alex;
  c.workedShifts=99;
  delete c.timeOff;
  const restored=loadHousehold(JSON.parse(JSON.stringify(root)));
  assert.equal(restored.careerSystem.byResident.alex.timeOff.balance,0);
  assert.equal(restored.careerSystem.byResident.alex.timeOff.progress,0);
  assert.equal(restoreCareerTimeOff({balance:100,progress:8,bookings:[
    {id:'fake',start:1,end:300,type:'paid',hourlyCredits:100,settled:false}
  ]},c.employmentId).bookings.length,0);
});
test('W3-A: booking pending shift clears work departure and prevents salary',()=>{
  const root=make(),c=root.careerSystem.byResident.alex;
  const shift=upcomingCareerTimeOff(root,'alex')[0].shift;
  progressCareerWork(root,shift.start-61,shift.start-50);
  assert.equal(c.currentShift?.phase,'pending');
  assert.equal(bookCareerTimeOff(root,'alex',shift.id,'unpaid').ok,true);
  assert.equal(c.currentShift,null);
  progressCareerWork(root,shift.start-50,shift.start+1);
  assert.equal(c.currentShift,null);
  assert.equal(root.careerSystem.settlementIds.length,0);
});
