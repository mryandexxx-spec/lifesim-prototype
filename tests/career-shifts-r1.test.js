/** CAREER-SHIFTS-R1: owner-approved A/A/A/A, real Gregorian schedules and save safety. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {CAREER_CATALOG} from '../src/career-catalog.js';
import {CAREER_SPECIALIZATIONS} from '../src/career-specializations.js';
import {newHousehold,loadHousehold} from '../src/household.js';
import {hireCareer,restoreCareerSystem} from '../src/career-state.js';
import {plannedCareerShift,nextCareerShift} from '../src/career-scheduler.js';
import {approvedRankSchedule,migrateLegacyCareerSchedules} from '../src/career-rank-schedules.js';
import {careerVacancies,calendarCareerShifts} from '../src/career-job-board.js';

const TIMES={
  'city-services':[[360,540],[420,480],[480,480],[480,480],[540,420],[540,420],[540,480],[540,480]],
  'kitchen-studio':[[1020,540],[840,480],[720,480],[720,480],[600,420],[600,420],[600,420],[600,420]],
  'art-studio':[[720,540],[660,480],[600,480],[600,480],[600,420],[600,420],[600,480],[600,480]],
  editorial:[[960,540],[720,480],[600,480],[600,480],[600,420],[600,420],[540,480],[540,480]],
  'business-center':[[480,540],[540,480],[540,480],[540,480],[600,420],[600,420],[600,480],[600,480]],
  'civic-service':[[1200,540],[1080,480],[840,480],[840,480],[600,420],[600,420],[600,480],[600,480]]
};
const PAY={
  'city-services':[15,34,73,91,111,123,139,158],
  'kitchen-studio':[16,38,82,101,123,135,151,172],
  'art-studio':[17,36,77,95,116,128,144,163],
  editorial:[14,35,79,97,118,130,146,166],
  'business-center':[18,42,89,104,125,137,153,174],
  'civic-service':[19,43,85,100,122,134,150,170]
};
function employed(root,careerId){
  root.careerSystem=hireCareer(root.careerSystem,'alex',careerId,root.minutes,{rankSchedules:true});
  return root.careerSystem.byResident.alex;
}
function setRank(contract,level){
  contract.level=level;
  if(level>=5)contract.specialization={schema:1,
    id:CAREER_SPECIALIZATIONS[contract.careerId][0].id,
    chosenAt:contract.hiredAt,workedShiftsAtChoice:0};
}
test('approved A matrix has 48 rank profiles, valid original wages and strictly increasing full-week pay',()=>{
  assert.equal(CAREER_CATALOG.length,6);
  for(const career of CAREER_CATALOG){
    const amounts=[];
    for(let rank=0;rank<8;rank++){
      const schedule=approvedRankSchedule(career.id,rank);
      assert.ok(schedule,career.id+' rank '+rank);
      assert.equal(schedule.startMinute,TIMES[career.id][rank][0]);
      assert.equal(schedule.duration,TIMES[career.id][rank][1]);
      assert.equal(schedule.weekdays.length,rank>=6&&career.id!=='kitchen-studio'?4:5);
      assert.equal(schedule.holidayPolicy,'observe');
      amounts.push(schedule.duration*schedule.weekdays.length*PAY[career.id][rank]/60);
    }
    assert.ok(amounts.every((n,i)=>i===0||n>amounts[i-1]),career.id+' promotion may not reduce regular gross weekly pay');
  }
});
test('night shifts are one immutable shift across midnight; Sunday civic work belongs to Sunday',()=>{
  const root=newHousehold('2026-11-16');
  const contract=employed(root,'civic-service');
  // 2026-11-16 Monday, Sunday index6 is a civic work day.
  const sunday=plannedCareerShift(root.calendar,contract,6);
  assert.ok(sunday);
  assert.equal(sunday.start,6*1440+1200);
  assert.equal(sunday.end,sunday.start+540);
  assert.equal(sunday.id,contract.employmentId+'@6@'+sunday.start);
  assert.equal(sunday.hourlyCredits,19);
  assert.equal(nextCareerShift(root.calendar,contract,sunday.start+5)?.id,sunday.id);
  const dayRows=calendarCareerShifts(root,'2026-11-22','2026-11-22');
  assert.equal(dayRows.length,1);
  assert.equal(dayRows[0].start,1200);
  assert.equal(dayRows[0].end,300);
  assert.equal(dayRows[0].overnight,true);
});
test('real contract schedule uses rank; existing old root-v1 contract waits until safe Monday',()=>{
  let root=newHousehold('2026-11-16');
  const contract=employed(root,'kitchen-studio');
  assert.equal(plannedCareerShift(root.calendar,contract,1).start,1440+1020);
  // Emulate existing root-v1 saves: rank scheduling extension is absent.
  delete contract.shiftSchedule;
  const existing=plannedCareerShift(root.calendar,contract,1);
  assert.equal(existing.start,1440+600);
  const saved=JSON.parse(JSON.stringify(root));
  root=loadHousehold(saved,'2026-11-16');
  const migrated=root.careerSystem.byResident.alex;
  assert.equal(migrated.shiftSchedule.schema,1);
  assert.equal(migrated.shiftSchedule.effectiveDayIndex,7);
  assert.equal(plannedCareerShift(root.calendar,migrated,1).start,1440+600);
  assert.equal(plannedCareerShift(root.calendar,migrated,8).start,8*1440+1020);
  const reloaded=loadHousehold(JSON.parse(JSON.stringify(root)),'2026-11-16');
  assert.deepEqual(reloaded.careerSystem.byResident.alex.shiftSchedule,migrated.shiftSchedule);
});
test('legacy future paid leave and active shift survive migration without creating new IDs',()=>{
  const root=newHousehold('2026-11-16'),contract=employed(root,'civic-service');
  delete contract.shiftSchedule;
  const future=plannedCareerShift(root.calendar,contract,13);
  assert.ok(future);
  contract.timeOff.bookings=[{id:future.id,start:future.start,end:future.end,
    type:'paid',hourlyCredits:19,settled:false,paidAmount:0}];
  const present=plannedCareerShift(root.calendar,contract,2);
  contract.currentShift={id:present.id,employmentId:contract.employmentId,
    careerId:contract.careerId,start:present.start,end:present.end,
    hourlyCredits:19,phase:'pending',warn60:false,warn15:false,departedAt:null};
  const before=JSON.stringify(contract.currentShift);
  const originalLeave=JSON.stringify(contract.timeOff.bookings);
  migrateLegacyCareerSchedules(root);
  assert.equal(JSON.stringify(contract.currentShift),before);
  assert.equal(JSON.stringify(contract.timeOff.bookings),originalLeave);
  assert.ok(contract.shiftSchedule.effectiveDayIndex>=14);
  assert.equal(plannedCareerShift(root.calendar,contract,13)?.id,future.id);
  assert.equal(plannedCareerShift(root.calendar,contract,14),null);
});
test('new vacancy uses true R0 rank timetable rather than old static catalog hours',()=>{
  const root=newHousehold('2026-11-16');
  const data=careerVacancies(root,'alex');
  const civic=data.find(v=>v.id==='civic-service');
  const kitchen=data.find(v=>v.id==='kitchen-studio');
  assert.equal(civic.hours,'20:00–05:00 (+1 день)');
  assert.equal(civic.duration,540);
  assert.equal(kitchen.hours,'17:00–02:00 (+1 день)');
});
