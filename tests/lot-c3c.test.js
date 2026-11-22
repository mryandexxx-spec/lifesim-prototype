/** LOT-C3c: actual household 30-day and two-resident harvest/kitchen regressions.
 * Pure runtime tests; no PlayCanvas mock substitutes for browser smoke.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {newHousehold,loadHousehold,chooseResidentAction,tickHousehold} from '../src/household.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {gardenApproach,gardenRequestStillValid,settleGardenAction,
  GARDEN_DURATION} from '../src/gardening.js';
import {newKitchen,restoreKitchen,finishKitchenRecipe} from '../src/kitchen.js';
import {quoteKitchenRestock,proposeKitchenRestock} from '../src/kitchen-market.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {arrive} from '../src/simulation.js';

const clone=value=>structuredClone(value);
const stations=[
  {instanceId:'shop-prep-901',prefabId:'prep',itemDefinitionId:'prep.oak',
    x:9.2,z:1.5,yaw:0,location:'home'},
  {instanceId:'shop-stove-902',prefabId:'stove',itemDefinitionId:'stove.copper',
    x:11.3,z:1.5,yaw:0,location:'home'}
];
function household(){
  const root=newHousehold('2026-11-20');
  root.autonomy.enabled=false;
  root.otherSim.autonomy.enabled=false;
  root.world.furniture.instances.push(...clone(stations));
  return root;
}
function garden(root,itemId='garden.herb.mint'){
  const preview=previewOutdoorFeatureEdit(root,{operation:'place',
    itemId,pose:{x:8,z:-7,yaw:0}});
  assert.equal(preview.ok,true,preview.reason);
  const result=commitOutdoorFeatureEdit(root,preview);
  assert.equal(result.ok,true,result.reason);
  const id=result.root.world.outdoors.features.find(x=>x.itemId===itemId).instanceId;
  return {root:result.root,id};
}
function mature(root,id){
  root.minutes+=4320;
  root.otherSim.minutes=root.minutes;
  Object.assign(root.world.outdoors.gardens[id],
    {evaluatedAt:root.minutes,progressWetMinutes:4320});
}
function using(root,id,actionId,residentId='alex',elapsed=0){
  const actor=residentId==='alex'?root:root.otherSim;
  const route=gardenApproach(root.world,id,actor.position);
  assert.ok(route,'a real route to garden');
  actor.position={...route.goal};
  actor.action={id:'garden',phase:'using',automatic:false,elapsed,
    targetInstanceId:id,gardenActionId:actionId,
    gardenPlantedAt:root.world.outdoors.gardens[id].plantedAt,
    gardenGoal:{...route.goal}};
}
test('C3c: 7 and 30 full game days keep two clocks and finite pantry',()=>{
  let root=household();
  root.kitchen.pantry={vegetables:1,grains:0,dairy:2,herbs:0,meat:0,chicken:0};
  const initial=clone(root.kitchen.pantry);
  const at=root.minutes;
  const start=performance.now();
  for(let day=1;day<=30;day++){
    for(let hour=0;hour<24;hour++)tickHousehold(root,60);
    assert.equal(root.minutes,at+day*1440);
    assert.equal(root.otherSim.minutes,root.minutes,'no double household time');
    assert.deepEqual(root.kitchen.pantry,initial,
      'there is no free dawn refill or autonomous inventory mint');
    if(day===7||day===30){
      root=loadHousehold(clone(root));
      assert.equal(root.version,1);
      assert.equal(root.otherSim.minutes,root.minutes);
      assert.deepEqual(root.kitchen.pantry,initial);
    }
  }
  const elapsed=performance.now()-start;
  assert.ok(elapsed<90000,'30-day step simulation within 90s: '+elapsed);
  console.log('LOT-C3c 30-day / 720-hour tick regression: '+Math.round(elapsed)+'ms');
});
test('C3c: paused, half-finished and reloaded harvest never duplicates a crop',()=>{
  let {root,id}=garden(household());
  mature(root,id);
  using(root,id,'harvest','alex');
  root.paused=true;
  tickHousehold(root,12);
  assert.equal(root.kitchen.pantry.herbs,0);
  assert.equal(root.action.elapsed,0);
  root.paused=false;
  tickHousehold(root,7);
  assert.equal(root.kitchen.pantry.herbs,0,'no bonus at 7/12 minutes');
  assert.equal(root.action?.gardenActionId,'harvest');
  root=loadHousehold(clone(root));
  assert.equal(root.action?.gardenActionId,'harvest',
    'a legitimate active harvest survives root-v1 reload');
  tickHousehold(root,5);
  assert.equal(root.kitchen.pantry.herbs,2);
  assert.equal(root.action,null);
  assert.equal(gardenRequestStillValid(root,'mira',id,'harvest'),false);
  root=loadHousehold(clone(root));
  tickHousehold(root,12);
  assert.equal(root.kitchen.pantry.herbs,2);
  assert.equal(settleGardenAction(root,'mira',id,'harvest'),false);
});
test('C3c: two simultaneous completion attempts settle one and only one harvest',()=>{
  const {root,id}=garden(household());
  mature(root,id);
  using(root,id,'harvest','alex',GARDEN_DURATION.harvest-1);
  using(root,id,'harvest','mira',GARDEN_DURATION.harvest-1);
  tickHousehold(root,1);
  assert.equal(root.kitchen.pantry.herbs,2,'same crop must credit only once');
  assert.ok(root.world.outdoors.gardens[id].harvestedAt!==null);
  assert.equal(gardenRequestStillValid(root,'alex',id,'harvest'),false);
  assert.equal(gardenRequestStillValid(root,'mira',id,'harvest'),false);
});
test('C3c: capacity 16, broken replant and charged completion survive reload',()=>{
  let {root,id}=garden(household());
  mature(root,id);
  root.kitchen.pantry.herbs=15;
  assert.equal(gardenRequestStillValid(root,'alex',id,'harvest'),false);
  assert.equal(root.kitchen.pantry.herbs,15);
  root.kitchen.pantry.herbs=14;
  using(root,id,'harvest');
  tickHousehold(root,12);
  assert.equal(root.kitchen.pantry.herbs,16);
  assert.equal(gardenRequestStillValid(root,'mira',id,'harvest'),false);
  const credits=root.shop.credits;
  const entries=root.financialHistory.entries.length;
  using(root,id,'replant','mira');
  root.paused=true;tickHousehold(root,10);root.paused=false;
  assert.equal(root.shop.credits,credits);
  root.otherSim.action=null;
  tickHousehold(root,10);
  assert.equal(root.shop.credits,credits,'cancel is cost-free');
  using(root,id,'replant','alex',5);
  root=loadHousehold(clone(root));
  assert.equal(root.shop.credits,credits);
  tickHousehold(root,5);
  assert.equal(root.shop.credits,credits-30);
  assert.equal(root.financialHistory.entries.length,entries+1);
  assert.equal(root.world.outdoors.gardens[id].harvestedAt,null);
  assert.equal(root.world.outdoors.gardens[id].progressWetMinutes,0);
  const planting=root.world.outdoors.gardens[id].plantedAt;
  root=loadHousehold(clone(root));
  tickHousehold(root,10);
  assert.equal(root.world.outdoors.gardens[id].plantedAt,planting);
  assert.equal(root.shop.credits,credits-30,'no second charge on reload');
});
test('C3c: competing herb-soup storage finishes cannot consume one ingredient twice',()=>{
  const root=household();
  root.kitchen.pantry={vegetables:2,grains:8,dairy:8,herbs:1};
  assert.equal(chooseResidentAction(root,'cook',false,'alex',
    'shop-stove-902',null,null,null,null,'cook.herb-soup'),true);
  const savedAction=clone(root.action);
  const fridge=furnitureActionApproach(root.world,'fridge');
  assert.ok(fridge);
  for(const actor of [root,root.otherSim]){
    actor.position={...fridge};
    actor.action={...clone(savedAction),phase:'using',elapsed:0,cookStage:'storing'};
  }
  tickHousehold(root,6);
  assert.equal(root.kitchen.pantry.herbs,0);
  assert.equal(root.kitchen.pantry.vegetables,0);
  assert.equal(root.kitchen.prepared.reduce((n,x)=>n+x.portions,0),3);
  const saved=loadHousehold(clone(root));
  assert.equal(saved.kitchen.prepared.reduce((n,x)=>n+x.portions,0),3);
  assert.equal(finishKitchenRecipe(saved.kitchen,'cook.herb-soup',0),false);
});
test('C3c: finite purchases debit the canonical family ledger and keep legacy meals',()=>{
  let root=household();
  root.kitchen=restoreKitchen({schema:1,pantry:{vegetables:2,grains:0,dairy:1},
    prepared:[{recipeId:'cook.soup',portions:2}],dirtyDishes:1,lastPantryDay:6});
  assert.equal(root.kitchen.pantry.herbs,0);
  const oldCredits=root.shop.credits;
  const beforeEntries=root.financialHistory.entries.length;
  for(const id of ['vegetables','grains','dairy']){
    const proposal=proposeKitchenRestock(root,id,'mira');
    assert.equal(proposal.ok,true,proposal.reason);
    assert.equal(proposal.entry.delta,-15);
    root.kitchen=proposal.kitchen;
    root.shop=proposal.shop;
    root.financialHistory=proposal.financialHistory;
    root=loadHousehold(clone(root));
  }
  assert.deepEqual(root.kitchen.pantry,
    {vegetables:7,grains:5,dairy:6,herbs:0,meat:0,chicken:0});
  assert.equal(root.shop.credits,oldCredits-45);
  assert.equal(root.financialHistory.entries.length,beforeEntries+3);
  assert.equal(root.kitchen.prepared[0].portions,2,'old meals survive');
  root.shop.credits=0;
  assert.equal(quoteKitchenRestock(root,'vegetables').reason,'insufficient-credits');
  root.shop.credits=50;
  root.kitchen.pantry.vegetables=26;
  assert.equal(quoteKitchenRestock(root,'vegetables').reason,'pantry-full');
  assert.equal(root.kitchen.schema,1);
  assert.equal(root.version,1);
});
