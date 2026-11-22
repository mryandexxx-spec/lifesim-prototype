import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold} from '../src/household.js';
import {newKitchen,restoreKitchen,kitchenRecipe,preparedKitchenMeals} from '../src/kitchen.js';
import {quoteKitchenRestock,proposeKitchenRestock} from '../src/kitchen-market.js';
import {GRILL_RECIPES,canGrillRecipe,finishGrillRecipe,grillApproach,chooseOutdoorDining} from '../src/grill-r1.js';
import {OUTDOOR_CATALOG} from '../src/outdoor-catalog.js';
import {sanitizeQueueCommand} from '../src/action-queue.js';

const recipeIds=['grill.vegetables','grill.chicken','grill.steak','grill.shashlik','grill.platter'];
function sampleWorld(){const r=newHousehold();return r;}
test('GRILL-R1: paid outdoor SKU and five skill-gated recipes are authored',()=>{
  assert.equal(OUTDOOR_CATALOG['garden.grill'].price,560);
  assert.deepEqual(recipeIds.map(id=>GRILL_RECIPES[id].minLevel),[0,2,4,6,8]);
  assert.deepEqual(recipeIds.map(id=>GRILL_RECIPES[id].portions),[3,3,2,3,4]);
  assert.equal(kitchenRecipe('grill.steak').label,'Стейки на углях');
});
test('GRILL-R1: old v1 pantry adds NO free meat or chicken',()=>{
  const k=newKitchen();
  assert.equal(k.pantry.meat,0);assert.equal(k.pantry.chicken,0);
  const old={schema:1,pantry:{vegetables:4,grains:4,dairy:4,herbs:2},
    prepared:[],deliveries:[],dirtyDishes:0,lastPantryDay:0};
  assert.equal(restoreKitchen(old).pantry.meat,0);
  assert.equal(restoreKitchen(old).pantry.chicken,0);
  assert.equal(restoreKitchen({...old,pantry:{...old.pantry,meat:3,chicken:2}}).pantry.meat,3);
  assert.equal(restoreKitchen({...old,pantry:{...old.pantry,meat:-10,chicken:200}}).pantry.meat,0);
});
test('GRILL-R1: meat and chicken are paid through original atomic ledger',()=>{
  const root=sampleWorld();
  const start=root.shop.credits;
  const a=quoteKitchenRestock(root,'meat');
  assert.deepEqual([a.ok,a.units,a.price],[true,3,36]);
  const paid=proposeKitchenRestock(root,'meat','alex');
  assert.equal(paid.ok,true);
  assert.equal(root.shop.credits,start);
  assert.equal(paid.shop.credits,start-36);
  assert.equal(paid.kitchen.pantry.meat,3);
  assert.equal(paid.financialHistory.entries.at(-1).delta,-36);
  assert.equal(proposeKitchenRestock({...root,shop:{...root.shop,credits:0}},'meat').ok,false);
});
test('GRILL-R1: recipes do not create free food or bypass skill and capacity',()=>{
  const kitchen=newKitchen();
  kitchen.pantry={...kitchen.pantry,meat:3,chicken:3,vegetables:8,herbs:2};
  assert.equal(canGrillRecipe(kitchen,'grill.steak',3),false);
  assert.equal(canGrillRecipe(kitchen,'grill.steak',4),true);
  const previous=kitchen.pantry.meat;
  assert.equal(finishGrillRecipe(kitchen,'grill.steak',4),true);
  assert.equal(kitchen.pantry.meat,previous-2);
  assert.equal(preparedKitchenMeals(kitchen).find(x=>x.recipeId==='grill.steak').portions,2);
  assert.equal(finishGrillRecipe(kitchen,'grill.steak',4),false);
  assert.equal(canGrillRecipe(kitchen,'cook.soup',9),false);
});
test('GRILL-R1: no phantom queue commands, no forged recipes',()=>{
  const ids=['alex','mira'];
  assert.equal(sanitizeQueueCommand('alex',{type:'grill',instanceId:'out-1',recipeId:'grill.steak'},ids).recipeId,'grill.steak');
  assert.equal(sanitizeQueueCommand('alex',{type:'grill',instanceId:'out-1',recipeId:'cook.soup'},ids),null);
  assert.equal(sanitizeQueueCommand('alex',{type:'grill',instanceId:'home-bed-1',recipeId:'grill.steak'},ids),null);
});
test('GRILL-R1: invalid outdoor fixture and table alone do not make a meal site',()=>{
  const root=sampleWorld();
  assert.equal(grillApproach(root.world,'out-999'),null);
  assert.equal(chooseOutdoorDining(root.world,root.position),null);
  const table={instanceId:'out-1',itemId:'garden.table',x:8,z:8,yaw:0,purchasePriceCredits:220};
  root.world.outdoors.features=[table];
  assert.equal(chooseOutdoorDining(root.world,root.position),null);
});
test('GRILL-R1: restored root remains schema-v1 and no free meat is minted',()=>{
  const old=sampleWorld();
  delete old.kitchen.pantry.meat;delete old.kitchen.pantry.chicken;
  const restored=loadHousehold(JSON.parse(JSON.stringify(old)));
  assert.equal(restored.version,1);
  assert.equal(restored.kitchen.pantry.meat,0);
  assert.equal(restored.kitchen.pantry.chicken,0);
});
