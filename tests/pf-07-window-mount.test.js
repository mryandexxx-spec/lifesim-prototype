import test from 'node:test';
import assert from 'node:assert/strict';
import {newConstructionWorld,starterShellSegments} from '../src/construction.js';
import {newFurnitureWorld,restoreFurnitureWorld} from '../src/furniture-catalog.js';
import {newFurnitureShop,buyMarketItem,findMarketPlacement,storeMarketItem,restoreMarketItem,findStoredPlacement} from '../src/furniture-shop.js';
import {proposeFurnitureMove} from '../src/furniture-layout.js';
import {windowPlacementCandidates,windowMountPose,validateWindowMounts,migrateWindowMounts,windowMountVisible} from '../src/window-mount.js';
const ids=['mesh.green_curtains','mesh.wooden_blinds'];
const context=()=>({construction:newConstructionWorld()});
test('PF-07 both panels reject open floor and outside, find continuous wall, charge once and persist',()=>{
 for(const sku of ids){
  const opts=context(),world=newFurnitureWorld(),shop=newFurnitureShop();
  for(const [x,z] of [[0,0],[0,7],[100,100]])assert.equal(buyMarketItem(world,shop,sku,{x,z,yaw:0},opts).ok,false);
  const pose=findMarketPlacement(world,shop,sku,opts);assert.ok(pose);
  const b=buyMarketItem(world,shop,sku,pose,opts);assert.ok(b.ok,b.reason);
  const item=b.world.instances.find(x=>x.instanceId===b.instanceId);
  assert.ok(item.mount);assert.equal(b.shop.credits,shop.credits-item.purchasePriceCredits);
  assert.deepEqual(restoreFurnitureWorld(b.world).instances.find(x=>x.instanceId===b.instanceId),item);
  assert.equal(validateWindowMounts(opts.construction,b.world).ok,true);
  assert.equal(buyMarketItem(b.world,b.shop,sku,pose,opts).reason,'window-mount-occupied');
  assert.equal(proposeFurnitureMove(b.world,b.instanceId,{x:0,z:0,yaw:0},opts).ok,false);
  const stored=storeMarketItem(b.world,b.shop,b.instanceId,opts);assert.ok(stored.ok);
  assert.equal(restoreMarketItem(stored.world,stored.shop,b.instanceId,{x:0,z:0,yaw:0},opts).ok,false);
  const restored=restoreMarketItem(stored.world,stored.shop,b.instanceId,findStoredPlacement(stored.world,stored.shop,b.instanceId,opts),opts);
  assert.ok(restored.ok);assert.equal(restored.shop.credits,b.shop.credits);
 }
});
test('PF-07 three contiguous sections, no openings, wall delete guard and cutaway',()=>{
 const opts=context(),c=opts.construction,sku=ids[0];
 const north=starterShellSegments(c).find(w=>w.starterSide==='north'&&w.i===6);
 const mount={edgeId:north.id,side:1,t:.5},p=windowMountPose(c,sku,mount);
 assert.ok(p);
 const adjacent=starterShellSegments(c).find(w=>w.starterSide==='north'&&w.i===7);
 const after={...c,starterRemoved:[adjacent.id]};
 assert.equal(windowMountPose(after,sku,mount),null);
 const opened={...c,openings:[{type:'door',edgeIds:[adjacent.id]}]};
 assert.equal(windowMountPose(opened,sku,mount),null);
 const b=buyMarketItem(newFurnitureWorld(),newFurnitureShop(),sku,p,opts);
 assert.ok(b.ok,b.reason);assert.equal(validateWindowMounts(after,b.world).ok,false);
 assert.equal(windowMountVisible(p,'down'),false);assert.equal(windowMountVisible(p,'up'),true);
});
test('PF-07 old floating purchase moves to warehouse without losing ID, SKU or value',()=>{
 const c=context().construction,sku=ids[0],world=newFurnitureWorld();
 const old={instanceId:'shop-meshwall-999',prefabId:'meshwall',itemDefinitionId:sku,purchasePriceCredits:190,location:'home',x:0,z:7,yaw:0};
 world.instances.push(old);
 const fixed=migrateWindowMounts(c,world);
 assert.deepEqual(fixed.instances.at(-1),{...old,location:'storage'});
 const p=windowPlacementCandidates(c,sku)[0];
 const nearby={...world,instances:world.instances.map(i=>i===old?{...old,x:p.x,z:p.z}:i)};
 const migrated=migrateWindowMounts(c,nearby);
 assert.equal(migrated.instances.at(-1).location,'home');assert.ok(migrated.instances.at(-1).mount);
 assert.deepEqual(migrateWindowMounts(c,migrated),migrated);
});
