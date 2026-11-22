import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,SAVE_KEY} from '../src/simulation.js';
import {newHousehold,loadHousehold,getActor,HOUSEHOLD_IDS} from '../src/household.js';
import {createResidentDirectory,strictLegacyActor} from '../src/resident-registry.js';

const clone=value=>JSON.parse(JSON.stringify(value));

test('CAS-01.1 strict legacy actor resolver never aliases an unknown resident to Alex',()=>{
  const root=newHousehold();
  assert.deepEqual(HOUSEHOLD_IDS,['alex','mira']);
  assert.equal(strictLegacyActor(root,'alex'),root);
  assert.equal(strictLegacyActor(root,'mira'),root.otherSim);
  for(const invalid of ['resident_3','unknown','__proto__','',null]){
    assert.equal(strictLegacyActor(root,invalid),null);
    assert.equal(getActor(root,invalid),null,'no fallback to root for '+String(invalid));
  }
  assert.equal(strictLegacyActor(root,undefined),null);
  assert.equal(getActor(root),root,'historical omitted id must still mean Alex');
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
});

test('CAS-01.1 directory preserves original actors and exposes independent proposed identities',()=>{
  const root=newHousehold();
  const actor3=newGame(),actor4=newGame();
  actor3.needs.hunger=17;actor4.needs.hunger=82;
  const before=clone(root);
  const directory=createResidentDirectory(root,[
    {id:'resident_3',actor:actor3},{id:'resident_4',actor:actor4}
  ]);
  assert.deepEqual(directory.ids,['alex','mira','resident_3','resident_4']);
  assert.equal(directory.getActor('alex'),root);
  assert.equal(directory.getActor('mira'),root.otherSim);
  assert.equal(directory.getActor('resident_3'),actor3);
  assert.equal(directory.getActor('resident_4'),actor4);
  assert.equal(directory.getActor('ghost'),null);
  actor3.needs.hunger=9;
  assert.equal(actor4.needs.hunger,82);
  assert.deepEqual(clone(root),before,'read-only directory must not mutate saved household');
  const later=createResidentDirectory(root,[{id:'resident_10',actor:newGame()}]);
  assert.deepEqual(later.ids,['alex','mira','resident_10']);
  assert.equal(Object.hasOwn(root,'population'),false,
    'extra identities here are a test seam, not live saved residents');
});

test('CAS-01.1 rejects a fifth member, reserved ID, duplicate and invalid additions',()=>{
  const root=newHousehold(),fresh=()=>newGame();
  for(const entries of [
    [{id:'resident_3',actor:fresh()},{id:'resident_4',actor:fresh()},
      {id:'resident_5',actor:fresh()}],
    [{id:'alex',actor:fresh()}],
    [{id:'mira',actor:fresh()}],
    [{id:'resident_3',actor:fresh()},{id:'resident_3',actor:fresh()}],
    [{id:'bad id',actor:fresh()}],
    [{id:'resident_03',actor:fresh()}],
    [{id:'resident_3',actor:null}],
    [{id:'resident_3',actor:{version:100}}]
  ])assert.throws(()=>createResidentDirectory(root,entries),/Invalid|duplicate|limit/);
});

test('CAS-01.1 old one-person v1 save still migrates to two named slots',()=>{
  const one=newGame();
  one.minutes=673;one.needs.energy=27;
  const restored=loadHousehold(clone(one));
  const directory=createResidentDirectory(restored);
  assert.deepEqual(directory.ids,['alex','mira']);
  assert.equal(directory.getActor('alex'),restored);
  assert.equal(directory.getActor('mira'),restored.otherSim);
  assert.equal(directory.getActor('resident_3'),null);
  assert.equal(restored.minutes,673);
  assert.equal(restored.needs.energy,27);
});
