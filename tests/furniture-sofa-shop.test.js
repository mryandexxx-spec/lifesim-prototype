import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newFurnitureWorld,FURNITURE_CATALOG} from '../src/furniture-catalog.js';
import {newFurnitureShop,SHOP_ITEMS,marketListing,canTradeMarketInstance,
  buyMarketItem,storeMarketItem,restoreMarketItem,sellMarketItem,
  findMarketPlacement} from '../src/furniture-shop.js';
import {furniturePose,furniturePoint} from '../src/furniture-transform.js';
import {SOFA_APPROACH,SOFA_POSE} from '../src/pose-config.js';
import {sofaTransitionPose,createSofaTransition,advanceSofaTransition} from '../src/sofa-transition.js';
import {newHousehold,loadHousehold,furnitureAvailable,chooseResidentAction} from '../src/household.js';
import {pickWorldRayTarget} from '../src/world-interactions.js';
const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const game=source('../src/game.js'),css=source('../styles.css');
const people={residents:[{x:-.8,z:2.95},{x:-.25,z:.35}]};
const json=x=>JSON.parse(JSON.stringify(x));
const close=(a,b)=>Math.abs(a-b)<1e-7;
const newSofa=({x=-2,z=0,yaw=90,instanceId='shop-sofa-11'}={})=>
  ({instanceId,prefabId:'sofa',location:'home',x,z,yaw});

test('six trial products preserve independently functional sofa and its price',()=>{
 assert.deepEqual(SHOP_ITEMS.map(x=>x.prefabId),
   ['plant','table','nightstand','tv','sofa','bed']);
 assert.equal(marketListing().length,37);
 assert.equal(SHOP_ITEMS.find(x=>x.prefabId==='plant').price,130);
 assert.equal(SHOP_ITEMS.find(x=>x.prefabId==='sofa').price,550);
 assert.equal(newFurnitureShop().credits,5000);
 assert.match(css,/\.furnish-stock\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});
test('the original sofa is protected; purchased sofa can be stored, restored and sold if free',()=>{
 const world=newFurnitureWorld(),shop=newFurnitureShop();
 const original=world.instances.find(i=>i.prefabId==='sofa');
 assert.equal(canTradeMarketInstance(original),false);
 assert.equal(storeMarketItem(world,shop,original.instanceId).reason,'protected-item');
 assert.equal(sellMarketItem(world,shop,original.instanceId).reason,'protected-item');
 const duplicate=newSofa();
 assert.equal(canTradeMarketInstance(duplicate),true);
 assert.equal(canTradeMarketInstance({...duplicate,instanceId:'home-sofa-3'}),false);
 const synthetic={...world,instances:[...world.instances,duplicate]};
 assert.equal(storeMarketItem(synthetic,shop,duplicate.instanceId,
   {lockedInstanceIds:[duplicate.instanceId]}).reason,'reserved');
 const stored=storeMarketItem(synthetic,shop,duplicate.instanceId);
 assert.equal(stored.ok,true);
 assert.equal(stored.world.instances.at(-1).location,'storage');
 assert.equal(sellMarketItem(stored.world,shop,duplicate.instanceId).ok,true);
});
test('different sofa IDs are independent resources, and targets survive save/load',()=>{
 const root=newHousehold(),item=newSofa();
 root.world.furniture.instances.push(item);
 assert.equal(furnitureAvailable(root,'sofa','alex',item.instanceId),true);
 assert.equal(chooseResidentAction(root,'sofa',false,'alex',item.instanceId),true);
 assert.equal(root.action.targetInstanceId,item.instanceId);
 assert.equal(furnitureAvailable(root,'sofa','mira',item.instanceId),false);
 assert.equal(furnitureAvailable(root,'sofa','mira','home-sofa-1'),true);
 assert.equal(chooseResidentAction(root,'sofa',false,'mira','home-sofa-1'),true);
 const restored=loadHousehold(json(root));
 assert.equal(restored.action.targetInstanceId,item.instanceId);
 assert.equal(restored.otherSim.action.targetInstanceId,'home-sofa-1');
 assert.equal(furnitureAvailable(restored,'sofa','mira',item.instanceId),false);
});
test('world-facing approach and seated poses follow a moved/rotated sofa, not prefab origin',()=>{
 const root=newHousehold(),item=newSofa();
 root.world.furniture.instances.push(item);
 const original=furniturePoint(root.world,'sofa',SOFA_APPROACH,'home-sofa-1');
 const copyApproach=furniturePoint(root.world,'sofa',SOFA_APPROACH,item.instanceId);
 assert.ok(!close(original.x,copyApproach.x)||!close(original.z,copyApproach.z));
 const progress=advanceSofaTransition(createSofaTransition(),true,.06);
 const pose=sofaTransitionPose(progress);
 const moved=furniturePose(root.world,'sofa',pose,item.instanceId);
 const other=furniturePose(root.world,'sofa',pose,'home-sofa-1');
 assert.ok(!close(moved.x,other.x)||!close(moved.z,other.z));
 assert.equal(moved.yaw,pose.yaw-item.yaw);
 assert.equal(moved.sofaWeight,pose.sofaWeight);
 assert.equal(furniturePose(root.world,'sofa',SOFA_POSE,'missing-sofa-8'),null);
});
test('3D ray selects the exact purchased sofa instance, unlike the default sofa',()=>{
 const bounds={min:{x:-2.4,y:0,z:-.4},max:{x:-1.6,y:1.08,z:.4}};
 const target=pickWorldRayTarget({x:-2,y:2,z:0},{x:-2,y:-1,z:0},
   [{kind:'object',id:'sofa',instanceId:'shop-sofa-11',bounds}]);
 assert.deepEqual(target,{kind:'object',id:'sofa',instanceId:'shop-sofa-11'});
 assert.match(game,/select\(target.id,target.instanceId\)/);
 assert.match(game,/\?\{targetInstanceId:selectedFurnitureInstanceId\}:\{\}/);
 assert.match(game,/sofaCopies=game.world.furniture.instances/);
 assert.match(game,/instanceId:item.instanceId/);
 assert.match(game,/return pickWorldRayTarget\(near,far,\s*\[\.\.\.residents,\.\.\.sofaCopies,/);
});
test('visual sit and exit stay bound to action target; Meshy seat contact is per instance',()=>{
 assert.match(game,/sofaVisualTargets=\{alex:null,mira:null\}/);
 assert.match(game,/sofaVisualTargets.alex=alexDining\?game\.action\.diningSeatInstanceId:[\s\S]*?alexReadingSeated[\s\S]*?\(alexWatchSeat\|\|game.action\?\.targetInstanceId\)\|\|null/);
 assert.match(game,/sofaVisualTargets.mira=miraDining\?game\.otherSim\.action\.diningSeatInstanceId:[\s\S]*?miraReadingSeated[\s\S]*?\(miraWatchSeat\|\|game.otherSim.action\?\.targetInstanceId\)\|\|null/);
 assert.match(game,/const alexSeatBase=sofaTransitionPose\(sofaStates.alex\)/);
 assert.match(game,/const miraSeatBase=sofaTransitionPose\(sofaStates.mira\)/);
 assert.match(game,/makeSofaSeat=\(instanceId=null,romanticSlot=null\)=>/);
 assert.match(game,/furnitureInstance\(game.world,'sofa',instanceId\)/);
 assert.match(game,/alexSeatInstanceId=sofaVisualTargets.alex/);
 assert.match(game,/seat:seatContactEnabled\?\(alexDiningVisual&&/);
 assert.match(game,/purchasedDiningSeatSurface\(game.world,alexDiningVisual.chairId/);
 assert.match(game,/if\(!seating\)\{sofaVisualTargets.alex=null;romanticSofaSlots.alex=null;diningVisual.alex=null;\}/);
 assert.match(game,/if\(!miraSeating\)\{sofaVisualTargets.mira=null;romanticSofaSlots.mira=null;diningVisual.mira=null;\}/);
 assert.match(game,/if\(sofaVisualTargets\[id\]\)busy.add\(sofaVisualTargets\[id\]\)/);
});
test('functional sofa has a 3D prefab clone and real shop transaction, not fake mood bonus',()=>{
 assert.match(game,/withDecor\('sofa',\(\)=>\{/);
 assert.match(game,/decorTemplates.set\(prefabId,node\)/);
 assert.match(game,/!MARKET_OFFERS.some\(s=>s.prefabId===item.prefabId\)/);
 assert.match(game,/template.clone\(\)/);
 assert.match(game,/applyMarketTransaction\(buyMarketItem\(/);
 assert.match(game,/syncShopPreviewEntity\(\)/);
});
test('purchasable sofa requires physically valid placement and charges once',()=>{
 const world=newFurnitureWorld(),shop=newFurnitureShop();
 const pose=findMarketPlacement(world,shop,'sofa',people);
 if(pose){
   const transaction=buyMarketItem(world,shop,'sofa',pose,people);
   assert.equal(transaction.ok,true);
   assert.equal(transaction.shop.credits,4450);
   assert.equal(transaction.world.instances.length,world.instances.length+1);
   assert.equal(transaction.world.instances.at(-1).instanceId,'shop-sofa-1');
   assert.equal(shop.credits,5000);
   const restored=loadHousehold({...newHousehold(),world:{furniture:transaction.world},
     shop:transaction.shop});
   assert.equal(restored.world.furniture.instances.at(-1).prefabId,'sofa');
   assert.equal(restored.shop.credits,4450);
 }else{
   // In a full apartment, the player must rearrange furniture before buying
   // another large object; never silently place it inside another fixture.
   assert.equal(buyMarketItem(world,shop,'sofa',
     {x:1.355,z:1.59,yaw:0},people).ok,false);
 }
});
