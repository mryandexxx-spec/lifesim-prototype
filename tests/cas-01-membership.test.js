import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold} from '../src/household.js';
import {createResidentDirectory} from '../src/resident-registry.js';
import {DEFAULT_FAMILY_ID,DEFAULT_DWELLING_ID,createResidentMembership}
  from '../src/resident-membership.js';

test('CAS-01.2 legacy pair shares household and dwelling, never implied blood kinship',()=>{
  const root=newHousehold(),before=JSON.stringify(root);
  const m=createResidentMembership(['alex','mira']);
  assert.equal(m.getFamilyId('alex'),DEFAULT_FAMILY_ID);
  assert.equal(m.getDwellingId('mira'),DEFAULT_DWELLING_ID);
  assert.deepEqual(m.getFamilyResidents(DEFAULT_FAMILY_ID),['alex','mira']);
  assert.deepEqual(m.getDwellingResidents(DEFAULT_DWELLING_ID),['alex','mira']);
  assert.equal(m.kinshipBetween('alex','mira'),null);
  assert.equal(m.kinshipBetween('alex','alex'),null);
  assert.equal(m.getFamilyId('missing'),null);
  assert.equal(JSON.stringify(root),before);
  assert.deepEqual(createResidentDirectory(root).ids,['alex','mira']);
  assert.equal(Object.hasOwn(root,'population'),false);
});

test('CAS-01.2 cohabitation, family affiliation and kinship are independent',()=>{
  const ids=['alex','mira','resident_3','resident_4'];
  const links={
    alex:{familyId:'family_1',dwellingId:'dwelling_1'},
    mira:{familyId:'family_2',dwellingId:'dwelling_1'},
    resident_3:{familyId:'family_1',dwellingId:'dwelling_2'},
    resident_4:{familyId:'family_1',dwellingId:'dwelling_1'}
  };
  const original=JSON.stringify(links);
  const m=createResidentMembership(ids,links,[
    {fromId:'alex',toId:'resident_3',type:'parent'},
    {fromId:'resident_3',toId:'resident_4',type:'sibling'}
  ]);
  assert.deepEqual(m.getFamilyResidents('family_1'),['alex','resident_3','resident_4']);
  assert.deepEqual(m.getDwellingResidents('dwelling_1'),['alex','mira','resident_4']);
  assert.equal(m.kinshipBetween('alex','resident_3'),'parent');
  assert.equal(m.kinshipBetween('resident_3','alex'),'child');
  assert.equal(m.kinshipBetween('resident_4','resident_3'),'sibling');
  assert.equal(m.kinshipBetween('alex','resident_4'),null,'kinship is not inferred');
  assert.equal(m.kinshipBetween('alex','mira'),null,'sharing dwelling is not blood');
  assert.equal(JSON.stringify(links),original);
  assert.throws(()=>m.getFamilyResidents('family_1').push('ghost'),TypeError);
  assert.throws(()=>{m.linksByResident.alex.familyId='changed';},TypeError);
});

test('CAS-01.2 validates membership IDs, explicit kinship and parent cycles',()=>{
  const ids=['alex','mira','resident_3'];
  for(const [people,links,edges] of [
    [['alex','alex'],{},[]],
    [ids,{ghost:{familyId:'family_1',dwellingId:'dwelling_1'}},[]],
    [ids,{alex:{familyId:'family_1'}},[]],
    [ids,{alex:{familyId:'__proto__',dwellingId:'dwelling_1'}},[]],
    [ids,{},[{fromId:'alex',toId:'ghost',type:'parent'}]],
    [ids,{},[{fromId:'alex',toId:'alex',type:'sibling'}]],
    [ids,{},[{fromId:'alex',toId:'mira',type:'parent'},
             {fromId:'mira',toId:'alex',type:'parent'}]],
    [ids,{},[{fromId:'alex',toId:'mira',type:'sibling'},
             {fromId:'mira',toId:'alex',type:'sibling'}]],
    [ids,{},[{fromId:'alex',toId:'mira',type:'parent'},
             {fromId:'mira',toId:'resident_3',type:'parent'},
             {fromId:'resident_3',toId:'alex',type:'parent'}]]
  ])assert.throws(()=>createResidentMembership(people,links,edges),TypeError);
});
