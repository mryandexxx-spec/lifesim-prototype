/** Q5 canonical career-map matrix: all six careers, two branches, eight ranks and old saves. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {CAREER_CATALOG} from '../src/career-catalog.js';
import {CAREER_SPECIALIZATIONS,careerRankForContract,chooseCareerSpecialization,specializationReadiness} from '../src/career-specializations.js';
import {seniorRank,resetSeniorProof} from '../src/career-seniority.js';
import {careerPromotionRule,promotionReadiness} from '../src/career-progression.js';
import {careerMapView} from '../src/career-map.js';

const copy=record=>JSON.parse(JSON.stringify(record));
const family=(careerId,residentId='alex')=>{
  const root=newHousehold('2026-11-16');
  root.careerSystem=hireCareer(root.careerSystem,residentId,careerId,480);
  return {root,contract:root.careerSystem.byResident[residentId]};
};
test('Q5 is a pure read-only graph for all six existing professions and both residents',()=>{
  assert.equal(CAREER_CATALOG.length,6);
  for(const career of CAREER_CATALOG)for(const id of ['alex','mira']){
    const {root}=family(career.id,id);
    const before=JSON.stringify(root);
    const map=careerMapView(root,id);
    assert.ok(map);assert.equal(map.common.length,5);
    assert.equal(map.tracks.length,2);
    assert.equal(map.all.length,11);
    assert.equal(map.currentLevel,1);
    assert.deepEqual(map.common.map(n=>n.level),[1,2,3,4,5]);
    assert.equal(map.common[0].status,'current');
    assert.equal(map.common[1].status,'locked');
    assert.equal(map.common[0].hourlyCredits,career.ranks[0].hourlyCredits);
    for(const track of map.tracks){
      const canonical=CAREER_SPECIALIZATIONS[career.id].find(x=>x.id===track.id);
      assert.ok(canonical);assert.deepEqual(track.nodes.map(n=>n.level),[6,7,8]);
      assert.equal(track.nodes[0].hourlyCredits,canonical.rank.hourlyCredits);
      for(const level of [6,7])assert.equal(
        track.nodes[level-5].hourlyCredits,
        seniorRank(career.id,track.id,level).hourlyCredits);
      assert.ok(track.nodes.every(node=>node.status==='locked'));
    }
    assert.equal(JSON.stringify(root),before,'graph may not change simulation or save');
  }
});
test('Q5 all 6×2×8 selected-path ranks match existing canonical contracts',()=>{
  for(const career of CAREER_CATALOG)
    for(const track of CAREER_SPECIALIZATIONS[career.id])
      for(const level of [0,1,2,3,4,5,6,7]){
        const {root,contract}=family(career.id);
        contract.level=4;contract.rankShifts=12;contract.performance=99;
        contract.workedShifts=30;
        assert.equal(chooseCareerSpecialization(root,'alex',track.id).ok,true);
        contract.level=level;contract.rankShifts=0;
        contract.seniorProofs=resetSeniorProof(contract,root.minutes);
        const before=JSON.stringify(root);
        const map=careerMapView(root,'alex');
        assert.equal(map.all.length,11);
        assert.equal(map.all.filter(n=>n.status==='current').length,1);
        const current=map.all.find(n=>n.status==='current');
        assert.equal(current.level,level+1);
        assert.equal(current.title,careerRankForContract(contract).title);
        assert.equal(current.hourlyCredits,careerRankForContract(contract).hourlyCredits);
        assert.equal(map.tracks.filter(t=>t.selected).length,1);
        assert.equal(map.tracks.find(t=>t.id===track.id).nodes.length,3);
        assert.equal(JSON.stringify(root),before);
        if(level>=5){
          const alternative=map.tracks.find(t=>t.id!==track.id);
          assert.ok(alternative.nodes.every(n=>n.status!=='passed'&&n.status!=='current'));
        }
      }
});
test('Q5 immediate requirements are the live canonical readiness; future thresholds are reference only',()=>{
  for(const career of CAREER_CATALOG){
    const {root,contract}=family(career.id);
    for(let level=0;level<=3;level++){
      contract.level=level;contract.rankShifts=2;contract.performance=65;
      const next=careerMapView(root,'alex').common[level+1];
      assert.deepEqual(next.requirements.map(r=>[r.label,r.current,r.target,r.met]),
        promotionReadiness(root,'alex').requirements.map(r=>[r.label,r.current,r.target,r.met]));
      const canonical=careerPromotionRule(career.id,level);
      assert.equal(next.requirements[0].target,canonical.performance);
      assert.equal(next.requirements[1].target,canonical.shifts);
      const future=careerMapView(root,'alex').common.at(-1);
      if(level<3){
        assert.equal(future.requirements[1].current,null,
          'future per-rank shifts must not imply earned rank progress');
      }
    }
    contract.level=4;contract.rankShifts=12;contract.performance=100;
    const pre=careerMapView(root,'alex');
    assert.ok(pre.tracks.every(t=>t.nodes[0].canChoose));
    assert.equal(promotionReadiness(root,'alex').needsSpecialization,true);
    const first=CAREER_SPECIALIZATIONS[career.id][0];
    contract.workedShifts=20;
    assert.equal(chooseCareerSpecialization(root,'alex',first.id).ok,true);
    let map=careerMapView(root,'alex');
    const next=map.tracks.find(t=>t.id===first.id).nodes[0];
    assert.deepEqual(next.requirements.map(r=>[r.label,r.current,r.target,r.met]),
      promotionReadiness(root,'alex').requirements.map(r=>[r.label,r.current,r.target,r.met]));
    assert.ok(next.requirements.some(r=>r.label==='Профильная рабочая ситуация'));
    contract.level=5;contract.seniorProofs=resetSeniorProof(contract,root.minutes);
    map=careerMapView(root,'alex');
    const rank7=map.tracks.find(t=>t.id===first.id).nodes[1];
    assert.deepEqual(rank7.requirements.map(r=>r.label),
      promotionReadiness(root,'alex').requirements.map(r=>r.label));
    assert.ok(rank7.requirements.some(r=>r.label.startsWith('Успешная ситуация')));
  }
});
test('Q5 legacy root-v1 saves, no branch, malformed extension, two contracts and finances survive',()=>{
  for(const career of CAREER_CATALOG){
    const {root}=family(career.id);
    root.careerSystem=hireCareer(root.careerSystem,'mira',career.id,480);
    // hireCareer replaces the career system; never keep a stale contract reference.
    const contract=root.careerSystem.byResident.alex;
    contract.level=4;contract.rankShifts=8;contract.performance=91;
    delete contract.specialization;delete contract.seniorProofs;
    delete root.careerSystem.professionalGoals;
    const old=copy(root),saved=loadHousehold(old);
    const initial=JSON.stringify(saved);
    const map=careerMapView(saved,'alex'),other=careerMapView(saved,'mira');
    assert.equal(map.all.length,11);assert.equal(other.all.length,11);
    assert.equal(map.tracks.every(t=>t.nodes[0].canChoose),
      specializationReadiness(saved,'alex').canSwitch,
      'map cannot offer switching while the canonical work guard blocks it');
    assert.equal(JSON.stringify(saved),initial);
    assert.equal(saved.version,1);assert.equal(saved.shop.credits,old.shop.credits);
    assert.equal(saved.careerSystem.byResident.alex.level,4);
    assert.equal(saved.careerSystem.byResident.mira.level,0);
    contract.specialization={schema:999,id:'invalid'};
    const dirty=loadHousehold(copy(root));
    assert.equal(careerMapView(dirty,'alex').tracks.length,2);
    assert.equal(dirty.careerSystem.byResident.alex.level,4);
  }
  assert.equal(careerMapView(newHousehold('2026-11-16'),'alex'),null);
  assert.equal(careerMapView(newHousehold('2026-11-16'),'evil'),null);
});
test('Q5 alternative track stays visible and uses existing guarded switching with no salary receipt',()=>{
  const {root,contract}=family('city-services');
  contract.level=4;contract.rankShifts=10;contract.workedShifts=20;contract.performance=100;
  assert.equal(chooseCareerSpecialization(root,'alex','logistics').ok,true);
  contract.level=6;contract.workedShifts+=2;
  contract.seniorProofs=resetSeniorProof(contract,root.minutes);
  const money=root.shop.credits,employmentId=contract.employmentId;
  const map=careerMapView(root,'alex');
  const alternative=map.tracks.find(x=>x.id==='infrastructure');
  assert.equal(alternative.nodes[0].canChoose,true);
  assert.equal(alternative.nodes[1].status,'locked');
  assert.equal(chooseCareerSpecialization(root,'alex','infrastructure').ok,true);
  assert.equal(root.shop.credits,money);
  assert.equal(contract.employmentId,employmentId);
  assert.equal(contract.level,6);
  assert.equal(careerMapView(root,'alex').tracks.find(t=>t.id==='infrastructure').nodes[1].status,'current');
  contract.currentShift={phase:'pending'};
  assert.equal(chooseCareerSpecialization(root,'alex','logistics').ok,false);
});
