import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, loadGame, chooseAction, arrive, tick, autonomousChoice, readableTime } from '../src/simulation.js';

test('initial state is valid, with independent new instances', () => {
  const a = newGame(), b = newGame();
  a.needs.hunger = 0;
  assert.equal(b.needs.hunger, 78);
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
