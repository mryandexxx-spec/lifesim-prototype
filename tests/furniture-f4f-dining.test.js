import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,chooseResidentAction,tickHousehold,furnitureAvailable} from '../src/household.js';
import {arrive,ACTIONS} from '../src/simulation.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {chooseDiningSeat,diningSeatMatches,diningSeatApproach,diningPlatePosition} from '../src/dining.js';

function home(){
  const h=newHousehold();
  h.world.furniture.instances.push(
    {instanceId:'shop-dining-f4f',prefabId:'diningtable',itemDefinitionId:'diningtable.farm',
      x:8,z:0,yaw:0,location:'home'},
    {instanceId:'shop-chair-a',prefabId:'chair',itemDefinitionId:'chair.loft',
      x:8,z:2.25,yaw:0,location:'home'},
    {instanceId:'shop-chair-b',prefabId:'chair',itemDefinitionId:'chair.cross',
      x:8,z:-2.25,yaw:180,location:'home'}
  );
  return h;
}
test('F4F: both existing dining variants become a real action source',()=>{
  assert.equal(ACTIONS.dining.label,'Пообедать за столом');
  const h=home();
  assert.equal(h.world.furniture.instances.filter(x=>x.prefabId==='diningtable').length,1);
  assert.equal(furnitureAvailable(h,'dining','alex','shop-dining-f4f'),true);
  assert.equal(diningSeatMatches(h.world,'shop-dining-f4f','shop-chair-a'),true);
  assert.equal(diningSeatMatches(h.world,'shop-dining-f4f','shop-chair-b'),true);
});
test('F4F: orientation and distance filter chairs, never armchairs',()=>{
  const h=home();
  h.world.furniture.instances[ h.world.furniture.instances.length-1 ].yaw=0;
  assert.equal(diningSeatMatches(h.world,'shop-dining-f4f','shop-chair-b'),false);
  h.world.furniture.instances.push({instanceId:'shop-armchair',prefabId:'armchair',x:8,z:2.3,yaw:0,location:'home'});
  assert.equal(diningSeatMatches(h.world,'shop-dining-f4f','shop-armchair'),false);
  assert.equal(diningSeatMatches(h.world,'missing','shop-chair-a'),false);
  assert.equal(diningPlatePosition(h.world,'missing','shop-chair-a'),null);
});
test('F4F: real path to food and chair; not an instant hunger gain',()=>{
  const h=home(),start=h.needs.hunger;
  const seat=chooseDiningSeat(h.world,h.position,'shop-dining-f4f');
  assert.ok(seat,'actual reachable seat should exist');
  assert.equal(chooseResidentAction(h,'dining',false,'alex','shop-dining-f4f'),true);
  assert.equal(h.action.diningSeatInstanceId,seat.instanceId);
  assert.equal(h.action.diningStage,'toFridge');
  tickHousehold(h,3);
  assert.ok(h.needs.hunger<start,'walking alone must not feed the resident');
  const atFridge=furnitureActionApproach(h.world,'fridge');
  h.position={...atFridge};arrive(h);h.action.diningStage='taking';
  const beforeTaking=h.needs.hunger;
  tickHousehold(h,6);
  assert.equal(h.action.diningStage,'toSeat');
  assert.equal(h.action.phase,'walking');
  assert.ok(h.needs.hunger<beforeTaking,'taking food must not feed the resident');
  const point=diningSeatApproach(h.world,h.action.targetInstanceId,seat.instanceId);
  assert.ok(point);
  h.position={...point};arrive(h);h.action.diningStage='eating';
  const beforeEating=h.needs.hunger;
  tickHousehold(h,10);
  assert.ok(h.needs.hunger>beforeEating,'only verified bites restore hunger');
  const plate=diningPlatePosition(h.world,h.action.targetInstanceId,seat.instanceId);
  assert.ok(plate && plate.y>.7);
});
test('F4F: seat is exclusive while eating, two diners use separate seats',()=>{
  const h=home();
  assert.equal(chooseResidentAction(h,'dining',false,'alex','shop-dining-f4f'),true);
  assert.equal(furnitureAvailable(h,'seat','mira',h.action.diningSeatInstanceId),false);
  assert.equal(furnitureAvailable(h,'dining','mira','shop-dining-f4f'),false,
    'a single refrigerator allows only one collector at a time');
  h.position={...furnitureActionApproach(h.world,'fridge')};arrive(h);
  h.action.diningStage='taking';tickHousehold(h,6);
  assert.equal(furnitureAvailable(h,'dining','mira','shop-dining-f4f'),true);
  assert.equal(chooseResidentAction(h,'dining',false,'mira','shop-dining-f4f'),true);
  assert.notEqual(h.action.diningSeatInstanceId,h.otherSim.action.diningSeatInstanceId);
});
test('F4F: invalidated chair cancels before reward, pause freezes action',()=>{
  const h=home();
  assert.equal(chooseResidentAction(h,'dining',false,'alex','shop-dining-f4f'),true);
  h.position={...furnitureActionApproach(h.world,'fridge')};arrive(h);
  h.action.diningStage='taking';tickHousehold(h,6);
  h.position={...diningSeatApproach(h.world,h.action.targetInstanceId,h.action.diningSeatInstanceId)};
  arrive(h);h.action.diningStage='eating';
  const oldElapsed=h.action.elapsed,oldHunger=h.needs.hunger;
  h.paused=true;tickHousehold(h,5);
  assert.equal(h.action.elapsed,oldElapsed);
  assert.equal(h.needs.hunger,oldHunger);
  h.paused=false;
  h.world.furniture.instances.find(x=>x.instanceId===h.action.diningSeatInstanceId).location='storage';
  tickHousehold(h,1);
  assert.equal(h.action,null);
  assert.ok(h.needs.hunger<=oldHunger);
});
test('F4F: optional v1 meal-stage, chair identity and other residents survive load',()=>{
  const h=home();
  assert.equal(chooseResidentAction(h,'dining',false,'alex','shop-dining-f4f'),true);
  h.position={...furnitureActionApproach(h.world,'fridge')};arrive(h);
  h.action.diningStage='taking';tickHousehold(h,6);
  h.position={...diningSeatApproach(h.world,h.action.targetInstanceId,h.action.diningSeatInstanceId)};
  arrive(h);h.action.diningStage='eating';tickHousehold(h,3);
  const copy=loadHousehold(structuredClone(h));
  assert.equal(copy.version,1);
  assert.equal(copy.action?.id,'dining');
  assert.equal(copy.action?.diningStage,'eating');
  assert.equal(copy.action?.diningSeatInstanceId,h.action.diningSeatInstanceId);
  assert.ok(copy.otherSim);
  const old=loadHousehold({version:1,minutes:20,needs:{hunger:50,energy:50,fun:50,hygiene:50,bladder:50,social:50},position:{x:-.8,z:2.95}});
  assert.equal(old.version,1);
  assert.equal(old.action,null);
});
