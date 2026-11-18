/** W2-A.4: all twelve full eight-step paths, canonical earned evidence and saves. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold} from '../src/household.js';
import {CAREER_CATALOG} from '../src/career-catalog.js';
import {hireCareer} from '../src/career-state.js';
import {CAREER_SPECIALIZATIONS,chooseCareerSpecialization,careerRankForContract} from '../src/career-specializations.js';
import {SENIOR_CAREER_PATHS,seniorTrack,seniorNextRank,seniorMissingScenes,
  seniorPromotionReadiness,resetSeniorProof,recordSeniorIncident} from '../src/career-seniority.js';
import {promotionReadiness,promoteCareer} from '../src/career-progression.js';
import {plannedCareerShift} from '../src/career-scheduler.js';
import {startWorkIncident,decideWorkIncident,workScenario,WORK_INCIDENT_CATALOG} from '../src/career-incidents.js';
import {progressCareerWork,finishCareerReturn} from '../src/career-work.js';

const clone=data=>JSON.parse(JSON.stringify(data));
const PAIRS={ 'city-services':[123,139,158], 'kitchen-studio':[135,151,172],
  editorial:[130,146,166], 'art-studio':[128,144,163],
  'business-center':[137,153,174], 'civic-service':[134,150,170]};
function family(careerId='city-services',trackId='logistics',resident='alex'){
  const root=newHousehold('2026-11-16');
  root.minutes=0;root.otherSim.minutes=0;
  root.careerSystem=hireCareer(root.careerSystem,resident,careerId,0);
  const c=root.careerSystem.byResident[resident];
  c.level=4;c.workedShifts=26;c.rankShifts=8;c.performance=99;
  const selected=chooseCareerSpecialization(root,resident,trackId);
  assert.equal(selected.ok,true);
  c.level=5;c.rankShifts=0;c.performance=92;
  c.specialization.focusReceiptId=c.employmentId+'@0@0#work';
  c.specialization.focusScenarioId=selected.track.scenarioId;
  c.specialization.focusAt=0;
  c.seniorProofs=resetSeniorProof(c,0);
  const actor=resident==='mira'?root.otherSim:root;
  const profile=seniorTrack(careerId,trackId);
  const skill=profile.ranks[0].requirements.skill;
  if(skill)actor.skills.xpById[skill]=1000000;
  return {root,c,actor,profile,resident,day:0};
}
function nextShift(st){
  for(let d=st.day;d<st.day+60;d++){
    const shift=plannedCareerShift(st.root.calendar,st.c,d);
    if(shift&&shift.id!==st.c.lastShift?.id){st.day=d+1;return shift;}
  }
  throw Error('No next shift');
}
function earnedShift(st){
  const {root,c,resident}=st;
  const shift=nextShift(st);
  c.currentShift={...shift,phase:'working',departedAt:shift.start,
    readiness:92,warn15:false,warn60:false,incident:null};
  root.minutes=shift.start+Math.ceil(shift.duration/2)+1;
  root.otherSim.minutes=root.minutes;
  assert.equal(startWorkIncident(root,resident,root.minutes),true);
  const inc=c.currentShift.incident;
  const option=workScenario(c.careerId,inc.scenarioId).options[0];
  const out=decideWorkIncident(root,resident,option.id);
  assert.equal(out.ok,true);
  const scene=inc.scenarioId;
  assert.ok(out.performanceDelta>0,'actual authored successful case');
  progressCareerWork(root,shift.end-1,shift.end);
  assert.equal(finishCareerReturn(root,resident),true);
  root.minutes=shift.end;root.otherSim.minutes=root.minutes;
  return {scene,shift};
}
test('12 immutable specialization paths have exactly 24 named seventh/eighth roles and approved salaries',()=>{
  assert.equal(CAREER_CATALOG.length,6);
  for(const career of CAREER_CATALOG){
    assert.equal(career.ranks.length,5);
    const tracks=CAREER_SPECIALIZATIONS[career.id];
    assert.equal(tracks.length,2);
    assert.deepEqual(PAIRS[career.id].slice(0,1),[tracks[0].rank.hourlyCredits]);
    const names=new Set();
    for(const track of tracks){
      const path=seniorTrack(career.id,track.id);
      assert.ok(path);
      assert.deepEqual(path.ranks.map(r=>r.index),[6,7]);
      assert.deepEqual([track.rank.hourlyCredits,...path.ranks.map(r=>r.hourlyCredits)],PAIRS[career.id]);
      for(const rank of path.ranks){
        assert.ok(rank.title&&!names.has(rank.title));names.add(rank.title);
        assert.equal(rank.requirements.scenes.length,rank.index===6?1:2);
        assert.equal(new Set(rank.requirements.scenes).size,rank.requirements.scenes.length);
        assert.ok(rank.requirements.scenes.every(s=>WORK_INCIDENT_CATALOG[career.id].some(x=>x.id===s)));
        assert.ok(Object.isFrozen(rank)&&Object.isFrozen(rank.requirements));
      }
    }
    assert.equal(names.size,4);
  }
  assert.equal(Object.keys(SENIOR_CAREER_PATHS).length,6);
});
test('all 12 senior tracks require fresh on-rank incidents, actual shifts, performance and real skills',()=>{
  for(const career of CAREER_CATALOG)for(const track of CAREER_SPECIALIZATIONS[career.id]){
    const st=family(career.id,track.id);
    const {root,c,profile,resident}=st;
    for(const index of [5,6]){
      const next=profile.ranks[index-5];
      assert.equal(careerRankForContract(c).index,index);
      assert.equal(seniorNextRank(c).index,index+1);
      assert.equal(promotionReadiness(root,resident).ready,false);
      // Only true one-time working-scene receipts unlock conditions, never
      // retroactive W2-A.3 branch focus or an arbitrary fake proof call.
      assert.equal(recordSeniorIncident(root,resident,{id:'e999@0@0#work',
        careerId:c.careerId,scenarioId:next.requirements.scenes[0],performanceDelta:9,
        resolvedAt:0}),false);
      const beforeCash=root.shop.credits;
      for(let n=0;n<next.requirements.shifts;n++){
        earnedShift(st);
      }
      assert.equal(c.rankShifts,next.requirements.shifts);
      assert.equal(seniorMissingScenes(c).length,0,
        'All required scenes must be available from genuine working shifts');
      assert.ok(root.shop.credits>beforeCash);
      assert.equal(promotionReadiness(root,resident).ready,true,
        career.id+'/'+track.id+' at level '+index);
      const validated=loadHousehold(clone(root));
      const saved=validated.careerSystem.byResident[resident];
      assert.equal(saved.level,index);
      assert.deepEqual(saved.seniorProofs.positiveReceipts.map(x=>x.scenarioId).sort(),
        next.requirements.scenes.slice().sort());
      const salary=root.shop.credits;
      assert.equal(promoteCareer(root,resident).ok,true);
      assert.equal(root.shop.credits,salary,'promotion never pays a bonus');
      assert.equal(c.level,index+1);assert.equal(c.rankShifts,0);
      assert.equal(careerRankForContract(c).hourlyCredits,next.hourlyCredits);
      assert.equal(c.seniorProofs.rank,c.level);
      assert.equal(c.seniorProofs.positiveReceipts.length,0,
        'Fresh rank-scoped evidence cannot be inherited');
      const reloaded=loadHousehold(clone(root));
      assert.equal(reloaded.careerSystem.byResident[resident].level,index+1);
      assert.equal(reloaded.shop.credits,salary);
    }
    assert.equal(c.level,7);
    assert.equal(promotionReadiness(root,resident).maxLevel,true);
    assert.equal(seniorNextRank(c),null);
  }
});
test('old 0..5 saves restore and malformed new optional senior proofs cannot erase a valid contract',()=>{
  for(const career of CAREER_CATALOG)for(let level=0;level<=5;level++){
    const track=CAREER_SPECIALIZATIONS[career.id][0];
    const st=family(career.id,track.id);
    st.c.level=level;
    if(level<5){delete st.c.specialization;delete st.c.seniorProofs;}
    else delete st.c.seniorProofs; // un-upgraded historical sixth rank
    const saved=loadHousehold(clone(st.root));
    assert.equal(saved.careerSystem.byResident.alex.level,level);
    assert.equal(saved.careerSystem.schema,1);
    assert.equal(saved.version,1);
    assert.equal(saved.shop.credits,st.root.shop.credits);
    if(level===5){
      const c=loadHousehold(clone(st.root)).careerSystem.byResident.alex;
      assert.equal(careerRankForContract(c).hourlyCredits,track.rank.hourlyCredits);
    }
  }
  const st=family();st.c.level=7;
  for(const corruption of [{schema:7}, {schema:1,trackId:'fake',rank:7,startedAt:0,positiveReceipts:[]},
    {schema:1,trackId:'logistics',rank:7,startedAt:-3,positiveReceipts:[{incidentId:'fake'}]}]){
    st.c.seniorProofs=corruption;
    const restored=loadHousehold(clone(st.root));
    assert.equal(restored.careerSystem.byResident.alex.level,7);
    assert.equal(restored.careerSystem.byResident.alex.seniorProofs,undefined);
    assert.equal(restored.careerSystem.byResident.alex.employmentId,st.c.employmentId);
  }
});
test('actual rank7 shift snapshots and incident journal restore with one salary settlement',()=>{
  const st=family();st.c.level=7;
  const shift=nextShift(st);
  st.c.currentShift={...shift,phase:'working',departedAt:shift.start,
    readiness:90,warn15:false,warn60:false,incident:null};
  st.root.minutes=shift.start+shift.duration/2+1;
  assert.equal(startWorkIncident(st.root,st.resident,st.root.minutes),true);
  const inc=st.c.currentShift.incident;
  const resolved=decideWorkIncident(st.root,st.resident,
    workScenario(st.c.careerId,inc.scenarioId).options[0].id);
  assert.equal(resolved.ok,true);
  const persisted=loadHousehold(clone(st.root)),c=persisted.careerSystem.byResident.alex;
  assert.equal(c.level,7);
  assert.equal(c.currentShift.hourlyCredits,158);
  assert.equal(persisted.careerSystem.incidentHistory.alex.at(-1).rank,7);
  const credits=persisted.shop.credits;
  progressCareerWork(persisted,shift.end-1,shift.end);
  assert.equal(persisted.shop.credits,credits+Math.round(shift.duration*158/60));
  assert.equal(persisted.careerSystem.settlementIds.length,1);
  progressCareerWork(persisted,shift.end,shift.end+1);
  assert.equal(persisted.careerSystem.settlementIds.length,1);
  assert.equal(loadHousehold(clone(persisted)).shop.credits,persisted.shop.credits);
});
test('proof survives 12-entry work journal eviction and lateral transfer respects rank and credits',()=>{
  const st=family('city-services','logistics');
  st.c.level=6;
  for(let i=0;i<10;i++)earnedShift(st);
  assert.equal(seniorMissingScenes(st.c).length,0);
  st.root.careerSystem.incidentHistory.alex=[];
  const restored=loadHousehold(clone(st.root)),c=restored.careerSystem.byResident.alex;
  assert.equal(seniorMissingScenes(c).length,0,'Durable canonical proof not tied to short journal');
  const money=restored.shop.credits,worked=c.workedShifts,rank=c.rankShifts;
  assert.equal(chooseCareerSpecialization(restored,'alex','infrastructure').ok,true);
  assert.equal(c.level,6);
  assert.equal(c.workedShifts,worked);assert.equal(c.rankShifts,rank);
  assert.equal(restored.shop.credits,money);
  assert.equal(seniorMissingScenes(c).length,2,'New branch requires new cases');
  assert.equal(loadHousehold(clone(restored)).careerSystem.byResident.alex.level,6);
});
test('Alex and Mira have separate branch progression, proof and hourly snapshots',()=>{
  const st=family('city-services','logistics');
  st.root.careerSystem=hireCareer(st.root.careerSystem,'mira','editorial',0);
  const mira=st.root.careerSystem.byResident.mira;
  mira.level=4;mira.workedShifts=22;mira.rankShifts=10;mira.performance=99;
  assert.equal(chooseCareerSpecialization(st.root,'mira','leadership').ok,true);
  mira.level=7;mira.rankShifts=8;
  const old=loadHousehold(clone(st.root));
  assert.equal(old.careerSystem.byResident.alex.level,5);
  assert.equal(old.careerSystem.byResident.mira.level,7);
  assert.equal(careerRankForContract(old.careerSystem.byResident.alex).hourlyCredits,123);
  assert.equal(careerRankForContract(old.careerSystem.byResident.mira).hourlyCredits,166);
  assert.equal(old.careerSystem.byResident.mira.seniorProofs,undefined);
  assert.equal(old.careerSystem.byResident.alex.specialization.id,'logistics');
});
