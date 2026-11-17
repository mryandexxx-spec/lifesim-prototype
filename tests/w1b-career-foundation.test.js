import test from 'node:test';
import assert from 'node:assert/strict';
import {CAREER_CATALOG,careerDefinition,validCareerSchedule} from '../src/career-catalog.js';
import {newCareerSystem,restoreCareerSystem,hireCareer,resignCareer} from '../src/career-state.js';
import {plannedCareerShift,nextCareerShift,careerShiftsInWindow} from '../src/career-scheduler.js';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {createCalendar} from '../src/calendar-core.js';
const copy=v=>JSON.parse(JSON.stringify(v));
test('W1-B.1 six distinct original families with validated immutable ranks and weekly shift masks',()=>{
  assert.equal(CAREER_CATALOG.length,6);
  assert.equal(new Set(CAREER_CATALOG.map(c=>c.id)).size,6);
  for(const c of CAREER_CATALOG){
    assert.ok(c.ranks.length>=3);
    assert.ok(validCareerSchedule(c.schedule));
    assert.ok(Object.isFrozen(c)&&Object.isFrozen(c.schedule)&&Object.isFrozen(c.ranks));
    assert.ok(c.ranks.every(r=>r.hourlyCredits>=12&&r.hourlyCredits<=125));
    assert.equal(careerDefinition(c.id),c);
  }
  assert.equal(careerDefinition('not-a-career'),null);
  assert.equal(validCareerSchedule({...CAREER_CATALOG[0].schedule,weekdays:[0,0]}),false);
  assert.equal(validCareerSchedule({...CAREER_CATALOG[0].schedule,duration:0}),false);
});
test('W1-B.1 legacy and new household saves remain v1; money, house, people and skills are intact',()=>{
  const root=newHousehold('2026-11-16'); // Monday
  assert.equal(root.version,1);assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.deepEqual(root.careerSystem,newCareerSystem());
  root.shop.credits=341;root.needs.hunger=21;root.otherSim.needs.energy=28;
  root.skills.xpById.literature=44;
  const old=copy(root);delete old.careerSystem;
  const reloaded=loadHousehold(old,'2027-02-02');
  assert.deepEqual(reloaded.careerSystem,newCareerSystem());
  assert.equal(reloaded.shop.credits,341);
  assert.equal(reloaded.needs.hunger,21);
  assert.equal(reloaded.otherSim.needs.energy,28);
  assert.equal(reloaded.skills.xpById.literature,44);
  assert.deepEqual(reloaded.world,root.world);
  assert.deepEqual(reloaded.inventory,root.inventory);
  assert.equal(reloaded.calendar.startCivilDate,'2026-11-16');
  tickHousehold(reloaded,15);
  assert.equal(reloaded.shop.credits,341); // no pre-release fictional wages
});
test('W1-B.1 contracts independent per resident, old-clock synchronized and validated on reload',()=>{
  let s=newHousehold('2026-11-16');
  s.careerSystem=hireCareer(s.careerSystem,'alex','editorial',480);
  s.careerSystem=hireCareer(s.careerSystem,'mira','civic-service',480);
  assert.equal(s.careerSystem.byResident.alex.employmentId,'e1');
  assert.equal(s.careerSystem.byResident.mira.employmentId,'e2');
  assert.equal(s.careerSystem.byResident.mira.careerId,'civic-service');
  assert.throws(()=>hireCareer(s.careerSystem,'alex','editorial',600),/already employed/);
  assert.throws(()=>hireCareer(s.careerSystem,'alien','editorial',600),/Invalid/);
  assert.throws(()=>hireCareer(s.careerSystem,'alex','nonexistent',600),/Invalid/);
  const reload=loadHousehold(copy(s));
  assert.deepEqual(reload.careerSystem,s.careerSystem);
  assert.equal(reload.otherSim.minutes,reload.minutes);
  // In-game simulation ticks in fractional minutes (0.3 at x1).
  const afterFractional=hireCareer(newCareerSystem(),'mira','editorial',480.3);
  assert.equal(restoreCareerSystem(copy(afterFractional)).byResident.mira.hiredAt,480.3);
  assert.equal(plannedCareerShift(s.calendar,afterFractional.byResident.mira,0)?.start,540);
  reload.careerSystem=resignCareer(reload.careerSystem,'alex');
  assert.equal(reload.careerSystem.byResident.alex,null);
  assert.equal(reload.careerSystem.byResident.mira.employmentId,'e2');
  assert.equal(reload.careerSystem.nextEmploymentId,3);
});
test('W1-B.1 malicious/stale state cannot create phantom work or overwrite household',()=>{
  const s=newHousehold();
  s.careerSystem={schema:1,nextEmploymentId:0,byResident:{
    alex:{residentId:'alex',employmentId:'e8',careerId:'not-a-job',level:0,hiredAt:0,status:'employed'},
    mira:{residentId:'mira',employmentId:'e9',careerId:'editorial',level:999,
      hiredAt:0,status:'employed'}},
    settlementIds:['oops','e1@0@540','e1@0@540']};
  const restored=loadHousehold(copy(s));
  assert.equal(restored.careerSystem.byResident.alex,null);
  assert.equal(restored.careerSystem.byResident.mira,null);
  assert.deepEqual(restored.careerSystem.settlementIds,['e1@0@540']);
  assert.equal(restored.shop.credits,5000);
  const good=hireCareer(newCareerSystem(),'alex','editorial',480);
  good.byResident.mira={...good.byResident.alex,residentId:'mira'};
  assert.equal(restoreCareerSystem(good).byResident.mira,null);
});
test('W1-B.1 Monday from Gregorian anchor; weekends do not create phantom shifts',()=>{
  const cal=createCalendar('2026-11-16'); // Monday
  const s=hireCareer(newCareerSystem(),'alex','editorial',480).byResident.alex;
  const monday=plannedCareerShift(cal,s,0);
  assert.equal(monday.iso,'2026-11-16');
  assert.equal(monday.weekday,0);
  assert.equal(monday.start,540);
  assert.equal(monday.end,1020);
  assert.equal(monday.id,'e1@0@540');
  assert.equal(plannedCareerShift(cal,s,5),null);
  assert.equal(plannedCareerShift(cal,s,6),null);
  assert.equal(plannedCareerShift(cal,s,7).iso,'2026-11-23');
  assert.equal(nextCareerShift(cal,s,1020)?.dayIndex,1);
  assert.equal(nextCareerShift(cal,s,7*1440+480)?.id,'e1@7@10620');
  assert.deepEqual(careerShiftsInWindow(cal,s,540,540),[]);
});
test('W1-B.1 leap-year, holiday exemption, calendar override, and employer weekly mask',()=>{
  const cal=createCalendar('2024-02-28'); // Wednesday
  const s=hireCareer(newCareerSystem(),'mira','city-services',480).byResident.mira;
  assert.equal(plannedCareerShift(cal,s,1).iso,'2024-02-29');
  assert.equal(plannedCareerShift(cal,s,2).iso,'2024-03-01');
  assert.equal(plannedCareerShift(cal,s,3),null);
  const newyear=createCalendar('2027-01-01'); // Friday, original New Year off
  const staff=hireCareer(newCareerSystem(),'alex','editorial',0).byResident.alex;
  assert.equal(plannedCareerShift(newyear,staff,0),null);
  const custom={...newyear,holidays:[{id:'h-newyear',title:'Встреча нового года',
    month:1,day:1,enabled:false,dayOffWork:true}]};
  assert.equal(plannedCareerShift(custom,staff,0)?.iso,'2027-01-01');
  const changed={...cal,weekendDays:[0,1]}; // player prefs do not rewrite an employer contract
  assert.equal(plannedCareerShift(changed,s,1)?.iso,'2024-02-29');
});
test('W1-B.1 night shift overlaps midnight, jump windows are half-open, stable on reload',()=>{
  const cal=createCalendar('2026-11-16');
  const s=hireCareer(newCareerSystem(),'mira','civic-service',0).byResident.mira;
  const wed=plannedCareerShift(cal,s,2);
  assert.equal(wed.start,2*1440+1200);
  assert.equal(wed.end,3*1440+240);
  assert.equal(plannedCareerShift(cal,s,2)?.id,wed.id);
  assert.deepEqual(careerShiftsInWindow(cal,s,wed.start-1,wed.start),[]);
  assert.deepEqual(careerShiftsInWindow(cal,s,wed.start,wed.start+1).map(x=>x.id),[wed.id]);
  assert.deepEqual(careerShiftsInWindow(cal,s,wed.end-1,wed.end).map(x=>x.id),[wed.id]);
  assert.deepEqual(careerShiftsInWindow(cal,s,wed.end,wed.end+1),[]);
  assert.equal(nextCareerShift(cal,s,wed.start+100)?.id,wed.id);
  assert.equal(nextCareerShift(cal,s,wed.end)?.dayIndex,3);
  assert.throws(()=>careerShiftsInWindow(cal,s,0,32*1440),RangeError);
});
test('W1-B.1 cannot schedule shifts before hire and does not progress when paused',()=>{
  const root=newHousehold('2026-11-16');
  root.careerSystem=hireCareer(root.careerSystem,'alex','editorial',700);
  assert.equal(plannedCareerShift(root.calendar,root.careerSystem.byResident.alex,0),null);
  assert.equal(nextCareerShift(root.calendar,root.careerSystem.byResident.alex,700)?.dayIndex,1);
  root.paused=true;
  const before=JSON.stringify(root);
  tickHousehold(root,120);
  assert.equal(JSON.stringify(root),before);
  root.paused=false;
  tickHousehold(root,120);
  assert.equal(root.careerSystem.byResident.alex.performance,50);
  assert.equal(root.careerSystem.byResident.alex.currentShift,null);
  assert.equal(root.shop.credits,5000);
});
