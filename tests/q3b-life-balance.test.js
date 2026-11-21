import test from 'node:test';
import assert from 'node:assert/strict';
import {NEED_DECAY_PER_MINUTE,SLEEP_MIN_MINUTES,SLEEP_MAX_MINUTES,SLEEP_WAKE_ENERGY,
  SELF_CARE_REPEAT_COOLDOWN_MINUTES} from '../src/need-balance.js';
import {ACTIONS,newGame,loadGame,chooseAction,arrive,tick,autonomousChoice} from '../src/simulation.js';
import {newHousehold,loadHousehold,tickHousehold,chooseResidentAction} from '../src/household.js';
import {socialNeedDecayRate} from '../src/social-need.js';
import {effectiveSleepSpeed} from '../src/sleep-acceleration.js';
import {hireCareer} from '../src/career-state.js';
import {progressCareerWork,arriveCareerPortal} from '../src/career-work.js';

const close=(a,b,epsilon=1e-5)=>assert.ok(Math.abs(a-b)<=epsilon, `${a} vs ${b}`);
const copy=x=>JSON.parse(JSON.stringify(x));
test('Q3b/R2 effective need rates, fresh household only, personality social spread',()=>{
  assert.deepEqual(NEED_DECAY_PER_MINUTE,
    {hunger:.023,energy:.028,hygiene:.020,fun:.026,bladder:.030,social:.016});
  const h=newHousehold();
  assert.deepEqual(h.needs,{hunger:82,energy:85,hygiene:80,fun:76,social:78,bladder:82});
  assert.deepEqual(h.otherSim.needs,{hunger:82,energy:88,hygiene:80,fun:78,social:76,bladder:82});
  close(socialNeedDecayRate(h.personality),NEED_DECAY_PER_MINUTE.social);
  close(socialNeedDecayRate(h.otherSim.personality),NEED_DECAY_PER_MINUTE.social+.0024);
  const old=copy(h);old.needs.energy=9;old.otherSim.needs.hunger=3;
  const restored=loadHousehold(old);
  assert.equal(restored.needs.energy,9);
  assert.equal(restored.otherSim.needs.hunger,3);
  assert.equal(restored.version,1);
});
test('Q3b 7-hour minimum sleep, 92-point wake, 9-hour cap and no decay while asleep',()=>{
  assert.equal(ACTIONS.bed.duration,SLEEP_MAX_MINUTES);
  assert.equal(SLEEP_MIN_MINUTES,420);assert.equal(SLEEP_WAKE_ENERGY,92);
  let s=newGame();s.needs.energy=78;chooseAction(s,'bed');arrive(s);
  tick(s,400);assert.equal(s.action?.id,'bed');assert.equal(s.action.elapsed,400);
  assert.equal(s.needs.energy,100,'sleep gains 40.8 without a simultaneous energy drain');
  tick(s,20);assert.equal(s.action,null);assert.equal(s.needs.energy,100);
  s=newGame();s.needs.energy=0;chooseAction(s,'bed');arrive(s);
  tick(s,420);assert.equal(s.action?.id,'bed');
  close(s.needs.energy,42.84);
  tick(s,120);assert.equal(s.action,null);close(s.needs.energy,55.08);
});
test('Q3b oversized tick and 1-minute chunks agree across natural wake',()=>{
  const a=newGame();a.needs.energy=57;chooseAction(a,'bed');arrive(a);
  const b=loadGame(copy(a));
  tick(a,480);
  for(let i=0;i<480;i++)tick(b,1);
  for(const key of Object.keys(a.needs))close(a.needs[key],b.needs[key]);
  assert.equal(a.action,null);assert.equal(b.action,null);
});
test('Q3b player pause and interrupted/reloaded sleep never grant retroactive energy',()=>{
  const s=newGame();s.needs.energy=18;chooseAction(s,'bed');arrive(s);tick(s,90);
  const stored=copy(s);const loaded=loadGame(stored);
  close(loaded.needs.energy,s.needs.energy);
  assert.equal(loaded.action.elapsed,90);
  loaded.paused=true;tick(loaded,400);close(loaded.needs.energy,s.needs.energy);
  assert.equal(loaded.action.elapsed,90);
  loaded.paused=false;tick(loaded,10);
  close(loaded.needs.energy,s.needs.energy+1.02);
});
test('Q3b clamp-at-100 sleep is chunk invariant, including awake remainder',()=>{
  const a=newGame();a.needs.energy=78;chooseAction(a,'bed');arrive(a);
  const b=loadGame(copy(a));
  tick(a,480);for(let i=0;i<480;i++)tick(b,1);
  close(a.needs.energy,100-60*NEED_DECAY_PER_MINUTE.energy,1e-4);
  close(a.needs.energy,b.needs.energy,1e-4);
  assert.equal(a.action,null);assert.equal(b.action,null);
});
test('Q3b 180-minute repeat protection permits true emergency and blocks green wish',()=>{
  assert.equal(SELF_CARE_REPEAT_COOLDOWN_MINUTES,180);
  const s=newGame();s.minutes=850;s.needs.fun=70;
  s.mind.wish={id:'sofa',since:800,until:1100};
  s.mind.memories=[{id:'sofa',at:830,fulfilled:true}];
  assert.notEqual(autonomousChoice(s),'sofa');
  s.needs.fun=18;
  assert.equal(autonomousChoice(s),'sofa');
});
test('Q3b safe fast-forward requires two real sleepers and no work conflict or queue',()=>{
  const h=newHousehold('2026-11-16');
  h.speed=1;
  assert.equal(effectiveSleepSpeed(h),1);
  assert.ok(chooseResidentAction(h,'bed',false,'alex'));
  assert.ok(chooseResidentAction(h,'bed',false,'mira'));
  assert.equal(effectiveSleepSpeed(h),1,'walking is not sleeping');
  arrive(h);arrive(h.otherSim);
  assert.equal(effectiveSleepSpeed(h),3);
  assert.equal(h.speed,1,'never overwrite saved player speed');
  assert.equal(effectiveSleepSpeed(h,{blocked:true}),1);
  h.socialAction={kind:'talk'};assert.equal(effectiveSleepSpeed(h),1);
  h.socialAction=null;
  h.actionQueues.byResident.alex=[{type:'object',actionId:'fridge'}];
  assert.equal(effectiveSleepSpeed(h),1,'manual queue must stop auto boost');
  h.actionQueues.byResident.alex=[];
  h.careerSystem=hireCareer(h.careerSystem,'alex','editorial',h.minutes);
  h.minutes=9*60-30;h.otherSim.minutes=h.minutes;
  assert.equal(effectiveSleepSpeed(h),1,'near upcoming shift must stop boost');
});
test('Q3b work meal, WC, energy and non-duplicated shift accounting',()=>{
  const h=newHousehold('2026-11-16');
  h.careerSystem=hireCareer(h.careerSystem,'alex','editorial',h.minutes);
  h.minutes=540;h.otherSim.minutes=540;
  progressCareerWork(h,539,540);
  assert.equal(arriveCareerPortal(h,'alex',540),true);
  h.needs.hunger=50;h.needs.bladder=36;h.needs.energy=70;
  tickHousehold(h,480);
  assert.equal(h.careerSystem.byResident.alex.lastShift.workReport.meal,true);
  assert.ok(h.careerSystem.byResident.alex.lastShift.workReport.toilet>0);
  assert.ok(h.needs.energy<48,'new work fatigue applied');
  const before=h.needs.energy;tickHousehold(h,10);
  close(h.needs.energy,before);
});
test('Q3b 24-hour, seven-day, 30-day no-care baseline is bounded and deterministic',()=>{
  for(const days of [1,7,30]){
    const h=newHousehold();h.autonomy.enabled=false;
    for(let n=0;n<days*24;n++)tickHousehold(h,60);
    assert.equal(h.minutes,480+days*1440);
    for(const actor of [h,h.otherSim]){
      for(const value of Object.values(actor.needs))
        assert.ok(Number.isFinite(value)&&value>=0&&value<=100);
    }
  }
});
