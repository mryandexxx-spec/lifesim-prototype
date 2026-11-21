import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {plannedCareerShift} from '../src/career-scheduler.js';
import {progressCareerWork,arriveCareerPortal} from '../src/career-work.js';
import {CAREER_CATALOG} from '../src/career-catalog.js';
import {createProfile} from '../src/trait-catalog.js';
import {WORK_INCIDENTS,WORK_INCIDENT_CATALOG,INCIDENT_HISTORY_LIMIT,
  workScenario,selectWorkScenario,startWorkIncident,pendingWorkIncident,
  decideWorkIncident,chooseAutonomousWorkOption,automaticWorkIncident} from '../src/career-incidents.js';

const copy=x=>JSON.parse(JSON.stringify(x));
function setup(career='editorial',id='alex'){
  const root=newHousehold('2026-11-16');
  root.careerSystem=hireCareer(root.careerSystem,id,career,480);
  const contract=root.careerSystem.byResident[id],day=career==='civic-service'?2:
    career==='kitchen-studio'?1:0;
  const shift=plannedCareerShift(root.calendar,contract,day);
  root.minutes=shift.start;root.otherSim.minutes=shift.start;
  progressCareerWork(root,shift.start-.01,shift.start);
  assert.equal(arriveCareerPortal(root,id,shift.start),true);
  return {root,id,contract,day};
}
function spawn(state,day=state.day+1){
  const shift=plannedCareerShift(state.root.calendar,state.contract,day);
  assert.ok(shift);
  state.contract.currentShift={...shift,phase:'working',departedAt:shift.start,
    warn15:false,warn60:false,readiness:70,incident:null};
  state.root.minutes=shift.start+Math.ceil(shift.duration/2)+1;
  state.root.otherSim.minutes=state.root.minutes;
  assert.equal(startWorkIncident(state.root,state.id,state.root.minutes),true);
  return state.contract.currentShift.incident;
}
function first(state){
  const shift=state.contract.currentShift;
  state.root.minutes=shift.start+Math.ceil((shift.end-shift.start)/2)+1;
  state.root.otherSim.minutes=state.root.minutes;
  assert.equal(startWorkIncident(state.root,state.id,state.root.minutes),true);
  return shift.incident;
}

test('all six careers preserve three original workplace scenarios and add two rank-aware stories',()=>{
  assert.deepEqual(Object.keys(WORK_INCIDENT_CATALOG).sort(),
    CAREER_CATALOG.map(c=>c.id).sort());
  const ids=new Set(),titles=new Set();
  for(const career of CAREER_CATALOG){
    const scenes=WORK_INCIDENT_CATALOG[career.id];
    assert.equal(scenes.length,7);
    assert.equal(scenes[0].title,WORK_INCIDENTS[career.id].title);
    assert.deepEqual(scenes[0].options,WORK_INCIDENTS[career.id].options);
    for(const scene of scenes){
      assert.equal(scene.options.length,3);
      assert.ok(scene.title.length>8&&scene.text.length>35);
      assert.equal(new Set(scene.options.map(o=>o.id)).size,3);
      assert.ok(!ids.has(career.id+':'+scene.id));
      assert.ok(!titles.has(scene.title));
      ids.add(career.id+':'+scene.id);titles.add(scene.title);
      for(const option of scene.options){
        assert.ok(option.feedback.length>10&&option.text.length>8);
        assert.ok(['work.pride','work.pressure','work.relief'].includes(option.memory));
        assert.ok(!option.skill||['cooking','painting','literature'].includes(option.skill));
      }
    }
  }
  assert.equal(ids.size,42);
});
test('first situation retains W1-B.3b.2 behavior, later shifts differ without immediate repeats',()=>{
  for(const career of CAREER_CATALOG){
    const st=setup(career.id);
    assert.equal(first(st).scenarioId,'legacy');
    assert.ok(decideWorkIncident(st.root,st.id,WORK_INCIDENTS[career.id].options[1].id).ok);
    st.contract.workedShifts=1;
    const a=spawn(st,st.day+1);
    assert.notEqual(a.scenarioId,'legacy');
    assert.ok(decideWorkIncident(st.root,st.id,
      workScenario(career.id,a.scenarioId).options[0].id).ok);
    const b=spawn(st,st.day+2);
    assert.notEqual(b.scenarioId,a.scenarioId);
    assert.equal(st.root.careerSystem.incidentHistory.alex.length,2);
  }
});
test('selection is deterministic from the saved clock, rank, personality and journal',()=>{
  const st=setup('editorial');first(st);
  assert.ok(decideWorkIncident(st.root,'alex','rewrite').ok);
  st.contract.workedShifts=1;
  const shift=plannedCareerShift(st.root.calendar,st.contract,st.day+1);
  st.contract.currentShift={...shift,phase:'working',departedAt:shift.start,
    incident:null,readiness:80};
  st.root.minutes=shift.start+shift.duration/2+1;
  st.root.otherSim.minutes=st.root.minutes;
  const cloned=loadHousehold(copy(st.root));
  const selected=selectWorkScenario(st.root,'alex');
  assert.equal(selected,selectWorkScenario(cloned,'alex'));
  assert.equal(startWorkIncident(st.root,'alex',st.root.minutes),true);
  assert.equal(startWorkIncident(cloned,'alex',cloned.minutes),true);
  assert.equal(st.root.careerSystem.byResident.alex.currentShift.incident.scenarioId,selected);
  assert.equal(cloned.careerSystem.byResident.alex.currentShift.incident.scenarioId,selected);
});
test('trait profiles produce different autonomous behavior in the same situation',()=>{
  const one=setup('city-services'),two=setup('city-services');
  first(one);first(two);
  one.root.personality=createProfile(['habits.neat','temperament.calm']);
  two.root.personality=createProfile(['values.empathetic','temperament.cheerful']);
  one.root.needs.energy=65;two.root.needs.energy=65;
  const a=chooseAutonomousWorkOption(one.root,'alex');
  const b=chooseAutonomousWorkOption(two.root,'alex');
  assert.notEqual(a,b);
  assert.ok(WORK_INCIDENTS['city-services'].options.some(x=>x.id===a));
  assert.ok(WORK_INCIDENTS['city-services'].options.some(x=>x.id===b));
});
test('manual decision persists detailed history, real character effects, no XP or wage',()=>{
  const st=setup('kitchen-studio');first(st);
  const before={credits:st.root.shop.credits,performance:st.contract.performance,
    skills:copy(st.root.skills),memories:st.root.mind.memories.length};
  const answer=decideWorkIncident(st.root,'alex','adapt');
  assert.ok(answer.ok);
  const entry=st.root.careerSystem.incidentHistory.alex.at(-1);
  assert.equal(entry.scenarioId,'legacy');
  assert.equal(entry.choiceId,'adapt');
  assert.equal(entry.auto,false);
  assert.equal(entry.performanceAfter,st.contract.performance);
  assert.equal(entry.performanceDelta,answer.performanceDelta);
  assert.equal(entry.energyDelta,-4);
  assert.equal(entry.funDelta,3);
  assert.equal(st.root.shop.credits,before.credits);
  assert.deepEqual(st.root.skills,before.skills);
  assert.equal(st.root.mind.memories.length,before.memories+1);
  assert.equal(decideWorkIncident(st.root,'alex','recheck').ok,false);
  assert.equal(st.root.careerSystem.incidentHistory.alex.length,1);
  assert.equal(st.root.careerSystem.incidentIds.length,1);
});
test('new scenario and its outcome survive Safari reload and do not become the legacy scene',()=>{
  const st=setup('art-studio');first(st);
  assert.ok(decideWorkIncident(st.root,'alex','accent').ok);
  st.contract.workedShifts=1;
  const incident=spawn(st);
  assert.notEqual(incident.scenarioId,'legacy');
  const scene=workScenario('art-studio',incident.scenarioId);
  const restored=loadHousehold(copy(st.root));
  assert.equal(pendingWorkIncident(restored,'alex').scenarioId,incident.scenarioId);
  const chosen=scene.options[1].id;
  assert.equal(decideWorkIncident(restored,'alex',chosen).ok,true);
  const roundtrip=loadHousehold(copy(restored));
  const savedIncident=roundtrip.careerSystem.byResident.alex.currentShift.incident;
  assert.equal(savedIncident.choiceId,chosen);
  assert.equal(savedIncident.scenarioId,scene.id);
  assert.equal(roundtrip.careerSystem.incidentHistory.alex.length,2);
  assert.equal(decideWorkIncident(roundtrip,'alex',chosen).ok,false);
  assert.deepEqual(roundtrip.careerSystem.incidentHistory.alex,
    restored.careerSystem.incidentHistory.alex);
});
test('legacy W1-B.3b.2 saves without scenario ID restore their original choice exactly once',()=>{
  const st=setup('editorial');first(st);
  assert.ok(decideWorkIncident(st.root,'alex','verify').ok);
  const raw=copy(st.root),previous=raw.careerSystem.byResident.alex.performance;
  delete raw.careerSystem.incidentHistory;
  delete raw.careerSystem.byResident.alex.currentShift.incident.scenarioId;
  const loaded=loadHousehold(raw);
  const incident=loaded.careerSystem.byResident.alex.currentShift.incident;
  assert.equal(incident.scenarioId,'legacy');
  assert.equal(incident.choiceId,'verify');
  assert.equal(loaded.careerSystem.byResident.alex.performance,previous);
  assert.deepEqual(loaded.careerSystem.incidentHistory,{alex:[],mira:[]});
  assert.equal(decideWorkIncident(loaded,'alex','verify').ok,false);
  assert.equal(loaded.careerSystem.incidentIds.length,1);
});
test('history belongs to each resident independently, even on simultaneous shifts',()=>{
  const st=setup('editorial','alex');
  st.root.careerSystem=hireCareer(st.root.careerSystem,'mira','business-center',480);
  const mira=st.root.careerSystem.byResident.mira;
  const shift=plannedCareerShift(st.root.calendar,mira,0);
  mira.currentShift={...shift,phase:'working',departedAt:shift.start,readiness:65};
  first(st);
  st.root.minutes=shift.start+shift.duration/2+1;
  assert.equal(startWorkIncident(st.root,'mira',st.root.minutes),true);
  assert.ok(decideWorkIncident(st.root,'alex','rewrite').ok);
  assert.equal(st.root.careerSystem.incidentHistory.alex.length,1);
  assert.equal(st.root.careerSystem.incidentHistory.mira.length,0);
  assert.ok(automaticWorkIncident(st.root,'mira').ok);
  assert.equal(st.root.careerSystem.incidentHistory.mira.length,1);
  assert.equal(st.root.careerSystem.incidentHistory.mira[0].auto,true);
  const roundtrip=loadHousehold(copy(st.root));
  assert.equal(roundtrip.careerSystem.incidentHistory.alex.length,1);
  assert.equal(roundtrip.careerSystem.incidentHistory.mira.length,1);
});
test('journal remains bounded, per-job and survives switching jobs',()=>{
  const st=setup();first(st);
  assert.ok(decideWorkIncident(st.root,'alex','verify').ok);
  for(let n=1;n<=15;n++){
    st.contract.workedShifts=n;
    const shift=st.contract.currentShift;
    const start=shift.start+1440;
    const newShift={...shift,id:st.contract.employmentId+'@'+Math.floor(start/1440)+'@'+start,
      start,end:start+480,phase:'working',departedAt:start,incident:null};
    st.contract.currentShift=newShift;
    st.root.minutes=start+241;st.root.otherSim.minutes=st.root.minutes;
    assert.equal(startWorkIncident(st.root,'alex',st.root.minutes),true);
    assert.ok(automaticWorkIncident(st.root,'alex').ok);
  }
  assert.equal(st.root.careerSystem.incidentHistory.alex.length,INCIDENT_HISTORY_LIMIT);
  assert.equal(new Set(st.root.careerSystem.incidentHistory.alex.map(x=>x.id)).size,INCIDENT_HISTORY_LIMIT);
  const loaded=loadHousehold(copy(st.root));
  assert.equal(loaded.careerSystem.incidentHistory.alex.length,INCIDENT_HISTORY_LIMIT);
  assert.equal(loaded.careerSystem.incidentHistory.mira.length,0);
});
test('corrupt scenarios and injected history are stripped without reset of contracts or cash',()=>{
  const st=setup();first(st);
  const raw=copy(st.root),cash=raw.shop.credits;
  raw.careerSystem.byResident.alex.currentShift.incident.scenarioId='<script>';
  raw.careerSystem.incidentHistory={alex:[
    {id:'bad',scenarioId:'legacy',choiceId:'rewrite'},
    {id:'e1@0@540#work',scenarioId:'deleted',choiceId:'rewrite',careerId:'editorial'}
  ],mira:{danger:true}};
  const loaded=loadHousehold(raw);
  assert.equal(loaded.careerSystem.byResident.alex.currentShift.incident,null);
  assert.deepEqual(loaded.careerSystem.incidentHistory,{alex:[],mira:[]});
  assert.equal(loaded.shop.credits,cash);
  assert.equal(loaded.careerSystem.byResident.alex.employmentId,'e1');
  assert.equal(loaded.version,1);
});
test('pause and x3 still grant only one incident and one canonical salary',()=>{
  const st=setup();st.root.paused=true;
  const original=JSON.stringify(st.root);
  tickHousehold(st.root,240);
  assert.equal(JSON.stringify(st.root),original);
  st.root.paused=false;st.root.speed=3;
  let notices=0;
  const shift=st.contract.currentShift;
  while(st.root.minutes<shift.end){
    const delta=Math.min(1.2,shift.end-st.root.minutes);
    const events=tickHousehold(st.root,delta)||[];
    notices+=events.filter(x=>x.type==='incident').length;
  }
  assert.equal(notices,1);
  assert.equal(st.root.careerSystem.incidentHistory.alex.length,1);
  assert.equal(st.root.careerSystem.incidentIds.length,1);
  assert.equal(st.root.careerSystem.settlementIds.length,1);
  assert.equal(st.root.shop.credits,5112);
  tickHousehold(st.root,15);
  assert.equal(st.root.careerSystem.incidentHistory.alex.length,1);
});
