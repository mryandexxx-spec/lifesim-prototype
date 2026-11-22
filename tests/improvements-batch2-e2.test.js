import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {marketListing} from '../src/furniture-shop.js';
import {DELIVERY_GAME_MINUTES} from '../src/ready-food.js';
import {homeMarketListing,quoteHomeDelivery,proposeHomeDelivery,
  settleHomeDeliveries} from '../src/marketplace-home.js';

const product=root=>{
  const item=homeMarketListing().find(x=>x.price>0&&x.price<=root.shop.credits);
  assert.ok(item,'at least one existing affordable canonical item');
  return item;
};
function checkout(root,itemId,actor='alex'){
  const tx=proposeHomeDelivery(root,itemId,actor);
  assert.equal(tx.ok,true,tx.reason);
  root.homeMarket=tx.homeMarket;root.shop=tx.shop;
  root.financialHistory=tx.financialHistory;
  return tx;
}

test('BlinStavka furniture uses the existing SKU and exact canonical shop price',()=>{
  const root=newHousehold(),offer=product(root);
  assert.equal(homeMarketListing().length,marketListing().length);
  const quote=quoteHomeDelivery(root,offer.itemId);
  assert.equal(quote.ok,true);
  assert.equal(quote.offer.itemId,offer.itemId);
  assert.equal(quote.price,offer.price);
  assert.equal(quote.dueAt,Math.floor(root.minutes)+DELIVERY_GAME_MINUTES);
  assert.equal(quoteHomeDelivery(root,'phantom').reason,'unknown-item');
});

test('paid furnishing arrives after actual game time to canonical warehouse exactly once',()=>{
  const root=newHousehold(),offer=product(root);
  const initial=root.world.furniture.instances.length;
  const credits=root.shop.credits,nextId=root.shop.nextId;
  const ledger=root.financialHistory.entries.length;
  const tx=checkout(root,offer.itemId);
  assert.equal(root.shop.credits,credits-offer.price);
  assert.equal(root.shop.nextId,nextId+1);
  assert.equal(root.financialHistory.entries.length,ledger+1);
  assert.equal(root.world.furniture.instances.length,initial);
  const restored=loadHousehold(JSON.parse(JSON.stringify(root)));
  assert.equal(restored.homeMarket.orders.length,1);
  tickHousehold(restored,DELIVERY_GAME_MINUTES-1);
  assert.equal(restored.world.furniture.instances.length,initial);
  tickHousehold(restored,1);
  assert.equal(restored.homeMarket.orders.length,0);
  assert.equal(restored.world.furniture.instances.length,initial+1);
  const item=restored.world.furniture.instances.find(x=>x.instanceId===tx.instanceId);
  assert.equal(item.location,'storage');
  assert.equal(item.prefabId,offer.prefabId);
  assert.equal(item.itemDefinitionId,offer.itemId);
  assert.equal(item.purchasePriceCredits,offer.price);
  tickHousehold(restored,30);
  assert.equal(restored.world.furniture.instances.length,initial+1);
  assert.equal(restored.financialHistory.entries.length,ledger+1);
  assert.equal(restored.shop.credits,credits-offer.price);
});

test('sim pause and lack of storage slots hold paid merchandise without refund or phantom spawn',()=>{
  const root=newHousehold(),offer=product(root);
  const tx=checkout(root,offer.itemId,'mira');
  root.paused=true;
  tickHousehold(root,DELIVERY_GAME_MINUTES+3);
  assert.equal(root.homeMarket.orders.length,1);
  assert.equal(root.world.furniture.instances.some(x=>x.instanceId===tx.instanceId),false);
  root.paused=false;
  root.minutes=tx.dueAt;
  const original=root.world.furniture.instances;
  root.world.furniture.instances=Array.from({length:128},(_,i)=>({
    instanceId:'home-full-'+i,prefabId:'chair',x:0,z:0,yaw:0,location:'storage'
  }));
  assert.equal(settleHomeDeliveries(root).length,0);
  assert.equal(root.homeMarket.orders.length,1);
  root.world.furniture.instances=original;
  assert.equal(settleHomeDeliveries(root).length,1);
  assert.equal(root.homeMarket.orders.length,0);
});

test('two paid orders reserve distinct physical IDs and a single balance ledger',()=>{
  const root=newHousehold(),offer=product(root);
  const first=checkout(root,offer.itemId,'alex');
  const second=checkout(root,offer.itemId,'mira');
  assert.notEqual(first.instanceId,second.instanceId);
  assert.notEqual(first.order.id,second.order.id);
  assert.equal(root.homeMarket.orders.length,2);
  root.minutes+=DELIVERY_GAME_MINUTES;
  assert.equal(settleHomeDeliveries(root).length,2);
  assert.equal(settleHomeDeliveries(root).length,0);
  assert.equal(root.world.furniture.instances.filter(x=>
    [first.instanceId,second.instanceId].includes(x.instanceId)).length,2);
});

test('old v1 saves migrate empty marketplace, unknown or duplicate deliveries never mint goods',()=>{
  const root=newHousehold(),offer=product(root);
  delete root.homeMarket;
  assert.deepEqual(loadHousehold(JSON.parse(JSON.stringify(root))).homeMarket.orders,[]);
  root.homeMarket={schema:1,orders:[
    {id:'home-order-1',itemId:offer.itemId,instanceId:'shop-'+offer.prefabId+'-123',
      price:offer.price,orderedAt:480,dueAt:498},
    {id:'home-order-1',itemId:offer.itemId,instanceId:'shop-'+offer.prefabId+'-124',
      price:offer.price,orderedAt:480,dueAt:498},
    {id:'home-order-2',itemId:'not-real',instanceId:'shop-chair-125',
      price:10,orderedAt:480,dueAt:498}
  ]};
  const restored=loadHousehold(JSON.parse(JSON.stringify(root)));
  assert.equal(restored.homeMarket.orders.length,1);
  assert.equal(restored.version,1);
  const noFunds=newHousehold();noFunds.shop.credits=0;
  assert.equal(quoteHomeDelivery(noFunds,offer.itemId).ok,false);
});
