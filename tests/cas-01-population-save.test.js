import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SAVE_KEY,newGame} from '../src/simulation.js';
import {newHousehold,loadHousehold,getActor,tickHousehold} from '../src/household.js';
import {PopulationSaveError,restorePopulation,savedPopulationMembership,
  proposePopulationSave,commitPopulationSave} from '../src/resident-population.js';

const clone=x=>JSON.parse(JSON.stringify(x));
const extra=(id,firstName,energy)=>{
  const actor=newGame();
  actor.needs.energy=energy;
  actor.personality.name=firstName;
  return {id,identity:{firstName,lastName:'Ладный',lifeStage:'adult'},actor};
};
const fixture=()=>({
  schema:1,nextResidentSerial:5,
  residentsById:{
    resident_3:extra('resident_3','Вера',24),
    resident_4:extra('resident_4','Игорь',83)
  },
  linksByResident:{
    alex:{familyId:'family_1',dwellingId:'dwelling_1'},
    mira:{familyId:'family_2',dwellingId:'dwelling_1'},
    resident_3:{familyId:'family_1',dwellingId:'dwelling_1'},
    resident_4:{familyId:'family_1',dwellingId:'dwelling_2'}
  },
  kinship:[{fromId:'alex',toId:'resident_3',type:'parent'}]
});

test('CAS-01.3 old one-person and advanced two-person saves never acquire phantom population',()=>{
  const one=newGame();one.minutes=770;one.needs.energy=23;
  const legacy=loadHousehold(clone(one));
  assert.equal(legacy.minutes,770);
  assert.equal(legacy.needs.energy,23);
  assert.equal(Object.hasOwn(legacy,'population'),false);
  assert.equal(legacy.otherSim.version,1);
  const current=newHousehold();
  current.shop.credits=143;
  current.needs.hunger=17;
  current.otherSim.needs.energy=28;
  current.relationship.affinity=72;
  const original=clone(current);
  const recovered=loadHousehold(original);
  assert.equal(recovered.shop.credits,143);
  assert.equal(recovered.needs.hunger,17);
  assert.equal(recovered.otherSim.needs.energy,28);
  assert.equal(recovered.relationship.affinity,72);
  assert.equal(Object.hasOwn(recovered,'population'),false);
  assert.deepEqual(original,clone(current));
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
});

test('CAS-01.3 optional population roundtrip preserves extra actors and independent membership, not live simulation',()=>{
  const state=newHousehold();
  state.shop.credits=189;
  state.otherSim.needs.energy=39;
  state.population=fixture();
  const raw=clone(state);
  const recovered=loadHousehold(raw);
  const again=loadHousehold(clone(recovered));
  assert.equal(recovered.version,1);
  assert.deepEqual(recovered.population,raw.population);
  assert.deepEqual(again.population,raw.population);
  assert.equal(recovered.population.residentsById.resident_3.actor.needs.energy,24);
  assert.equal(recovered.population.residentsById.resident_4.actor.needs.energy,83);
  assert.equal(recovered.population.nextResidentSerial,5);
  assert.equal(recovered.shop.credits,189);
  assert.equal(recovered.otherSim.needs.energy,39);
  const populationBeforeTick=JSON.stringify(recovered.population);
  const clockBeforeTick=recovered.minutes;
  tickHousehold(recovered,0.25);
  assert.equal(recovered.minutes,clockBeforeTick+0.25);
  assert.equal(JSON.stringify(recovered.population),populationBeforeTick,
    'regular 2-person tick preserves detached saved records byte-for-byte');
  assert.equal(getActor(recovered,'resident_3'),null,'CAS-01.3 does not spawn gameplay actors');
  const m=savedPopulationMembership(recovered);
  assert.deepEqual(m.getDwellingResidents('dwelling_1'),['alex','mira','resident_3']);
  assert.deepEqual(m.getFamilyResidents('family_1'),['alex','resident_3','resident_4']);
  assert.equal(m.kinshipBetween('alex','mira'),null);
  assert.equal(m.kinshipBetween('alex','resident_3'),'parent');
  assert.equal(m.kinshipBetween('resident_4','resident_3'),null);
  recovered.population.residentsById.resident_3.actor.needs.energy=10;
  assert.equal(raw.population.residentsById.resident_3.actor.needs.energy,24,'no alias');
});

test('CAS-01.3 damaged, oversubscribed or incompatible population refuses restoration',()=>{
  const base=newHousehold(),valid=fixture();
  const invalids=[
    {...valid,schema:2},
    {...valid,nextResidentSerial:4},
    {...valid,kinship:[{fromId:'alex',toId:'ghost',type:'parent'}]},
    {...valid,residentsById:{...valid.residentsById,resident_5:extra('resident_5','Тим',22)}},
    {...valid,residentsById:{resident_3:{...valid.residentsById.resident_3,id:'alex'}}},
    {...valid,linksByResident:{alex:{familyId:'family_1',dwellingId:'dwelling_1'}}},
    {...valid,residentsById:{resident_3:{...valid.residentsById.resident_3,
      actor:{...valid.residentsById.resident_3.actor,shop:{credits:999999}}}}},
    {...valid,residentsById:{resident_3:{...valid.residentsById.resident_3,
      actor:{...valid.residentsById.resident_3.actor,needs:{energy:10}}}}},
    {...valid,residentsById:{resident_3:{...valid.residentsById.resident_3,
      actor:{...valid.residentsById.resident_3.actor,action:{id:'move'}}}}},
    {...valid,unknownFutureField:7},
    null,
    {}
  ];
  for(const population of invalids){
    assert.throws(()=>loadHousehold({...clone(base),population}),PopulationSaveError);
  }
  assert.equal(Object.hasOwn(base,'population'),false);
  assert.throws(()=>restorePopulation({...valid,nextResidentSerial:NaN}),PopulationSaveError);
});

test('CAS-01.3 proposal commits one full-v1 snapshot, with quota failure rollback and stale-state check',()=>{
  const root=newHousehold();
  root.shop.credits=271;
  root.otherSim.needs.hunger=44;
  const original=JSON.stringify(root),population=fixture();
  const proposal=proposePopulationSave(root,population,loadHousehold);
  assert.equal(proposal.ok,true,proposal.reason);
  assert.equal(JSON.stringify(root),original,'proposal never mutates active state');
  let stored=original,writes=0;
  const unavailable=commitPopulationSave(root,proposal,()=>{
    writes++;throw new Error('QuotaExceededError');
  });
  assert.deepEqual(unavailable,{ok:false,reason:'storage-failed'});
  assert.equal(writes,1);
  assert.equal(stored,original);
  assert.equal(JSON.stringify(root),original);
  root.minutes++;
  const stale=commitPopulationSave(root,proposal,()=>{writes++;return true;});
  assert.deepEqual(stale,{ok:false,reason:'stale-state'});
  assert.equal(writes,1);
  root.minutes--;
  const success=commitPopulationSave(root,proposal,text=>{
    writes++;stored=text;
  });
  assert.equal(success.ok,true);
  assert.equal(writes,2,'one atomic setItem for successful proposal');
  assert.equal(JSON.stringify(root),original,'caller swaps root only after commit success');
  const reloaded=loadHousehold(JSON.parse(stored));
  assert.equal(reloaded.shop.credits,271);
  assert.equal(reloaded.otherSim.needs.hunger,44);
  assert.deepEqual(reloaded.population,population);
  assert.equal(success.root.population.residentsById.resident_4.actor.needs.energy,83);
});

test('CAS-01.3 invalid proposal never writes, null storage return is not an acknowledgement failure',()=>{
  const root=newHousehold(),pop=fixture();
  pop.kinship=[{fromId:'ghost',toId:'alex',type:'parent'}];
  const invalid=proposePopulationSave(root,pop,loadHousehold);
  assert.equal(invalid.ok,false);
  let called=0;
  const result=commitPopulationSave(root,invalid,()=>{called++;});
  assert.deepEqual(result,{ok:false,reason:'invalid-proposal'});
  assert.equal(called,0);
  const valid=proposePopulationSave(root,fixture(),loadHousehold);
  assert.equal(valid.ok,true);
  assert.deepEqual(commitPopulationSave(root,valid,()=>false),
    {ok:false,reason:'storage-failed'});
});

test('CAS-01.3 game boot/write paths are fail-closed on load errors',()=>{
  const source=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  assert.match(source,/let saveStorageLocked=false/);
  assert.match(source,/catch \{\s*saveStorageLocked=true;\s*game=newHousehold/);
  assert.match(source,/const canWriteGameSave=\(\)=>bootReadyToSave&&!saveStorageLocked/);
  assert.match(source,/if\(!canWriteGameSave\(\)\)/);
  const writes=[...source.matchAll(/localStorage\.setItem\(SAVE_KEY,/g)];
  assert.equal(writes.length,4,'update guard test if any new save writer is added');
  assert.equal((source.match(/if\(!canWriteGameSave\(\)\)/g)||[]).length,4,
    'manual, pool, undo writers all must be locked');
});
