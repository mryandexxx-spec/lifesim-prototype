import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, SAVE_KEY, newGame, arrive, tick, autonomousChoice } from '../src/simulation.js';
import { newHousehold,loadHousehold,getActor,selectResident,getActorName,
  furnitureAvailable,chooseResidentAction,setHouseholdAutonomy,tickHousehold,residentAutonomousChoice } from '../src/household.js';

test('new household contains two independent residents and a shared clock',()=>{
  const s=newHousehold();
  assert.equal(s.selectedSim,'alex');
  assert.equal(getActorName('mira'),'Мира');
  assert.equal(s.otherSim.minutes,s.minutes);
  assert.notDeepEqual(s.position,s.otherSim.position);
  s.otherSim.needs.hunger=4;
  assert.equal(s.needs.hunger,78);
  assert.equal(s.otherSim.mind.memories.length,0);
  assert.ok(s.otherSim.mind.wish);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
});

test('legacy 0.1-0.3.1 saves retain Alex action/needs/mood and autonomy preference',()=>{
  const legacy=newGame();
  legacy.minutes=925;legacy.needs.fun=24;legacy.position={x:3,z:-1.8};
  legacy.action={id:'sofa',phase:'walking',elapsed:3,automatic:false};
  legacy.mind.memories.push({id:'fridge',at:600,fulfilled:false});
  legacy.autonomy.enabled=false;
  const old=JSON.parse(JSON.stringify(legacy));
  const s=loadHousehold(old);
  assert.equal(s.version,1);
  assert.equal(s.minutes,925);
  assert.equal(s.needs.fun,24);
  assert.equal(s.position.x,3);
  assert.equal(s.action.id,'sofa');
  assert.equal(s.mind.memories.length,1);
  assert.equal(s.autonomy.enabled,false);
  assert.equal(s.otherSim.autonomy.enabled,false);
  assert.equal(s.selectedSim,'alex');
});

test('Mira has separate needs, events, desire and is saved and restored',()=>{
  const s=newHousehold();
  s.otherSim.needs.energy=13;
  assert.ok(selectResident(s,'mira'));
  assert.equal(getActor(s,s.selectedSim),s.otherSim);
  assert.equal(chooseResidentAction(s,'bed',false,'mira'),true);
  assert.equal(s.action,null);
  arrive(s.otherSim);
  tickHousehold(s,25);
  assert.ok(s.otherSim.needs.energy>13);
  assert.equal(s.needs.energy<67,true);
  const t=loadHousehold(JSON.parse(JSON.stringify(s)));
  assert.equal(t.selectedSim,'mira');
  assert.equal(t.otherSim.action.id,'bed');
  assert.equal(t.otherSim.position.x,s.otherSim.position.x);
  assert.equal(t.otherSim.needs.energy,s.otherSim.needs.energy);
});

test('both actors tick once while one global clock is advanced once',()=>{
  const s=newHousehold();
  tickHousehold(s,10);
  assert.equal(s.minutes,490);
  assert.equal(s.otherSim.minutes,490);
  assert.ok(s.needs.hunger<78);
  assert.ok(s.otherSim.needs.hunger<72);
  s.paused=true;
  const old=JSON.stringify(s);
  tickHousehold(s,60);
  assert.equal(JSON.stringify(s),old);
});

test('one interaction slot per furniture item and other items remain available',()=>{
  const s=newHousehold();
  assert.equal(chooseResidentAction(s,'fridge',false,'mira'),true);
  assert.equal(furnitureAvailable(s,'fridge','alex'),false);
  assert.equal(chooseResidentAction(s,'fridge',false,'alex'),false);
  assert.equal(chooseResidentAction(s,'sofa',false,'alex'),true);
  assert.equal(s.action.id,'sofa');
  assert.equal(s.otherSim.action.id,'fridge');
});

test('global autoplay off cancels both automatic actions, but preserves manual tasks',()=>{
  const s=newHousehold();
  s.minutes=900;
  s.otherSim.minutes=900;
  assert.equal(chooseResidentAction(s,'bed',true,'alex'),true);
  assert.equal(chooseResidentAction(s,'fridge',false,'mira'),true);
  setHouseholdAutonomy(s,false);
  assert.equal(s.action,null);
  assert.equal(s.otherSim.action.id,'fridge');
  assert.equal(residentAutonomousChoice(s,'mira'),null);
  assert.equal(chooseResidentAction(s,'shower',false,'alex'),true);
  setHouseholdAutonomy(s,true);
  assert.equal(s.action.id,'shower');
  assert.equal(s.autonomy.enabled,true);
  assert.equal(s.otherSim.autonomy.enabled,true);
});

test('invalid second resident and unknown selection recover without corrupting Alex',()=>{
  const s=newHousehold();
  s.selectedSim='alien';
  s.otherSim={version:900,needs:{hunger:'NaN'},position:{x:Infinity,z:-500}};
  const restored=loadHousehold(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.selectedSim,'alex');
  assert.equal(restored.otherSim.version,1);
  assert.ok(Number.isFinite(restored.otherSim.position.x));
  assert.equal(restored.needs.hunger,78);
  assert.equal(selectResident(restored,'unknown'),false);
});

test('old save lacking otherSim initializes Mira and the two can act independently',()=>{
  const s=loadHousehold({version:1,minutes:600,needs:{hunger:20,energy:40,hygiene:60,fun:80},position:{x:-.25,z:.35}});
  assert.ok(s.otherSim);
  assert.equal(s.needs.hunger,20);
  assert.equal(chooseResidentAction(s,'fridge',false,'alex'),true);
  assert.equal(chooseResidentAction(s,'shower',false,'mira'),true);
});
