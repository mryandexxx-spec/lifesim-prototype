import test from 'node:test';
import assert from 'node:assert/strict';
import {newFurnitureWorld,restoreFurnitureWorld,rotateLocal} from '../src/furniture-catalog.js';
import {diningSeatMatches,diningSeatApproach,isPermittedDiningTuck,chooseDiningSeat} from '../src/dining.js';
import {proposeFurnitureMove} from '../src/furniture-layout.js';
import {buyMarketItem,newFurnitureShop,storeMarketItem,restoreMarketItem} from '../src/furniture-shop.js';
import {isWalkable,findPath} from '../src/navigation.js';

import {newHousehold,chooseResidentAction,tickHousehold} from '../src/household.js';
import {ACTIONS,arrive} from '../src/simulation.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {READY_MEAL_IDS} from '../src/ready-meal-catalog.js';
import {proposeReadyMealPurchase} from '../src/ready-food.js';

const table={instanceId:'shop-diningtable-90',prefabId:'diningtable',x:9,z:0,yaw:0,location:'home'};
const chair={instanceId:'shop-chair-91',prefabId:'chair',x:9,z:2.5,yaw:0,location:'home'};
const residents=[{x:6,z:-2},{x:6,z:2},{x:12,z:-2},{x:12,z:2}];
const fixture=(...items)=>restoreFurnitureWorld({...newFurnitureWorld(),instances:[...newFurnitureWorld().instances,...items]});
const poseAt=(yaw,d)=>{const p=rotateLocal(0,d,yaw);return {x:table.x+p.x,z:table.z+p.z,yaw};};
for(const yaw of [0,90,180,270]){
  const depth=yaw%180===0?1:1.5;
  test('PF-03 grid tuck, actual dining route and collision at yaw '+yaw,()=>{
    const world=fixture(table,chair);
    const pose=poseAt(yaw,depth);
    const move=proposeFurnitureMove(world,chair.instanceId,pose,{residents});
    assert.equal(move.ok,true,move.reason);
    assert.equal(diningSeatMatches(move.world,table.instanceId,chair.instanceId),true);
    assert.equal(isPermittedDiningTuck(move.world,table.instanceId,chair.instanceId),true);
    const approach=diningSeatApproach(move.world,table.instanceId,chair.instanceId);
    assert.ok(approach?.side);
    assert.ok(isWalkable(approach.x,approach.z,move.world));
    for(const resident of residents){
      assert.ok(findPath(resident,approach,move.world));
      assert.equal(chooseDiningSeat(move.world,resident,table.instanceId)?.instanceId,chair.instanceId);
    }
    assert.equal(proposeFurnitureMove(world,chair.instanceId,poseAt(yaw,depth-.25)).ok,false);
    assert.equal(proposeFurnitureMove(world,chair.instanceId,{...pose,yaw:(yaw+180)%360}).ok,false);
    assert.deepEqual(restoreFurnitureWorld(JSON.parse(JSON.stringify(move.world))),move.world);
    assert.equal(world.instances.at(-1).z,2.5);
  });
  test('PF-03 buy and restore use the same side access at yaw '+yaw,()=>{
    const world=fixture(table),shop=newFurnitureShop(),pose=poseAt(yaw,depth);
    const purchase=buyMarketItem(world,shop,'chair.loft',pose,{residents});
    assert.equal(purchase.ok,true,purchase.reason);
    assert.ok(purchase.shop.credits<shop.credits);
    const stored=storeMarketItem(purchase.world,purchase.shop,purchase.instanceId);
    assert.ok(stored.ok);
    const restored=restoreMarketItem(stored.world,stored.shop,purchase.instanceId,pose,{residents});
    assert.equal(restored.ok,true,restored.reason);
    assert.deepEqual(restored.shop,purchase.shop);
  });
}
test('PF-03 a table may not trap an overlapping chair between other furniture',()=>{
  const seat={...chair,...poseAt(0,1)};
  const blocker=(id,x)=>({instanceId:id,prefabId:'armchair',location:'home',x,z:2.1,yaw:0});
  const world=fixture({...table,z:-.5},seat,blocker('shop-armchair-92',7.9),blocker('shop-armchair-93',10.1));
  const result=proposeFurnitureMove(world,table.instanceId,{x:9,z:0,yaw:0});
  assert.equal(result.ok,false);
});

test('PF-03 two original residents can take and eat one portion at a tucked chair',()=>{
  for(const person of ['alex','mira']){
    const h=newHousehold(),id=READY_MEAL_IDS[2],actor=person==='alex'?h:h.otherSim;
    h.autonomy.enabled=false;h.otherSim.autonomy.enabled=false;
    h.world.furniture.instances.push({...table,x:6.75,z:-1.5},{...chair,x:6.75,z:-.5});
    const tx=proposeReadyMealPurchase(h,id,'fridge',person);
    assert.equal(tx.ok,true,tx.reason);
    h.kitchen=tx.kitchen;h.shop=tx.shop;h.financialHistory=tx.financialHistory;
    actor.needs.hunger=18;
    assert.equal(chooseResidentAction(h,'dining',false,person,table.instanceId,
      null,null,null,null,id),true);
    assert.equal(actor.action.diningSeatInstanceId,chair.instanceId);
    actor.position={...furnitureActionApproach(h.world,'fridge')};
    arrive(actor);actor.action.diningStage='taking';tickHousehold(h,6);
    assert.equal(h.kitchen.prepared[0].portions,1);
    const approach=diningSeatApproach(h.world,table.instanceId,chair.instanceId);
    assert.ok(approach?.side);
    actor.position={...approach};arrive(actor);actor.action.diningStage='eating';
    const hunger=actor.needs.hunger,balance=h.shop.credits;
    tickHousehold(h,6);
    assert.equal(actor.action.cookedRecipeId,id);
    assert.ok(actor.needs.hunger>hunger);
    assert.equal(h.shop.credits,balance);
    tickHousehold(h,ACTIONS.dining.duration-6);
    assert.equal(actor.action,null);
    assert.equal(h.kitchen.dirtyDishes,1);
    assert.equal(h.financialHistory.entries.length,1);
  }
});
