/** CAREER-R2: 12 specialist branches, real choice history and v1 safety. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {plannedCareerShift} from '../src/career-scheduler.js';
import {CAREER_CATALOG} from '../src/career-catalog.js';
import {CAREER_SPECIALIZATIONS,chooseCareerSpecialization} from '../src/career-specializations.js';
import {CAREER_R2_SCENES} from '../src/career-r2-scenes.js';
import {CAREER_R1_SCENES} from '../src/career-r1-scenes.js';
import {WORK_INCIDENT_CATALOG,workScenario,workStoryFollowUp,selectWorkScenario,
  startWorkIncident,decideWorkIncident,automaticWorkIncident} from '../src/career-incidents.js';
const copy=x=>JSON.parse(JSON.stringify(x));
function prepare(career,track,resident='alex',rank=5){
  const root=newHousehold('2026-11-16');
  root.careerSystem=hireCareer(root.careerSystem,resident,career,0);
  const contract=root.careerSystem.byResident[resident];
  contract.level=4;contract.workedShifts=4;contract.rankShifts=3;
  assert.equal(chooseCareerSpecialization(root,resident,track).ok,true);
  contract.level=rank;
  contract.currentShift={id:contract.employmentId+'@0@0',careerId:career,
    start:0,end:480,duration:480,phase:'working',departedAt:0,
    readiness:75,incident:null};
  root.minutes=245;root.otherSim.minutes=245;
  return {root,contract,resident};
}
test('42 stable work stories: R2 adds exactly one immutable scene per existing specialist track',()=>{
  let count=0;const ids=new Set();
  for(const {id} of CAREER_CATALOG){
    const bank=WORK_INCIDENT_CATALOG[id];
    assert.equal(bank.length,7);
    assert.deepEqual(bank.slice(3,5),CAREER_R1_SCENES[id]);
    assert.deepEqual(bank.slice(5),CAREER_R2_SCENES[id]);
    assert.deepEqual(bank.slice(5).map(s=>s.trackId),CAREER_SPECIALIZATIONS[id].map(t=>t.id));
    for(const scene of bank){
      assert.ok(!ids.has(id+':'+scene.id));ids.add(id+':'+scene.id);count++;
    }
    for(const scene of CAREER_R2_SCENES[id]){
      assert.equal(scene.minRank,5);assert.equal(scene.maxRank,7);
      assert.equal(scene.options.length,3);
      assert.ok(Object.isFrozen(scene)&&Object.isFrozen(scene.options));
      assert.ok(scene.title.length>8&&scene.text.length>35);
      assert.ok(scene.options.every(o=>o.feedback.length>10&&o.text.length>8));
      assert.ok(scene.options.every(o=>o.performance>=-5&&o.performance<=10&&
        o.energy>=-20&&o.energy<=5&&o.fun>=-10&&o.fun<=10));
      assert.equal(new Set(scene.options.map(o=>o.id)).size,3);
      assert.equal(workScenario(id,scene.id),scene);
    }
  }
  assert.equal(count,42);assert.equal(ids.size,42);
});
test('rank and actual track gate are applied before scoring; no cross-branch stories',()=>{
  for(const {id} of CAREER_CATALOG){
    const [a,b]=CAREER_SPECIALIZATIONS[id];
    for(const rank of [0,2,4,5,6,7]){
      const st=prepare(id,a.id,'mira',rank);
      const first=selectWorkScenario(st.root,'mira');
      assert.equal(selectWorkScenario(copy(st.root),'mira'),first);
      const selected=workScenario(id,first);
      assert.ok(selected);
      assert.ok(rank>=(selected.minRank??0)&&rank<=(selected.maxRank??7));
      if(selected.trackId)assert.equal(selected.trackId,a.id);
      const other=CAREER_R2_SCENES[id].find(s=>s.trackId===b.id);
      assert.ok(!selected.trackId||selected.id!==other.id);
      const noTrack=copy(st.root);
      delete noTrack.careerSystem.byResident.mira.specialization;
      assert.notEqual(selectWorkScenario(noTrack,'mira'),CAREER_R2_SCENES[id][0].id);
      assert.notEqual(selectWorkScenario(noTrack,'mira'),CAREER_R2_SCENES[id][1].id);
      assert.equal(startWorkIncident(st.root,'mira',st.root.minutes),true);
    }
  }
});
test('real prior decisions enable a follow-up for only the same resident, without invented history',()=>{
  const st=prepare('city-services','logistics','alex',4);
  const scene=CAREER_R2_SCENES['city-services'][0];
  assert.equal(workStoryFollowUp(st.root,'alex',scene),false);
  assert.equal(startWorkIncident(st.root,'alex',st.root.minutes),true);
  st.contract.currentShift.incident.scenarioId='city-missing';
  assert.equal(decideWorkIncident(st.root,'alex','trace').ok,true);
  assert.equal(workStoryFollowUp(st.root,'alex',scene),true);
  assert.equal(workStoryFollowUp(st.root,'mira',scene),false);
  const restored=loadHousehold(copy(st.root));
  assert.equal(workStoryFollowUp(restored,'alex',scene),true);
  const withoutHistory=copy(st.root);
  withoutHistory.careerSystem.incidentHistory={alex:[],mira:[]};
  assert.equal(workStoryFollowUp(withoutHistory,'alex',scene),false);
  const wrong=copy(st.root);
  wrong.careerSystem.incidentHistory.alex[0].choiceId='hold';
  assert.equal(workStoryFollowUp(wrong,'alex',scene),false);
});
test('two residents resolve separate specialist cases once, with intact credits and v1 save',()=>{
  const root=newHousehold('2026-11-16');
  root.careerSystem=hireCareer(root.careerSystem,'alex','kitchen-studio',0);
  root.careerSystem=hireCareer(root.careerSystem,'mira','editorial',0);
  for(const [id,career,track] of [['alex','kitchen-studio','signature'],['mira','editorial','leadership']]){
    const c=root.careerSystem.byResident[id];
    c.level=4;c.workedShifts=4;
    assert.equal(chooseCareerSpecialization(root,id,track).ok,true);
    c.level=5;
    const actualShift=plannedCareerShift(root.calendar,c,1);
    assert.ok(actualShift,'Both careers actually work on Tuesday');
    c.currentShift={...actualShift,phase:'working',departedAt:actualShift.start,
      readiness:75,incident:null};
  }
  root.minutes=2285;root.otherSim.minutes=2285;
  const funds=root.shop.credits,skills=copy(root.skills);
  for(const [id,career,scene] of [['alex','kitchen-studio','kitchen-tasting'],
    ['mira','editorial','editorial-grid']]){
    assert.equal(startWorkIncident(root,id,root.minutes),true);
    root.careerSystem.byResident[id].currentShift.incident.scenarioId=scene;
    assert.equal(decideWorkIncident(root,id,workScenario(career,scene).options[1].id).ok,true);
    assert.equal(automaticWorkIncident(root,id).ok,false);
    assert.equal(root.careerSystem.incidentHistory[id].length,1);
  }
  assert.equal(root.shop.credits,funds);
  assert.deepEqual(root.skills,skills,'No synthetic skill XP for the chosen option');
  assert.equal(root.careerSystem.incidentIds.length,2);
  const loaded=loadHousehold(copy(root));
  assert.equal(loaded.version,1);
  assert.equal(loaded.shop.credits,funds);
  assert.equal(loaded.careerSystem.incidentIds.length,2);
  for(const id of ['alex','mira']){
    assert.equal(loaded.careerSystem.incidentHistory[id].length,1);
    assert.equal(loaded.careerSystem.byResident[id].level,5);
    assert.equal(loaded.careerSystem.byResident[id].currentShift.incident.choiceId,
      root.careerSystem.byResident[id].currentShift.incident.choiceId);
  }
});
test('verified promotion evidence keeps selection priority over recent repetition',()=>{
  const st=prepare('city-services','logistics','alex',4);
  const focused=workScenario('city-services','city-missing');
  const history=st.root.careerSystem.incidentHistory.alex;
  history.push({careerId:'city-services',scenarioId:'city-missing',choiceId:'trace',performanceDelta:4});
  // A different latest incident avoids the original canonical no-immediate-repeat gate.
  history.push({careerId:'city-services',scenarioId:'city-route',choiceId:'plan',performanceDelta:4});
  st.root.careerSystem.byResident.alex.workedShifts=8;
  assert.equal(selectWorkScenario(st.root,'alex'),'city-missing',
    'Missing genuine branch proof outranks repetition cooldown');
  st.contract.level=5;
  st.contract.specialization.focusReceiptId='e1@0@0#work';
  st.contract.specialization.focusScenarioId=focused.id;
  assert.ok(workScenario('city-services',selectWorkScenario(st.root,'alex')));
});
