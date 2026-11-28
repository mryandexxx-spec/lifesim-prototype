import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold,getActor} from '../src/household.js';
import {newGame,SAVE_KEY} from '../src/simulation.js';
import {createProfile} from '../src/trait-catalog.js';
import {residentIdsForSimulation} from '../src/resident-activity-runtime.js';
import {restoreCharacterLibrary,characterDirectory,proposeCharacterCreation,commitCharacterCreation,CharacterLibraryError} from '../src/character-library.js';
import {writeV1Save,readV1Save} from '../src/qsk-09-save-safety.js';
const draft=(n=1)=>({identity:{firstName:'Персонаж '+n,lastName:'',lifeStage:'adult'},
 personality:createProfile(['temperament.calm','habits.neat']),aspirationId:'career',
 appearance:{sex:'female',axes:[.13,-.7,.45],outfitId:'female_casualsuit02'}});
const clone=x=>JSON.parse(JSON.stringify(x));
function full(){
 const root=newHousehold();
 const extra=id=>({id,identity:{firstName:id,lastName:'',lifeStage:'adult'},actor:newGame()});
 root.population={schema:1,nextResidentSerial:5,residentsById:{resident_3:extra('resident_3'),resident_4:extra('resident_4')},
 linksByResident:Object.fromEntries(['alex','mira','resident_3','resident_4'].map(id=>[id,{familyId:'family_1',dwellingId:'dwelling_1'}])),kinship:[]};
 return loadHousehold(clone(root));
}
test('legacy saves keep original optional shape',()=>{
 const root=loadHousehold(clone(newHousehold()));
 assert.equal(Object.hasOwn(root,'characterLibrary'),false);
 assert.deepEqual(characterDirectory(root).ids,['alex','mira']);
});
test('full house still creates and persists 24 additional profiles without activating them',()=>{
 let root=full(),bytes=JSON.stringify(root),writes=0;
 const storage={getItem:k=>{assert.equal(k,SAVE_KEY);return bytes;},setItem:(k,v)=>{assert.equal(k,SAVE_KEY);writes++;bytes=v;}};
 const originalPopulation=JSON.stringify(root.population);
 const active=residentIdsForSimulation(root);
 assert.deepEqual(active,['alex','mira','resident_3','resident_4']);
 for(let i=0;i<24;i++){
  const proposal=proposeCharacterCreation(root,draft(i),loadHousehold);
  assert.equal(proposal.ok,true,proposal.reason);
  assert.equal(proposal.id,'resident_'+(i+5));
  assert.equal(JSON.stringify(root),proposal.base);
  const committed=commitCharacterCreation(root,proposal,s=>writeV1Save(storage,SAVE_KEY,JSON.parse(s)).ok);
  assert.equal(committed.ok,true,committed.reason);
  root=loadHousehold(readV1Save(storage,SAVE_KEY).value);
  assert.deepEqual(root.characterLibrary,proposal.root.characterLibrary);
  assert.equal(JSON.stringify(root.population),originalPopulation);
 }
 assert.equal(writes,24);assert.equal(characterDirectory(root).ids.length,28);
 const profile=characterDirectory(root).getUnassignedProfile('resident_28');
 assert.deepEqual(profile.appearance,draft(23).appearance);
 profile.identity.firstName='changed';
 assert.equal(characterDirectory(root).getUnassignedProfile('resident_28').identity.firstName,'Персонаж 23');
 const lib=JSON.stringify(root.characterLibrary);tickHousehold(root,.25);
 assert.equal(JSON.stringify(root.characterLibrary),lib);
 assert.deepEqual(residentIdsForSimulation(root),active);
 assert.equal(getActor(root,'resident_28'),null);
 assert.equal(Object.hasOwn(root.actionQueues.byResident,'resident_28'),false);
 assert.equal(Object.hasOwn(root.careerSystem.byResident,'resident_28'),false);
 assert.equal(root.socialGraph.persons.includes('resident_28'),false);
});
test('invalid creation, failed quota and stale writes retain prior profiles and serial',()=>{
 let root=full(),p=proposeCharacterCreation(root,draft(),loadHousehold);
 assert.equal(p.ok,true,p.reason);let writes=0,base=JSON.stringify(root);
 assert.deepEqual(commitCharacterCreation(root,p,()=>{writes++;throw Error('quota');}),{ok:false,reason:'storage-failed'});
 assert.equal(JSON.stringify(root),base);assert.equal(writes,1);
 root.minutes++;assert.deepEqual(commitCharacterCreation(root,p,()=>{writes++;}),{ok:false,reason:'stale-state'});
 assert.equal(writes,1);root.minutes--;
 assert.equal(proposeCharacterCreation(root,draft(),loadHousehold).id,p.id);
 for(const d of [{...draft(),aspirationId:null},{...draft(),personality:{...draft().personality,traitIds:['temperament.calm','temperament.cheerful']}},{...draft(),appearance:{...draft().appearance,axes:[NaN,0,0]}},{...draft(),identity:{firstName:'<x>',lastName:'',lifeStage:'adult'}}])
  assert.equal(proposeCharacterCreation(root,d,loadHousehold).ok,false);
});
test('strict restore rejects malformed extension and active collision; respects legacy high-water',()=>{
 const root=full(),p=proposeCharacterCreation(root,draft(),loadHousehold);assert.equal(p.ok,true);
 const library=p.root.characterLibrary;
 for(const raw of [null,{}, {...library,schema:2},{...library,nextResidentSerial:5},
  {...library,profilesById:{resident_3:{...library.profilesById.resident_5,id:'resident_3'}}}])
  assert.throws(()=>loadHousehold({...clone(root),characterLibrary:raw}),CharacterLibraryError);
 const advanced={...clone(root.population),nextResidentSerial:71};
 const restored=restoreCharacterLibrary(library,advanced);
 assert.equal(restored.nextResidentSerial,71);
 assert.equal(restored.profilesById.resident_5.id,'resident_5');
});
