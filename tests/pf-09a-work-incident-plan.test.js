import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {plannedCareerShift} from '../src/career-scheduler.js';
import {arriveCareerPortal,progressCareerWork} from '../src/career-work.js';
import {chooseCareerSpecialization} from '../src/career-specializations.js';
import {incidentOutcome,planWorkIncident,advanceWorkIncident,recordIncidentOpportunity,
  pendingWorkIncident,decideWorkIncident,workScenario} from '../src/career-incidents.js';
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){
  const root=newHousehold('2026-11-16');
  root.careerSystem=hireCareer(root.careerSystem,'alex','editorial',480);
  const contract=root.careerSystem.byResident.alex;
  const s=plannedCareerShift(root.calendar,contract,0);
  root.minutes=s.start;root.otherSim.minutes=s.start;
  progressCareerWork(root,s.start-.01,s.start);
  assert.equal(arriveCareerPortal(root,'alex',s.start),true);
  return {root,contract,shift:contract.currentShift};
}
test('PF-09/A 12000 ordinary shift IDs: independent reproducible 40/40/15/5 roll',()=>{
  const counts={none:0,ordinary:0,unusual:0,rare:0};
  for(let i=0;i<12000;i++){
    const start=540+i*1440,id='e1@'+i+'@'+start,resident=i%2?'alex':'mira';
    const result=incidentOutcome(id,resident);
    assert.equal(incidentOutcome(id,resident),result);
    counts[result]++;
  }
  for(const [k,target] of Object.entries({none:.4,ordinary:.4,unusual:.15,rare:.05}))
    assert.ok(Math.abs(counts[k]/12000-target)<=.02,JSON.stringify(counts));
  console.log('PF-09/A roll distribution',counts);
});
test('PF-09/A three decision windows, all outcomes, short late shift',()=>{
  const {contract,shift}=fixture(),outcomes=new Set(),windows=new Set();
  for(let i=0;i<200;i++){
    const s={...shift,id:'e1@'+i+'@'+i*1440,start:i*1440,end:i*1440+480,departedAt:i*1440};
    const p=planWorkIncident(contract,'alex',s);
    assert.deepEqual(planWorkIncident(contract,'alex',s),p);
    outcomes.add(p.rarity);
    if(p.status==='due'){
      const frac=(p.dueAt-s.start)/480;
      const w=frac<=.301?0:frac<=.601?1:2;
      const [lo,hi]=[[.148,.302],[.398,.602],[.648,.802]][w];
      assert.ok(frac>=lo&&frac<=hi);
      windows.add(w);
    }
  }
  assert.equal(outcomes.size,4);assert.equal(windows.size,3);
  assert.equal(planWorkIncident(contract,'alex',{...shift,departedAt:shift.end-10}).status,'none');
});
test('PF-09/A no ghost on coarse end tick; exactly one salary',()=>{
  const {root,shift,contract}=fixture(),funds=root.shop.credits;
  const messages=tickHousehold(root,shift.end-root.minutes);
  assert.equal(messages.filter(x=>x.type==='incident').length,0);
  assert.equal(root.careerSystem.incidentIds.length,0);
  assert.equal(root.careerSystem.incidentHistory.alex.length,0);
  assert.equal(contract.lastShift.incident,null);
  assert.equal(root.careerSystem.settlementIds.length,1);
  assert.equal(root.shop.credits,funds+contract.lastShift.salary);
  tickHousehold(root,5);assert.equal(root.careerSystem.settlementIds.length,1);
});
function findShift(state,status){
  const {root,contract,shift}=state;
  let s=shift;
  for(let i=1;planWorkIncident(contract,'alex',s).status!==status;i++){
    assert.ok(i<60);
    const next=plannedCareerShift(root.calendar,contract,i);
    if(next)s={...next,phase:'working',departedAt:next.start,readiness:70};
  }
  contract.currentShift=s;root.minutes=s.start;root.otherSim.minutes=s.start;
  return s;
}
test('PF-09/A no-event shift remains normal through small ticks and reload',()=>{
  const st=fixture(),s=findShift(st,'none');
  let root=st.root;
  for(let i=0;i<10;i++){
    const at=s.start+(s.end-s.start)*(i+1)/10;
    const messages=progressCareerWork(root,root.minutes,at);
    assert.equal(messages.filter(x=>x.type==='incident').length,0);
    root.minutes=at;root.otherSim.minutes=at;
    if(i===4)root=loadHousehold(clone(root));
  }
  assert.equal(root.careerSystem.incidentIds.length,0);
  assert.equal(root.careerSystem.settlementIds.length,1);
});
test('PF-09/A v1 reload preserves plan, actual incident and one-time choice',()=>{
  const st=fixture(),s=findShift(st,'due'),root=st.root;
  assert.equal(advanceWorkIncident(root,'alex',s.start),false);
  const p=clone(s.incidentPlan),saved=loadHousehold(clone(root));
  assert.deepEqual(saved.careerSystem.byResident.alex.currentShift.incidentPlan,p);
  assert.equal(advanceWorkIncident(saved,'alex',p.dueAt-.01),false);
  assert.equal(advanceWorkIncident(saved,'alex',p.dueAt),true);
  assert.equal(advanceWorkIncident(saved,'alex',p.dueAt+1),false);
  const restored=loadHousehold(clone(saved)),incident=pendingWorkIncident(restored,'alex');
  assert.ok(incident);
  restored.minutes=p.dueAt;
  const option=workScenario('editorial',incident.scenarioId).options[0].id;
  assert.ok(decideWorkIncident(restored,'alex',option).ok);
  assert.equal(decideWorkIncident(restored,'alex',option).ok,false);
  assert.equal(restored.careerSystem.incidentIds.length,1);
});
test('PF-09/A missing focus evidence gets an opportunity by fourth eligible shift',()=>{
  const {root,contract,shift}=fixture();
  contract.currentShift=null;contract.level=4;contract.workedShifts=5;
  assert.ok(chooseCareerSpecialization(root,'alex','investigations').ok);
  let s;
  for(let i=0;i<3;i++){
    s={...shift,id:'e1@'+i+'@'+(i*1440+540),start:i*1440+540,end:i*1440+1020,departedAt:i*1440+540};
    s.incidentPlan=planWorkIncident(contract,'alex',s);
    assert.deepEqual(s.incidentPlan.proofScenes,['legacy']);
    recordIncidentOpportunity(contract,s);
  }
  assert.equal(contract.incidentProofWait.skipped,3);
  s={...shift,id:'e1@4@6300',start:6300,end:6780,departedAt:6300};
  contract.currentShift=s;
  const p=planWorkIncident(contract,'alex',s);
  assert.equal(p.status,'due');
  assert.equal(advanceWorkIncident(root,'alex',p.dueAt),true);
  assert.equal(s.incident.scenarioId,'legacy');
  assert.equal(contract.specialization.focusReceiptId,null);
  recordIncidentOpportunity(contract,s);
  assert.equal(contract.incidentProofWait.skipped,0);
});
