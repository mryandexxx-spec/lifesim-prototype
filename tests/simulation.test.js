import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, loadGame, chooseAction, arrive, tick, autonomousChoice, readableTime } from '../src/simulation.js';

test('initial state is valid, with independent new instances', () => {
  const a = newGame(), b = newGame();
  a.needs.hunger = 0;
  assert.equal(b.needs.hunger, 82);
  assert.equal(readableTime(480).time, '08:00');
  assert.equal(readableTime(1440).day, 'День 2');
});

test('action changes selected need and finishes', () => {
  const s = newGame();
  assert.equal(chooseAction(s,'fridge'), true);
  arrive(s);
  const before = s.needs.hunger;
  tick(s,20);
  assert.ok(s.needs.hunger > before);
  tick(s,30);
  assert.equal(s.action, null);
});

test('pause freezes time and needs', () => {
  const s = newGame(); s.paused = true;
  const snapshot = JSON.stringify(s);
  tick(s,120);
  assert.equal(JSON.stringify(s), snapshot);
});

test('restoration rejects bad payloads and clamps untrusted values', () => {
  assert.equal(loadGame({version:9}).minutes, 480);
  const s = loadGame({ version:1,minutes:600,needs:{hunger:200,energy:-11},position:{x:Infinity,z:12}});
  assert.equal(s.needs.hunger,100);assert.equal(s.needs.energy,0);
  assert.equal(s.position.x,-0.25);
});

test('autonomy picks most urgent need', () => {
  const s = newGame();
  assert.equal(autonomousChoice(s),null);
  s.needs.energy=12; s.needs.hunger=22;
  assert.equal(autonomousChoice(s),'bed');
});

test('existing 0.1 save data remains readable without an autonomy field', () => {
  const old={version:1, minutes:850, needs:{hunger:31,energy:44,hygiene:81,fun:58},position:{x:3.1,z:-2.2},action:{id:'fridge',phase:'walking',elapsed:0,automatic:false}};
  const restored=loadGame(old);
  assert.equal(restored.minutes,850);
  assert.equal(restored.action.id,'fridge');
  assert.equal(restored.autonomy.nextAt,480);
  assert.equal(restored.needs.hunger,31);
});

test('nighttime behavior favours sleep before exhaustion', () => {
  const state=newGame();
  state.minutes=23*60;
  state.needs.energy=57;
  assert.equal(autonomousChoice(state),'bed');
});

test('autonomous behavior respects short breaks, but manual commands remain available', () => {
  const state=newGame();
  state.minutes=850;
  state.needs.hunger=9;
  state.autonomy.nextAt=900;
  assert.equal(autonomousChoice(state),null);
  assert.equal(chooseAction(state,'fridge',true),false);
  assert.equal(chooseAction(state,'fridge'),true);
  arrive(state);
  tick(state,30);
  assert.equal(state.action,null);
  assert.ok(state.autonomy.nextAt > state.minutes);
});
