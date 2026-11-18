import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {progressCareerWork,arriveCareerPortal,selectCareerWorkMode,finishCareerReturn} from '../src/career-work.js';
import {progressWorkNeeds,workNeedsReport} from '../src/career-work-needs.js';
import {plannedCareerShift} from '../src/career-scheduler.js';

const clone=x=>JSON.parse(JSON.stringify(x));
const get=(root,id='alex')=>id==='alex'?root:root.otherSim;
function started(mode='normal',id='alex',career='editorial'){
  const root=newHousehold('2026-11-16');
  root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
  root.careerSystem=hireCareer(root.careerSystem,id,career,root.minutes);
  assert.equal(selectCareerWorkMode(root,id,mode).ok,true);
  // Weekday shift starts at 09:00; jobs may have a different first start.
  const planned=plannedCareerShift(root.calendar,root.careerSystem.byResident[id],
    Math.floor(root.minutes/1440)+1);
  assert.ok(planned);
  root.minutes=planned.start;root.otherSim.minutes=root.minutes;
  progressCareerWork(root,planned.start-1,planned.start);
  assert.equal(root.careerSystem.byResident[id].currentShift?.phase,'departing');
  assert.equal(arriveCareerPortal(root,id,root.minutes),true);
  return root;
}
function finish(root,id='alex'){
  const shift=root.careerSystem.byResident[id].currentShift;
  tickHousehold(root,shift.end-root.minutes);
  return root.careerSystem.byResident[id].lastShift;
}
test('W3-B: real-time lunch, workplace toilet and ambient chat; one real salary',()=>{
  const root=started('network');
  root.needs.hunger=38;root.needs.bladder=30;root.needs.social=40;
  const firstMoney=root.shop.credits,initialEnergy=root.needs.energy;
  const shift=root.careerSystem.byResident.alex.currentShift;
  tickHousehold(root,Math.floor((shift.end-root.minutes)/2)-1);
  assert.equal(workNeedsReport(shift).meal,false);
  tickHousehold(root,2);
  assert.equal(workNeedsReport(shift).meal,true);
  const report=finish(root);
  assert.equal(report.workReport.meal,true);
  assert.ok(report.workReport.toilet>=1&&report.workReport.toilet<=2);
  assert.ok(report.workReport.socialMinutes>0);
  assert.ok(root.needs.social>40);
  assert.ok(root.needs.energy<initialEnergy);
  assert.ok(root.needs.hunger<90,'Employer lunch must never maximize hunger');
  assert.equal(root.shop.credits,firstMoney+report.salary);
  assert.equal(root.careerSystem.settlementIds.length,1);
  tickHousehold(root,90);
  assert.equal(root.shop.credits,firstMoney+report.salary);
});
test('W3-B: four modes have bounded, materially different performance and needs',()=>{
  const result={};
  for(const mode of ['effort','normal','network','conserve']){
    const root=started(mode);
    root.needs.social=48;
    const report=finish(root);
    result[mode]={energy:root.needs.energy,social:root.needs.social,
      delta:report.performanceDelta,report};
  }
  assert.ok(result.effort.delta>result.conserve.delta);
  assert.ok(result.effort.energy<result.conserve.energy);
  assert.ok(result.network.social>result.effort.social);
  assert.ok(result.normal.energy<result.conserve.energy);
  assert.ok(result.effort.report.workReport.strain>result.conserve.report.workReport.strain);
});
test('W3-B: one large tick and small x1/x3 steps stay nearly identical',()=>{
  const base=started('network');
  base.needs.hunger=28;base.needs.bladder=23;base.needs.social=55;
  const a=loadHousehold(clone(base)),b=loadHousehold(clone(base));
  const until=a.careerSystem.byResident.alex.currentShift.end-a.minutes;
  tickHousehold(a,until);
  for(let t=0;t<until;t+=12)tickHousehold(b,Math.min(12,until-t));
  for(const key of ['hunger','bladder','social','energy','hygiene','fun'])
    assert.ok(Math.abs(a.needs[key]-b.needs[key])<2.5,key+' drift');
  assert.deepEqual(a.careerSystem.byResident.alex.lastShift.workReport,
    b.careerSystem.byResident.alex.lastShift.workReport);
  assert.equal(a.shop.credits,b.shop.credits);
});
test('W3-B: save/reload in shift does not repeat lunch or count conversation twice',()=>{
  let root=started('network');
  root.needs.hunger=35;root.needs.social=40;
  const duration=root.careerSystem.byResident.alex.currentShift.end-root.minutes;
  tickHousehold(root,Math.floor(duration*.65));
  const through=root.careerSystem.byResident.alex.currentShift.workNeeds.appliedThrough;
  assert.equal(root.careerSystem.byResident.alex.currentShift.workNeeds.mealUsed,true);
  const saved=clone(root);
  root=loadHousehold(saved);
  assert.equal(root.careerSystem.byResident.alex.currentShift.workNeeds.appliedThrough,through);
  const before=clone(root.needs);
  progressWorkNeeds(root,root.minutes,root.minutes);
  assert.deepEqual(root.needs,before);
  const salary=finish(root).salary;
  assert.equal(root.careerSystem.byResident.alex.lastShift.workReport.meal,true);
  const loaded=loadHousehold(clone(root));
  tickHousehold(loaded,20);
  assert.equal(loaded.careerSystem.settlementIds.length,1);
  assert.equal(loaded.shop.credits,root.shop.credits);
  assert.equal(loaded.careerSystem.byResident.alex.lastShift.salary,salary);
});
test('W3-B: night shift and two workers use one clock and independent need receipts',()=>{
  const root=started('network','mira','civic-service');
  root.otherSim.needs.hunger=30;root.otherSim.needs.bladder=25;
  const shift=root.careerSystem.byResident.mira.currentShift;
  assert.ok(shift.end>Math.ceil(shift.start/1440)*1440,'Crosses midnight');
  const alexBefore=clone(root.needs);
  const report=finish(root,'mira');
  assert.equal(report.workReport.meal,true);
  assert.ok(report.workReport.toilet>0);
  assert.equal(root.careerSystem.byResident.alex,null);
  assert.ok(root.needs.energy<alexBefore.energy,'Resident at home continues usual needs');
  assert.equal(root.otherSim.minutes,root.minutes);
});
test('W3-B: mode switching is prospective; pausing and malformed fields are safe',()=>{
  let root=started('effort');
  tickHousehold(root,100);
  const one=root.careerSystem.byResident.alex.currentShift.workNeeds;
  const first=one.modeScore;
  root.paused=true;const paused=clone(root);
  tickHousehold(root,300);
  assert.deepEqual(clone(root),paused);
  root.paused=false;
  assert.equal(selectCareerWorkMode(root,'alex','conserve').ok,true);
  tickHousehold(root,100);
  const two=root.careerSystem.byResident.alex.currentShift.workNeeds;
  assert.equal(two.modeScore,first-300,'Switch changes future 100 minutes only');
  assert.equal(selectCareerWorkMode(root,'alex','fake').ok,false);
  const report=finish(root);
  assert.ok(report.performanceDelta<12);
  assert.equal(selectCareerWorkMode(root,'alex','network').ok,false,'Returning is locked');
  const saved=clone(root);
  assert.equal(finishCareerReturn(root,'alex'),true);
  saved.careerSystem.byResident.alex.currentShift=null;
  saved.careerSystem.byResident.alex.workMode='tampered';
  root=loadHousehold(saved);
  assert.equal(root.careerSystem.byResident.alex.workMode,'normal');
});
test('W3-B: W3-A day off/missed shift cannot produce work meals or social care',()=>{
  const root=newHousehold('2026-11-16');
  root.careerSystem=hireCareer(root.careerSystem,'alex','editorial',root.minutes);
  const base=clone(root.needs);
  progressWorkNeeds(root,root.minutes,root.minutes+500);
  assert.deepEqual(root.needs,base);
  progressCareerWork(root,root.minutes,root.minutes+700);
  assert.equal(root.careerSystem.byResident.alex.lastShift.outcome,'missed');
  assert.equal(root.careerSystem.byResident.alex.lastShift.workReport,undefined);
});
test('W3-B: legacy in-flight shift defaults neutral; no retroactive off-lot rewards',()=>{
  let root=started('normal');
  tickHousehold(root,140);
  const snapshot=clone(root);
  delete snapshot.careerSystem.byResident.alex.currentShift.workNeeds;
  delete snapshot.careerSystem.byResident.alex.currentShift.workMode;
  delete snapshot.careerSystem.byResident.alex.workMode;
  root=loadHousehold(snapshot);
  const shift=root.careerSystem.byResident.alex.currentShift;
  assert.equal(shift.workMode,'normal');
  const current=clone(root.needs);
  tickHousehold(root,1);
  assert.ok(Math.abs(root.needs.hunger-current.hunger)<1);
  assert.equal(shift.workNeeds.mealUsed,false,'Legacy work does not retro-lunch');
  const corrupted=clone(root);
  corrupted.careerSystem.byResident.alex.currentShift.workNeeds.appliedThrough=1e16;
  root=loadHousehold(corrupted);
  assert.ok(root.careerSystem.byResident.alex.currentShift);
  assert.equal(root.careerSystem.byResident.alex.currentShift.workNeeds,null);
});
