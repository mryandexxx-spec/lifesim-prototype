import test from 'node:test';
import assert from 'node:assert/strict';
import {newFurnitureWorld,restoreFurnitureWorld,ORIGINAL_FURNITURE} from '../src/furniture-catalog.js';
import {newHousehold,loadHousehold} from '../src/household.js';
import {SHOP_SCHEMA,SHOP_START_CREDITS,SHOP_ITEMS,SHOP_SELL_PERCENT,
  newFurnitureShop,restoreFurnitureShop,buyMarketItem,storeMarketItem,
  restoreMarketItem,sellMarketItem,findMarketPlacement,marketListing} from '../src/furniture-shop.js';
const copy=v=>JSON.parse(JSON.stringify(v));
const setup=()=>({world:newFurnitureWorld(),shop:newFurnitureShop()});
const people={residents:[{x:-.8,z:2.95},{x:-.25,z:.35}]};
test('F2.1 shop catalog has decor and two functional goods, still provisional',()=>{
  assert.deepEqual(SHOP_ITEMS.map(x=>x.prefabId),['plant','table','nightstand','tv','sofa','bed']);
  assert.equal(marketListing().length,37);
  assert.equal(SHOP_START_CREDITS,5000);
  assert.equal(newFurnitureShop().schema,SHOP_SCHEMA);
});
test('invalid shop state heals once while valid state roundtrips without free refill',()=>{
  assert.deepEqual(restoreFurnitureShop(undefined),newFurnitureShop());
  const state={schema:SHOP_SCHEMA,credits:120,nextId:12};
  assert.deepEqual(restoreFurnitureShop(copy(state)),state);
  assert.deepEqual(restoreFurnitureShop(restoreFurnitureShop(state)),state);
  assert.deepEqual(restoreFurnitureShop({schema:1,credits:-1,nextId:3}),newFurnitureShop());
});
test('purchase requires safe location, charges once and creates unique repeated same prefab',()=>{
  let {world,shop}=setup();
  const pose=findMarketPlacement(world,shop,'plant',people);
  assert.ok(pose,'room needs at least one real free planting position');
  const bought=buyMarketItem(world,shop,'plant',pose,people);
  assert.equal(bought.ok,true);
  assert.equal(shop.credits,5000,'caller unchanged');
  assert.equal(world.instances.length,10);
  assert.equal(bought.shop.credits,5000-130);
  assert.equal(bought.world.instances.length,11);
  assert.ok(bought.world.instances.find(x=>x.instanceId===bought.instanceId));
  const otherPose=findMarketPlacement(bought.world,bought.shop,'plant',people);
  assert.ok(otherPose);
  const twice=buyMarketItem(bought.world,bought.shop,'plant',otherPose,people);
  assert.equal(twice.ok,true);
  assert.notEqual(twice.instanceId,bought.instanceId);
  assert.equal(new Set(twice.world.instances.map(x=>x.instanceId)).size,12);
  assert.deepEqual(restoreFurnitureWorld(copy(twice.world)),twice.world);
});
test('purchase rejects invalid, overlapping, out of room and insufficient funds atomically',()=>{
  let {world,shop}=setup();
  const before=copy(world),coins=copy(shop);
  for(const [type,pose] of [['sofa',{x:0,z:0,yaw:0}],
    ['plant',{x:8,z:8,yaw:0}],['plant',{x:1.355,z:1.59,yaw:0}],
    ['plant',{x:0,z:0,yaw:45}]]){
    assert.equal(buyMarketItem(world,shop,type,pose,people).ok,false);
  }
  assert.deepEqual(world,before);assert.deepEqual(shop,coins);
  assert.equal(buyMarketItem(world,{schema:1,credits:1,nextId:1},'tv',
    {x:0,z:-2,yaw:0},people).reason,'insufficient-credits');
});
test('home => storage => restored home preserves same identity and charges nothing extra',()=>{
  let {world,shop}=setup();
  const plant=world.instances.find(x=>x.prefabId==='plant');
  const stored=storeMarketItem(world,shop,plant.instanceId);
  assert.equal(stored.ok,true);
  assert.equal(stored.world.instances.find(x=>x.instanceId===plant.instanceId).location,'storage');
  assert.equal(stored.shop.credits,shop.credits);
  const putBack=restoreMarketItem(stored.world,stored.shop,plant.instanceId,plant,people);
  assert.equal(putBack.ok,true);
  assert.equal(putBack.world.instances.find(x=>x.instanceId===plant.instanceId).location,'home');
  assert.equal(putBack.shop.credits,shop.credits);
});
test('busy furniture cannot store/sell and essential fixtures are protected',()=>{
  let {world,shop}=setup();
  for(const type of ['bed','sofa','fridge','shower','toilet','counter']){
    const item=world.instances.find(x=>x.prefabId===type);
    assert.equal(storeMarketItem(world,shop,item.instanceId).reason,'protected-item');
    assert.equal(sellMarketItem(world,shop,item.instanceId).reason,'protected-item');
  }
  const item=world.instances.find(x=>x.prefabId==='tv');
  const locks={lockedInstanceIds:[item.instanceId]};
  assert.equal(storeMarketItem(world,shop,item.instanceId,locks).reason,'reserved');
  assert.equal(sellMarketItem(world,shop,item.instanceId,locks).reason,'reserved');
});
test('selling credits exactly 70%, removes instance and is not repeatable',()=>{
  const {world,shop}=setup(), item=world.instances.find(x=>x.prefabId==='plant');
  const sold=sellMarketItem(world,shop,item.instanceId);
  assert.equal(sold.ok,true);
  assert.equal(sold.amount,Math.floor(130*SHOP_SELL_PERCENT/100));
  assert.equal(sold.shop.credits,shop.credits+sold.amount);
  assert.equal(sold.world.instances.find(x=>x.instanceId===item.instanceId),undefined);
  assert.equal(sellMarketItem(sold.world,sold.shop,item.instanceId).ok,false);
});
test('no personal simulations, action queues or saves are changed by rejected offer',()=>{
  const root=newHousehold(),before=copy(root);
  const denied=buyMarketItem(root.world.furniture,newFurnitureShop(),'plant',
    {x:500,z:500,yaw:0},people);
  assert.equal(denied.ok,false);
  assert.deepEqual(root,before);
  const loaded=loadHousehold(copy(root));
  assert.equal(loaded.version,1);
  assert.equal(loaded.world.furniture.instances.length,ORIGINAL_FURNITURE.length);
});
