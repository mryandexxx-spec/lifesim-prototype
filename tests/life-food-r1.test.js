import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold,chooseResidentAction,tickHousehold} from '../src/household.js';
import {newKitchen,restoreKitchen,finishKitchenRecipe,canCookRecipe,
  takeKitchenServing,preparedKitchenMeals,kitchenSummary} from '../src/kitchen.js';
import {READY_MEAL_IDS,readyMeal} from '../src/ready-meal-catalog.js';
import {quoteReadyMeal,proposeReadyMealPurchase,settleReadyMealDeliveries,
  DELIVERY_GAME_MINUTES} from '../src/ready-food.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {diningSeatApproach} from '../src/dining.js';
import {ACTIONS,arrive,SAVE_KEY} from '../src/simulation.js';

const dinnerFurniture=[
  {instanceId:'food-table-904',prefabId:'diningtable',
    itemDefinitionId:'diningtable.farm',x:6.8,z:-1.5,yaw:0,location:'home'},
  {instanceId:'food-chair-905',prefabId:'chair',
    itemDefinitionId:'chair.loft',x:6.8,z:.75,yaw:0,location:'home'},
  {instanceId:'food-prep-901',prefabId:'prep',
    itemDefinitionId:'prep.oak',x:9.2,z:1.5,yaw:0,location:'home'},
  {instanceId:'food-stove-902',prefabId:'stove',
    itemDefinitionId:'stove.copper',x:11.3,z:1.5,yaw:0,location:'home'}
];
function home(){
  const h=newHousehold();
  h.autonomy.enabled=false;h.otherSim.autonomy.enabled=false;
  h.world.furniture.instances.push(...structuredClone(dinnerFurniture));
  return h;
}
function commit(h,tx){
  assert.equal(tx.ok,true,tx.reason||'transaction should succeed');
  h.kitchen=tx.kitchen;h.shop=tx.shop;
  h.financialHistory=tx.financialHistory;
}
test('FOOD-R1: original three dishes differ in cost, remain inferior per credit to cooking',()=>{
  assert.equal(READY_MEAL_IDS.length,3);
  const names=READY_MEAL_IDS.map(id=>readyMeal(id).label);
  assert.equal(new Set(names).size,3);
  const h=home();
  for(const id of READY_MEAL_IDS){
    const m=readyMeal(id),fridge=quoteReadyMeal(h,id,'fridge');
    const phone=quoteReadyMeal(h,id,'phone');
    assert.equal(fridge.ok,true);assert.equal(phone.ok,true);
    assert.equal(fridge.price,m.fridgePrice);
    assert.equal(phone.price,m.deliveryPrice);
    assert.ok(phone.price>fridge.price);
    assert.ok(m.fridgePrice>=18);
    assert.ok(m.hungerFactor>0.9&&m.hungerFactor<1.2);
  }
  assert.equal(quoteReadyMeal(h,'cook.soup','fridge').ok,false);
  assert.equal(quoteReadyMeal(h,READY_MEAL_IDS[0],'unknown').ok,false);
  assert.equal(DELIVERY_GAME_MINUTES,18);
});
test('FOOD-R1: fridge purchase creates exactly one cooked-compatible stock and one canonical debit',()=>{
  const h=home(),id=READY_MEAL_IDS[0],before=h.shop.credits;
  const tx=proposeReadyMealPurchase(h,id,'fridge','alex');
  assert.equal(tx.ok,true);
  assert.equal(h.shop.credits,before,'proposal must never mutate current save');
  assert.equal(h.kitchen.prepared.length,0);
  commit(h,tx);
  assert.equal(h.shop.credits,before-readyMeal(id).fridgePrice);
  assert.equal(h.financialHistory.entries.length,1);
  assert.equal(h.financialHistory.entries[0].kind,'purchase');
  assert.equal(h.financialHistory.entries[0].delta,-readyMeal(id).fridgePrice);
  assert.equal(h.financialHistory.entries[0].balanceAfter,h.shop.credits);
  assert.equal(h.financialHistory.entries[0].sourceId,'ready-food.fridge.'+id);
  assert.deepEqual(h.kitchen.prepared,[{recipeId:id,portions:1}]);
  assert.equal(h.kitchen.deliveries.length,0);
  assert.equal(preparedKitchenMeals(h.kitchen)[0].label,readyMeal(id).label);
  const restored=loadHousehold(structuredClone(h));
  assert.equal(restored.version,1);assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(restored.shop.credits,h.shop.credits);
  assert.equal(restored.financialHistory.entries.length,1);
  assert.deepEqual(restored.kitchen.prepared,h.kitchen.prepared);
  assert.equal(takeKitchenServing(restored.kitchen,id),id);
  assert.equal(kitchenSummary(restored.kitchen).prepared,0);
  assert.equal(restored.financialHistory.entries.length,1,'eating cannot debit wallet again');
});
test('FOOD-R1: phone order debits once now; delivery only at due game minute, never twice',()=>{
  const h=home(),id=READY_MEAL_IDS[1],before=h.shop.credits;
  commit(h,proposeReadyMealPurchase(h,id,'phone','mira'));
  assert.equal(h.shop.credits,before-readyMeal(id).deliveryPrice);
  assert.equal(h.financialHistory.entries.length,1);
  assert.equal(h.kitchen.prepared.length,0);
  assert.equal(h.kitchen.deliveries.length,1);
  const order=h.kitchen.deliveries[0],due=order.dueAt;
  assert.equal(due,Math.floor(h.minutes)+18);
  assert.deepEqual(settleReadyMealDeliveries(h),[]);
  h.paused=true;tickHousehold(h,1000);
  assert.equal(h.minutes,order.orderedAt);
  assert.equal(h.kitchen.deliveries.length,1);
  h.paused=false;tickHousehold(h,17);
  assert.equal(h.kitchen.prepared.length,0);
  assert.equal(h.kitchen.deliveries.length,1);
  const save=loadHousehold(structuredClone(h));
  assert.deepEqual(save.kitchen.deliveries,h.kitchen.deliveries);
  save.speed=3;tickHousehold(save,1);
  assert.deepEqual(save.kitchen.prepared,[{recipeId:id,portions:1}]);
  assert.equal(save.kitchen.deliveries.length,0);
  const money=save.shop.credits,journal=save.financialHistory.entries.length;
  tickHousehold(save,5);assert.deepEqual(settleReadyMealDeliveries(save),[]);
  assert.equal(save.kitchen.prepared[0].portions,1);
  assert.equal(save.shop.credits,money);assert.equal(save.financialHistory.entries.length,journal);
  assert.equal(save.financialHistory.entries[0].sourceId,'ready-food.phone.'+id);
});
test('FOOD-R1: capacity includes in-transit reservations, no negative credit, no partial updates',()=>{
  const h=home(),id=READY_MEAL_IDS[0];
  h.shop.credits=0;
  assert.equal(quoteReadyMeal(h,id,'fridge').reason,'insufficient-credits');
  assert.equal(proposeReadyMealPurchase(h,id,'phone').ok,false);
  assert.equal(h.shop.credits,0);
  assert.equal(h.financialHistory.entries.length,0);
  h.shop.credits=500;
  h.kitchen.prepared=[{recipeId:'cook.soup',portions:12}];
  assert.equal(quoteReadyMeal(h,id,'fridge').reason,'storage-full');
  assert.equal(quoteReadyMeal(h,id,'phone').reason,'storage-full');
  assert.equal(h.financialHistory.entries.length,0);
  h.kitchen.prepared=[{recipeId:'cook.soup',portions:11}];
  commit(h,proposeReadyMealPurchase(h,id,'phone','alex'));
  assert.equal(h.kitchen.prepared[0].portions,11);
  assert.equal(h.kitchen.deliveries.length,1);
  assert.equal(quoteReadyMeal(h,id,'fridge').reason,'storage-full');
  assert.equal(canCookRecipe(h.kitchen,'cook.soup',0),false,
    'home cooking must not displace a paid pending order');
  const before=h.shop.credits;
  const reject=proposeReadyMealPurchase(h,id,'phone','alex');
  assert.equal(reject.ok,false);
  assert.equal(h.shop.credits,before);
  assert.equal(h.financialHistory.entries.length,1);
  h.world.furniture.instances.find(x=>x.prefabId==='fridge').location='storage';
  assert.equal(quoteReadyMeal(h,id,'phone').reason,'missing-fridge');
  h.minutes+=20;
  assert.equal(settleReadyMealDeliveries(h).length,0,
    'paid order must remain pending while destination is unavailable');
  assert.equal(h.kitchen.deliveries.length,1);
  h.world.furniture.instances.find(x=>x.prefabId==='fridge').location='home';
  assert.equal(settleReadyMealDeliveries(h).length,1);
  assert.equal(kitchenSummary(h.kitchen).prepared,12);
});
test('FOOD-R1: two independent paid purchases have unique receipts; settlement is replay-safe',()=>{
  const h=home(),id=READY_MEAL_IDS[2],balance=h.shop.credits;
  commit(h,proposeReadyMealPurchase(h,id,'phone','alex'));
  commit(h,proposeReadyMealPurchase(h,id,'fridge','mira'));
  assert.equal(h.financialHistory.entries.length,2);
  assert.notEqual(h.financialHistory.entries[0].id,h.financialHistory.entries[1].id);
  assert.equal(h.kitchen.prepared[0].portions,1);
  assert.equal(h.kitchen.deliveries.length,1);
  h.minutes+=18;
  assert.equal(settleReadyMealDeliveries(h).length,1);
  assert.deepEqual(settleReadyMealDeliveries(h),[]);
  assert.equal(h.kitchen.prepared[0].portions,2);
  assert.equal(h.shop.credits,balance-readyMeal(id).deliveryPrice-readyMeal(id).fridgePrice);
  assert.equal(h.financialHistory.entries.length,2);
});
test('FOOD-R1: paid meal consumed only after real fridge-to-chair A* route and seated eating',()=>{
  for(const person of ['alex','mira']){
    const h=home(),id=READY_MEAL_IDS[2],actor=person==='alex'?h:h.otherSim;
    commit(h,proposeReadyMealPurchase(h,id,'fridge',person));
    actor.needs.hunger=18;
    assert.equal(chooseResidentAction(h,'dining',false,person,'food-table-904',
      null,null,null,null,id),true);
    assert.equal(actor.action.selectedRecipeId,id);
    assert.equal(h.kitchen.prepared[0].portions,1,'no portion at enqueue');
    actor.position={...furnitureActionApproach(h.world,'fridge')};
    arrive(actor);actor.action.diningStage='taking';tickHousehold(h,6);
    assert.equal(h.kitchen.prepared[0].portions,1,'no portion before chair');
    const seat=diningSeatApproach(h.world,actor.action.targetInstanceId,
      actor.action.diningSeatInstanceId);
    assert.ok(seat);
    actor.position={...seat};arrive(actor);actor.action.diningStage='eating';
    const hunger=actor.needs.hunger,balance=h.shop.credits;
    tickHousehold(h,6);
    assert.equal(kitchenSummary(h.kitchen).prepared,0,'one real portion consumed');
    assert.equal(actor.action.cookedRecipeId,id);
    assert.ok(actor.needs.hunger>hunger,'ready food applies hunger factor');
    assert.equal(h.shop.credits,balance,'physical meal must not charge twice');
    tickHousehold(h,ACTIONS.dining.duration-6);
    assert.equal(actor.action,null);
    assert.equal(h.kitchen.dirtyDishes,1);
    assert.equal(h.financialHistory.entries.length,1);
  }
});
test('FOOD-R1: old root v1, legacy homemade food and cooking keep their contracts',()=>{
  const old=loadHousehold({version:1,minutes:480,
    needs:{hunger:70,energy:70,fun:70,hygiene:70,bladder:70,social:70},
    position:{x:-.8,z:2.95},
    kitchen:{schema:1,pantry:{vegetables:8,grains:8,dairy:8,herbs:0},
      prepared:[{recipeId:'cook.soup',portions:3}],dirtyDishes:2,lastPantryDay:0}});
  assert.equal(old.kitchen.schema,1);
  assert.deepEqual(old.kitchen.deliveries,[]);
  assert.equal(old.kitchen.prepared[0].portions,3);
  assert.equal(takeKitchenServing(old.kitchen,'cook.soup'),'cook.soup');
  assert.equal(old.kitchen.prepared[0].portions,2);
  const k=newKitchen();
  assert.equal(canCookRecipe(k,READY_MEAL_IDS[0],10),false,
    'ready meals cannot be fabricated through cooking actions');
  assert.equal(finishKitchenRecipe(k,READY_MEAL_IDS[0],10),false);
  assert.equal(canCookRecipe(k,'cook.soup',0),true);
  assert.equal(finishKitchenRecipe(k,'cook.soup',0),true);
  assert.equal(k.prepared[0].portions,3);
  const forged=restoreKitchen({...k,deliveries:[
    {id:'bad',recipeId:READY_MEAL_IDS[0],orderedAt:10,dueAt:28},
    {id:'ready-order-1',recipeId:'rogue',orderedAt:10,dueAt:28}]});
  assert.deepEqual(forged.deliveries,[]);
});
test('FOOD-R1: exact Safari/PlayCanvas UI and Pages dependency contracts',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const phone=readFileSync(new URL('../src/career-phone-ui.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(html,/id="fridge-ready-select"/);
  assert.match(html,/id="fridge-ready-buy-button"/);
  assert.match(game,/onBuyReadyMeal:buyReadyMeal/);
  assert.match(game,/function buyReadyMeal\(/);
  assert.match(phone,/\['work','Работа'\],\['finance','Финансы'\],\['food','Доставка'\]/);
  assert.match(phone,/renderReadyFood\(root\)/);
  assert.match(css,/repeat\(3,minmax\(0,1fr\)\)/);
  for(const path of ['src/ready-food.js','src/ready-meal-catalog.js']){
    assert.ok(pages.includes('node --check '+path),path+' syntax gate');
    assert.ok(pages.includes(path),path+' in static deploy');
    assert.ok(html.includes('"./'+path+'":"./'+path+'?v=food-r1"'),path+' versioned');
  }
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
});
