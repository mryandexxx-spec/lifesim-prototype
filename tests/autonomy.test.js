import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, AUTONOMY_WAIT_SECONDS, SAVE_KEY, newGame, loadGame, chooseAction, arrive, tick, autonomousChoice, setAutonomyEnabled, advanceAutonomyWait } from '../src/simulation.js';

test('autonomy is enabled by default and migrated from v0.1/v0.2/v0.3 saves', () => {
  const fresh = newGame();
  assert.equal(fresh.autonomy.enabled, true);
  assert.equal(SAVE_KEY, 'lifesim.room01.v1');
  const legacy = JSON.parse(JSON.stringify(fresh));
  delete legacy.autonomy.enabled;
  assert.equal(loadGame(legacy).autonomy.enabled, true);
  legacy.autonomy.enabled = 'false';
  assert.equal(loadGame(legacy).autonomy.enabled, true);
  legacy.autonomy.enabled = false;
  assert.equal(loadGame(legacy).autonomy.enabled, false);
});

test('manual commands still work when autonomy is switched off', () => {
  const s = newGame();
  s.minutes = 900;
  s.needs.energy = 0;
  assert.equal(setAutonomyEnabled(s,false),false);
  assert.equal(autonomousChoice(s),null);
  assert.equal(chooseAction(s,'bed',true),false);
  assert.equal(chooseAction(s,'bed'),true);
  arrive(s);
  tick(s,ACTIONS.bed.duration + 1);
  assert.equal(s.action,null);
  assert.equal(s.mind.memories.length,1);
});

test('turning off autonomy cancels ongoing automatic tasks without interrupting manual tasks', () => {
  const s = newGame();
  s.minutes=900;
  assert.equal(chooseAction(s,'fridge',true),true);
  assert.equal(setAutonomyEnabled(s,false),false);
  assert.equal(s.action,null);
  assert.equal(s.mind.memories.length,0);
  assert.equal(chooseAction(s,'sofa'),true);
  setAutonomyEnabled(s,true);
  assert.equal(s.action.id,'sofa');
  assert.equal(s.action.automatic,false);
  setAutonomyEnabled(s,false);
  assert.equal(s.action.id,'sofa');
});

test('restoring disabled autonomy never resumes an old automatic action', () => {
  const s = newGame();
  s.autonomy.enabled=false;
  s.action={ id:'shower',phase:'using',elapsed:10,automatic:true };
  const loaded=loadGame(JSON.parse(JSON.stringify(s)));
  assert.equal(loaded.autonomy.enabled,false);
  assert.equal(loaded.action,null);
  s.action.automatic=false;
  assert.equal(loadGame(JSON.parse(JSON.stringify(s))).action.id,'shower');
});

test('independent real-time wait starts at zero, pauses, resets with action/off, ignores speed x3', () => {
  const s=newGame();
  assert.equal(AUTONOMY_WAIT_SECONDS,12);
  let wait=0;
  wait=advanceAutonomyWait(wait,5,s);
  assert.equal(wait,5);
  s.speed=3;
  wait=advanceAutonomyWait(wait,6,s);
  assert.equal(wait,11);
  s.paused=true;
  wait=advanceAutonomyWait(wait,200,s);
  assert.equal(wait,11);
  s.paused=false;
  wait=advanceAutonomyWait(wait,2,s);
  assert.equal(wait,12);
  s.action={id:'fridge',phase:'walking',elapsed:0,automatic:false};
  assert.equal(advanceAutonomyWait(wait,1,s),0);
  s.action=null;
  setAutonomyEnabled(s,false);
  assert.equal(advanceAutonomyWait(3,1,s),0);
  setAutonomyEnabled(s,true);
  assert.equal(advanceAutonomyWait(0,1,s),1);
});

test('invalid elapsed durations do not bypass the safety wait', () => {
  const s=newGame();
  assert.equal(advanceAutonomyWait(NaN,Infinity,s),0);
  assert.equal(advanceAutonomyWait(-10,-4,s),0);
  assert.equal(advanceAutonomyWait(1000,0,s),12);
});
