import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {hireCareer,restoreCareerSystem} from '../src/career-state.js';
import {plannedCareerShift} from '../src/career-scheduler.js';
import {progressCareerWork,arriveCareerPortal,finishCareerReturn,skipCareerShift} from '../src/career-work.js';
import {careerReadiness,promotionReadiness,promoteCareer} from '../src/career-progression.js';

const clone=x=>JSON.parse(JSON.stringify(x));
const fresh=()=>newHousehold('2026-11-16');
const employ=(root,id='alex',career='editorial')=>{
  root.careerSystem=hireCareer(root.careerSystem,id,career,root.minutes);
  return root.careerSystem.byResident[id];
};
function shiftDay(root,id,day,late=0){
  const contract=root.careerSystem.byResident[id];
  const planned=plannedCareerShift(root.calendar,contract,day);
  assert.ok(planned,'Schedule exists on requested day');
  root.minutes=planned.start+late;root.otherSim.minutes=root.minutes;
  progressCareerWork(root,planned.start-1,root.minutes);
  assert.equal(arriveCareerPortal(root,id,root.minutes),true);
  tickHousehold(root,planned.end-root.minutes);
  const last=clone(contract.lastShift);
  assert.equal(finishCareerReturn(root,id),true);
  return last;
}
test('W1-B.3b.1 performance only changes at confirmed settlement and work causes real fatigue',()=>{
  const root=fresh(),contract=employ(root),startPerformance=contract.performance;
  const planned=plannedCareerShift(root.calendar,contract,1);
  root.minutes=planned.start;root.otherSim.minutes=root.minutes;
  progressCareerWork(root,planned.start-1,planned.start);
  const energyBefore=root.needs.energy,hygieneBefore=root.needs.hygiene;
  arriveCareerPortal(root,'alex',root.minutes);
  assert.equal(contract.performance,startPerformance);
  assert.ok(contract.currentShift.readiness>=0);
  tickHousehold(root,planned.end-planned.start);
  assert.equal(contract.workedShifts,1);
  assert.equal(contract.rankShifts,1);
  assert.equal(contract.missedShifts,0);
  assert.ok(contract.performance>startPerformance);
  assert.ok(root.needs.energy<energyBefore);
  assert.ok(root.needs.hygiene<hygieneBefore);
  assert.equal(contract.lastShift.outcome,'worked');
  assert.match(contract.lastShift.grade,/день|смена/);
  const snap=clone(root);
  tickHousehold(root,1);
  assert.equal(contract.workedShifts,1,'No second career receipt during return');
  assert.equal(root.needs.energy,snap.needs.energy,'Fatigue charged once');
  assert.equal(root.careerSystem.settlementIds.length,1);
});
test('W1-B.3b.1 missed and skipped shifts hurt performance once; late shift is recorded',()=>{
  const root=fresh(),contract=employ(root);
  const first=plannedCareerShift(root.calendar,contract,1);
  root.minutes=first.start;root.otherSim.minutes=root.minutes;
  progressCareerWork(root,first.start-1,first.start);
  assert.equal(skipCareerShift(root,'alex'),true);
  assert.equal(contract.performance,43);
  assert.equal(contract.missedShifts,1);
  assert.equal(contract.lastShift.performanceDelta,-7);
  assert.equal(skipCareerShift(root,'alex'),false);
  progressCareerWork(root,first.start,first.end);
  assert.equal(contract.performance,43,'No repeated penalty');
  const late=shiftDay(root,'alex',2,90);
  assert.equal(late.lateMinutes,90);
  assert.equal(contract.lateShifts,1);
  assert.equal(contract.workedShifts,1);
  assert.ok(late.performanceDelta<10);
  assert.equal(root.careerSystem.settlementIds.length,1);
});
test('W1-B.3b.1 three real shifts and genuine literature skill unlock first promotion',()=>{
  const root=fresh(),contract=employ(root);
  let progress=promotionReadiness(root,'alex');
  assert.equal(progress.ready,false);
  assert.equal(progress.rank,'Обозреватель');
  assert.equal(progress.requirements[2].label,'Литературная эрудиция');
  assert.equal(promoteCareer(root,'alex').ok,false);
  for(let day=1;day<=3;day++)shiftDay(root,'alex',day);
  progress=promotionReadiness(root,'alex');
  assert.equal(contract.workedShifts,3);
  assert.ok(contract.performance>=68);
  assert.equal(progress.ready,false,'Never award unearned literature XP from rabbit-hole');
  root.skills.xpById.literature=35;
  assert.equal(promotionReadiness(root,'alex').ready,true);
  assert.equal(promoteCareer(root,'alex').ok,true);
  assert.equal(contract.level,1);
  assert.equal(contract.rankShifts,0);
  assert.ok(contract.performance>=55);
  const second=plannedCareerShift(root.calendar,contract,4);
  assert.equal(second.hourlyCredits,35);
  const salary=shiftDay(root,'alex',4);
  assert.equal(salary.salary,280,'Promotion changes actual paid hourly rate');
  assert.equal(root.careerSystem.settlementIds.length,4);
});
test('W1-B.3b.1 promotion requires return home even if requirements are met',()=>{
  const root=fresh(),contract=employ(root,'alex','city-services');
  contract.performance=85;contract.rankShifts=3;
  const planned=plannedCareerShift(root.calendar,contract,1);
  root.minutes=planned.start;root.otherSim.minutes=root.minutes;
  progressCareerWork(root,planned.start-1,planned.start);
  assert.equal(promoteCareer(root,'alex').ok,false);
  assert.equal(contract.level,0);
  skipCareerShift(root,'alex');
  assert.equal(promoteCareer(root,'alex').ok,true);
});
test('W1-B.3b.1 Alex and Mira have separate performance, fatigue, career rank and wallet receipts',()=>{
  const root=fresh(),alex=employ(root,'alex','city-services'),
    mira=employ(root,'mira','art-studio');
  root.otherSim.skills.xpById.painting=160;
  shiftDay(root,'alex',1);
  assert.equal(mira.workedShifts,0);
  assert.equal(mira.performance,50);
  shiftDay(root,'mira',2);
  assert.equal(alex.workedShifts,1);
  assert.equal(mira.workedShifts,1);
  assert.notEqual(root.needs.energy,root.otherSim.needs.energy);
  assert.equal(root.careerSystem.settlementIds.length,2);
});
test('W1-B.3b.1 saved midshift readiness and historical records survive reload, no repeated rewards',()=>{
  let root=fresh(),contract=employ(root);
  const shift=plannedCareerShift(root.calendar,contract,1);
  root.minutes=shift.start;root.otherSim.minutes=shift.start;
  progressCareerWork(root,shift.start-1,shift.start);
  arriveCareerPortal(root,'alex',shift.start);
  const before=contract.currentShift.readiness;
  root=loadHousehold(clone(root));
  contract=root.careerSystem.byResident.alex;
  assert.equal(contract.currentShift.readiness,before);
  const firstEnergy=root.needs.energy;
  tickHousehold(root,shift.end-shift.start);
  const earned=contract.performance,energy=root.needs.energy,credits=root.shop.credits;
  assert.ok(energy<firstEnergy);
  root=loadHousehold(clone(root));
  assert.equal(root.careerSystem.byResident.alex.performance,earned);
  assert.equal(root.careerSystem.byResident.alex.workedShifts,1);
  assert.equal(root.careerSystem.byResident.alex.lastShift.grade!==null,true);
  tickHousehold(root,2);
  assert.equal(root.shop.credits,credits);
  assert.equal(root.needs.energy,energy);
  assert.equal(root.careerSystem.byResident.alex.workedShifts,1);
});
test('W1-B.3b.1 old/corrupt career v1 saves migrate safely with bounded counters',()=>{
  const root=fresh(),contract=employ(root);
  const raw=clone(root.careerSystem);
  delete raw.byResident.alex.workedShifts;
  delete raw.byResident.alex.rankShifts;
  raw.byResident.alex.missedShifts=-10;
  raw.byResident.alex.lateShifts=999999999999;
  const restored=restoreCareerSystem(raw).byResident.alex;
  assert.equal(restored.performance,50);
  assert.equal(restored.workedShifts,0);
  assert.equal(restored.rankShifts,0);
  assert.equal(restored.missedShifts,0);
  assert.equal(restored.lateShifts,0);
  assert.equal(root.version,1);
  assert.equal(root.shop.credits,5000);
  assert.equal(careerReadiness(null)>=0,true);
});
test('W1-B.3b.1 all six career ladders have valid and visible requirements',()=>{
  const root=fresh();
  for(const career of ['city-services','kitchen-studio','art-studio','editorial',
    'business-center','civic-service']){
    root.careerSystem=hireCareer(restoreCareerSystem(null),'alex',career,480);
    const goal=promotionReadiness(root,'alex');
    assert.equal(goal.maxLevel,false);
    assert.equal(goal.ready,false);
    assert.ok(goal.requirements.length>=2);
    assert.equal(goal.requirements[0].label,'Результативность');
  }
});
