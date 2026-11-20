import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {gardenApproach,gardenView,gardenRequestStillValid,settleGardenAction,
  restoreGardenRecord,GARDEN_DURATION,GARDEN_REPLANT_PRICE} from '../src/gardening.js';
import {restoreKitchen,replenishKitchen,KITCHEN_HERB_LIMIT} from '../src/kitchen.js';
import {gardenActionSheet} from '../src/garden-presentation.js';
import {sanitizeQueueCommand,enqueueAction,pendingActions} from '../src/action-queue.js';

const copy=x=>JSON.parse(JSON.stringify(x));
function planted(itemId='garden.herb.mint'){
  const root=newHousehold(),p=previewOutdoorFeatureEdit(root,{
    operation:'place',itemId,pose:{x:19,z:8,yaw:0}});
  assert.equal(p.ok,true,p.reason);
  const c=commitOutdoorFeatureEdit(root,p);
  assert.equal(c.ok,true,c.reason);
  c.root.autonomy.enabled=false;c.root.otherSim.autonomy.enabled=false;
  return {game:c.root,id:c.root.world.outdoors.features[0].instanceId};
}
function mature(game,id){
  game.minutes+=4320;game.otherSim.minutes=game.minutes;
  Object.assign(game.world.outdoors.gardens[id],{
    evaluatedAt:game.minutes,progressWetMinutes:4320});
}
function act(game,id,actionId,residentId='alex'){
  const actor=residentId==='alex'?game:game.otherSim;
  const plan=gardenApproach(game.world,id,actor.position);assert.ok(plan);
  actor.position={...plan.goal};
  actor.action={id:'garden',phase:'using',automatic:false,elapsed:0,
    targetInstanceId:id,gardenActionId:actionId,
    gardenPlantedAt:game.world.outdoors.gardens[id].plantedAt,gardenGoal:{...plan.goal}};
  tickHousehold(game,GARDEN_DURATION[actionId]);
  assert.equal(actor.action,null);
}
test('LOT-C3a old kitchen saves get zero herbs, finite stock never receives free dawn refills',()=>{
  const k=restoreKitchen({schema:1,pantry:{vegetables:4,grains:6,dairy:2},
    prepared:[],dirtyDishes:0,lastPantryDay:0});
  assert.equal(k.pantry.herbs,0);
  k.pantry.herbs=13;
  assert.ok(replenishKitchen(k,1500));
  assert.equal(k.pantry.herbs,13);
  assert.equal(restoreKitchen({...k,pantry:{...k.pantry,herbs:17}}).pantry.herbs,0);
  assert.equal(restoreKitchen({...k,pantry:{...k.pantry,herbs:16}}).pantry.herbs,KITCHEN_HERB_LIMIT);
});
test('LOT-C3a harvest only mature herbs, physical 12m completion, exactly-once reload',()=>{
  const {game,id}=planted();
  assert.equal(gardenRequestStillValid(game,'alex',id,'harvest'),false);
  mature(game,id);
  assert.equal(gardenRequestStillValid(game,'alex',id,'harvest'),true);
  assert.equal(gardenActionSheet(game,'alex',id).actions.some(a=>a.actionId==='harvest'&&a.available),true);
  act(game,id,'harvest');
  assert.equal(game.kitchen.pantry.herbs,2);
  assert.equal(game.world.outdoors.gardens[id].harvestedAt,game.minutes);
  assert.equal(settleGardenAction(game,'mira',id,'harvest'),false);
  const saved=loadHousehold(copy(game));
  assert.equal(saved.kitchen.pantry.herbs,2);
  assert.equal(gardenRequestStillValid(saved,'mira',id,'harvest'),false);
  assert.equal(gardenView(saved.world.outdoors,id,saved.minutes).harvestedAt,game.minutes);
});
test('LOT-C3a flowers and full pantry never yield herb harvest',()=>{
  const {game:flower,id:fid}=planted('garden.flower.calendula');
  mature(flower,fid);assert.equal(gardenRequestStillValid(flower,'alex',fid,'harvest'),false);
  const {game,id}=planted();mature(game,id);
  game.kitchen.pantry.herbs=KITCHEN_HERB_LIMIT-1;
  assert.equal(gardenRequestStillValid(game,'alex',id,'harvest'),false);
  assert.equal(gardenActionSheet(game,'alex',id).actions.find(a=>a.actionId==='harvest').available,false);
  game.kitchen.pantry.herbs=KITCHEN_HERB_LIMIT-2;
  assert.equal(gardenRequestStillValid(game,'alex',id,'harvest'),true);
});
test('LOT-C3a replant after harvest debits once with finance journal and new planting ID',()=>{
  const {game,id}=planted();mature(game,id);
  assert.equal(gardenRequestStillValid(game,'alex',id,'replant'),false);
  act(game,id,'harvest');
  const old=game.world.outdoors.gardens[id].plantedAt;
  const credits=game.shop.credits,entries=game.financialHistory.entries.length;
  act(game,id,'replant');
  assert.equal(game.shop.credits,credits-GARDEN_REPLANT_PRICE);
  assert.equal(game.financialHistory.entries.length,entries+1);
  const state=game.world.outdoors.gardens[id];
  assert.ok(state.plantedAt>old);assert.equal(state.progressWetMinutes,0);
  assert.equal(state.harvestedAt,null);
  assert.equal(settleGardenAction(game,'alex',id,'replant'),false);
  const saved=loadHousehold(copy(game));
  assert.equal(saved.shop.credits,game.shop.credits);
  assert.equal(saved.financialHistory.entries.length,game.financialHistory.entries.length);
  assert.equal(saved.world.outdoors.gardens[id].plantedAt,state.plantedAt);
});
test('LOT-C3a saved FIFO intent, pause and cancelled in-flight harvest are harmless',()=>{
  const {game,id}=planted();mature(game,id);
  assert.deepEqual(sanitizeQueueCommand('alex',
    {type:'garden',instanceId:id,actionId:'harvest'},['alex','mira']),
    {type:'garden',instanceId:id,actionId:'harvest'});
  assert.ok(enqueueAction(game.actionQueues,'alex',
    {type:'garden',instanceId:id,actionId:'harvest'}));
  const saved=loadHousehold(copy(game));
  assert.equal(pendingActions(saved.actionQueues,'alex').length,1);
  saved.paused=true;tickHousehold(saved,12);
  assert.equal(saved.kitchen.pantry.herbs,0);
  saved.paused=false;saved.actionQueues.byResident.alex=[];
  const plan=gardenApproach(saved.world,id,saved.position);
  saved.position={...plan.goal};
  saved.action={id:'garden',phase:'using',automatic:false,elapsed:7,
    targetInstanceId:id,gardenActionId:'harvest',
    gardenPlantedAt:saved.world.outdoors.gardens[id].plantedAt,gardenGoal:{...plan.goal}};
  const mid=loadHousehold(copy(saved));
  assert.equal(mid.action?.gardenActionId,'harvest');
  mid.action=null;tickHousehold(mid,12);
  assert.equal(mid.kitchen.pantry.herbs,0);
});
test('LOT-C3a malformed harvest metadata is sanitized without destroying mature plot',()=>{
  const raw={schema:1,plantedAt:480,evaluatedAt:4800,progressWetMinutes:4320,
    hydratedUntil:2640,lastWateredAt:480,harvestedAt:1e100};
  const restored=restoreGardenRecord(raw,4800);
  assert.equal(restored.progressWetMinutes,4320);
  assert.equal(restored.harvestedAt,null);
  assert.equal(restoreGardenRecord({...raw,harvestedAt:4700},4800).harvestedAt,4700);
});
