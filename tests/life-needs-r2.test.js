/** NEEDS-R2: quantifiable moderation, genuine household time, save continuity.
 * No new save fields, passive refills, extra social rewards or clock changes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {ACTIONS,NEEDS,PHYSICAL_NEEDS,newGame,loadGame,tick} from '../src/simulation.js';
import {NEED_DECAY_PER_MINUTE,NEED_COMFORT_START,NEED_GREEN_BOUNDARY,
  NEED_MINIMUM_COMFORT_MINUTES,SLEEP_MIN_MINUTES,SLEEP_MAX_MINUTES,
  minutesUntilNeedThreshold} from '../src/need-balance.js';
import {creditCompletedSocialNeed,socialNeedDecayRate} from '../src/social-need.js';

const copy=x=>JSON.parse(JSON.stringify(x));
const nearly=(a,b,eps=1e-5)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const legacy=Object.freeze({hunger:.030,energy:.041,hygiene:.027,fun:.038,bladder:.037,social:.019});

test('R2 six-need moderate balance beats measured R1 without freezing consequences',()=>{
  assert.deepEqual(Object.keys(NEED_DECAY_PER_MINUTE).sort(),[...NEEDS].sort());
  assert.equal(NEED_MINIMUM_COMFORT_MINUTES,450);
  assert.equal(NEED_GREEN_BOUNDARY,75);
  assert.equal(NEED_COMFORT_START,90);
  for(const need of NEEDS){
    const rate=NEED_DECAY_PER_MINUTE[need],prior=legacy[need];
    assert.ok(rate>=prior*.65&&rate<=prior*.87,need+' needs a bounded moderate tune');
    const duration=minutesUntilNeedThreshold(rate);
    assert.ok(duration>=450&&duration<=960,need+' must need routine care');
    assert.ok(90-1440*rate<75,need+' still calls for attention after 24h no care');
  }
  assert.equal(Math.max(...Object.values(NEED_DECAY_PER_MINUTE)),NEED_DECAY_PER_MINUTE.bladder);
  assert.equal(SLEEP_MIN_MINUTES,480);
  assert.equal(SLEEP_MAX_MINUTES,540);
  assert.equal(ACTIONS.bed.duration,540);
});

test('R2: two real resident need bars stay >=75 through 450 game min, then decline',()=>{
  const root=newHousehold('2026-11-21');
  for(const resident of [root,root.otherSim])
    for(const need of NEEDS)resident.needs[need]=90;
  const base=copy(root);
  tickHousehold(root,450);
  assert.equal(root.version,base.version);
  assert.equal(root.shop.credits,base.shop.credits);
  for(const resident of [root,root.otherSim]){
    for(const need of NEEDS)
      assert.ok(resident.needs[need]>=75,need+' green after moderate window');
  }
  tickHousehold(root,990);
  for(const resident of [root,root.otherSim]){
    const below=NEEDS.filter(n=>resident.needs[n]<NEED_GREEN_BOUNDARY);
    assert.ok(below.length>=5,'cannot be immortal without care');
    for(const need of NEEDS)
      assert.ok(resident.needs[need]>=0&&resident.needs[need]<=100);
  }
});

test('R2: same game clock and proportional decay at x1/x3, not frame-dependent',()=>{
  const a=newGame(),b=loadGame(copy(a)),c=loadGame(copy(a));
  for(const sim of [a,b,c])for(const n of NEEDS)sim.needs[n]=90;
  tick(a,180);
  for(let k=0;k<600;k++)tick(b,.30);
  for(let k=0;k<600;k++)tick(c,.90);
  nearly(a.minutes,b.minutes);
  nearly(c.minutes-b.minutes,360);
  for(const need of PHYSICAL_NEEDS){
    nearly(a.needs[need],b.needs[need]);
    nearly(90-c.needs[need],3*(90-a.needs[need]));
  }
});

test('R2: loading a root-v1 household keeps money, kitchen, skills and six needs',()=>{
  const before=newHousehold('2026-11-21');
  before.needs.hunger=63.75;
  before.otherSim.needs.social=36.2;
  const serialized=copy(before);
  const restored=loadHousehold(serialized,'2026-11-21');
  assert.equal(restored.version,1);
  assert.equal(restored.needs.hunger,63.75);
  assert.equal(restored.otherSim.needs.social,36.2);
  assert.equal(restored.shop.credits,before.shop.credits);
  assert.deepEqual(restored.kitchen,before.kitchen);
  assert.deepEqual(restored.world,before.world);
  tickHousehold(restored,30);
  assert.equal(restored.version,1);
  assert.equal(restored.shop.credits,before.shop.credits);
  assert.ok(restored.needs.hunger<63.75);
});

test('R2 social still needs real positive communication, not passive regeneration',()=>{
  const house=newHousehold('2026-11-21');
  house.needs.social=70;house.otherSim.needs.social=70;
  const a=socialNeedDecayRate(house.personality);
  const b=socialNeedDecayRate(house.otherSim.personality);
  tickHousehold(house,180);
  nearly(house.needs.social,70-a*180);
  nearly(house.otherSim.needs.social,70-b*180);
  const preA=house.needs.social,preB=house.otherSim.needs.social;
  assert.equal(creditCompletedSocialNeed({alex:house,mira:house.otherSim},
    {seq:1,at:house.minutes,actorId:'alex',targetId:'mira',type:'conversation.talk'}),true);
  nearly(house.needs.social,preA+18);
  nearly(house.otherSim.needs.social,preB+18);
});
