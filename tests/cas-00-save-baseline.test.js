/**
 * CAS-00.3 baseline only: guard pre-CAS saves before changing the two-resident
 * simulation. These tests must pass without any CAS production implementation.
 * No real player data or browser storage is read.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {SAVE_KEY,newGame} from '../src/simulation.js';
import {HOUSEHOLD_IDS,newHousehold,loadHousehold,getActor,selectResident} from '../src/household.js';
import {newActionQueues,restoreActionQueues,enqueueAction,pendingActions} from '../src/action-queue.js';

const snapshot=value=>JSON.parse(JSON.stringify(value));

test('CAS-00 legacy v1: one-resident snapshot restores original progress and adds Mira only',()=>{
  const old=newGame();
  old.minutes=935;
  old.needs={...old.needs,hunger:18,energy:36,social:59};
  old.position={x:.2,z:1.2};
  old.autonomy.enabled=false;
  old.mind.memories.push({id:'fridge',at:740,fulfilled:false});
  const fixture=snapshot(old);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(fixture.version,1);
  assert.equal(Object.hasOwn(fixture,'otherSim'),false);
  const restored=loadHousehold(fixture);
  assert.equal(restored.version,1);
  assert.equal(restored.minutes,fixture.minutes);
  assert.deepEqual(restored.needs,fixture.needs);
  assert.deepEqual(restored.position,fixture.position);
  assert.equal(restored.autonomy.enabled,false);
  assert.equal(restored.mind.memories.at(-1).id,'fridge');
  assert.equal(restored.otherSim.version,1);
  assert.equal(restored.selectedSim,'alex');
  // Migrating a single-person save may not mutate the archived input fixture.
  assert.deepEqual(fixture,snapshot(old));
});

test('CAS-00 modern v1: two actors, personality, wallet and relationships survive reload',()=>{
  const active=newHousehold();
  active.shop.credits=173;
  active.needs.hunger=24;
  active.otherSim.needs.energy=31;
  active.relationship.affinity=64;
  active.personality.preferences.likes.push('drawing');
  active.otherSim.personality.preferences.likes.push('gardening');
  assert.equal(selectResident(active,'mira'),true);
  const fixture=snapshot(active);
  const recovered=loadHousehold(fixture);
  assert.equal(recovered.version,1);
  assert.deepEqual(HOUSEHOLD_IDS,['alex','mira']);
  assert.equal(recovered.shop.credits,173);
  assert.equal(recovered.needs.hunger,24);
  assert.equal(recovered.otherSim.needs.energy,31);
  assert.equal(recovered.relationship.affinity,64);
  assert.equal(recovered.selectedSim,'mira');
  assert.deepEqual(recovered.personality,active.personality);
  assert.deepEqual(recovered.otherSim.personality,active.otherSim.personality);
  assert.equal(getActor(recovered,'alex'),recovered);
  assert.equal(getActor(recovered,'mira'),recovered.otherSim);
  assert.equal(recovered.otherSim.minutes,recovered.minutes);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
});

test('CAS-00 v1: repeated restoration is financially idempotent and does not spawn actors',()=>{
  const household=newHousehold();
  household.shop.credits=209;
  const first=loadHousehold(snapshot(household));
  const second=loadHousehold(snapshot(first));
  assert.equal(second.version,1);
  assert.equal(first.shop.credits,209);
  assert.equal(second.shop.credits,209);
  assert.equal(second.selectedSim,'alex');
  assert.equal(Object.hasOwn(second,'population'),false);
  assert.equal(second.otherSim.minutes,second.minutes);
});

test('CAS-00 queue baseline: four independent generic resident IDs survive v1 queue roundtrip',()=>{
  const ids=['alex','mira','resident_3','resident_4'];
  const queues=newActionQueues(ids);
  enqueueAction(queues,'resident_3',{type:'object',actionId:'sofa'});
  enqueueAction(queues,'resident_4',{type:'object',actionId:'bed'});
  enqueueAction(queues,'alex',{type:'object',actionId:'fridge'});
  const result=restoreActionQueues(snapshot(queues),ids);
  assert.deepEqual(ids.map(id=>pendingActions(result,id).length),[1,0,1,1]);
  assert.equal(pendingActions(result,'resident_3')[0].actionId,'sofa');
  assert.equal(pendingActions(result,'resident_4')[0].actionId,'bed');
  assert.deepEqual(snapshot(result),result);
});
