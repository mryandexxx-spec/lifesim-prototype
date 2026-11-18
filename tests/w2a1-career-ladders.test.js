/** W2-A.1: stable five-step six-career ladders, legacy saves and once-only pay. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {CAREER_CATALOG,careerDefinition} from '../src/career-catalog.js';
import {hireCareer,restoreCareerSystem} from '../src/career-state.js';
import {plannedCareerShift} from '../src/career-scheduler.js';
import {promotionReadiness,promoteCareer} from '../src/career-progression.js';
import {progressCareerWork,arriveCareerPortal,finishCareerReturn} from '../src/career-work.js';
import {startWorkIncident,decideWorkIncident,workScenario} from '../src/career-incidents.js';

const copy=data=>JSON.parse(JSON.stringify(data));
const initial={
  'city-services':[['Курьер',15],['Координатор',34],['Руководитель службы',73]],
  'kitchen-studio':[['Помощник кухни',16],['Повар',38],['Шеф мастерской',82]],
  'art-studio':[['Ассистент галереи',17],['Оформитель',36],['Арт-директор',77]],
  editorial:[['Стажёр редакции',14],['Обозреватель',35],['Редактор',79]],
  'business-center':[['Делопроизводитель',18],['Аналитик',42],['Управляющий',89]],
  'civic-service':[['Помощник службы',19],['Инспектор',43],['Координатор службы',85]]
};
const senior={
  'city-services':[[['Директор городских сервисов',91],['Куратор городской сети',111]],7,83,9,87],
  'kitchen-studio':[[['Шеф сети мастерских',101],['Кулинарный директор',123]],7,83,9,88,'cooking'],
  'art-studio':[[['Директор сети арт-студий',95],['Руководитель творческих проектов',116]],7,83,9,88,'painting'],
  editorial:[[['Главный редактор',97],['Руководитель издательских проектов',118]],7,83,9,88,'literature'],
  'business-center':[[['Директор делового центра',104],['Руководитель деловой сети',125]],8,83,10,88],
  'civic-service':[[['Руководитель общественных программ',100],['Директор общественных инициатив',122]],8,83,10,88]
};
function fixture(career,id='alex'){
  const root=newHousehold('2026-11-16');
  root.careerSystem=hireCareer(root.careerSystem,id,career,480);
  return {root,contract:root.careerSystem.byResident[id],actor:id==='mira'?root.otherSim:root};
}
function firstShift(root,contract){
  for(let day=0;day<15;day++){
    const shift=plannedCareerShift(root.calendar,contract,day);
    if(shift)return shift;
  }
  throw Error('Missing career shift');
}
test('all six original IDs and first three ranks are identical; exactly two senior ranks added',()=>{
  assert.equal(CAREER_CATALOG.length,6);
  for(const career of CAREER_CATALOG){
    assert.equal(career.ranks.length,5);
    assert.deepEqual(career.ranks.slice(0,3).map(r=>[r.title,r.hourlyCredits]),initial[career.id]);
    assert.deepEqual(career.ranks.slice(3).map(r=>[r.title,r.hourlyCredits]),senior[career.id][0]);
    for(const rank of career.ranks)assert.ok(rank.hourlyCredits>0);
    assert.deepEqual(career.ranks.map(r=>r.index),[0,1,2,3,4]);
    assert.deepEqual(career.schedule.weekdays.length>0,true);
  }
});
test('legacy levels 0, 1 and former maximum 2 retain employment, titles, pay and new goal',()=>{
  for(const career of CAREER_CATALOG)for(let level=0;level<=2;level++){
    const {root,contract}=fixture(career.id);
    contract.level=level;
    contract.workedShifts=18;contract.rankShifts=6;contract.performance=79;
    const before=firstShift(root,contract);
    const restored=loadHousehold(copy(root));
    const after=restored.careerSystem.byResident.alex;
    assert.equal(after.level,level);
    assert.equal(after.employmentId,contract.employmentId);
    assert.equal(after.workedShifts,18);
    assert.equal(after.rankShifts,6);
    assert.equal(after.performance,79);
    assert.equal(careerDefinition(after.careerId).ranks[after.level].title,initial[career.id][level][0]);
    assert.equal(plannedCareerShift(restored.calendar,after,Math.floor(before.start/1440)).hourlyCredits,
      initial[career.id][level][1]);
    assert.equal(promotionReadiness(restored,'alex').maxLevel,false,
      'Old third rank is not a terminal promotion any more');
    assert.equal(restored.version,1);
  }
});
test('previous first and second promotion rules remain unchanged for all careers',()=>{
  for(const career of CAREER_CATALOG){
    const {root,contract}=fixture(career.id);
    for(const level of [0,1]){
      contract.level=level;contract.rankShifts=0;contract.performance=100;
      const goal=promotionReadiness(root,'alex');
      assert.equal(goal.requirements[0].target,level===0?68:80);
      assert.equal(goal.requirements[1].target,
        level===0?(['business-center','civic-service'].includes(career.id)?4:3):
        (['city-services','business-center','civic-service'].includes(career.id)?6:5));
      const skill=senior[career.id][5];
      assert.equal(goal.requirements.length,skill?3:2);
      if(skill)assert.equal(goal.requirements[2].target,level===0?1:3);
    }
  }
});
test('senior promotions need earned rank-shifts, real rating and genuine profile skill',()=>{
  for(const career of CAREER_CATALOG){
    const [,n2,p2,n3,p3,skill]=senior[career.id];
    const {root,contract,actor}=fixture(career.id);
    contract.level=2;contract.workedShifts=25;contract.rankShifts=n2-1;contract.performance=p2;
    if(skill)actor.skills.xpById[skill]=3000;
    let goal=promotionReadiness(root,'alex');
    assert.equal(goal.rank,career.ranks[3].title);
    assert.equal(goal.ready,false);
    assert.equal(goal.requirements[1].current,n2-1);
    contract.rankShifts=n2;contract.performance=p2-1;
    assert.equal(promotionReadiness(root,'alex').ready,false);
    contract.performance=p2;
    assert.equal(promotionReadiness(root,'alex').ready,true);
    assert.equal(promoteCareer(root,'alex').ok,true);
    assert.equal(contract.level,3);
    assert.equal(contract.rankShifts,0);
    assert.equal(contract.workedShifts,25);
    assert.equal(contract.performance,Math.max(55,p2-18));
    assert.equal(promoteCareer(root,'alex').ok,false);
    contract.rankShifts=n3;contract.performance=p3;
    goal=promotionReadiness(root,'alex');
    assert.equal(goal.rank,career.ranks[4].title);
    assert.equal(goal.requirements[1].target,n3);
    if(skill){
      actor.skills.xpById[skill]=0;
      goal=promotionReadiness(root,'alex');
      assert.equal(goal.ready,false,'No invented XP from job contract');
      assert.equal(goal.requirements[2].target,5);
      actor.skills.xpById[skill]=3000;
    }
    assert.equal(promotionReadiness(root,'alex').ready,true);
    assert.equal(promoteCareer(root,'alex').ok,true);
    assert.equal(contract.level,4);
    assert.equal(promotionReadiness(root,'alex').maxLevel,true);
  }
});
test('only new completed full shifts pay senior rates once; old snapshots are immutable',()=>{
  for(const career of CAREER_CATALOG){
    const {root,contract}=fixture(career.id);
    contract.level=3;contract.performance=85;
    const shift=firstShift(root,contract);
    const oldCredits=root.shop.credits;
    root.minutes=shift.start;root.otherSim.minutes=shift.start;
    progressCareerWork(root,shift.start-1,shift.start);
    assert.equal(arriveCareerPortal(root,'alex',shift.start),true);
    assert.equal(contract.currentShift.hourlyCredits,senior[career.id][0][0][1]);
    const loaded=loadHousehold(copy(root));
    const c=loaded.careerSystem.byResident.alex;
    assert.equal(c.currentShift.hourlyCredits,senior[career.id][0][0][1]);
    assert.equal(promoteCareer(loaded,'alex').ok,false,'No promotion in-flight');
    tickHousehold(loaded,shift.end-shift.start);
    const earned=Math.round(shift.duration*senior[career.id][0][0][1]/60);
    assert.equal(c.lastShift.salary,earned);
    assert.equal(loaded.shop.credits,oldCredits+earned);
    assert.equal(loaded.careerSystem.settlementIds.length,1);
    tickHousehold(loaded,1);
    assert.equal(loaded.shop.credits,oldCredits+earned);
    assert.equal(finishCareerReturn(loaded,'alex'),true);
    const again=loadHousehold(copy(loaded));
    assert.equal(again.shop.credits,oldCredits+earned);
    assert.equal(again.careerSystem.settlementIds.length,1);
  }
});
test('pending and resolved rank3/rank4 incidents restore without repeat after Safari reload',()=>{
  const root=newHousehold('2026-11-16');
  root.careerSystem=hireCareer(root.careerSystem,'alex','city-services',480);
  root.careerSystem=hireCareer(root.careerSystem,'mira','editorial',480);
  root.careerSystem.byResident.alex.level=3;
  root.careerSystem.byResident.alex.workedShifts=10;
  root.careerSystem.byResident.mira.level=4;
  root.careerSystem.byResident.mira.workedShifts=20;
  for(const id of ['alex','mira']){
    const c=root.careerSystem.byResident[id],shift=firstShift(root,c);
    c.currentShift={...shift,phase:'working',departedAt:shift.start,
      readiness:75,warn15:false,warn60:false,incident:null};
  }
  const t=Math.max(...['alex','mira'].map(id=>{
    const s=root.careerSystem.byResident[id].currentShift;
    return s.start+Math.round((s.end-s.start)/2)+1;
  }));
  root.minutes=t;root.otherSim.minutes=t;
  assert.equal(startWorkIncident(root,'alex',t),true);
  assert.equal(startWorkIncident(root,'mira',t),true);
  const before=loadHousehold(copy(root));
  for(const id of ['alex','mira']){
    const c=before.careerSystem.byResident[id];
    assert.equal(c.currentShift.incident.choiceId,null);
    const scene=workScenario(c.careerId,c.currentShift.incident.scenarioId);
    assert.equal(decideWorkIncident(before,id,scene.options[0].id).ok,true);
  }
  const restored=loadHousehold(copy(before));
  assert.deepEqual(restored.careerSystem.incidentHistory.alex.map(x=>x.rank),[3]);
  assert.deepEqual(restored.careerSystem.incidentHistory.mira.map(x=>x.rank),[4]);
  assert.equal(restored.careerSystem.incidentIds.length,2);
  const prior=copy(restored.careerSystem.incidentHistory);
  for(const id of ['alex','mira']){
    const c=restored.careerSystem.byResident[id];
    const choice=c.currentShift.incident.choiceId;
    assert.equal(decideWorkIncident(restored,id,choice).ok,false);
  }
  assert.deepEqual(restored.careerSystem.incidentHistory,prior);
  assert.equal(restored.shop.credits,5000);
});
test('old missing optional career fields stay compatible and independent per resident',()=>{
  const root=newHousehold('2026-11-16');
  root.careerSystem=hireCareer(root.careerSystem,'alex','kitchen-studio',480);
  root.careerSystem=hireCareer(root.careerSystem,'mira','art-studio',480);
  root.careerSystem.byResident.alex.level=2;
  root.careerSystem.byResident.mira.level=4;
  root.careerSystem.byResident.mira.performance=91;
  delete root.careerSystem.byResident.alex.rankShifts;
  delete root.careerSystem.incidentHistory;
  const old=restoreCareerSystem(copy(root.careerSystem));
  assert.equal(old.byResident.alex.level,2);
  assert.equal(old.byResident.mira.level,4);
  assert.equal(old.byResident.alex.rankShifts,0);
  assert.equal(old.byResident.mira.performance,91);
  assert.deepEqual(old.incidentHistory,{alex:[],mira:[]});
  assert.equal(root.version,1);
});
