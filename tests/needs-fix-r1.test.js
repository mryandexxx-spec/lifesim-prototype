/** NEEDS-FIX-R1: red-first reproductions and release regression scenarios.
 * All time values are canonical game minutes; no DOM or PlayCanvas mocks.
 */
import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {ACTIONS,SAVE_KEY,newGame,loadGame,chooseAction,arrive,tick} from '../src/simulation.js';
import {newHousehold,loadHousehold,chooseResidentAction,furnitureAvailable,tickHousehold} from '../src/household.js';
import {NEED_DECAY_PER_MINUTE} from '../src/need-balance.js';
import {FRIDGE_EAT_START} from '../src/fridge-interaction.js';
import {TOILET_RELIEF_START,TOILET_RELIEF_END} from '../src/toilet-interaction.js';
import {diningSeatApproach} from '../src/dining.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {kitchenServingMultiplier} from '../src/kitchen.js';
import {readyMeal} from '../src/ready-meal-catalog.js';

const clone=x=>structuredClone(x);
const near=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<=tol,`Expected ${a} ≈ ${b}`);
const sleep=(start,product=null)=>{
  const s=newGame();s.needs.energy=start;s.autonomy.enabled=false;
  assert.equal(chooseAction(s,'bed',false),true);arrive(s);
  s.action.targetInstanceId='sleep-bed-1';
  const world={furniture:{instances:[{instanceId:'sleep-bed-1',prefabId:'bed',
    itemDefinitionId:product??'legacy.bed',location:'home'}]}};
  let used=0;
  while(s.action&&used<600){tick(s,1,world);used++;}
  assert.equal(s.action,null,'natural wake must finish without requiring extra click');
  return {energy:s.needs.energy,minutes:used,state:s};
};
const meal=(recipeId,quality=null)=>{
  const s=newGame();s.needs.hunger=10;s.autonomy.enabled=false;
  chooseAction(s,'dining',false);arrive(s);
  s.action.diningStage='eating';s.action.portionTaken=true;
  s.action.cookedRecipeId=recipeId;
  if(quality)s.action.cookedQuality=quality;
  const before=s.needs.hunger;
  tick(s,ACTIONS.dining.duration);
  assert.equal(s.action,null);
  return s.needs.hunger-before;
};
const snack=()=>{
  const s=newGame();s.needs.hunger=10;s.autonomy.enabled=false;
  chooseAction(s,'fridge',false);arrive(s);
  const before=s.needs.hunger;
  tick(s,ACTIONS.fridge.duration);
  return s.needs.hunger-before;
};

test('NEEDS-FIX red: a full table portion is at least twice a completed ordinary snack',()=>{
  const baseline=snack();
  near(baseline,ACTIONS.fridge.duration*(ACTIONS.fridge.benefitPerMinute-
    NEED_DECAY_PER_MINUTE.hunger));
  assert.ok(meal('cook.soup')>baseline*2,'complete cooked serving must be visibly stronger');
  for(const id of ['ready.sunny-grains','ready.garden-wrap','ready.gold-roast'])
    assert.ok(meal(id)>baseline*2,'purchased ready food is a FULL meal: '+id);
  assert.ok(meal('cook.soup','good')>meal('cook.soup','normal'));
  assert.ok(meal('cook.soup','chef')>meal('cook.soup','excellent'));
  assert.equal(kitchenServingMultiplier('ready.gold-roast','chef'),1,
    'purchased food cannot gain cooking-only bonus');
  assert.ok(meal('cook.festival-pie','chef')<=50,
    'recipe and cooking quality may not bypass full-portion balance ceiling');
});
test('NEEDS-FIX red: no hunger credit before a verified seated portion',()=>{
  const s=newGame();s.needs.hunger=20;
  chooseAction(s,'dining',false);arrive(s);s.action.diningStage='eating';
  tick(s,10);
  near(s.needs.hunger,20-10*NEED_DECAY_PER_MINUTE.hunger);
  s.action=null;
  const old=s.needs.hunger;
  tick(s,5);assert.ok(s.needs.hunger<old);
});
test('NEEDS-FIX red: completing toilet reaches exact 100; cancellation does not',()=>{
  for(const start of [0,12,50,92]){
    const s=newGame();s.needs.bladder=start;
    chooseAction(s,'toilet');arrive(s);
    tick(s,ACTIONS.toilet.duration*TOILET_RELIEF_START);
    assert.ok(s.needs.bladder<=start,'entry is not relief');
    tick(s,ACTIONS.toilet.duration*(TOILET_RELIEF_END-TOILET_RELIEF_START));
    assert.ok(s.needs.bladder<=100);
    tick(s,ACTIONS.toilet.duration*(1-TOILET_RELIEF_END));
    assert.equal(s.needs.bladder,100,'completed physical use must finish at 100');
    assert.equal(s.action,null);
    const post=loadGame(clone(s));
    assert.equal(post.needs.bladder,100);
    tick(post,1);near(post.needs.bladder,100-NEED_DECAY_PER_MINUTE.bladder);
  }
  for(const fraction of [.2,.55,.85,.99]){
    const s=newGame();s.needs.bladder=3;
    chooseAction(s,'toilet');arrive(s);
    tick(s,ACTIONS.toilet.duration*fraction);
    s.action=null;
    const saved=loadGame(clone(s));
    assert.ok(saved.needs.bladder<100,'interrupted action cannot grant completion refill');
    near(saved.needs.bladder,s.needs.bladder);
  }
});
test('NEEDS-FIX red: ordinary bed restores low energy in an 8–9 hour night',()=>{
  for(const start of [0,10,40,80]){
    const full=sleep(start);
    assert.ok(full.minutes>=480&&full.minutes<=540,
      `initial ${start}, duration ${full.minutes}: ordinary bed must sustain a night`);
    assert.ok(full.energy>=91.95,`initial ${start}: wake tick may include <1 awake minute, energy ${full.energy}`);
  }
});
test('NEEDS-FIX red: premium canopy bed is faster, still physiological',()=>{
  for(const start of [0,10,40,80]){
    const basic=sleep(start,'bed.platform');
    const fast=sleep(start,'bed.canopy');
    assert.ok(fast.minutes>=360&&fast.minutes<=450);
    assert.ok(fast.minutes<basic.minutes,'premium bed must actually be faster');
    assert.ok(fast.energy>=91.95);
  }
});
test('NEEDS-FIX: saved mid-sleep and paused sleep never accrue off-clock energy',()=>{
  for(const start of [0,10,40,80]){
    const original=newGame();original.needs.energy=start;
    chooseAction(original,'bed');arrive(original);
    tick(original,125);
    const resumed=loadGame(clone(original));
    near(resumed.needs.energy,original.needs.energy);
    assert.equal(resumed.action.elapsed,125);
    resumed.paused=true;tick(resumed,300);
    near(resumed.needs.energy,original.needs.energy);
    resumed.paused=false;
    const reference=loadGame(clone(original));
    tick(resumed,10);tick(reference,10);
    near(resumed.needs.energy,reference.needs.energy);
  }
});
test('NEEDS-FIX: two residents share one toilet and retain strict root-v1',()=>{
  const root=newHousehold();
  root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
  root.needs.bladder=4;root.otherSim.needs.bladder=5;
  assert.equal(chooseResidentAction(root,'toilet',false,'alex'),true);
  assert.equal(furnitureAvailable(root,'toilet','mira'),false);
  assert.equal(chooseResidentAction(root,'toilet',false,'mira'),false);
  const old=loadHousehold(clone(root));
  assert.equal(old.version,1);assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(old.action?.id,'toilet');
  assert.ok(chooseResidentAction(old,'fridge',false,'mira'));
  old.paused=true;const before=old.needs.bladder;
  tickHousehold(old,5);near(old.needs.bladder,before);
  old.paused=false;
  assert.equal(old.otherSim.action.id,'fridge');
});
test('NEEDS-FIX: real kitchen portion remains consumed once after reload and late ticks',()=>{
  const h=newHousehold();
  h.autonomy.enabled=false;h.otherSim.autonomy.enabled=false;
  h.world.furniture.instances.push(
    {instanceId:'needs-table-1',prefabId:'diningtable',itemDefinitionId:'diningtable.farm',
      x:6.8,z:-1.5,yaw:0,location:'home'},
    {instanceId:'needs-chair-1',prefabId:'chair',itemDefinitionId:'chair.loft',
      x:6.8,z:.75,yaw:0,location:'home'});
  h.kitchen.prepared=[{recipeId:'cook.soup',portions:1,quality:'excellent'}];
  h.needs.hunger=10;
  assert.ok(chooseResidentAction(h,'dining',false,'alex','needs-table-1',
    null,null,null,null,'cook.soup'));
  const waiting=h.needs.hunger;
  tickHousehold(h,1);assert.ok(h.needs.hunger<waiting);
  h.position={...furnitureActionApproach(h.world,'fridge')};
  arrive(h);h.action.diningStage='taking';tickHousehold(h,6);
  assert.equal(h.kitchen.prepared[0].portions,1);
  h.position={...diningSeatApproach(h.world,h.action.targetInstanceId,
    h.action.diningSeatInstanceId)};
  arrive(h);h.action.diningStage='eating';
  tickHousehold(h,7);
  assert.equal(h.kitchen.prepared.length,0);
  const save=loadHousehold(clone(h));
  const before=save.needs.hunger;
  tickHousehold(save,4);
  assert.ok(save.needs.hunger>before);
  assert.equal(save.kitchen.prepared.length,0);
  tickHousehold(save,50);
  assert.equal(save.kitchen.prepared.length,0);
  assert.equal(save.version,1);
});

test('NEEDS-FIX: production import map invalidates older Safari needs and bed SKU cache keys',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const module of ['simulation','need-balance','furniture-products']){
    assert.match(html,new RegExp('["]\\./src/'+module+'[.]js[?]v=[^"\\n]*-needs-fix-r1["]'),
      'fresh import-map cache key required: '+module);
  }
});
