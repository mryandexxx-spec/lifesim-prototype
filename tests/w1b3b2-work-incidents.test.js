import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold,getActor} from '../src/household.js';
import {hireCareer,restoreCareerSystem} from '../src/career-state.js';
import {plannedCareerShift} from '../src/career-scheduler.js';
import {progressCareerWork,arriveCareerPortal,finishCareerReturn} from '../src/career-work.js';
import {WORK_INCIDENTS,WORK_INCIDENT_CATALOG,startWorkIncident,pendingWorkIncident,
  decideWorkIncident,automaticWorkIncident,chooseAutonomousWorkOption,
  restoreWorkIncident,workIncidentChoiceDescription,planWorkIncident,workScenario} from '../src/career-incidents.js';
import {createProfile} from '../src/trait-catalog.js';
import {CAREER_CATALOG} from '../src/career-catalog.js';

const json=x=>JSON.parse(JSON.stringify(x));
function employed(career='editorial',id='alex'){
  const root=newHousehold('2026-11-16');
  root.careerSystem=hireCareer(root.careerSystem,id,career,480);
  const contract=root.careerSystem.byResident[id];
  const day=career==='civic-service'?2:career==='kitchen-studio'?1:0;
  const shift=plannedCareerShift(root.calendar,contract,day);
  assert.ok(shift,'planned shift '+career);
  root.minutes=shift.start;root.otherSim.minutes=shift.start;
  progressCareerWork(root,shift.start-.01,shift.start);
  assert.equal(arriveCareerPortal(root,id,shift.start),true);
  return {root,contract,shift,id};
}
function reached(career='editorial',id='alex'){
  const state=employed(career,id);
  // Explicit legacy pending fixture: these tests exercise choice and receipt contracts, not scheduling.
  const at=state.shift.start+state.shift.duration/2+1;
  state.root.minutes=at;state.root.otherSim.minutes=at;
  assert.equal(startWorkIncident(state.root,state.id,at),true);
  return state;
}
test('six original careers have authored distinct situations and three unique decisions',()=>{
  assert.deepEqual(Object.keys(WORK_INCIDENTS).sort(),CAREER_CATALOG.map(x=>x.id).sort());
  const titles=new Set();
  for(const career of CAREER_CATALOG){
    const def=WORK_INCIDENTS[career.id];
    assert.ok(def.title.length>8&&def.text.length>20);
    assert.equal(def.options.length,3);titles.add(def.title);
    assert.equal(new Set(def.options.map(x=>x.id)).size,3);
    assert.deepEqual(new Set(def.options.map(x=>x.memory)),
      new Set(['work.pressure','work.pride','work.relief']));
  }
  assert.equal(titles.size,6);
});
test('work incident follows its deterministic plan, never before due and at most once',()=>{
  const {root,shift,contract}=employed();
  const p=planWorkIncident(contract,'alex',contract.currentShift);
  const first=p.status==='due'?p.dueAt-.01:shift.end-20;
  assert.equal(tickHousehold(root,first-root.minutes).filter(x=>x.type==='incident').length,0);
  assert.equal(pendingWorkIncident(root,'alex'),null);
  const messages=tickHousehold(root,1);
  assert.equal(messages.filter(x=>x.type==='incident').length,p.status==='due'?1:0);
  assert.equal(Boolean(pendingWorkIncident(root,'alex')),p.status==='due');
  assert.equal(tickHousehold(root,1).filter(x=>x.type==='incident').length,0);
});
test('manual decision changes actual performance, needs, memory and emotion once',()=>{
  const {root}=reached(),c=root.careerSystem.byResident.alex;
  const before={performance:c.performance,energy:root.needs.energy,
    memory:root.mind.memories.length,credits:root.shop.credits};
  const result=decideWorkIncident(root,'alex','rewrite');
  assert.equal(result.ok,true);
  assert.equal(c.performance,before.performance+result.performanceDelta);
  assert.equal(root.needs.energy,before.energy-3);
  assert.equal(root.mind.memories.length,before.memory+1);
  assert.equal(root.mind.memories.at(-1).id,'work.pride');
  assert.ok(root.mind.emotions.some(x=>x.source==='work.pride'));
  assert.equal(root.shop.credits,before.credits);
  const receipt=json(c.currentShift.incident);
  assert.equal(decideWorkIncident(root,'alex','verify').ok,false);
  assert.deepEqual(c.currentShift.incident,receipt);
  assert.equal(root.careerSystem.incidentIds.length,1);
});
test('each option is meaningful and character traits affect actual choices',()=>{
  const {root}=reached();
  const career=WORK_INCIDENTS.editorial;
  const previews=career.options.map(option=>workIncidentChoiceDescription(root,'alex',option));
  assert.equal(new Set(previews).size,3);
  const base=root.careerSystem.byResident.alex.performance;
  const chosen=decideWorkIncident(root,'alex','hold');
  assert.ok(chosen.ok);assert.ok(chosen.performanceDelta<=2);
  assert.equal(root.careerSystem.byResident.alex.performance,base+chosen.performanceDelta);
});
test('phone closes or Safari reloads while waiting: decision remains, one effect only',()=>{
  const {root}=reached();
  const pending=json(pendingWorkIncident(root,'alex'));
  const restored=loadHousehold(json(root));
  assert.deepEqual(pendingWorkIncident(restored,'alex'),pending);
  const result=decideWorkIncident(restored,'alex','verify');
  assert.ok(result.ok);
  const saved=json(restored),again=loadHousehold(saved);
  assert.equal(again.careerSystem.incidentIds.length,1);
  assert.equal(again.careerSystem.byResident.alex.currentShift.incident.choiceId,'verify');
  assert.equal(decideWorkIncident(again,'alex','hold').ok,false);
  assert.equal(again.careerSystem.byResident.alex.performance,
    restored.careerSystem.byResident.alex.performance);
  assert.equal(again.mind.memories.at(-1).id,'work.pressure');
});
test('unanswered incident auto-resolves once before salary, never blocks work',()=>{
  const {root,shift}=reached(),wallet=root.shop.credits;
  const option=chooseAutonomousWorkOption(root,'alex');
  assert.ok(WORK_INCIDENTS.editorial.options.some(x=>x.id===option));
  tickHousehold(root,shift.end-root.minutes);
  const c=root.careerSystem.byResident.alex;
  // W3-B: actual hunger/energy/social state evolves during this workday, so
  // autonomous judgement at the end may differ from the pre-shift preview.
  const resolved=c.currentShift.incident.choiceId;
  assert.ok(WORK_INCIDENTS.editorial.options.some(x=>x.id===resolved));
  assert.equal(c.currentShift.incident.auto,true);
  assert.equal(c.lastShift.incident.choiceId,resolved);
  assert.equal(c.lastShift.salary,112);
  assert.equal(root.shop.credits,wallet+112);
  assert.equal(root.careerSystem.settlementIds.length,1);
  assert.equal(root.careerSystem.incidentIds.length,1);
  tickHousehold(root,5);
  assert.equal(root.shop.credits,wallet+112);
  assert.equal(root.careerSystem.incidentIds.length,1);
  assert.equal(finishCareerReturn(root,'alex'),true);
  assert.equal(root.careerSystem.byResident.alex.lastShift.incident.auto,true);
});
test('manual outcome then shift closure never applies event twice or pays twice',()=>{
  const {root,shift}=reached(),c=root.careerSystem.byResident.alex;
  assert.ok(decideWorkIncident(root,'alex','rewrite').ok);
  const previous=c.performance;
  tickHousehold(root,shift.end-root.minutes);
  assert.equal(c.performance,Math.min(100,previous+c.lastShift.performanceDelta));
  assert.equal(c.currentShift.incident.auto,false);
  assert.equal(root.careerSystem.incidentIds.length,1);
  const loaded=loadHousehold(json(root));
  tickHousehold(loaded,10);
  assert.equal(loaded.shop.credits,root.shop.credits);
  assert.equal(loaded.careerSystem.incidentIds.length,1);
});
test('paused simulation leaves pending event and all related stats untouched',()=>{
  const {root}=reached();
  root.paused=true;
  const before=JSON.stringify(root);
  tickHousehold(root,300);
  assert.equal(JSON.stringify(root),before);
  root.paused=false;
  assert.ok(pendingWorkIncident(root,'alex'));
});
test('speed x3 steps use same single event and salary receipts',()=>{
  const {root,shift,contract}=employed();
  const expected=planWorkIncident(contract,'alex',contract.currentShift).status==='due'?1:0;
  root.speed=3;root.otherSim.speed=3;
  let events=0;
  while(root.minutes<shift.end){
    const delta=Math.min(0.9,shift.end-root.minutes);
    const messages=tickHousehold(root,delta)||[];
    events+=messages.filter(x=>x.type==='incident').length;
  }
  assert.equal(events,expected);
  assert.equal(root.careerSystem.incidentIds.length,expected);
  assert.equal(root.careerSystem.settlementIds.length,1);
  assert.equal(root.shop.credits,5112);
});
test('Alex and Mira working simultaneously keep independent events, effects and pay',()=>{
  const root=newHousehold('2026-11-16');
  root.careerSystem=hireCareer(root.careerSystem,'alex','editorial',480);
  root.careerSystem=hireCareer(root.careerSystem,'mira','business-center',480);
  root.minutes=540;root.otherSim.minutes=540;
  progressCareerWork(root,539,540);
  assert.equal(arriveCareerPortal(root,'alex',540),true);
  assert.equal(arriveCareerPortal(root,'mira',540),true);
  // Two explicitly pending legacy incidents isolate independent manual/auto receipts.
  root.minutes=781;root.otherSim.minutes=781;
  assert.equal(startWorkIncident(root,'alex',781),true);
  assert.equal(startWorkIncident(root,'mira',781),true);
  assert.ok(decideWorkIncident(root,'alex','verify').ok);
  assert.ok(pendingWorkIncident(root,'mira'));
  assert.equal(root.careerSystem.incidentIds.length,1);
  tickHousehold(root,239);
  assert.equal(root.careerSystem.incidentIds.length,2);
  assert.equal(root.careerSystem.settlementIds.length,2);
  assert.equal(root.shop.credits,5000+112+144);
  assert.equal(root.careerSystem.byResident.alex.lastShift.incident.auto,false);
  assert.equal(root.careerSystem.byResident.mira.lastShift.incident.auto,true);
});
test('switching selected resident never transfers or replays incident',()=>{
  const {root}=reached();
  root.selectedSim='mira';
  assert.equal(pendingWorkIncident(root,'mira'),null);
  assert.equal(decideWorkIncident(root,'mira','verify').ok,false);
  root.selectedSim='alex';
  assert.ok(decideWorkIncident(root,'alex','rewrite').ok);
  assert.equal(root.careerSystem.incidentIds.length,1);
});
test('resignation and old root-v1 saves without incident fields migrate safely',()=>{
  const root=newHousehold();
  const loaded=loadHousehold(json(root));
  assert.deepEqual(loaded.careerSystem.incidentIds,[]);
  const working=reached().root;
  delete working.careerSystem.incidentIds;
  delete working.careerSystem.byResident.alex.currentShift.incident;
  const migrated=loadHousehold(json(working));
  assert.deepEqual(migrated.careerSystem.incidentIds,[]);
  assert.equal(migrated.careerSystem.byResident.alex.currentShift.incident,null);
});
test('corrupted event IDs, option IDs, huge ledgers safely discarded without wiping salary',()=>{
  const {root}=reached();
  const raw=json(root);raw.careerSystem.incidentIds=['invalid',null,'e1@0@540#work'];
  raw.careerSystem.byResident.alex.currentShift.incident.choiceId='injected script';
  const loaded=loadHousehold(raw);
  assert.equal(loaded.careerSystem.byResident.alex.currentShift.incident,null);
  assert.deepEqual(loaded.careerSystem.incidentIds,['e1@0@540#work']);
  assert.equal(loaded.shop.credits,root.shop.credits);
  assert.equal(startWorkIncident(loaded,'alex',loaded.minutes+1),false);
  assert.equal(decideWorkIncident(loaded,'alex','verify').ok,false);
  assert.equal(restoreWorkIncident({id:'other',careerId:'editorial',start:540,end:1020},
    {id:'evil',createdAt:600,choiceId:null}),null);
});
test('overnight civic work event resolves with ordinary canonical payroll',()=>{
  const {root,shift}=reached('civic-service','mira');
  assert.ok(pendingWorkIncident(root,'mira'));
  tickHousehold(root,shift.end-root.minutes);
  assert.equal(root.careerSystem.byResident.mira.lastShift.salary,152);
  assert.equal(root.careerSystem.byResident.mira.lastShift.incident.auto,true);
});


test('LP-02A: manual dexterity maps only to authored physical approaches',()=>{
  const keys=Object.entries(WORK_INCIDENT_CATALOG).flatMap(([career,scenes])=>
    scenes.flatMap(s=>s.options.filter(o=>o.axis==='coordination')
      .map(o=>career+'/'+s.id+'/'+o.id))).sort();
  assert.deepEqual(keys,[
    'art-studio/art-frame/repair',
    'art-studio/art-pigments/mix',
    'art-studio/legacy/rebuild',
    'art-studio/pf09b-art-studio-light/pf09b-art-studio-light-a',
    'art-studio/pf09b-art-studio-packing/pf09b-art-studio-packing-a'
  ]);
  assert.equal(workScenario('city-services','pf09b-city-services-locker').focus,'practicality');
  assert.equal(workScenario('art-studio','art-pigments').options.find(o=>o.id==='change').axis,'creativity');
});
test('LP-02A: real work decision and once-only receipt differ by dexterity, not resident identity',()=>{
  for(const id of ['alex','mira'])for(const trait of ['coordination.agile','coordination.clumsy']){
    const {root,contract}=reached('art-studio',id),actor=getActor(root,id);
    actor.personality=createProfile(['temperament.calm',trait]);
    actor.needs.energy=75;actor.mind.mood.value=75;
    contract.currentShift.incident.scenarioId='art-pigments';
    const chosen=chooseAutonomousWorkOption(root,id),before=root.shop.credits;
    assert.equal(chosen,trait==='coordination.agile'?'mix':'plain');
    const result=automaticWorkIncident(root,id);
    assert.ok(result.ok);
    assert.equal(result.incident.choiceId,chosen);
    assert.equal(root.careerSystem.incidentIds.length,1);
    assert.equal(root.careerSystem.incidentHistory[id][0].choiceId,chosen);
    assert.equal(root.shop.credits,before);
    assert.equal(automaticWorkIncident(root,id).ok,false);
    const restored=loadHousehold(json(root));
    assert.deepEqual(restored.careerSystem.incidentHistory[id],root.careerSystem.incidentHistory[id]);
    assert.deepEqual(restored.careerSystem.incidentIds,root.careerSystem.incidentIds);
  }
});
test('LP-02A: dexterity alone no longer changes abstract editorial decisions or previews',()=>{
  const {root,contract}=reached('editorial');
  contract.currentShift.incident.scenarioId='pf09b-editorial-voices';
  const options=workScenario('editorial','pf09b-editorial-voices').options;
  for(const energy of [35,75])for(const mood of [35,75]){
    root.needs.energy=energy;root.mind.mood.value=mood;
    root.personality=createProfile(['temperament.calm','coordination.agile']);
    const first=chooseAutonomousWorkOption(root,'alex');
    const descriptions=options.map(o=>workIncidentChoiceDescription(root,'alex',o));
    root.personality=createProfile(['temperament.calm','coordination.clumsy']);
    assert.equal(chooseAutonomousWorkOption(root,'alex'),first);
    assert.deepEqual(options.map(o=>workIncidentChoiceDescription(root,'alex',o)),descriptions);
  }
});
