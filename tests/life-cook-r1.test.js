/** COOK-R1: skill quality belongs to an actual saved batch; pantry is the
 * only ingredient source and FOOD-R1 keeps its own prices/deliveries. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newKitchen,restoreKitchen,KITCHEN_RECIPES,KITCHEN_QUALITIES,
  KITCHEN_PREPARED_LIMIT,canCookRecipe,finishKitchenRecipe,
  preparedKitchenMeals,takeKitchenServing,takeKitchenServingDetails,
  cookingQuality,kitchenServingMultiplier,kitchenSummary} from '../src/kitchen.js';
import {quoteCookingRecipe,quoteKitchenRestock,proposeKitchenRestock} from '../src/kitchen-market.js';
import {HOBBY_SKILLS} from '../src/hobby-reading.js';
import {currentSkillLevel} from '../src/skills-engine.js';
import {newHousehold,loadHousehold,chooseResidentAction,tickHousehold} from '../src/household.js';
import {ACTIONS,arrive,SAVE_KEY} from '../src/simulation.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {diningSeatApproach} from '../src/dining.js';
import {READY_MEAL_IDS,readyMeal} from '../src/ready-meal-catalog.js';
import {quoteReadyMeal,proposeReadyMealPurchase,settleReadyMealDeliveries} from '../src/ready-food.js';

const kitchenFurniture=[
  {instanceId:'cook-prep-1',prefabId:'prep',itemDefinitionId:'prep.oak',
    x:9.2,z:1.5,yaw:0,location:'home'},
  {instanceId:'cook-stove-1',prefabId:'stove',itemDefinitionId:'stove.copper',
    x:11.3,z:1.5,yaw:0,location:'home'},
  {instanceId:'cook-table-1',prefabId:'diningtable',itemDefinitionId:'diningtable.farm',
    x:6.8,z:-1.5,yaw:0,location:'home'},
  {instanceId:'cook-chair-1',prefabId:'chair',itemDefinitionId:'chair.loft',
    x:6.8,z:.75,yaw:0,location:'home'}
];
function home(){
  const h=newHousehold();
  h.autonomy.enabled=false;h.otherSim.autonomy.enabled=false;
  h.world.furniture.instances.push(...structuredClone(kitchenFurniture));
  return h;
}
function commit(h,tx){
  assert.equal(tx.ok,true,tx.reason);
  h.kitchen=tx.kitchen;h.shop=tx.shop;h.financialHistory=tx.financialHistory;
}
test('COOK-R1: original five stable recipes + four real skill-gated new dishes',()=>{
  const ids=Object.keys(KITCHEN_RECIPES);
  assert.equal(ids.length,9);
  for(const id of ['cook.soup','cook.herb-soup','cook.pancakes','cook.pasta',
    'cook.gratin'])assert.ok(ids.includes(id),'legacy recipe '+id);
  const gate={ 'cook.grain-bowl':1,'cook.herb-noodles':3,
    'cook.roast-tray':5,'cook.festival-pie':7};
  for(const [id,level] of Object.entries(gate)){
    const recipe=KITCHEN_RECIPES[id];
    assert.equal(recipe.minLevel,level);
    assert.equal(canCookRecipe(newKitchen(),id,level-1),false);
    assert.equal(HOBBY_SKILLS.skills.cooking.unlocks.some(
      u=>u.id===id&&u.minLevel===level),true);
    const k=newKitchen();k.pantry.herbs=8;
    assert.equal(canCookRecipe(k,id,level),true);
    assert.ok(recipe.cookMinutes>=23&&recipe.portions>=3);
    assert.ok(recipe.hungerFactor>1);
  }
  assert.equal(canCookRecipe(newKitchen(),READY_MEAL_IDS[0],10),false);
});
test('COOK-R1: ingredient quote uses SAME 15/5 restock unit, not a cooking debit',()=>{
  const h=home();
  assert.equal(quoteCookingRecipe('ready.sunny-grains'),null);
  assert.equal(quoteCookingRecipe('cook.soup').creditsEquivalent,6);
  const q=quoteCookingRecipe('cook.herb-noodles');
  assert.deepEqual(q.items.map(x=>[x.id,x.quantity]),
    [['grains',3],['dairy',1],['herbs',1]]);
  assert.equal(q.creditsEquivalent,12);
  assert.equal(q.perServing,4);
  const pantry=structuredClone(h.kitchen.pantry);
  const credits=h.shop.credits,ledger=h.financialHistory.entries.length;
  assert.equal(finishKitchenRecipe(h.kitchen,'cook.soup',0),true);
  assert.equal(h.kitchen.pantry.vegetables,pantry.vegetables-2);
  assert.equal(h.shop.credits,credits);
  assert.equal(h.financialHistory.entries.length,ledger);
  // Only buying pantry staples uses the existing canonical financial ledger.
  const price=quoteKitchenRestock(h,'vegetables');
  assert.equal(price.price,15);
  commit(h,proposeKitchenRestock(h,'vegetables','alex'));
  assert.equal(h.shop.credits,credits-15);
  assert.equal(h.financialHistory.entries.length,ledger+1);
  assert.equal(finishKitchenRecipe(h.kitchen,'cook.pancakes',0),true);
  assert.equal(h.financialHistory.entries.length,ledger+1,
    'cooking cannot debit a second time');
});
test('COOK-R1: known quality tiers are fixed and improve hunger only for home food',()=>{
  assert.deepEqual(Object.keys(KITCHEN_QUALITIES),
    ['normal','good','excellent','chef']);
  for(const [level,tier] of [[0,'normal'],[2,'normal'],[3,'good'],
    [5,'good'],[6,'excellent'],[8,'excellent'],[9,'chef'],[10,'chef']]){
    assert.equal(cookingQuality(level).id,tier);
  }
  assert.equal(kitchenServingMultiplier('cook.soup','excellent'),1.16);
  assert.equal(kitchenServingMultiplier('ready.gold-roast','chef'),1);
  assert.equal(kitchenServingMultiplier('cook.soup','unknown'),1);
  assert.equal(kitchenServingMultiplier('cook.soup',null),1);
});
test('COOK-R1: same recipe stores independent quality batches, not duplicated ingredients',()=>{
  const k=newKitchen();
  assert.ok(finishKitchenRecipe(k,'cook.soup',0));
  assert.ok(finishKitchenRecipe(k,'cook.soup',6));
  assert.deepEqual(k.prepared,[
    {recipeId:'cook.soup',portions:3},
    {recipeId:'cook.soup',portions:3,quality:'excellent'}
  ]);
  assert.equal(k.pantry.vegetables,4);
  assert.equal(preparedKitchenMeals(k).length,1,'fridge picker remains per recipe');
  assert.equal(preparedKitchenMeals(k)[0].portions,6);
  const restored=restoreKitchen(structuredClone(k));
  assert.deepEqual(restored.prepared,k.prepared);
  assert.deepEqual(takeKitchenServingDetails(restored,'cook.soup'),
    {recipeId:'cook.soup',quality:'normal'});
  assert.equal(takeKitchenServing(restored,'cook.soup'),'cook.soup');
  assert.equal(takeKitchenServingDetails(restored,'cook.soup').quality,'normal');
  assert.equal(takeKitchenServingDetails(restored,'cook.soup').quality,'excellent');
  assert.equal(kitchenSummary(restored).prepared,2);
});
test('COOK-R1: malformed quality cannot boost bought/legacy stock, root v1 unchanged',()=>{
  const h=home();
  h.kitchen.prepared=[
    {recipeId:'ready.gold-roast',portions:1,quality:'chef'},
    {recipeId:'cook.soup',portions:1,quality:'hacked'},
    {recipeId:'cook.soup',portions:2,quality:'good'}
  ];
  h.kitchen.deliveries=[{id:'ready-order-9',recipeId:READY_MEAL_IDS[0],
    orderedAt:100,dueAt:118}];
  const loaded=loadHousehold(structuredClone(h));
  assert.equal(loaded.version,1);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.deepEqual(loaded.kitchen.prepared,[
    {recipeId:'ready.gold-roast',portions:1},
    {recipeId:'cook.soup',portions:1},
    {recipeId:'cook.soup',portions:2,quality:'good'}
  ]);
  assert.deepEqual(loaded.kitchen.deliveries,h.kitchen.deliveries);
});
test('COOK-R1: full fridge path, working stove, XP, stock and pantry, no new wallet',()=>{
  const h=home();h.needs.hunger=90;
  h.skills.xpById.cooking=HOBBY_SKILLS.skills.cooking.xpThresholds[5];
  assert.equal(currentSkillLevel(h.skills,HOBBY_SKILLS,'cooking'),6);
  const credits=h.shop.credits,ledger=h.financialHistory.entries.length;
  const recipe=KITCHEN_RECIPES['cook.roast-tray'];
  assert.ok(chooseResidentAction(h,'cook',false,'alex','cook-stove-1',
    null,null,null,null,recipe.id));
  assert.equal(h.action.cookStage,'toFridge');
  assert.equal(h.kitchen.prepared.length,0);
  h.position={...furnitureActionApproach(h.world,'fridge')};
  arrive(h);h.action.cookStage='taking';tickHousehold(h,5);
  h.position={...furnitureActionApproach(h.world,'prep','cook-prep-1')};
  arrive(h);h.action.cookStage='preparing';tickHousehold(h,8);
  h.position={...furnitureActionApproach(h.world,'cook','cook-stove-1')};
  arrive(h);h.action.cookStage='cooking';
  const xp=h.skills.xpById.cooking;
  tickHousehold(h,recipe.cookMinutes);
  assert.ok(h.skills.xpById.cooking>xp,'only actual cooking advances existing XP');
  assert.equal(h.action.cookStage,'toFridgeStore');
  assert.equal(h.kitchen.prepared.length,0,'food cannot appear before storage');
  h.position={...furnitureActionApproach(h.world,'fridge')};
  arrive(h);h.action.cookStage='storing';tickHousehold(h,6);
  assert.deepEqual(h.kitchen.prepared,
    [{recipeId:recipe.id,portions:recipe.portions,quality:'excellent'}]);
  assert.equal(h.kitchen.pantry.vegetables,5);
  assert.equal(h.kitchen.pantry.dairy,7);
  assert.equal(h.kitchen.pantry.grains,7);
  assert.equal(h.shop.credits,credits);
  assert.equal(h.financialHistory.entries.length,ledger);
  const restored=loadHousehold(structuredClone(h));
  assert.deepEqual(restored.kitchen.prepared,h.kitchen.prepared);
  assert.equal(restored.skills.xpById.cooking,h.skills.xpById.cooking);
});
test('COOK-R1: quality affects only physical seated bites and survives a mid-meal reload',()=>{
  function start(quality){
    const h=home();h.needs.hunger=18;
    h.kitchen.prepared=[{recipeId:'cook.pancakes',portions:1,
      ...(quality?{quality}:{})}];
    assert.ok(chooseResidentAction(h,'dining',false,'alex','cook-table-1',
      null,null,null,null,'cook.pancakes'));
    h.position={...furnitureActionApproach(h.world,'fridge')};
    arrive(h);h.action.diningStage='taking';tickHousehold(h,6);
    assert.equal(h.kitchen.prepared[0].portions,1,'not consumed during transit');
    const chair=diningSeatApproach(h.world,h.action.targetInstanceId,
      h.action.diningSeatInstanceId);
    h.position={...chair};arrive(h);h.action.diningStage='eating';
    const before=h.needs.hunger;
    tickHousehold(h,6);
    assert.equal(h.kitchen.prepared.length,0);
    assert.equal(h.action.cookedQuality,quality);
    const saved=loadHousehold(structuredClone(h));
    assert.equal(saved.action.cookedQuality,quality);
    tickHousehold(h,ACTIONS.dining.duration-6);
    assert.equal(h.kitchen.dirtyDishes,1);
    return {gain:saved.needs.hunger-before,restored:saved};
  }
  const basic=start(undefined),best=start('excellent');
  assert.ok(best.gain>basic.gain+0.3);
  assert.equal(basic.restored.action.cookedRecipeId,'cook.pancakes');
  assert.equal(best.restored.action.cookedQuality,'excellent');
});
test('COOK-R1: FOOD-R1 fridge/phone and home meals share slots, wallet and physical servings',()=>{
  const h=home(),before=h.shop.credits,phone=READY_MEAL_IDS[0];
  assert.equal(readyMeal(phone).fridgePrice,18);
  commit(h,proposeReadyMealPurchase(h,phone,'phone','mira'));
  assert.equal(h.financialHistory.entries.length,1);
  const cost=readyMeal(phone).deliveryPrice;
  assert.equal(h.shop.credits,before-cost);
  const k=h.kitchen;
  assert.ok(finishKitchenRecipe(k,'cook.soup',3));
  assert.equal(k.prepared[0].quality,'good');
  h.minutes+=18;
  assert.equal(settleReadyMealDeliveries(h).length,1);
  assert.equal(kitchenSummary(k).prepared,4);
  assert.equal(h.financialHistory.entries.length,1);
  const loaded=loadHousehold(structuredClone(h));
  assert.equal(loaded.kitchen.prepared.length,2);
  assert.equal(loaded.kitchen.deliveries.length,0);
  assert.equal(takeKitchenServingDetails(loaded.kitchen,phone).quality,'normal');
  assert.equal(takeKitchenServingDetails(loaded.kitchen,'cook.soup').quality,'good');
  assert.equal(loaded.shop.credits,before-cost);
  assert.equal(quoteReadyMeal(loaded,phone,'fridge').ok,true);
  assert.equal(loaded.financialHistory.entries.length,1);
  const full=newKitchen();
  full.prepared=[{recipeId:'cook.soup',portions:KITCHEN_PREPARED_LIMIT-1,
    quality:'excellent'}];
  full.deliveries=[{id:'ready-order-123',recipeId:phone,orderedAt:1,dueAt:20}];
  assert.equal(canCookRecipe(full,'cook.soup',10),false);
});
test('COOK-R1: Safari source, stable IDs and no duplicate finance plumbing',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const sim=readFileSync(new URL('../src/simulation.js',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  for(const id of Object.keys(KITCHEN_RECIPES))
    assert.match(html,new RegExp('value="'+id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'"'));
  assert.match(html,/id="cook-recipe-quote"/);
  assert.match(ui,/KITCHEN_QUALITIES\[meal.quality\]/);
  assert.match(ui,/renderCookRecipeQuote\(\)/);
  assert.match(ui,/quoteCookingRecipe\(id\)/);
  assert.match(sim,/kitchenServingMultiplier\(cooked.id,state.action.cookedQuality\)/);
  assert.match(pages,/cp src\/kitchen\.js src\/kitchen-market\.js/);
  assert.match(pages,/cp src\/ready-meal-catalog\.js src\/ready-food\.js/);
});
