import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {KITCHEN_RESTOCK_LABELS,quotePantryDelivery,proposePantryDelivery,
  settlePantryDeliveries,ingredientPack} from '../src/kitchen-market.js';
import {DELIVERY_GAME_MINUTES} from '../src/ready-food.js';

test('BlinStavka phone sells actual pantry packs at existing canonical prices and quantities',()=>{
  const root=newHousehold();
  for(const id of Object.keys(KITCHEN_RESTOCK_LABELS)){
    const quote=quotePantryDelivery(root,id);
    assert.equal(quote.ok,true,id);
    const pack=ingredientPack(id);
    assert.equal(quote.units,pack.units);
    assert.equal(quote.price,pack.price);
    assert.equal(quote.dueAt,Math.floor(root.minutes)+DELIVERY_GAME_MINUTES);
  }
});
test('paid grocery order arrives at actual shared fridge after clock delay, exactly once',()=>{
  const root=newHousehold(),before=root.kitchen.pantry.vegetables;
  const credits=root.shop.credits;
  const quote=proposePantryDelivery(root,'vegetables','alex');
  assert.equal(quote.ok,true);
  assert.equal(quote.kitchen.pantry.vegetables,before);
  assert.equal(quote.shop.credits,credits-quote.price);
  root.kitchen=quote.kitchen;root.shop=quote.shop;root.financialHistory=quote.financialHistory;
  assert.equal(root.kitchen.pantryDeliveries.length,1);
  const reloaded=loadHousehold(JSON.parse(JSON.stringify(root)));
  assert.equal(reloaded.kitchen.pantryDeliveries.length,1);
  tickHousehold(reloaded,DELIVERY_GAME_MINUTES-1);
  assert.equal(reloaded.kitchen.pantry.vegetables,before);
  tickHousehold(reloaded,1);
  assert.equal(reloaded.kitchen.pantry.vegetables,before+quote.units);
  assert.equal(reloaded.kitchen.pantryDeliveries.length,0);
  tickHousehold(reloaded,30);
  assert.equal(reloaded.kitchen.pantry.vegetables,before+quote.units);
  assert.equal(reloaded.shop.credits,credits-quote.price);
});
test('pending deliveries reserve pantry capacity, pause and missing fridge preserve paid order',()=>{
  const root=newHousehold();root.kitchen.pantry.meat=27;
  const first=proposePantryDelivery(root,'meat','mira');assert.equal(first.ok,true);
  root.kitchen=first.kitchen;root.shop=first.shop;root.financialHistory=first.financialHistory;
  assert.equal(quotePantryDelivery(root,'meat').ok,false);
  root.paused=true;tickHousehold(root,18);
  assert.equal(root.kitchen.pantry.meat,27);
  root.paused=false;root.minutes+=18;
  const fridge=root.world.furniture.instances.find(x=>x.prefabId==='fridge'&&x.location==='home');
  assert.ok(fridge);
  fridge.location='warehouse';
  assert.deepEqual(settlePantryDeliveries(root),[]);
  assert.equal(root.kitchen.pantryDeliveries.length,1);
  fridge.location='home';
  assert.equal(settlePantryDeliveries(root).length,1);
  assert.equal(root.kitchen.pantry.meat,30);
});
test('legacy v1 kitchens load with empty new delivery queue and invalid orders are rejected',()=>{
  const root=newHousehold();
  delete root.kitchen.pantryDeliveries;
  let saved=loadHousehold(JSON.parse(JSON.stringify(root)));
  assert.deepEqual(saved.kitchen.pantryDeliveries,[]);
  root.kitchen.pantryDeliveries=[
    {id:'pantry-order-1',ingredientId:'vegetables',units:5,orderedAt:480,dueAt:498},
    {id:'pantry-order-1',ingredientId:'vegetables',units:5,orderedAt:480,dueAt:498},
    {id:'pantry-order-2',ingredientId:'unknown',units:5,orderedAt:480,dueAt:498}
  ];
  saved=loadHousehold(JSON.parse(JSON.stringify(root)));
  assert.equal(saved.kitchen.pantryDeliveries.length,1);
  assert.equal(saved.version,1);
});
