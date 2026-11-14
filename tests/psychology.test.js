import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, SAVE_KEY, newGame, loadGame, chooseAction, arrive, tick, autonomousChoice } from '../src/simulation.js';
import { WISHES, TRAITS, MEMORY_TEXT, calculateMood, restoreMind, selectWish, psychologyScore } from '../src/psychology.js';

test('mind is initialized separately for each game; wish exists and saves use v1 key', () => {
  const a=newGame(),b=newGame();
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(a.version,1);
  assert.ok(WISHES[a.mind.wish.id]);
  assert.ok(a.mind.mood.value >= 0 && a.mind.mood.value <= 100);
  a.mind.memories.push({id:'sofa',at:480,fulfilled:false});
  assert.equal(b.mind.memories.length,0);
  assert.equal(TRAITS.neat.value>0,true);
});

test('old 0.1 and 0.2 saves retain need, location, active task and obtain mind', () => {
  const before=newGame();
  delete before.mind;
  before.needs.fun=28;
  before.minutes=943;
  before.position={x:1.2,z:.5};
  before.action={id:'sofa',phase:'walking',elapsed:5,automatic:true};
  const restored=loadGame(JSON.parse(JSON.stringify(before)));
  assert.equal(restored.needs.fun,28);
  assert.equal(restored.position.x,1.2);
  assert.equal(restored.action.id,'sofa');
  assert.ok(restored.mind.wish && restored.mind.mood);
});

test('completing a desired action records one fulfilled event and changes desire', () => {
  const state=newGame();
  const id=state.mind.wish.id;
  assert.equal(chooseAction(state,id),true);
  arrive(state);
  tick(state,ACTIONS[id].duration+1);
  assert.equal(state.action,null);
  assert.equal(state.mind.memories.length,1);
  assert.equal(state.mind.memories[0].id,id);
  assert.equal(state.mind.memories[0].fulfilled,true);
  assert.notEqual(state.mind.wish.id,id);
  assert.ok(MEMORY_TEXT[id]);
  tick(state,30);
  assert.equal(state.mind.memories.length,1);
});

test('interrupted or walking actions do not add memories', () => {
  const state=newGame();
  chooseAction(state,'sofa');
  tick(state,4);
  chooseAction(state,'shower');
  assert.equal(state.mind.memories.length,0);
});

test('low needs override positive memories in emotion and urgent autonomy', () => {
  const s=newGame();
  s.minutes=780;
  s.mind.memories=[{id:'sofa',at:780,fulfilled:true}];
  s.needs.energy=7;
  s.needs.hunger=50;
  s.needs.hygiene=85;
  s.needs.fun=90;
  assert.equal(calculateMood(s.needs,s.mind,s.minutes).label,'Измотан');
  assert.equal(autonomousChoice(s),'bed');
});

test('wishes influence voluntary behavior once player exploration time has passed', () => {
  const s=newGame();
  assert.equal(autonomousChoice(s),null);
  s.minutes=570;
  s.needs={hunger:90,energy:90,hygiene:90,fun:90};
  assert.equal(autonomousChoice(s),s.mind.wish.id);
  assert.ok(psychologyScore(s,s.mind.wish.id)>0);
});

test('invalid or hostile mind payload is sanitized, bounded and never trusted for labels', () => {
  const s=newGame(); s.minutes=2000;
  const data=JSON.parse(JSON.stringify(s));
  data.mind={mood:{value:999,label:'<script>'}, wish:{id:'unsafe',since:0,until:99999999},
    memories:[{id:'unsafe',at:2000,fulfilled:true},{id:'bed',at:Infinity},{id:'bed',at:1990,fulfilled:true}, ...Array.from({length:24},(_,i)=>({id:'sofa',at:1950+i,fulfilled:i%2===0}))]};
  const restored=loadGame(data);
  assert.equal(restored.mind.memories.length,12);
  assert.ok(restored.mind.memories.every(e=>WISHES[e.id]));
  assert.notEqual(restored.mind.mood.label,'<script>');
  assert.ok(WISHES[restored.mind.wish.id]);
});

test('wishes expire and are regenerated after 480 game minutes', () => {
  const s=newGame();
  const old=s.mind.wish;
  tick(s,482);
  assert.ok(s.mind.wish.since>old.since);
  assert.ok(WISHES[s.mind.wish.id]);
});

test('saved mind restores only valid recent actions, time, and wish', () => {
  const s=newGame();
  chooseAction(s,'fridge');arrive(s);tick(s,27);
  const restored=loadGame(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.mind.memories.length,1);
  assert.equal(restored.mind.memories[0].id,'fridge');
  assert.equal(restored.mind.wish.id,s.mind.wish.id);
  assert.equal(restored.mind.memories[0].at,s.mind.memories[0].at);
});

test('pause freezes psychological state and memories', () => {
  const s=newGame(); s.paused=true;
  const before=JSON.stringify(s);
  tick(s,1000);
  assert.equal(JSON.stringify(s),before);
});
