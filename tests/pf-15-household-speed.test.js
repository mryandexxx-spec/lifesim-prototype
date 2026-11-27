import test from 'node:test';
import assert from 'node:assert/strict';
import {householdIdleEpisode,createHouseholdSpeedController} from '../src/sleep-acceleration.js';
const bed=()=>({id:'bed',phase:'using'});
function fixture(n=2){
  const root={version:1,speed:1,paused:false,action:null,careerSystem:{byResident:{}},
    population:{linksByResident:{alex:{dwellingId:'home'}},residentsById:{}}};
  const actors=[root],ids=['alex'];
  if(n>=2){root.otherSim={version:1,action:null};actors.push(root.otherSim);ids.push('mira');}
  for(let i=3;i<=n;i++){
    const id='resident_'+i,actor={version:1,action:null};
    root.population.residentsById[id]={id,actor};
    root.population.linksByResident[id]={dwellingId:'home'};
    actors.push(actor);ids.push(id);
  }
  return {root,actors,ids,controller:createHouseholdSpeedController()};
}
for(const n of [1,2,3,4]){
  test('PF-15 '+n+' residents sleep, wake, next episode',()=>{
    const {root,actors,controller:c}=fixture(n);
    assert.equal(c.read(root),1);
    actors.forEach(a=>a.action=bed());
    assert.equal(householdIdleEpisode(root),'sleep');assert.equal(c.read(root),3);
    assert.equal(root.speed,1);
    actors.at(-1).action=null;assert.equal(c.read(root),1);
    actors.at(-1).action=bed();assert.equal(c.read(root),3);
  });
  test('PF-15 '+n+' residents work, returning ends episode',()=>{
    const {root,ids,controller:c}=fixture(n);
    ids.forEach(id=>root.careerSystem.byResident[id]={currentShift:{phase:'working'}});
    assert.equal(c.read(root),3);
    for(const phase of ['returning','waiting','departing']){
      root.careerSystem.byResident[ids.at(-1)].currentShift.phase=phase;
      assert.equal(c.read(root),1);
    }
  });
}
test('walking to bed blocks acceleration; mixed sleep/work and remote extra handled correctly',()=>{
  const {root,actors,controller:c}=fixture(3);
  actors[0].action=bed();actors[1].action=bed();actors[2].action={id:'bed',phase:'walking'};
  assert.equal(c.read(root),1);
  root.careerSystem.byResident.resident_3={currentShift:{phase:'working'}};
  assert.equal(householdIdleEpisode(root),'mixed');assert.equal(c.read(root),3);
  root.population.linksByResident.resident_3.dwellingId='elsewhere';
  assert.equal(c.read(root),3);
});
test('manual toggle overrides this episode only; new episode restores auto',()=>{
  const {root,actors,controller:c}=fixture();
  actors.forEach(a=>a.action=bed());assert.equal(c.read(root),3);
  assert.equal(c.toggle(root),1);assert.equal(c.read(root),1);
  actors[0].action=null;assert.equal(c.read(root),1);
  actors[0].action=bed();assert.equal(c.read(root),3);
  assert.equal(root.speed,1);
  const restored=JSON.parse(JSON.stringify(root));
  assert.equal(createHouseholdSpeedController().read(restored),3);
});
test('pause and mandatory modal suspend boost; optional work incident does not stall whole shift',()=>{
  const {root,ids,controller:c}=fixture();
  ids.forEach(id=>root.careerSystem.byResident[id]={currentShift:{phase:'working'}});
  assert.equal(c.read(root),3);root.paused=true;assert.equal(c.read(root),1);
  root.paused=false;assert.equal(c.read(root,{blocked:true}),1);
  root.careerSystem.byResident.alex.currentShift.incident={choiceId:null};
  assert.equal(c.read(root),3);
  root.careerSystem.byResident.alex.currentShift.incident.choiceId='done';
  assert.equal(c.read(root),3);
});

import {newHousehold,chooseResidentAction,bedDestinationFor,tickHousehold,loadHousehold} from '../src/household.js';
import {arrive} from '../src/simulation.js';
import {hireCareer} from '../src/career-state.js';
import {progressCareerWork,arriveCareerPortal} from '../src/career-work.js';

test('actual household clock: first natural wake exits auto speed, remaining sleeper stays asleep',()=>{
  const root=newHousehold('2026-11-16'),c=createHouseholdSpeedController();
  for(const [id,actor,energy] of [['alex',root,99],['mira',root.otherSim,40]]){
    assert.ok(chooseResidentAction(root,'bed',true,id));
    actor.position=bedDestinationFor(root,id);actor.needs.energy=energy;arrive(actor);
  }
  const start=root.minutes;assert.equal(c.read(root),3);
  for(let i=0;i<100&&root.action;i++){tickHousehold(root,.30);c.read(root);}
  assert.equal(root.action,null);assert.equal(root.otherSim.action?.id,'bed');
  assert.equal(c.read(root),1);assert.ok(root.minutes-start>=1/.068&&root.minutes-start<1/.068+.31);
  assert.equal(root.minutes,root.otherSim.minutes);
});

test('actual staggered shifts: first salary settles once and speed falls before other shift ends',()=>{
  const root=newHousehold('2026-11-16'),c=createHouseholdSpeedController();
  root.careerSystem=hireCareer(root.careerSystem,'alex','city-services',400);
  root.careerSystem=hireCareer(root.careerSystem,'mira','editorial',400);
  for(const [id,start] of [['alex',480],['mira',540]]){
    root.minutes=start;root.otherSim.minutes=start;
    progressCareerWork(root,start-1,start);
    assert.ok(arriveCareerPortal(root,id,start));
    root.careerSystem.byResident[id].currentShift.incidentPlan={version:1,status:'none',rarity:null,dueAt:null,proofScenes:[]};
  }
  root.minutes=959.4;root.otherSim.minutes=root.minutes;
  assert.equal(c.read(root),3);
  for(let i=0;i<5;i++){tickHousehold(root,.30);c.read(root);}
  assert.equal(root.careerSystem.byResident.alex.currentShift.phase,'returning');
  assert.equal(root.careerSystem.byResident.mira.currentShift.phase,'working');
  assert.equal(c.read(root),1);assert.equal(root.careerSystem.settlementIds.length,1);
  const restored=loadHousehold(JSON.parse(JSON.stringify(root)));
  tickHousehold(restored,.30);assert.equal(restored.careerSystem.settlementIds.length,1);
});

test('LIFE-QOL: sleeping resident with future pending shift counts as asleep',()=>{
 const {root,actors,controller:c}=fixture();
 actors[0].action=bed();root.careerSystem.byResident.alex={currentShift:{phase:'pending'}};
 root.careerSystem.byResident.mira={currentShift:{phase:'working'}};
 assert.equal(householdIdleEpisode(root),'mixed');assert.equal(c.read(root),3);
 actors[0].action=null;assert.equal(c.read(root),1);
});
test('LIFE-QOL: optional incident does not prevent actual overlapping shifts from accelerating',()=>{
 const root=newHousehold('2026-11-16'),c=createHouseholdSpeedController();
 root.careerSystem=hireCareer(root.careerSystem,'alex','city-services',400);
 root.careerSystem=hireCareer(root.careerSystem,'mira','editorial',400);
 for(const [id,start] of [['alex',480],['mira',540]]){
   root.minutes=start;root.otherSim.minutes=start;
   progressCareerWork(root,start-1,start);assert.ok(arriveCareerPortal(root,id,start));
 }
 root.careerSystem.byResident.alex.currentShift.incident={choiceId:null};
 assert.equal(c.read(root),3);assert.equal(c.read(root,{blocked:true}),1);
 assert.equal(c.toggle(root),1);assert.equal(c.read(root),1);
});
