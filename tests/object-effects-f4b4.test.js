import test from 'node:test';
import assert from 'node:assert/strict';
import {FURNITURE_PRODUCTS,FURNITURE_APPEARANCES} from '../src/furniture-products.js';
import {legacyObjectRegistry} from '../src/object-legacy-adapter.js';
import {marketListing,SHOP_ITEMS,newFurnitureShop} from '../src/furniture-shop.js';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {captureObjectUse,settleObjectUseStep} from '../src/object-use-runtime.js';

const registry=legacyObjectRegistry();
function ready(id='alex'){
  const home=newHousehold(),actor=id==='alex'?home:home.otherSim;
  const sofa=home.world.furniture.instances.find(x=>x.instanceId==='home-sofa-1');
  sofa.itemDefinitionId='sofa.comfort';
  actor.action={id:'sofa',phase:'using',elapsed:0,automatic:false,
    targetInstanceId:sofa.instanceId};
  actor.needs.energy=50;actor.needs.fun=40;
  return {home,actor,sofa};
}
test('F4b4: separate comfort sofa SKU and honest shop description',()=>{
  const offer=FURNITURE_PRODUCTS.find(x=>x.itemId==='sofa.comfort');
  assert.equal(offer.prefabId,'sofa');
  assert.equal(offer.price,700);
  assert.equal(marketListing().find(x=>x.itemId==='sofa.comfort').effectText,
    'Отдых → досуг и +0,2 энергии за игровую минуту');
  assert.equal(SHOP_ITEMS.find(x=>x.prefabId==='sofa').price,550);
  assert.ok(FURNITURE_APPEARANCES['upholstery.sage']['sofa seat']);
  assert.equal(newFurnitureShop().credits,5000);
  assert.ok(Object.isFrozen(offer.effects[0]));
});
test('F4b4: bonus registered for ONLY comfort variant and ONLY sofa rest',()=>{
  assert.equal(registry.items['legacy.sofa'].effects.length,0);
  assert.equal(registry.items['legacy.tv'].effects.length,0);
  assert.equal(registry.items['plant.amber'].effects.length,0);
  const x=registry.items['sofa.comfort'].effects;
  assert.equal(x.length,1);
  assert.deepEqual([x[0].statId,x[0].actionId,x[0].mode,x[0].amount],
    ['needs.energy','sofa','perMinute',0.2]);
});
test('F4b4: active rest improves secondary energy without double fun grant',()=>{
  const {home,actor}=ready();
  tickHousehold(home,10);
  assert.ok(Math.abs(actor.needs.energy-52)<1e-5,
    'sofa prevents decay and adds exactly two energy points');
  assert.ok(actor.needs.fun>40&&actor.needs.fun<70,
    'fun comes only from baseline ACTIONS.sofa');
});
test('F4b4: old sofa continues preventing energy loss without healing it',()=>{
  const {home,actor,sofa}=ready();
  delete sofa.itemDefinitionId;
  tickHousehold(home,10);
  assert.equal(actor.needs.energy,50);
});
test('F4b4: no award before arrival, during pause or from other TV use',()=>{
  const {home,actor}=ready();
  actor.action.phase='walking';
  tickHousehold(home,5);
  assert.ok(actor.needs.energy<50);
  const afterWalk=actor.needs.energy;
  home.paused=true; tickHousehold(home,10);
  assert.equal(actor.needs.energy,afterWalk);
  home.paused=false;
  actor.action={id:'tv',phase:'using',elapsed:0,automatic:false,
    targetInstanceId:'home-tv-1',watchSeatInstanceId:'home-sofa-1'};
  const before=actor.needs.energy;
  tickHousehold(home,1);
  assert.equal(actor.needs.energy,before,'seated TV cancels decay but does not earn rest bonus');
});
test('F4b4: bonus belongs to the same physical SKU and never to storage or invalid target',()=>{
  const {home,actor,sofa}=ready();
  const receipt=captureObjectUse(actor);
  actor.minutes+=1;actor.action.elapsed+=1;
  sofa.location='storage';
  assert.deepEqual(settleObjectUseStep({world:home.world,actor,before:receipt}),[]);
  sofa.location='home';sofa.itemDefinitionId='legacy.sofa';
  assert.deepEqual(settleObjectUseStep({world:home.world,actor,before:receipt}),[]);
  sofa.itemDefinitionId='sofa.comfort';actor.action.targetInstanceId='home-bed-1';
  assert.deepEqual(settleObjectUseStep({world:home.world,actor,before:receipt}),[]);
});
test('F4b4: compatible v1 save reload keeps purchased comfort identity and bonus',()=>{
  const {home}=ready();
  const restored=loadHousehold(JSON.parse(JSON.stringify(home)));
  assert.equal(restored.version,1);
  assert.equal(restored.world.furniture.instances.find(x=>x.prefabId==='sofa').itemDefinitionId,'sofa.comfort');
  restored.needs.energy=50;
  tickHousehold(restored,5);
  assert.ok(Math.abs(restored.needs.energy-51)<1e-5);
});
test('F4b4: second resident earns own credit while Alex has no action',()=>{
  const {home}=ready('mira');
  home.action=null;
  home.otherSim.needs.energy=50;
  tickHousehold(home,5);
  assert.ok(Math.abs(home.otherSim.needs.energy-51)<1e-5);
  assert.ok(home.needs.energy<67);
});
