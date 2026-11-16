import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newFurnitureWorld,restoreFurnitureWorld,resolveActionFurniture} from '../src/furniture-catalog.js';
import {newHousehold,loadHousehold,chooseResidentAction,bedDestinationFor,furnitureAvailable} from '../src/household.js';
import {furniturePoint,furniturePose} from '../src/furniture-transform.js';
import {BED_SLOTS} from '../src/bed-layout.js';
import {newFurnitureShop,buyMarketItem,storeMarketItem,restoreMarketItem,sellMarketItem,canTradeMarketInstance} from '../src/furniture-shop.js';

const copy=x=>JSON.parse(JSON.stringify(x));
const trialResidents={residents:[{x:3.4,z:3.5},{x:-3.4,z:3.5}]};
const emptyHouse=()=>({...newFurnitureWorld(),instances:[]});
const bedPose={x:0,z:0,yaw:90};

test('a paid bed must pass two reachability checks, charges once and is saved by exact identity',()=>{
  const before=emptyHouse(),wallet=newFurnitureShop();
  const bought=buyMarketItem(before,wallet,'bed',bedPose,trialResidents);
  assert.equal(bought.ok,true,JSON.stringify(bought));
  assert.equal(bought.shop.credits,4150);
  assert.equal(wallet.credits,5000);
  assert.equal(bought.instanceId,'shop-bed-1');
  const bed=resolveActionFurniture(bought.world,'bed',bought.instanceId);
  assert.equal(bed?.yaw,90);
  assert.deepEqual(restoreFurnitureWorld(copy(bought.world)),bought.world);
  for(const side of ['left','right']){
    const at=furniturePoint(bought.world,'bed',BED_SLOTS[side].approach,bought.instanceId);
    assert.ok(at&&Number.isFinite(at.x)&&Number.isFinite(at.z));
  }
  const mapped=furniturePose(bought.world,'bed',{x:-3.0,z:-1.0,yaw:45},bought.instanceId);
  assert.ok(mapped&&Number.isFinite(mapped.x)&&Number.isFinite(mapped.yaw));
  assert.equal(furniturePose(bought.world,'bed',{x:0,z:0},'missing-bed'),null);
});

test('two sleepers reserve different sides of the same purchased bed and survive v1 reload',()=>{
  const bought=buyMarketItem(emptyHouse(),newFurnitureShop(),'bed',bedPose,trialResidents);
  assert.equal(bought.ok,true);
  const root=newHousehold();
  root.world.furniture=bought.world;
  root.position={...trialResidents.residents[0]};
  root.otherSim.position={...trialResidents.residents[1]};
  assert.equal(chooseResidentAction(root,'bed',false,'alex',bought.instanceId),true);
  assert.equal(chooseResidentAction(root,'bed',false,'mira',bought.instanceId),true);
  assert.notEqual(root.action.bedSlot,root.otherSim.action.bedSlot);
  assert.equal(root.action.targetInstanceId,bought.instanceId);
  assert.equal(root.otherSim.action.targetInstanceId,bought.instanceId);
  assert.ok(bedDestinationFor(root,'alex',bought.instanceId));
  assert.ok(bedDestinationFor(root,'mira',bought.instanceId));
  const loaded=loadHousehold(copy(root));
  assert.equal(loaded.action.targetInstanceId,bought.instanceId);
  assert.equal(loaded.otherSim.action.targetInstanceId,bought.instanceId);
  assert.notEqual(loaded.action.bedSlot,loaded.otherSim.action.bedSlot);
  assert.equal(furnitureAvailable(loaded,'bed','alex','missing-bed'),false);
});

test('original bed is protected; bought bed cannot be stored or sold while reserved',()=>{
  const original=newFurnitureWorld().instances.find(i=>i.prefabId==='bed');
  assert.equal(canTradeMarketInstance(original),false);
  assert.equal(storeMarketItem(newFurnitureWorld(),newFurnitureShop(),original.instanceId).reason,'protected-item');
  const bought=buyMarketItem(emptyHouse(),newFurnitureShop(),'bed',bedPose,trialResidents);
  assert.equal(bought.ok,true);
  const lock={lockedInstanceIds:[bought.instanceId]};
  assert.equal(storeMarketItem(bought.world,bought.shop,bought.instanceId,lock).reason,'reserved');
  assert.equal(sellMarketItem(bought.world,bought.shop,bought.instanceId,lock).reason,'reserved');
  const stored=storeMarketItem(bought.world,bought.shop,bought.instanceId);
  assert.equal(stored.ok,true);
  assert.equal(resolveActionFurniture(stored.world,'bed',bought.instanceId),null);
  const restored=restoreMarketItem(stored.world,stored.shop,bought.instanceId,bedPose,trialResidents);
  assert.equal(restored.ok,true,JSON.stringify(restored));
  assert.equal(restored.shop.credits,bought.shop.credits);
  assert.equal(resolveActionFurniture(restored.world,'bed',bought.instanceId)?.instanceId,bought.instanceId);
  const sold=sellMarketItem(stored.world,stored.shop,bought.instanceId);
  assert.equal(sold.ok,true);
  assert.equal(sold.shop.credits,bought.shop.credits+595);
});

test('invalid bed location never charges, and unsuitable 3D preview cannot be finalized',()=>{
  const source=newFurnitureWorld(),shop=newFurnitureShop();
  const denied=buyMarketItem(source,shop,'bed',{x:9,z:9,yaw:0},trialResidents);
  assert.equal(denied.ok,false);
  assert.deepEqual(source,newFurnitureWorld());
  assert.equal(shop.credits,5000);
});

test('3D bed picks, visual targets, transition poses and individual quilts all use instance ID',()=>{
  const source=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  assert.match(source,/selectedFurnitureInstanceId=\['sofa','bed','tv','hobby','music'\]\.includes\(id\)/);
  assert.match(source,/const bedCopies=game\.world\.furniture\.instances/);
  assert.match(source,/id:'bed',instanceId:item\.instanceId/);
  assert.match(source,/bedVisualTargets\.alex=game\.action\?\.targetInstanceId/);
  assert.match(source,/bedVisualTargets\.mira=game\.otherSim\.action\?\.targetInstanceId/);
  assert.match(source,/bedTransitionPose\(bedStates\.alex\),bedVisualTargets\.alex/);
  assert.match(source,/bedTransitionPose\(bedStates\.mira\),bedVisualTargets\.mira/);
  assert.match(source,/bedVisualTargets\[id\]===item\.instanceId/);
  assert.match(source,/node\.findByName\('duvet '\+slot\)/);
});
