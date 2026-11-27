import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTIONS,newGame,loadGame,tick,arrive} from '../src/simulation.js';
import {NEED_DECAY_PER_MINUTE} from '../src/need-balance.js';
import {KITCHEN_RECIPES,mealEnjoyment,kitchenSummary} from '../src/kitchen.js';
import {READY_MEAL_IDS} from '../src/ready-meal-catalog.js';
import {GRILL_RECIPES} from '../src/grill-catalog.js';
import {newHousehold,loadHousehold,chooseResidentAction,getActor,tickHousehold} from '../src/household.js';
import {proposeReadyMealPurchase} from '../src/ready-food.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {diningSeatApproach} from '../src/dining.js';
const near=(x,y)=>assert.ok(Math.abs(x-y)<1e-8,`${x} != ${y}`);
const duration=ACTIONS.dining.duration,decay=NEED_DECAY_PER_MINUTE.fun;
function meal(id,quality,portionTaken=true){
 const s=newGame();s.needs.fun=50;s.needs.hunger=20;
 s.action={id:'dining',phase:'using',elapsed:0,automatic:false,diningStage:'eating',
  diningSeatInstanceId:'food-chair-905',targetInstanceId:'food-table-904',
  portionTaken,cookedRecipeId:id,cookedQuality:quality};
 return s;
}
test('taste distinct from satiety, every real recipe covered, validated batch quality only',()=>{
 for(const id of [...Object.keys(KITCHEN_RECIPES),...Object.keys(GRILL_RECIPES),...READY_MEAL_IDS]){
  assert.ok(mealEnjoyment(id,'normal')>=4&&mealEnjoyment(id,'normal')<=8,id);
  assert.ok(mealEnjoyment(id,'chef')<=10,id);
 }
 assert.equal(mealEnjoyment('cook.soup','normal'),4);
 assert.equal(mealEnjoyment('cook.soup','chef'),7);
 assert.equal(mealEnjoyment('cook.soup','bogus'),4);
 assert.equal(mealEnjoyment('ready.gold-roast','chef'),8);
 assert.equal(mealEnjoyment('ready.sunny-grains'),4);
 assert.ok(mealEnjoyment('ready.gold-roast')>mealEnjoyment('ready.sunny-grains'));
 for(const id of [null,'','toString','unknown'])assert.equal(mealEnjoyment(id,'chef'),0);
 assert.ok(10/duration<ACTIONS.sofa.benefitPerMinute);
});
test('real seated bites earn bounded enjoyment, tick partition and saved elapsed preserve total',()=>{
 for(const [id,q] of [['cook.soup','chef'],['ready.gold-roast','chef'],['grill.steak','excellent']]){
   const full=meal(id,q),split=meal(id,q);
   tick(full,duration);
   for(let i=0;i<9;i++)tick(split,1);
   const restored=loadGame(structuredClone(split));
   assert.equal(restored.action.elapsed,9);assert.equal(restored.action.portionTaken,true);
   for(let i=9;i<duration;i++)tick(restored,1);
   near(full.needs.fun,50+mealEnjoyment(id,q)-duration*decay);
   near(restored.needs.fun,full.needs.fun);
   near(restored.needs.hunger,full.needs.hunger);
   assert.equal(full.action,null);assert.equal(restored.action,null);
   tick(restored,1);near(restored.needs.fun,full.needs.fun-decay);
 }
});
test('no enjoyment for free snack, free table meal, unconfirmed/unknown portions, walking, collection or pause',()=>{
 const states=[meal(null),meal('unknown'),meal('ready.gold-roast',null,false)];
 const walking=meal('ready.gold-roast');walking.action.phase='walking';walking.action.diningStage='toSeat';
 const taking=meal('ready.gold-roast');taking.action.diningStage='taking';
 const snack=newGame();snack.needs.fun=50;snack.action={id:'fridge',phase:'using',elapsed:0,automatic:false};
 states.push(walking,taking,snack);
 for(const s of states){tick(s,3);near(s.needs.fun,50-3*decay);}
 const paused=meal('ready.gold-roast');paused.paused=true;tick(paused,31);
 near(paused.needs.fun,50);assert.equal(paused.action.elapsed,0);
 const cancel=meal('ready.gold-roast');tick(cancel,6);
 near(cancel.needs.fun,50+8*6/duration-6*decay);
 cancel.action=null;tick(cancel,duration-6);
 near(cancel.needs.fun,50+8*6/duration-duration*decay);
});
test('Alex and Mira: paid serving, real route, exact single receipt and mid-bite household reload',()=>{
 for(const id of ['alex','mira']){
  let root=newHousehold('2026-11-26');
  root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
  root.world.furniture.instances.push(
    {instanceId:'food-table-904',prefabId:'diningtable',itemDefinitionId:'diningtable.farm',x:6.8,z:-1.5,yaw:0,location:'home'},
    {instanceId:'food-chair-905',prefabId:'chair',itemDefinitionId:'chair.loft',x:6.8,z:.75,yaw:0,location:'home'});
  const recipe='ready.gold-roast',cash=root.shop.credits,tx=proposeReadyMealPurchase(root,recipe,'fridge',id);
  assert.ok(tx.ok);Object.assign(root,{kitchen:tx.kitchen,shop:tx.shop,financialHistory:tx.financialHistory});
  let actor=getActor(root,id);actor.needs.hunger=20;actor.needs.fun=50;
  assert.ok(chooseResidentAction(root,'dining',false,id,'food-table-904',null,null,null,null,recipe));
  actor.position={...furnitureActionApproach(root.world,'fridge')};arrive(actor);actor.action.diningStage='taking';
  tickHousehold(root,5);near(actor.needs.fun,50-5*decay);
  assert.equal(kitchenSummary(root.kitchen).prepared,1);
  actor.position={...diningSeatApproach(root.world,actor.action.targetInstanceId,actor.action.diningSeatInstanceId)};
  arrive(actor);actor.action.diningStage='eating';
  const start=actor.needs.fun;tickHousehold(root,6);
  assert.equal(kitchenSummary(root.kitchen).prepared,0);
  assert.equal(actor.action.portionTaken,true);
  near(actor.needs.fun,start+8*6/duration-6*decay);
  root=loadHousehold(structuredClone(root));actor=getActor(root,id);
  assert.equal(actor.action.portionTaken,true);assert.equal(actor.action.elapsed,6);
  tickHousehold(root,duration-6);
  assert.equal(actor.action,null);near(actor.needs.fun,start+8-duration*decay);
  assert.equal(kitchenSummary(root.kitchen).prepared,0);
  assert.equal(root.shop.credits,cash-tx.price);
  assert.equal(root.financialHistory.entries.length,1);
  assert.equal(root.version,1);
 }
});
