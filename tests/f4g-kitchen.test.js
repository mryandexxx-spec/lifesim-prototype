import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ACTIONS,arrive} from '../src/simulation.js';
import {newHousehold,loadHousehold,chooseResidentAction,tickHousehold,
  furnitureAvailable} from '../src/household.js';
import {newKitchen,restoreKitchen,replenishKitchen,kitchenRecipe,canCookRecipe,
  finishKitchenRecipe,takeKitchenServing,chooseKitchenPlan,
  kitchenSummary,COOKING_SKILL_ID} from '../src/kitchen.js';
import {FURNITURE_PRODUCTS,FURNITURE_TYPE_BY_PREFAB} from '../src/furniture-products.js';
import {FURNITURE_CATALOG,furnitureActionApproach} from '../src/furniture-catalog.js';
import {proceduralGeometrySignature,proceduralFurnitureModel} from '../src/furniture-procedural-library.js';
import {newActionQueues,enqueueAction,restoreActionQueues} from '../src/action-queue.js';
import {HOBBY_SKILLS} from '../src/hobby-reading.js';
import {currentSkillLevel} from '../src/skills-engine.js';
import {diningSeatApproach} from '../src/dining.js';

const instances=[
  {instanceId:'shop-prep-901',prefabId:'prep',itemDefinitionId:'prep.oak',
    x:9.2,z:1.5,yaw:0,location:'home'},
  {instanceId:'shop-stove-902',prefabId:'stove',itemDefinitionId:'stove.copper',
    x:11.3,z:1.5,yaw:0,location:'home'},
  {instanceId:'shop-sink-903',prefabId:'sink',itemDefinitionId:'sink.farm',
    x:13.0,z:1.5,yaw:0,location:'home'},
  {instanceId:'shop-diningtable-904',prefabId:'diningtable',
    itemDefinitionId:'diningtable.farm',x:6.8,z:-1.5,yaw:0,location:'home'},
  {instanceId:'shop-chair-905',prefabId:'chair',itemDefinitionId:'chair.loft',
    x:6.8,z:.75,yaw:0,location:'home'}
];
function home(){
 const h=newHousehold();h.autonomy.enabled=false;h.otherSim.autonomy.enabled=false;
 h.world.furniture.instances.push(...structuredClone(instances));
 return h;
}
test('F4G: independent appliance models and authentic recipe roles',()=>{
 const keys=['stove','prep','sink'];
 for(const prefab of keys){
   const products=FURNITURE_PRODUCTS.filter(x=>x.prefabId===prefab);
   assert.equal(products.length,2);
   assert.equal(FURNITURE_CATALOG[prefab].templateOnly,true);
   assert.ok(FURNITURE_CATALOG[prefab].actionId);
   assert.ok(FURNITURE_TYPE_BY_PREFAB[prefab]);
   assert.notEqual(proceduralGeometrySignature(products[0].modelKey),
     proceduralGeometrySignature(products[1].modelKey),
     'same category must differ geometrically, not only by color');
 }
 assert.equal(Object.keys(HOBBY_SKILLS.skills).includes(COOKING_SKILL_ID),true);
 assert.equal(Object.keys(kitchenRecipe('cook.soup').requires)[0],'vegetables');
 assert.equal(ACTIONS.cook.benefitPerMinute,0);
});
test('F4G.1: no permanent food bowl left on the kitchen worktop',()=>{
  const oak=proceduralFurnitureModel('prep.oak');
  const stone=proceduralFurnitureModel('prep.stone');
  for(const model of [oak,stone]){
    assert.ok(model);
    assert.equal(model.parts.some(part=>/\b(bowl|meal|dish|ingredients)\b/i.test(part.name)),false,
      'worktop geometry must be permanently clear of meal props');
  }
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  assert.match(game,/const prepBowl=new pc\.Entity\('F4G prep bowl'\)/);
  assert.match(game,/node\.addChild\(prepBowl\);prepBowl\.enabled=false/);
  assert.match(game,/item\.prefabId==='prep'&&resident\.action\.cookStage==='preparing'/);
  assert.match(game,/const bowl=node\.findByName\('F4G prep bowl'\);\s*if\(bowl\)bowl\.enabled=active/);
  // Kitchen portions are a separate saved inventory; no persisted countertop food.
  const h=home();assert.ok(finishKitchenRecipe(h.kitchen,'cook.soup',0));
  const restored=loadHousehold(structuredClone(h));
  assert.equal(kitchenSummary(restored.kitchen).prepared,3);
  assert.equal(Object.hasOwn(restored.kitchen,'countertopFood'),false);
});
test('F4G: recipes gate by real supplies and per-resident cooking skill',()=>{
 const k=newKitchen();
 assert.equal(canCookRecipe(k,'cook.soup',0),true);
 assert.equal(canCookRecipe(k,'cook.pasta',0),false);
 assert.equal(canCookRecipe(k,'cook.pasta',2),true);
 assert.equal(canCookRecipe(k,'cook.gratin',3),false);
 const h=home();
 assert.equal(currentSkillLevel(h.skills,HOBBY_SKILLS,COOKING_SKILL_ID),0);
 assert.ok(finishKitchenRecipe(k,'cook.soup',0));
 assert.equal(k.pantry.vegetables,6);
 assert.equal(kitchenSummary(k).prepared,3);
 assert.equal(takeKitchenServing(k),'cook.soup');
 assert.equal(kitchenSummary(k).prepared,2);
 assert.equal(restoreKitchen({...k,schema:1,prepared:[{recipeId:'rogue',portions:999}]}).prepared.length,0);
 assert.ok(!replenishKitchen(k,1000));
 assert.ok(replenishKitchen(k,1500));
 assert.equal(k.pantry.vegetables,8);
 assert.ok(!replenishKitchen(k,1501),'reload/extra calls cannot mint duplicate daily supplies');
});
test('F4G: true three-station path and cooked portions are only minted on completion',()=>{
 const h=home(),plan=chooseKitchenPlan(h.world,h.position,'shop-stove-902');
 assert.ok(plan,'fridge -> prep counter -> stove must all be physically reachable');
 assert.equal(plan.prepInstanceId,'shop-prep-901');
 const initial=h.needs.hunger;
 assert.equal(chooseResidentAction(h,'cook',false,'alex','shop-stove-902',
    null,null,null,null,'cook.soup'),true);
 assert.equal(h.action.cookStage,'toFridge');
 assert.equal(h.action.prepInstanceId,plan.prepInstanceId);
 tickHousehold(h,3);
 assert.ok(h.needs.hunger<initial,'walking never grants food');
 assert.equal(kitchenSummary(h.kitchen).prepared,0);
 h.position={...furnitureActionApproach(h.world,'fridge')};
 arrive(h);h.action.cookStage='taking';tickHousehold(h,5);
 assert.equal(h.action.cookStage,'toPrep');
 assert.equal(h.action.phase,'walking');
 h.position={...furnitureActionApproach(h.world,'prep',plan.prepInstanceId)};
 arrive(h);h.action.cookStage='preparing';tickHousehold(h,8);
 assert.equal(h.action.cookStage,'toStove');
 assert.equal(kitchenSummary(h.kitchen).prepared,0);
 h.position={...furnitureActionApproach(h.world,'cook','shop-stove-902')};
 arrive(h);h.action.cookStage='cooking';tickHousehold(h,12);
 const xp=h.skills.xpById.cooking;
 assert.ok(xp>10);
 assert.equal(kitchenSummary(h.kitchen).prepared,0);
 h.paused=true;tickHousehold(h,100);
 assert.equal(h.skills.xpById.cooking,xp);
 h.paused=false;tickHousehold(h,13);
 assert.equal(h.action,null);
 assert.equal(kitchenSummary(h.kitchen).prepared,3);
 assert.equal(h.kitchen.pantry.vegetables,6);
 const saved=loadHousehold(structuredClone(h));
 assert.equal(saved.kitchen.prepared[0].recipeId,'cook.soup');
 assert.equal(saved.kitchen.prepared[0].portions,3);
 assert.ok(saved.skills.xpById.cooking>=xp);
});
test('F4G: prepared food is consumed only at the seated table, then creates dirty dishes',()=>{
 const h=home();
 h.kitchen.prepared.push({recipeId:'cook.soup',portions:3});
 assert.equal(chooseResidentAction(h,'dining',false,'alex','shop-diningtable-904'),true);
 assert.equal(kitchenSummary(h.kitchen).prepared,3);
 h.position={...furnitureActionApproach(h.world,'fridge')};
 arrive(h);h.action.diningStage='taking';tickHousehold(h,6);
 assert.equal(kitchenSummary(h.kitchen).prepared,3);
 const seat=diningSeatApproach(h.world,h.action.targetInstanceId,h.action.diningSeatInstanceId);
 assert.ok(seat);
 h.position={...seat};arrive(h);h.action.diningStage='eating';
 const initial=h.needs.hunger;
 tickHousehold(h,6);
 assert.equal(kitchenSummary(h.kitchen).prepared,2);
 assert.equal(h.action.cookedRecipeId,'cook.soup');
 assert.ok(h.needs.hunger>initial);
 tickHousehold(h,ACTIONS.dining.duration-6);
 assert.equal(h.action,null);
 assert.equal(h.kitchen.dirtyDishes,1);
 assert.equal(furnitureAvailable(h,'wash','alex','shop-sink-903'),true);
 assert.ok(chooseResidentAction(h,'wash',false,'alex','shop-sink-903'));
 h.position={...furnitureActionApproach(h.world,'wash','shop-sink-903')};
 arrive(h);tickHousehold(h,ACTIONS.wash.duration);
 assert.equal(h.kitchen.dirtyDishes,0);
 assert.equal(loadHousehold(structuredClone(h)).kitchen.dirtyDishes,0);
});
test('F4G: mid-cook station removal prevents phantom dish or XP, old v1 saved games still work',()=>{
 const h=home();
 assert.ok(chooseResidentAction(h,'cook',false,'alex','shop-stove-902',
   null,null,null,null,'cook.pancakes'));
 h.position={...furnitureActionApproach(h.world,'fridge')};
 arrive(h);h.action.cookStage='taking';tickHousehold(h,5);
 h.world.furniture.instances.find(x=>x.instanceId==='shop-prep-901').location='storage';
 tickHousehold(h,1);
 assert.equal(h.action,null);
 assert.equal(kitchenSummary(h.kitchen).prepared,0);
 assert.equal(h.skills.xpById.cooking||0,0);
 const old=loadHousehold({version:1,minutes:530,needs:{hunger:70,energy:60,
   fun:50,hygiene:80,bladder:80,social:50},position:{x:-.8,z:2.95}});
 assert.equal(old.version,1);
 assert.equal(old.kitchen.schema,1);
 assert.equal(old.world.furniture.instances.some(x=>x.prefabId==='stove'),false);
 const queue=newActionQueues(['alex','mira']);
 assert.ok(enqueueAction(queue,'alex',{type:'object',actionId:'cook',
   targetInstanceId:'shop-stove-902',recipeId:'cook.soup'}));
 assert.equal(restoreActionQueues(structuredClone(queue),['alex','mira'])
    .byResident.alex[0].recipeId,'cook.soup');
});
test('F4G: stored sink or remote washing cannot clear dishes after a broken route',()=>{
 const h=home();h.kitchen.dirtyDishes=2;
 assert.ok(chooseResidentAction(h,'wash',false,'alex','shop-sink-903'));
 h.position={...furnitureActionApproach(h.world,'wash','shop-sink-903')};
 arrive(h);
 h.world.furniture.instances.find(x=>x.instanceId==='shop-sink-903').location='storage';
 tickHousehold(h,ACTIONS.wash.duration);
 assert.equal(h.action,null);
 assert.equal(h.kitchen.dirtyDishes,2);
});
test('F4G: Safari touch interaction, visual effects and deploy contain kitchen ESM',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
 const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
 assert.match(html,/id="cooking-recipe-select"/);
 assert.match(html,/src\/kitchen\.js/);
 assert.match(game,/cooking-recipe-select/);
 assert.match(game,/F4G cooking pot/);
 assert.match(game,/kitchenAppliances=/);
 assert.match(workflow,/node --check src\/kitchen\.js/);
 assert.match(workflow,/cp src\/kitchen\.js src\/hobby-content\.js site\/src\//);
});
