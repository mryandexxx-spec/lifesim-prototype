import test from 'node:test';
import assert from 'node:assert/strict';
import {traitDraftOptions,toggleTraitDraft} from '../src/trait-picker.js';
import {listTraits,traitsConflict,validateSelection,createProfile} from '../src/trait-catalog.js';
import {newGame} from '../src/simulation.js';
import {newHousehold,loadHousehold} from '../src/household.js';
import {proposePopulationSave,commitPopulationSave,PopulationSaveError} from '../src/resident-population.js';

test('CAS trait draft uses canonical pair/triple rules for selection, removal and replacement',()=>{
  const ids=listTraits().map(x=>x.id);let checks=0;
  for(const a of ids)for(const b of ids){
    let s=toggleTraitDraft([],a);assert.deepEqual(s,[a]);
    const options=traitDraftOptions(s);assert.equal(options.length,24);
    const next=toggleTraitDraft(s,b);
    assert.deepEqual(next,a===b?[]:traitsConflict(a,b)?[a]:[a,b]);checks++;
    if(next.length!==2)continue;
    for(const c of ids){
      const three=toggleTraitDraft(next,c);
      const expected=next.includes(c)?next.filter(x=>x!==c):validateSelection([...next,c]).valid?[...next,c]:next;
      assert.deepEqual(three,expected);checks++;
      if(three.length===3){
        const full=traitDraftOptions(three);
        assert.equal(full.filter(x=>x.enabled).length,3);
        assert.deepEqual(toggleTraitDraft(three,'unknown'),three);
        const reduced=toggleTraitDraft(three,b);
        for(const d of ids){
          const result=toggleTraitDraft(reduced,d);
          assert.equal(validateSelection(result,{min:0}).valid,true);checks++;
        }
      }
    }
  }
  assert.ok(checks>100000);
  assert.throws(()=>traitDraftOptions(['habits.neat','habits.untidy']),RangeError);
  assert.throws(()=>traitDraftOptions(['habits.neat','habits.neat']),RangeError);
});
function population(profile){
  const actor=newGame();actor.personality=profile;
  if(profile===undefined)delete actor.personality;
  const id='resident_3';
  return {schema:1,nextResidentSerial:4,residentsById:{[id]:{id,identity:{firstName:'Вера',lastName:'Тест',lifeStage:'adult'},actor}},
    linksByResident:Object.fromEntries(['alex','mira',id].map(x=>[x,{familyId:'family_1',dwellingId:'dwelling_1'}])),kinship:[]};
}
test('new admission rejects invalid profiles, legacy missing profile preserved, existing character locked',()=>{
  const root=newHousehold(),snapshot=JSON.stringify(root);
  for(const traits of [['habits.neat'],['habits.neat','habits.untidy'],['habits.neat','habits.neat'],['habits.neat','unknown'],['habits.neat','pace.patient','tone.serious','novelty.curious']]){
    const pop=population({schema:1,traitIds:traits,preferences:{likes:[],dislikes:[]}});
    const result=proposePopulationSave(root,pop,loadHousehold);
    assert.equal(result.ok,false);assert.throws(()=>loadHousehold({...root,population:pop}),PopulationSaveError);
    let writes=0;assert.equal(commitPopulationSave(root,result,()=>writes++).ok,false);assert.equal(writes,0);
  }
  assert.equal(proposePopulationSave(root,population(undefined),loadHousehold).ok,false);
  const historical=loadHousehold({...root,population:population(undefined)});
  assert.equal(Object.hasOwn(historical.population.residentsById.resident_3.actor,'personality'),false);
  const profile=createProfile(['communication.direct','communication.diplomatic','tone.serious']);
  const pop=population(profile),proposal=proposePopulationSave(root,pop,loadHousehold);
  assert.equal(proposal.ok,true,proposal.reason);
  let stored;const result=commitPopulationSave(root,proposal,x=>{stored=x;});
  assert.equal(result.ok,true);assert.equal(JSON.stringify(root),snapshot);
  const restored=loadHousehold(JSON.parse(stored));
  assert.deepEqual(restored.population.residentsById.resident_3.actor.personality,profile);
  const changed=structuredClone(restored.population);changed.residentsById.resident_3.actor.personality=createProfile(['habits.neat','pace.patient']);
  assert.equal(proposePopulationSave(restored,changed,loadHousehold).reason,'existing-personality-locked');
});
