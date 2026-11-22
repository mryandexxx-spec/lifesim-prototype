import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold,nearestAvailableDiningTable} from '../src/household.js';
import {newKitchen,restoreKitchen,kitchenRecipe,preparedKitchenMeals} from '../src/kitchen.js';
import {arrive} from '../src/simulation.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {outdoorBenchAvailable} from '../src/outdoor-interactions.js';
import {quoteKitchenRestock,proposeKitchenRestock} from '../src/kitchen-market.js';
import {GRILL_RECIPES,canGrillRecipe,finishGrillRecipe,grillApproach,chooseOutdoorDining,grillAvailable,outdoorDiningApproach} from '../src/grill-r1.js';
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

function buy(root,itemId,x,z,yaw=0){
  const proposal=previewOutdoorFeatureEdit(root,{operation:'place',itemId,pose:{x,z,yaw}});
  assert.equal(proposal.ok,true,proposal.reason);
  const applied=commitOutdoorFeatureEdit(root,proposal);
  assert.equal(applied.ok,true,applied.reason);
  return applied.root;
}
function fixture(){
  let h=newHousehold();h.autonomy.enabled=false;h.otherSim.autonomy.enabled=false;
  h=buy(h,'garden.grill',19,8);
  const grill=h.world.outdoors.features.find(f=>f.itemId==='garden.grill');
  return {h,grill};
}
test('GRILL-R1: real paid grill SKU has exclusive A* contact and 70% resale',()=>{
  const {h,grill}=fixture(),point=grillApproach(h.world,grill.instanceId);
  assert.ok(point,'physical approach');
  assert.equal(grillAvailable(h,'alex',grill.instanceId),true);
  const saved=loadHousehold(structuredClone(h));
  assert.equal(saved.world.outdoors.features[0].itemId,'garden.grill');
  assert.equal(saved.financialHistory.entries.at(-1).delta,-560);
  const sell=previewOutdoorFeatureEdit(h,{operation:'sell',instanceId:grill.instanceId});
  assert.equal(sell.cost,-392);
  h.action={id:'grill',phase:'using',elapsed:3,automatic:false,
    targetInstanceId:grill.instanceId,recipeId:'grill.vegetables',grillStage:'cooking'};
  assert.equal(grillAvailable(h,'mira',grill.instanceId),false);
  assert.equal(previewOutdoorFeatureEdit(h,{operation:'sell',instanceId:grill.instanceId}).reason,'reserved-grill');
  h.action=null;
  h.actionQueues.byResident.mira.push({type:'grill',instanceId:grill.instanceId,
    recipeId:'grill.vegetables',seq:1});
  assert.equal(previewOutdoorFeatureEdit(h,{operation:'move',
    instanceId:grill.instanceId,pose:{x:21,z:8,yaw:0}}).reason,'reserved-grill');
});
test('GRILL-R1: walking, actual cooking, pause, save/reload and one completed storage batch',()=>{
  let {h,grill}=fixture();
  const point=grillApproach(h.world,grill.instanceId),before=h.kitchen.pantry.vegetables;
  h.action={id:'grill',phase:'walking',elapsed:0,automatic:false,
    targetInstanceId:grill.instanceId,recipeId:'grill.vegetables',grillStage:'cooking'};
  tickHousehold(h,5);
  assert.equal(h.kitchen.prepared.length,0);
  assert.equal(h.kitchen.pantry.vegetables,before);
  h.position={...point};arrive(h);tickHousehold(h,9);
  assert.ok(h.skills.xpById.cooking>0,'real grill practice advances Cooking');
  assert.equal(h.kitchen.prepared.length,0);
  const saved=loadHousehold(structuredClone(h));
  assert.equal(saved.action?.id,'grill');
  assert.equal(saved.action?.grillStage,'cooking');
  saved.paused=true;const xp=saved.skills.xpById.cooking;tickHousehold(saved,100);
  assert.equal(saved.skills.xpById.cooking,xp);
  saved.paused=false;tickHousehold(saved,21);
  assert.equal(saved.action.grillStage,'toFridgeStore');
  assert.equal(saved.action.phase,'walking');
  assert.equal(saved.kitchen.prepared.length,0);
  saved.position={...furnitureActionApproach(saved.world,'fridge')};
  arrive(saved);saved.action.grillStage='storing';
  tickHousehold(saved,6);
  assert.equal(saved.action,null);
  assert.equal(saved.kitchen.prepared[0].portions,3);
  assert.equal(saved.kitchen.pantry.vegetables,before-2);
  const stored=loadHousehold(structuredClone(saved));
  assert.equal(stored.kitchen.prepared[0].portions,3,'no new dish on reload');
  tickHousehold(stored,10);
  assert.equal(stored.kitchen.prepared[0].portions,3,'no duplicate batch after tick');
});
test('GRILL-R1: a garden table alone cannot seat, valid front bench is preferred over home',()=>{
  let {h}=fixture();
  h=buy(h,'garden.table',21.5,5);
  assert.equal(chooseOutdoorDining(h.world,h.position),null);
  h=buy(h,'garden.bench',21.5,7.25);
  const table=h.world.outdoors.features.find(f=>f.itemId==='garden.table');
  const bench=h.world.outdoors.features.find(f=>f.itemId==='garden.bench');
  const point=outdoorDiningApproach(h.world,table.instanceId,bench.instanceId);
  assert.ok(point,'oriented table+bench permits real outdoor seat');
  assert.equal(chooseOutdoorDining(h.world,h.position)?.instanceId,bench.instanceId);
  assert.equal(nearestAvailableDiningTable(h,'alex')?.instanceId,table.instanceId);
  h.otherSim.action={id:'dining',phase:'using',elapsed:3,automatic:false,
    targetInstanceId:table.instanceId,diningSeatInstanceId:bench.instanceId,
    diningStage:'eating',portionTaken:true};
  assert.equal(outdoorBenchAvailable(h,'alex',bench.instanceId),false);
  assert.notEqual(nearestAvailableDiningTable(h,'alex')?.instanceId,table.instanceId,
    'occupied outdoor seat forces safe indoor fallback');
  assert.equal(previewOutdoorFeatureEdit(h,{operation:'sell',instanceId:bench.instanceId}).reason,
    'reserved-dining');
  assert.equal(previewOutdoorFeatureEdit(h,{operation:'move',instanceId:table.instanceId,
    pose:{x:21,z:5,yaw:0}}).reason,'reserved-dining');
});
