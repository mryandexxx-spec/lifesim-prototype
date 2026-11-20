import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold,chooseResidentAction,tickHousehold} from '../src/household.js';
import {arrive} from '../src/simulation.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {newKitchen,restoreKitchen,replenishKitchen,kitchenRecipe,canCookRecipe,
  finishKitchenRecipe} from '../src/kitchen.js';
import {KITCHEN_RESTOCK_UNITS,KITCHEN_RESTOCK_PRICE,KITCHEN_RESTOCK_MAX,
  quoteKitchenRestock,proposeKitchenRestock} from '../src/kitchen-market.js';
const copy=x=>structuredClone(x);
const stations=[
  {instanceId:'shop-prep-901',prefabId:'prep',itemDefinitionId:'prep.oak',
    x:9.2,z:1.5,yaw:0,location:'home'},
  {instanceId:'shop-stove-902',prefabId:'stove',itemDefinitionId:'stove.copper',
    x:11.3,z:1.5,yaw:0,location:'home'}
];
function home(){
  const root=newHousehold();root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
  root.world.furniture.instances.push(...copy(stations));
  return root;
}
test('C3b recipe consumes two vegetables and one herb only on completion',()=>{
  const recipe=kitchenRecipe('cook.herb-soup');
  assert.deepEqual(recipe.requires,{vegetables:2,herbs:1});
  assert.equal(recipe.minLevel,0);assert.equal(recipe.cookMinutes,26);
  assert.equal(recipe.portions,3);assert.equal(recipe.hungerFactor,1.14);
  const kitchen=newKitchen();
  assert.equal(canCookRecipe(kitchen,recipe.id,0),false);
  kitchen.pantry.herbs=1;
  assert.equal(canCookRecipe(kitchen,recipe.id,0),true);
  assert.equal(finishKitchenRecipe(kitchen,recipe.id,0),true);
  assert.equal(kitchen.pantry.herbs,0);assert.equal(kitchen.pantry.vegetables,6);
  assert.equal(kitchen.prepared[0].portions,3);
  assert.equal(finishKitchenRecipe(kitchen,recipe.id,0),false);
});
test('C3b 30 days cannot refill basic groceries; legacy values survive reload',()=>{
  const old=restoreKitchen({schema:1,pantry:{vegetables:1,grains:0,dairy:4},
    prepared:[],dirtyDishes:0,lastPantryDay:0});
  for(let day=1;day<=30;day++)replenishKitchen(old,day*1440);
  assert.deepEqual(old.pantry,{vegetables:1,grains:0,dairy:4,herbs:0});
  const root=home();root.kitchen=old;
  const restored=loadHousehold(copy(root));
  assert.deepEqual(restored.kitchen.pantry,old.pantry);
  tickHousehold(restored,1440);
  assert.deepEqual(restored.kitchen.pantry,old.pantry);
  assert.equal(restored.version,1);
});
test('C3b purchases reject unsupported ingredient, cap overflow and no funds',()=>{
  const root=home();
  assert.equal(KITCHEN_RESTOCK_UNITS,5);assert.equal(KITCHEN_RESTOCK_PRICE,15);
  assert.equal(KITCHEN_RESTOCK_MAX,30);
  assert.equal(quoteKitchenRestock(root,'herbs').reason,'unsupported-ingredient');
  root.kitchen.pantry.vegetables=26;
  assert.equal(quoteKitchenRestock(root,'vegetables').reason,'pantry-full');
  root.kitchen.pantry.vegetables=25;
  assert.equal(quoteKitchenRestock(root,'vegetables').after,30);
  root.shop.credits=14;
  assert.equal(quoteKitchenRestock(root,'vegetables').reason,'insufficient-credits');
  root.shop.credits=100;
  assert.equal(quoteKitchenRestock({...root,world:null},'vegetables').reason,'missing-fridge');
  assert.equal(quoteKitchenRestock({...root,kitchen:{schema:1,pantry:{vegetables:31}}},'vegetables').reason,'invalid-pantry');
});
test('C3b one purchase projects ledger, pantry and credits without mutating root',()=>{
  const root=home(),original=copy(root);
  const result=proposeKitchenRestock(root,'vegetables','mira');
  assert.equal(result.ok,true);
  assert.equal(result.entry.kind,'purchase');assert.equal(result.entry.delta,-15);
  assert.equal(result.entry.sourceId,'kitchen.staples.vegetables');
  assert.equal(result.entry.actorId,'mira');
  assert.equal(root.shop.credits,original.shop.credits);
  assert.deepEqual(root.kitchen,original.kitchen);
  root.kitchen=result.kitchen;root.shop=result.shop;
  root.financialHistory=result.financialHistory;
  assert.equal(root.kitchen.pantry.vegetables,original.kitchen.pantry.vegetables+5);
  assert.equal(root.shop.credits,original.shop.credits-15);
  const restored=loadHousehold(copy(root));
  assert.equal(restored.kitchen.pantry.vegetables,root.kitchen.pantry.vegetables);
  assert.equal(restored.shop.credits,root.shop.credits);
  assert.deepEqual(restored.financialHistory.entries,root.financialHistory.entries);
  const next=proposeKitchenRestock(restored,'grains','alex');
  assert.equal(next.ok,true);assert.notEqual(next.entry.id,result.entry.id);
  assert.equal(restored.financialHistory.entries.length,1,'proposal does not commit itself');
});
test('C3b herb soup follows physical fridge-prep-stove-storage cycle',()=>{
  const root=home();root.kitchen.pantry.herbs=1;
  assert.ok(chooseResidentAction(root,'cook',false,'alex','shop-stove-902',
    null,null,null,null,'cook.herb-soup'));
  assert.equal(root.kitchen.pantry.herbs,1);
  root.position={...furnitureActionApproach(root.world,'fridge')};
  arrive(root);root.action.cookStage='taking';tickHousehold(root,5);
  root.position={...furnitureActionApproach(root.world,'prep','shop-prep-901')};
  arrive(root);root.action.cookStage='preparing';tickHousehold(root,8);
  root.position={...furnitureActionApproach(root.world,'cook','shop-stove-902')};
  arrive(root);root.action.cookStage='cooking';tickHousehold(root,26);
  assert.equal(root.kitchen.pantry.herbs,1);
  assert.equal(root.kitchen.prepared.length,0);
  root.position={...furnitureActionApproach(root.world,'fridge')};
  arrive(root);root.action.cookStage='storing';tickHousehold(root,6);
  assert.equal(root.action,null);assert.equal(root.kitchen.pantry.herbs,0);
  assert.equal(root.kitchen.prepared[0].recipeId,'cook.herb-soup');
  assert.equal(root.kitchen.prepared[0].portions,3);
  const stopped=home();stopped.kitchen.pantry.herbs=1;
  assert.ok(chooseResidentAction(stopped,'cook',false,'mira','shop-stove-902',
    null,null,null,null,'cook.herb-soup'));
  stopped.otherSim.action=null;tickHousehold(stopped,60);
  assert.equal(stopped.kitchen.pantry.herbs,1);
  assert.equal(stopped.kitchen.prepared.length,0);
});
test('C3b Safari interface and Pages bundle require confirmed atomic transaction',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  assert.match(html,/value="cook.herb-soup"/);
  assert.match(html,/id="fridge-staple-select"/);
  assert.match(html,/id="fridge-buy-button"/);
  assert.match(html,/lot-c3b-20261120/);
  assert.match(game,/window\.confirm\(/);
  assert.match(game,/proposeKitchenRestock\(game,itemId,game.selectedSim\)/);
  assert.match(game,/if\(!save\(true\)\)/);
  assert.match(pages,/cp src\/kitchen\.js src\/kitchen-market\.js/);
  assert.match(css,/#fridge-staple-select\{min-height:46px;\}/);
});
