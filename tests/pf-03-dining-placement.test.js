import test from 'node:test';
import assert from 'node:assert/strict';
import {newFurnitureWorld,restoreFurnitureWorld,rotateLocal} from '../src/furniture-catalog.js';
import {diningSeatMatches,diningSeatApproach,isPermittedDiningTuck,chooseDiningSeat} from '../src/dining.js';
import {proposeFurnitureMove} from '../src/furniture-layout.js';
import {buyMarketItem,newFurnitureShop,storeMarketItem,restoreMarketItem} from '../src/furniture-shop.js';
import {isWalkable,findPath} from '../src/navigation.js';

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
    const purchase=buyMarketItem(world,shop,'chair',pose,{residents});
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
