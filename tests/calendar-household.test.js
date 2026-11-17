import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold,HOUSEHOLD_IDS,getActor} from '../src/household.js';
import {SAVE_KEY,readableTime} from '../src/simulation.js';
import {calendarAt,setCurrentCalendarDate} from '../src/calendar-core.js';

const clone=value=>JSON.parse(JSON.stringify(value));

test('W1-A.1 keeps v1 SAVE_KEY and two actual residents under one persisted calendar',()=>{
  const root=newHousehold('2026-11-17');
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(root.version,1);
  assert.equal(root.calendar.startCivilDate,'2026-11-17');
  assert.deepEqual(HOUSEHOLD_IDS,['alex','mira']);
  assert.equal(getActor(root,'alex'),root);
  assert.equal(getActor(root,'mira'),root.otherSim);
  assert.equal(root.otherSim.calendar,undefined);
  assert.equal(root.minutes,root.otherSim.minutes);
  assert.equal(readableTime(root.minutes).time,'08:00');
  assert.equal(calendarAt(root.calendar,root.minutes).iso,'2026-11-17');
});
test('W1-A.1 migrates a real old household without erasing purchased items, credits or skill state',()=>{
  const old=newHousehold('2026-11-17');
  old.minutes=1440*9+717.5;
  old.otherSim.minutes=old.minutes;
  old.shop.credits=1723;
  old.needs.hunger=32;
  old.otherSim.needs.energy=44;
  old.skills.xpById.reading=28;
  const raw=clone(old);
  delete raw.calendar;
  const snapshot={
    shop:clone(raw.shop),world:clone(raw.world),inventory:clone(raw.inventory),
    kitchen:clone(raw.kitchen),otherSim:clone(raw.otherSim),
    actionQueues:clone(raw.actionQueues),socialGraph:clone(raw.socialGraph)
  };
  const migrated=loadHousehold(raw,'2026-11-17');
  assert.equal(migrated.version,1);
  assert.equal(migrated.minutes,old.minutes);
  assert.equal(migrated.otherSim.minutes,old.minutes);
  assert.equal(migrated.shop.credits,1723);
  assert.equal(migrated.needs.hunger,32);
  assert.equal(migrated.otherSim.needs.energy,44);
  assert.equal(calendarAt(migrated.calendar,old.minutes).iso,'2026-11-17');
  assert.equal(calendarAt(migrated.calendar,old.minutes).time,'11:57');
  assert.deepEqual(migrated.shop,snapshot.shop);
  assert.deepEqual(migrated.world,snapshot.world);
  assert.deepEqual(migrated.inventory,snapshot.inventory);
  assert.deepEqual(migrated.kitchen,snapshot.kitchen);
  assert.equal(migrated.actionQueues.nextSeq,snapshot.actionQueues.nextSeq);
  assert.equal(migrated.socialGraph.schema,snapshot.socialGraph.schema);
  assert.equal(migrated.otherSim.calendar,undefined);
  const reloaded=loadHousehold(clone(migrated),'2030-02-01');
  assert.deepEqual(reloaded.calendar,migrated.calendar);
  assert.equal(reloaded.shop.credits,1723);
  assert.equal(reloaded.minutes,old.minutes);
  assert.equal(reloaded.otherSim.minutes,old.minutes);
});
test('W1-A.1 pause and one shared household tick cross midnight exactly once',()=>{
  const root=newHousehold('2024-02-28');
  root.minutes=1439.75;
  root.otherSim.minutes=1439.75;
  root.paused=true;
  tickHousehold(root,10);
  assert.equal(root.minutes,1439.75);
  assert.equal(root.otherSim.minutes,1439.75);
  assert.equal(calendarAt(root.calendar,root.minutes).iso,'2024-02-28');
  root.paused=false;
  tickHousehold(root,.25);
  assert.equal(root.minutes,1440);
  assert.equal(root.otherSim.minutes,1440);
  assert.equal(calendarAt(root.calendar,root.minutes).iso,'2024-02-29');
  assert.equal(readableTime(root.minutes).time,'00:00');
  tickHousehold(root,1440*2);
  assert.equal(root.otherSim.minutes,root.minutes);
  assert.equal(calendarAt(root.calendar,root.minutes).iso,'2024-03-02');
  assert.equal(root.shop.credits,5000);
});
test('W1-A.1 user-selected anchor survives reload and does not reset belongings or minutes',()=>{
  const root=newHousehold('2026-11-17');
  root.shop.credits=381;
  root.calendar=setCurrentCalendarDate(root.calendar,root.minutes,'2027-01-05');
  const restored=loadHousehold(clone(root),'2032-06-06');
  assert.equal(restored.calendar.anchorConfirmed,true);
  assert.equal(calendarAt(restored.calendar,restored.minutes).iso,'2027-01-05');
  assert.equal(restored.shop.credits,381);
  assert.equal(restored.minutes,480);
});
