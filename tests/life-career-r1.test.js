/** CAREER-R1: rank-gated authentic incidents without changing old careers, receipts or saves. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {CAREER_CATALOG} from '../src/career-catalog.js';
import {CAREER_R1_SCENES} from '../src/career-r1-scenes.js';
import {WORK_INCIDENT_CATALOG,selectWorkScenario,workScenario,
  startWorkIncident,decideWorkIncident,automaticWorkIncident} from '../src/career-incidents.js';
const copy=x=>JSON.parse(JSON.stringify(x));
function working(careerId,level,resident='alex'){
  const root=newHousehold('2026-11-16');
  root.careerSystem=hireCareer(root.careerSystem,resident,careerId,0);
  const contract=root.careerSystem.byResident[resident];
  contract.level=level;contract.workedShifts=2;
  // A valid in-progress shift with one existing unique canonical receipt slot.
  contract.currentShift={id:contract.employmentId+'@0@0',careerId,start:0,end:480,
    duration:480,phase:'working',departedAt:0,readiness:75,incident:null};
  root.minutes=245;root.otherSim.minutes=245;
  return {root,contract};
}
test('append-only 12 CAREER-R1 stories: two per career, three choices and exact rank gates',()=>{
  assert.equal(CAREER_CATALOG.length,6);
  const sceneIds=new Set();
  for(const {id} of CAREER_CATALOG){
    const bank=WORK_INCIDENT_CATALOG[id];
    assert.deepEqual(bank.slice(3),CAREER_R1_SCENES[id]);
    assert.deepEqual(bank.slice(3).map(s=>[s.minRank,s.maxRank]),[[0,4],[5,7]]);
    assert.equal(bank.length,5);
    for(const scene of bank.slice(3)){
      assert.equal(scene.options.length,3);
      assert.ok(scene.title.length>8&&scene.text.length>40);
      assert.ok(Object.isFrozen(scene)&&Object.isFrozen(scene.options));
      assert.ok(!sceneIds.has(scene.id));sceneIds.add(scene.id);
      assert.equal(new Set(scene.options.map(o=>o.id)).size,3);
      assert.ok(scene.options.every(o=>o.performance<=10&&o.performance>=-5&&
        o.energy>=-20&&o.energy<=5&&o.fun>=-10&&o.fun<=10));
      assert.equal(workScenario(id,scene.id),scene);
    }
  }
  assert.equal(sceneIds.size,12);
});
test('only eligible scenarios are selected at ranks 0–7, deterministically for both residents',()=>{
  for(const {id} of CAREER_CATALOG)for(const level of [0,2,4,5,6,7]){
    const {root}=working(id,level,'mira');
    const first=selectWorkScenario(root,'mira');
    const second=selectWorkScenario(copy(root),'mira');
    assert.equal(first,second,id+' rank '+level);
    const chosen=workScenario(id,first);
    assert.ok(chosen);
    assert.ok(level>=(chosen.minRank??0)&&level<=(chosen.maxRank??7));
    assert.equal(startWorkIncident(root,'mira',root.minutes),true);
    assert.equal(root.careerSystem.byResident.mira.currentShift.incident.scenarioId,first);
  }
});
test('all new choices commit once through existing ledger and persist a per-resident history',()=>{
  for(const {id} of CAREER_CATALOG)for(const level of [0,7]){
    const {root,contract}=working(id,level);
    const story=CAREER_R1_SCENES[id][level===0?0:1];
    // Exercise a genuine working shift, selecting the newly authored eligible story.
    const inc=contract.currentShift;
    assert.equal(startWorkIncident(root,'alex',root.minutes),true);
    inc.incident.scenarioId=story.id;
    const before=root.shop.credits;
    const result=decideWorkIncident(root,'alex',story.options[0].id);
    assert.equal(result.ok,true);
    assert.equal(root.shop.credits,before,'incidents cannot create salary');
    assert.equal(root.careerSystem.incidentIds.length,1);
    assert.equal(root.careerSystem.incidentHistory.alex[0].scenarioId,story.id);
    assert.equal(root.careerSystem.incidentHistory.mira.length,0);
    assert.equal(decideWorkIncident(root,'alex',story.options[0].id).ok,false);
    assert.equal(automaticWorkIncident(root,'alex').ok,false);
    const restored=loadHousehold(copy(root));
    assert.equal(restored.version,1);
    assert.equal(restored.shop.credits,before);
    assert.equal(restored.careerSystem.incidentHistory.alex[0].scenarioId,story.id);
    assert.equal(restored.careerSystem.incidentIds.length,1);
  }
});
