import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,tick,ACTIONS} from '../src/simulation.js';
import {SLEEP_WAKE_ENERGY} from '../src/need-balance.js';

test('sleep completes naturally when energy reaches 100, without minimum-duration lock',()=>{
  assert.equal(SLEEP_WAKE_ENERGY,100);
  const root=newGame();
  root.needs.energy=99.8;
  root.action={id:'bed',phase:'using',elapsed:3,automatic:false};
  tick(root,5);
  assert.equal(root.action,null,'full energy must release the bed');
  assert.ok(root.needs.energy>99.8,'sleep genuinely recovered energy first');
  assert.ok(root.needs.energy<=100,'energy stays clamped');
});
test('sleep with energy exactly 100 wakes on next tick, preserving ordinary awake decay',()=>{
  const root=newGame();
  root.needs.energy=100;
  root.action={id:'bed',phase:'using',elapsed:10,automatic:false};
  tick(root,.3);
  assert.equal(root.action,null);
  assert.ok(root.needs.energy<=100);
  assert.ok(root.needs.energy>=99.9);
});
test('talking to television at 100 Fun still earns Social until physical TV conversation is done',()=>{
  const root=newGame();
  root.needs.fun=100;
  root.needs.social=11;
  root.action={id:'tv',phase:'using',elapsed:0,automatic:false,tvTalk:true};
  tick(root,1);
  assert.equal(root.action?.id,'tv','full Fun cannot terminate Social-oriented TV talk');
  assert.ok(root.needs.social>11,'Social is earned per real minute');
  assert.ok(root.needs.social<100,'no free Social refill');
  tick(root,ACTIONS.tv.duration);
  assert.equal(root.action,null,'TV conversation eventually ends at verified duration');
});
test('ordinary TV without talk still stops when Fun is full',()=>{
  const root=newGame();
  root.needs.fun=100;
  root.action={id:'tv',phase:'using',elapsed:0,automatic:false};
  tick(root,1);
  assert.equal(root.action,null);
});
test('pause and independent actor needs never mint sleep/talk reward',()=>{
  const sleeping=newGame(),talking=newGame();
  sleeping.paused=true;sleeping.needs.energy=99;
  sleeping.action={id:'bed',phase:'using',elapsed:3};
  talking.paused=true;talking.needs.fun=100;talking.needs.social=11;
  talking.action={id:'tv',phase:'using',elapsed:0,tvTalk:true};
  tick(sleeping,20);tick(talking,20);
  assert.equal(sleeping.needs.energy,99);assert.equal(sleeping.action.id,'bed');
  assert.equal(talking.needs.social,11);assert.equal(talking.action.id,'tv');
});
