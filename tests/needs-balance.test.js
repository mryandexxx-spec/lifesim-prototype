import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ACTIONS,NEEDS,PHYSICAL_NEEDS,newGame,loadGame,chooseAction,arrive,tick}
  from '../src/simulation.js';
import {newHousehold,tickHousehold} from '../src/household.js';
import {NEED_DECAY_PER_MINUTE,SOCIAL_DECAY_PERSONALITY_SPREAD,
  NEED_COMFORT_START,NEED_GREEN_BOUNDARY,NEED_MINIMUM_COMFORT_MINUTES,
  minutesUntilNeedThreshold} from '../src/need-balance.js';
import {socialNeedDecayRate} from '../src/social-need.js';
import {NEED_TONES} from '../src/mood-presentation.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<.00001,`${a} != ${b}`);
const copy=v=>JSON.parse(JSON.stringify(v));

test('balance contract has six genuine axes, one green boundary and playable comfort windows',()=>{
  assert.deepEqual([...PHYSICAL_NEEDS,'social'],NEEDS);
  assert.deepEqual(Object.keys(NEED_DECAY_PER_MINUTE).sort(),[...NEEDS].sort());
  assert.equal(NEED_COMFORT_START,90);
  assert.equal(NEED_GREEN_BOUNDARY,NEED_TONES.at(-1).min);
  assert.equal(NEED_MINIMUM_COMFORT_MINUTES,450);
  for(const id of NEEDS){
    assert.ok(NEED_DECAY_PER_MINUTE[id]>0);
    const duration=minutesUntilNeedThreshold(NEED_DECAY_PER_MINUTE[id]);
    assert.ok(duration>=NEED_MINIMUM_COMFORT_MINUTES,`${id} only ${duration} min`);
    assert.ok(duration<=1100,`${id} nearly immortal in green: ${duration} min`);
  }
  close(minutesUntilNeedThreshold(NEED_DECAY_PER_MINUTE.bladder),15/NEED_DECAY_PER_MINUTE.bladder);
  assert.ok(SOCIAL_DECAY_PERSONALITY_SPREAD>0);
  assert.equal(minutesUntilNeedThreshold(0),null);
  assert.equal(minutesUntilNeedThreshold(-1),null);
  assert.equal(minutesUntilNeedThreshold(NaN),null);
});
test('1x: 450 game minutes of ordinary free time keeps all SIX 90-point needs green',()=>{
  const house=newHousehold();
  for(const actor of [house,house.otherSim])for(const need of NEEDS)actor.needs[need]=90;
  tickHousehold(house,NEED_MINIMUM_COMFORT_MINUTES);
  for(const actor of [house,house.otherSim]){
    for(const need of NEEDS)assert.ok(actor.needs[need]>=75,
      `${need} too fast on resident ${actor===house?'alex':'mira'}: ${actor.needs[need]}`);
  }
  // The needs remain finite and eventually become actionable: no permanent
  // green freeze, rewards still require actual household events.
  tickHousehold(house,900);
  for(const actor of [house,house.otherSim]){
    assert.ok(actor.needs.bladder<57);
    assert.ok(actor.needs.hunger<66);
    assert.ok(actor.needs.hygiene<90);
  }
});
test('physical decay and sociability are deterministic over chunks, not render FPS',()=>{
  const first=newGame(),second=loadGame(copy(first));
  for(const need of NEEDS){first.needs[need]=90;second.needs[need]=90;}
  tick(first,320);
  for(let i=0;i<640;i++)tick(second,.5);
  for(const id of NEEDS)close(first.needs[id],second.needs[id]);
  close(first.minutes,second.minutes);
  for(const id of PHYSICAL_NEEDS)close(first.needs[id],90-320*NEED_DECAY_PER_MINUTE[id]);
  close(first.needs.social,90-320*socialNeedDecayRate(first.personality));
});
test('full normal-speed recovery of core actions establishes a green buffer',()=>{
  for(const [id,need,score] of [
    ['fridge','hunger',43],['bed','energy',42],
    ['shower','hygiene',40],['sofa','fun',37],['toilet','bladder',53]
  ]){
    const sim=newGame();
    for(const n of NEEDS)sim.needs[n]=85;
    sim.needs[need]=score;
    assert.ok(chooseAction(sim,id),id);
    arrive(sim);
    tick(sim,ACTIONS[id].duration);
    assert.equal(sim.action,null,id+' must complete');
    if(id==='fridge'){
      // F4F.2: a quick snack is deliberately smaller than a complete dinner.
      assert.ok(sim.needs[need]>score+10,id+' snack did not restore hunger');
      assert.ok(sim.needs[need]<75,id+' snack restored a full meal');
    }else{
      assert.ok(sim.needs[need]>=65,`${id} ended below 65 at ${sim.needs[need]}`);
      assert.ok(sim.needs[need]>score+25,id+' restored too little');
    }
  }
});
test('1x vs 3x changes clock uniformly; saving, pausing, and signed mood are compatible',()=>{
  const first=newHousehold(),fast=newHousehold();
  for(const s of [first,first.otherSim,fast,fast.otherSim])
    for(const need of NEEDS)s.needs[need]=90;
  for(let i=0;i<320;i++){
    tickHousehold(first,.30);
    tickHousehold(fast,.90);
  }
  close(fast.minutes-480,(first.minutes-480)*3);
  for(const id of PHYSICAL_NEEDS){
    const normalLoss=90-first.needs[id],fastLoss=90-fast.needs[id];
    close(fastLoss,normalLoss*3);
  }
  const frozen=copy(fast);
  fast.paused=true;tickHousehold(fast,500);
  for(const id of NEEDS)close(fast.needs[id],frozen.needs[id]);
  const loaded=loadGame(copy(first));
  assert.equal(loaded.version,1);
  assert.equal(loaded.needs.bladder,first.needs.bladder);
  assert.equal(loaded.needs.social,first.needs.social);
  assert.ok(Number.isFinite(first.mind.mood.value));
});
test('published Pages uses one pure rate table, with original animation and save pipeline',()=>{
  const scene=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const rules=readFileSync(new URL('../src/simulation.js',import.meta.url),'utf8');
  const social=readFileSync(new URL('../src/social-need.js',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(scene,/tickHousehold\(game,\.30 \* effectiveSleepSpeed\(game,/);
  assert.match(scene,/while\(accumulator>=\.10\)/);
  assert.match(rules,/NEED_DECAY_PER_MINUTE\[need\]/);
  assert.match(social,/NEED_DECAY_PER_MINUTE\.social/);
  assert.ok(workflow.includes('node --check src/need-balance.js'));
  assert.ok(workflow.includes('cp src/need-balance.js site/src/'));
  assert.equal(readFileSync(new URL('../src/simulation.js',import.meta.url),'utf8')
    .includes('lifesim.room01.v1'),true);
});
