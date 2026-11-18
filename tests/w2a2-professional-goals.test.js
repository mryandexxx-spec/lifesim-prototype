/** W2-A.2: authentic optional goals; two residents, six careers, legacy receipts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold} from '../src/household.js';
import {CAREER_CATALOG} from '../src/career-catalog.js';
import {hireCareer,resignCareer} from '../src/career-state.js';
import {plannedCareerShift} from '../src/career-scheduler.js';
import {startWorkIncident,decideWorkIncident,workScenario,WORK_INCIDENT_CATALOG} from '../src/career-incidents.js';
import {progressCareerWork,finishCareerReturn} from '../src/career-work.js';
import {promotionReadiness} from '../src/career-progression.js';
import {PROFESSIONAL_GOALS,professionalGoalsView,
  recordProfessionalShift,recordProfessionalIncident} from '../src/career-goals.js';

const copy=x=>JSON.parse(JSON.stringify(x));
function setup(career='city-services',id='alex'){
  const root=newHousehold('2026-11-16');
  root.careerSystem=hireCareer(root.careerSystem,id,career,480);
  return {root,id,contract:root.careerSystem.byResident[id]};
}
function shiftFor(root,contract,from=0){
  for(let day=from;day<from+20;day++){
    const shift=plannedCareerShift(root.calendar,contract,day);
    if(shift&&shift.start>=contract.hiredAt&&shift.id!==contract.lastShift?.id)return {shift,day};
  }
  throw Error('Missing scheduled shift');
}
function work(st,{day=0,scenario=null,option=0}={}){
  const {root,id,contract}=st;
  const chosen=shiftFor(root,contract,day);
  const shift=chosen.shift;
  contract.currentShift={...shift,phase:'working',departedAt:shift.start,
    warn15:false,warn60:false,readiness:78,incident:null};
  root.minutes=shift.start+Math.ceil((shift.end-shift.start)/2)+1;
  root.otherSim.minutes=root.minutes;
  if(scenario!==null){
    assert.equal(startWorkIncident(root,id,root.minutes),true);
    // Test setup selects a known authored scenario; all effects and receipts
    // still pass through the actual canonical decision function.
    contract.currentShift.incident.scenarioId=scenario;
    const result=decideWorkIncident(root,id,workScenario(contract.careerId,scenario).options[option].id);
    assert.equal(result.ok,true);
  }
  const messages=progressCareerWork(root,shift.end-1,shift.end);
  assert.equal(contract.currentShift.phase,'returning');
  assert.equal(finishCareerReturn(root,id),true);
  root.minutes=shift.end;root.otherSim.minutes=root.minutes;
  return {shift,day:chosen.day,messages};
}

test('twelve immutable profession-specific goals, verified authored scenes and skill gates',()=>{
  assert.equal(Object.keys(PROFESSIONAL_GOALS).length,6);
  for(const c of CAREER_CATALOG){
    assert.equal(c.ranks.length,5);
    const goals=PROFESSIONAL_GOALS[c.id];
    assert.equal(goals.length,2);
    assert.deepEqual(goals.map(g=>g.requiredShifts),[2,4]);
    assert.ok(goals.every(g=>g.scenes.every(s=>
      WORK_INCIDENT_CATALOG[c.id].some(scene=>scene.id===s))));
    assert.equal(goals[0].skillLevel,
      ['editorial','art-studio','kitchen-studio'].includes(c.id)?2:0);
    assert.equal(goals[1].skillLevel,
      ['editorial','art-studio','kitchen-studio'].includes(c.id)?3:0);
    assert.notEqual(goals[0].id,goals[1].id);
  }
});
test('real canonical work and a positive incident earn recognition once without extra salary',()=>{
  const st=setup();
  const baseline=st.root.shop.credits;
  let one=work(st,{day:0,scenario:'legacy',option:1});
  assert.equal(one.messages.some(x=>x.type==='salary'),true);
  assert.equal(professionalGoalsView(st.root,'alex').goals[0].sceneMet,true);
  assert.equal(professionalGoalsView(st.root,'alex').earned,0);
  assert.equal(professionalGoalsView(st.root,'alex').current.shifts,1);
  const b=st.root.shop.credits;
  assert.ok(b>baseline);
  assert.deepEqual(progressCareerWork(st.root,one.shift.end,one.shift.end),[]);
  assert.equal(st.root.shop.credits,b);
  let second=work(st,{day:one.day+1});
  const view=professionalGoalsView(st.root,'alex');
  assert.equal(view.earned,1);
  assert.equal(view.completed[0].title,'Точный адрес');
  assert.equal(second.messages.some(m=>m.text.includes('достижение')),true);
  assert.equal(st.root.careerSystem.professionalGoals.byResident.alex['city-services'].shifts,2);
  assert.deepEqual(recordProfessionalIncident(st.root,'alex',{
    id:'invalid',careerId:'city-services',scenarioId:'legacy',performanceDelta:4}),[]);
  assert.equal(st.root.careerSystem.professionalGoals.byResident.mira['city-services'],undefined);
  const reloaded=loadHousehold(copy(st.root));
  assert.equal(professionalGoalsView(reloaded,'alex').earned,1);
  assert.equal(reloaded.shop.credits,st.root.shop.credits);
  assert.equal(reloaded.careerSystem.settlementIds.length,2);
});
test('the second goal requires its own actual scene and four settled shifts, no promotion changes',()=>{
  const st=setup();
  const baseline=promotionReadiness(st.root,'alex');
  const first=work(st,{day:0,scenario:'legacy',option:1});
  work(st,{day:first.day+1,scenario:'city-route',option:1});
  assert.equal(professionalGoalsView(st.root,'alex').earned,1);
  let d=first.day+2;
  for(let i=0;i<2;i++){
    const next=work(st,{day:d});d=next.day+1;
  }
  const view=professionalGoalsView(st.root,'alex');
  assert.equal(view.earned,2);
  assert.deepEqual(view.completed.map(x=>x.title),['Точный адрес','Маршрут без пробуксовки']);
  assert.equal(st.contract.level,0);
  assert.equal(baseline.requirements[1].target,promotionReadiness(st.root,'alex').requirements[1].target);
  assert.deepEqual(view.goals.map(g=>g.shifts),[4,4]);
});
test('skill-based recognition uses genuine cooking/painting/literature levels, not invented XP',()=>{
  for(const [career,skill] of [
    ['kitchen-studio','cooking'],['editorial','literature'],['art-studio','painting']]){
    const st=setup(career);
    const source=PROFESSIONAL_GOALS[career][0].scenes[0];
    const first=work(st,{day:0,scenario:source,option:1});
    work(st,{day:first.day+1});
    const none=professionalGoalsView(st.root,'alex');
    assert.equal(none.goals[0].sceneMet,true);
    assert.equal(none.goals[0].shifts,2);
    assert.equal(none.goals[0].done,false,'No invented skill');
    st.root.skills.xpById[skill]=3000;
    assert.equal(professionalGoalsView(st.root,'alex').goals[0].done,true);
    assert.equal(professionalGoalsView(st.root,'alex').goals[1].done,false);
  }
});
test('legacy v1 saves backfill only real contract shifts and a validated positive story',()=>{
  const st=setup();
  work(st,{day:0,scenario:'legacy',option:1});
  const old=copy(st.root);
  old.careerSystem.byResident.alex.workedShifts=3;
  delete old.careerSystem.professionalGoals;
  const restored=loadHousehold(old);
  const view=professionalGoalsView(restored,'alex');
  assert.equal(view.earned,1);
  assert.equal(view.goals[0].shifts,3);
  assert.equal(view.goals[0].sceneMet,true);
  const unknown=copy(old);
  unknown.careerSystem.incidentHistory.alex=[];
  const fresh=loadHousehold(unknown);
  assert.equal(professionalGoalsView(fresh,'alex').earned,0);
  assert.equal(professionalGoalsView(fresh,'alex').goals[0].sceneMet,false);
  assert.equal(fresh.version,1);
});
test('bad legacy proofs and empty saves do not fabricate awards',()=>{
  const st=setup();
  st.contract.workedShifts=15;
  const old=copy(st.root);
  delete old.careerSystem.professionalGoals;
  old.careerSystem.incidentHistory.alex=[{
    id:'fake',careerId:'city-services',scenarioId:'city-route',
    rank:0,shiftStart:0,at:0,choiceId:'plan',
    performanceDelta:9,performanceAfter:100,energyDelta:-4,funDelta:3
  }];
  const clean=loadHousehold(old);
  assert.equal(professionalGoalsView(clean,'alex').earned,0);
  assert.equal(professionalGoalsView(clean,'alex').goals[0].shifts,4);
  const empty=loadHousehold({version:1,careerSystem:null});
  assert.equal(empty.careerSystem.professionalGoals.schema,1);
});
test('recognition survives 12-story journal eviction and a rank change',()=>{
  const st=setup('city-services');
  const first=work(st,{day:0,scenario:'legacy',option:1});
  work(st,{day:first.day+1});
  assert.equal(professionalGoalsView(st.root,'alex').earned,1);
  const goals=st.root.careerSystem.professionalGoals.byResident.alex['city-services'];
  st.root.careerSystem.incidentHistory.alex=[];
  st.contract.level=4;
  const loaded=loadHousehold(copy(st.root));
  assert.equal(professionalGoalsView(loaded,'alex').earned,1);
  assert.equal(loaded.careerSystem.professionalGoals.byResident.alex['city-services'].shifts,2);
  assert.equal(loaded.careerSystem.incidentHistory.alex.length,0);
  assert.ok(goals.scenes.legacy.receiptId.endsWith('#work'));
});
test('Alex and Mira professional states stay separate, retain recognition across resign/re-hire',()=>{
  const st=setup();
  st.root.careerSystem=hireCareer(st.root.careerSystem,'mira','editorial',480);
  st.contract=st.root.careerSystem.byResident.alex;
  const first=work(st,{day:0,scenario:'legacy',option:1});
  work(st,{day:first.day+1});
  const mira=professionalGoalsView(st.root,'mira');
  assert.equal(mira.earned,0);
  assert.equal(mira.goals[0].shifts,0);
  st.root.careerSystem=resignCareer(st.root.careerSystem,'alex');
  assert.equal(st.root.careerSystem.professionalGoals.byResident.alex['city-services'].shifts,2);
  st.root.careerSystem=hireCareer(st.root.careerSystem,'alex','city-services',st.root.minutes);
  assert.equal(professionalGoalsView(st.root,'alex').earned,1);
  assert.equal(professionalGoalsView(st.root,'mira').earned,0);
});
test('saved working/pending incident and old employment ranks preserve once-only semantics',()=>{
  const st=setup('city-services');
  for(let rank=0;rank<5;rank++){
    st.contract.level=rank;
    const raw=loadHousehold(copy(st.root));
    assert.equal(raw.careerSystem.byResident.alex.level,rank);
    assert.equal(raw.careerSystem.professionalGoals.schema,1);
  }
  const {shift}=shiftFor(st.root,st.contract,0);
  st.contract.currentShift={...shift,phase:'working',departedAt:shift.start,
    readiness:80,incident:null};
  st.root.minutes=shift.start+shift.duration/2+1;
  assert.equal(startWorkIncident(st.root,'alex',st.root.minutes),true);
  const saved=loadHousehold(copy(st.root));
  assert.equal(saved.careerSystem.byResident.alex.currentShift.incident.choiceId,null);
  assert.equal(saved.careerSystem.professionalGoals.byResident.alex['city-services'],undefined);
  const balance=saved.shop.credits;
  const result=decideWorkIncident(saved,'alex','coordinate');
  assert.equal(result.ok,true);
  assert.equal(decideWorkIncident(saved,'alex','coordinate').ok,false);
  assert.equal(saved.shop.credits,balance);
  assert.equal(saved.careerSystem.professionalGoals.byResident.alex['city-services'].shifts,0);
});
