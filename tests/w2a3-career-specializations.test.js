/** W2-A.3: choices, genuine scene evidence, old saves and existing payroll. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold} from '../src/household.js';
import {CAREER_CATALOG} from '../src/career-catalog.js';
import {hireCareer,resignCareer} from '../src/career-state.js';
import {plannedCareerShift} from '../src/career-scheduler.js';
import {promotionReadiness,promoteCareer} from '../src/career-progression.js';
import {progressCareerWork,finishCareerReturn} from '../src/career-work.js';
import {startWorkIncident,decideWorkIncident,workScenario,WORK_INCIDENT_CATALOG} from '../src/career-incidents.js';
import {CAREER_SPECIALIZATIONS,careerRankForContract,specializationReadiness,
  chooseCareerSpecialization,recordSpecializationIncident} from '../src/career-specializations.js';
import {professionalGoalsView} from '../src/career-goals.js';

const copy=x=>JSON.parse(JSON.stringify(x));
function setup(career='city-services',id='alex'){
  const root=newHousehold('2026-11-16');
  root.careerSystem=hireCareer(root.careerSystem,id,career,480);
  const contract=root.careerSystem.byResident[id];
  contract.level=4;contract.workedShifts=20;contract.rankShifts=4;contract.performance=95;
  return {root,contract,id,actor:id==='mira'?root.otherSim:root};
}
function shiftAt(root,contract,from=0){
  for(let day=from;day<from+24;day++){
    const shift=plannedCareerShift(root.calendar,contract,day);
    if(shift&&shift.id!==contract.lastShift?.id)return {shift,day};
  }
  throw Error('Missing next shift');
}
function work(st,from=0,{decision=true}={}){
  const {root,contract,id}=st;
  const {shift,day}=shiftAt(root,contract,from);
  contract.currentShift={...shift,phase:'working',departedAt:shift.start,
    readiness:88,warn15:false,warn60:false,incident:null};
  root.minutes=shift.start+Math.ceil(shift.duration/2)+1;
  root.otherSim.minutes=root.minutes;
  if(decision){
    assert.equal(startWorkIncident(root,id,root.minutes),true);
    const inc=contract.currentShift.incident;
    const opts=workScenario(contract.careerId,inc.scenarioId).options;
    const result=decideWorkIncident(root,id,opts[0].id);
    assert.equal(result.ok,true);
  }
  const messages=progressCareerWork(root,shift.end-1,shift.end);
  assert.equal(contract.currentShift.phase,'returning');
  assert.equal(finishCareerReturn(root,id),true);
  root.minutes=shift.end;root.otherSim.minutes=root.minutes;
  return {shift,day,messages};
}
test('six stable careers have precisely two immutable real branch rank5 options',()=>{
  assert.deepEqual(Object.keys(CAREER_SPECIALIZATIONS).sort(),
    CAREER_CATALOG.map(x=>x.id).sort());
  for(const career of CAREER_CATALOG){
    assert.equal(career.ranks.length,5,'historical titles, indices and rates remain in base catalog');
    const [a,b]=CAREER_SPECIALIZATIONS[career.id];
    assert.notEqual(a.id,b.id);assert.notEqual(a.rank.title,b.rank.title);
    assert.equal(a.rank.index,5);assert.equal(b.rank.index,5);
    assert.equal(a.rank.hourlyCredits,b.rank.hourlyCredits);
    assert.equal(a.rank.hourlyCredits,career.ranks[4].hourlyCredits+12);
    for(const track of [a,b])assert.ok(WORK_INCIDENT_CATALOG[career.id].some(
      scene=>scene.id===track.scenarioId));
    assert.ok(Object.isFrozen(a)&&Object.isFrozen(a.rank));
  }
});
test('old saves at all five ranks stay identical, without forced choice or payroll change',()=>{
  for(const career of CAREER_CATALOG)for(let level=0;level<5;level++){
    const {root,contract}=setup(career.id);
    contract.level=level;delete contract.specialization;
    const restored=loadHousehold(copy(root));
    const c=restored.careerSystem.byResident.alex;
    assert.equal(c.level,level);
    assert.equal(c.specialization,undefined);
    assert.equal(c.employmentId,contract.employmentId);
    assert.equal(careerRankForContract(c).title,career.ranks[level].title);
    assert.equal(shiftAt(restored,c).shift.hourlyCredits,career.ranks[level].hourlyCredits);
    if(level===4)assert.equal(promotionReadiness(restored,'alex').needsSpecialization,true);
    assert.equal(restored.version,1);
  }
});
test('malformed optional branch never deletes an old contract or awards',()=>{
  const st=setup();
  st.contract.specialization={schema:9,id:'unknown',chosenAt:99,workedShiftsAtChoice:0};
  const loaded=loadHousehold(copy(st.root));
  assert.equal(loaded.careerSystem.byResident.alex.level,4);
  assert.equal(loaded.careerSystem.byResident.alex.specialization,undefined);
  st.contract.level=5;
  const fallback=loadHousehold(copy(st.root));
  assert.equal(fallback.careerSystem.byResident.alex.level,4);
  assert.equal(fallback.careerSystem.byResident.alex.employmentId,st.contract.employmentId);
  assert.equal(fallback.shop.credits,st.root.shop.credits);
});
test('no early choice, during-shift change or missing two-shift cooldown bypass',()=>{
  const st=setup(),[a,b]=CAREER_SPECIALIZATIONS['city-services'];
  st.contract.level=3;
  assert.equal(chooseCareerSpecialization(st.root,'alex',a.id).ok,false);
  st.contract.level=4;
  assert.equal(chooseCareerSpecialization(st.root,'alex',a.id).ok,true);
  assert.equal(chooseCareerSpecialization(st.root,'alex',b.id).ok,true,
    'Before first new shift, mistaken choice is freely reversible');
  const {shift}=shiftAt(st.root,st.contract);
  st.contract.currentShift={...shift,phase:'pending',warn15:false,warn60:false};
  assert.equal(chooseCareerSpecialization(st.root,'alex',a.id).ok,false);
  st.contract.currentShift=null;
  const r=work(st);
  assert.equal(chooseCareerSpecialization(st.root,'alex',a.id).ok,false);
  work(st,r.day+1);
  assert.equal(chooseCareerSpecialization(st.root,'alex',a.id).ok,true);
  assert.equal(st.contract.level,4);
});
test('selected focus is earned only from actual post-choice positive incident receipt',()=>{
  for(const career of CAREER_CATALOG)for(const track of CAREER_SPECIALIZATIONS[career.id]){
    const st=setup(career.id);
    assert.equal(chooseCareerSpecialization(st.root,'alex',track.id).ok,true);
    const baseline=st.root.shop.credits;
    st.contract.rankShifts=track.requirements.shifts;
    st.contract.performance=99;
    if(track.requirements.skill)st.actor.skills.xpById[track.requirements.skill]=3000;
    let gate=promotionReadiness(st.root,'alex');
    assert.equal(gate.ready,false,'No fake pre-choice positive story');
    assert.equal(gate.requirements.at(-1).current,0);
    const r=work(st,0);
    assert.equal(st.contract.specialization.focusScenarioId,track.scenarioId);
    assert.ok(st.contract.specialization.focusReceiptId?.endsWith('#work'));
    assert.equal(st.root.careerSystem.incidentIds.length,1);
    assert.equal(st.root.careerSystem.settlementIds.length,1);
    assert.ok(st.root.shop.credits>baseline);
    gate=promotionReadiness(st.root,'alex');
    assert.equal(gate.ready,true,career.id+':'+track.id);
    const receipt=st.contract.specialization.focusReceiptId;
    assert.equal(recordSpecializationIncident(st.root,'alex',{
      id:receipt,careerId:career.id,scenarioId:track.scenarioId,performanceDelta:8,
      resolvedAt:st.root.minutes}),false,'Never replay focus effects');
    const before=st.root.shop.credits;
    assert.equal(promoteCareer(st.root,'alex').ok,true);
    assert.equal(st.contract.level,5);
    assert.equal(careerRankForContract(st.contract).title,track.rank.title);
    assert.equal(promotionReadiness(st.root,'alex').maxLevel,true);
    assert.equal(st.root.shop.credits,before,'Promotion cannot pay an extra salary');
    const restored=loadHousehold(copy(st.root));
    assert.equal(restored.careerSystem.byResident.alex.level,5);
    assert.equal(restored.careerSystem.byResident.alex.specialization.focusReceiptId,receipt);
    assert.equal(restored.shop.credits,before);
    const next=shiftAt(restored,restored.careerSystem.byResident.alex,r.day+1).shift;
    assert.equal(next.hourlyCredits,track.rank.hourlyCredits);
  }
});
test('rank5 current shift, saved hourly rate, incident and wages remain idempotent',()=>{
  const st=setup(),track=CAREER_SPECIALIZATIONS['city-services'][0];
  assert.equal(chooseCareerSpecialization(st.root,'alex',track.id).ok,true);
  st.contract.level=5;
  const {shift}=shiftAt(st.root,st.contract);
  st.contract.currentShift={...shift,phase:'working',departedAt:shift.start,
    readiness:80,warn15:false,warn60:false,incident:null};
  st.root.minutes=shift.start+shift.duration/2+1;st.root.otherSim.minutes=st.root.minutes;
  assert.equal(startWorkIncident(st.root,'alex',st.root.minutes),true);
  const inc=st.contract.currentShift.incident;
  assert.equal(decideWorkIncident(st.root,'alex',
    workScenario(st.contract.careerId,inc.scenarioId).options[0].id).ok,true);
  const loaded=loadHousehold(copy(st.root));
  const c=loaded.careerSystem.byResident.alex;
  assert.equal(c.level,5);assert.equal(c.currentShift.hourlyCredits,track.rank.hourlyCredits);
  assert.equal(loaded.careerSystem.incidentHistory.alex.at(-1).rank,5);
  const cash=loaded.shop.credits;
  progressCareerWork(loaded,shift.end-1,shift.end);
  assert.equal(loaded.shop.credits,cash+Math.round(shift.duration*track.rank.hourlyCredits/60));
  assert.equal(loaded.careerSystem.settlementIds.length,1);
  assert.equal(loaded.careerSystem.incidentIds.length,1);
  const once=loaded.shop.credits;
  progressCareerWork(loaded,shift.end,shift.end+1);
  assert.equal(loaded.shop.credits,once);
  assert.equal(loadHousehold(copy(loaded)).shop.credits,once);
});
test('sixth-rank lateral transfer preserves credits, rank, receipt ledger and badges',()=>{
  const st=setup('kitchen-studio'),[signature,operations]=CAREER_SPECIALIZATIONS['kitchen-studio'];
  st.actor.skills.xpById.cooking=3000;
  st.contract.rankShifts=20;
  assert.equal(chooseCareerSpecialization(st.root,'alex',operations.id).ok,true);
  work(st);
  const last=work(st,2);
  st.contract.level=5;
  const before=copy(st.root);
  const transfer=chooseCareerSpecialization(st.root,'alex',signature.id);
  assert.equal(transfer.ok,true);
  assert.equal(st.contract.level,5);
  assert.equal(st.contract.workedShifts,before.careerSystem.byResident.alex.workedShifts);
  assert.equal(st.contract.rankShifts,before.careerSystem.byResident.alex.rankShifts);
  assert.equal(st.root.shop.credits,before.shop.credits);
  assert.deepEqual(st.root.careerSystem.settlementIds,before.careerSystem.settlementIds);
  assert.equal(st.contract.specialization.focusReceiptId,null);
  assert.equal(careerRankForContract(st.contract).hourlyCredits,operations.rank.hourlyCredits);
  assert.ok(last.day>=2);
});
test('two residents choose independently; W2-A.2 recognition survives choice and resignation',()=>{
  const st=setup('city-services');
  st.root.careerSystem=hireCareer(st.root.careerSystem,'mira','editorial',480);
  st.root.careerSystem.byResident.mira.level=4;
  st.root.careerSystem.byResident.mira.workedShifts=18;
  assert.equal(chooseCareerSpecialization(st.root,'alex','logistics').ok,true);
  assert.equal(chooseCareerSpecialization(st.root,'mira','leadership').ok,true);
  const restored=loadHousehold(copy(st.root));
  assert.equal(restored.careerSystem.byResident.alex.specialization.id,'logistics');
  assert.equal(restored.careerSystem.byResident.mira.specialization.id,'leadership');
  assert.equal(professionalGoalsView(restored,'alex').goals.length,2);
  const awards=copy(restored.careerSystem.professionalGoals);
  restored.careerSystem=resignCareer(restored.careerSystem,'alex');
  assert.equal(restored.careerSystem.byResident.alex,null);
  assert.deepEqual(restored.careerSystem.professionalGoals,awards);
  assert.equal(restored.careerSystem.byResident.mira.specialization.id,'leadership');
});
