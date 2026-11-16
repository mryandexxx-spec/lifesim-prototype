import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ACTIONS,arrive,tick} from '../src/simulation.js';
import {newHousehold,loadHousehold,chooseResidentAction,furnitureAvailable} from '../src/household.js';
import {newFurnitureWorld,FURNITURE_CATALOG,furnitureActionApproach,resolveActionFurniture} from '../src/furniture-catalog.js';
import {furniturePoint,furniturePose} from '../src/furniture-transform.js';
import {findPath} from '../src/navigation.js';
import {TV_APPROACH,TV_WATCH_POSE,tvScreenFrame} from '../src/tv-interaction.js';
import {newFurnitureShop,findMarketPlacement,buyMarketItem,storeMarketItem,sellMarketItem} from '../src/furniture-shop.js';
const copy=x=>JSON.parse(JSON.stringify(x));
const residentPositions=[{x:-.8,z:2.95},{x:-.25,z:.35}];
const ctx={residents:residentPositions};

test('TV is a functional catalogue item with a real approach and regular Fun action',()=>{
  assert.equal(FURNITURE_CATALOG.tv.actionId,'tv');
  assert.deepEqual(FURNITURE_CATALOG.tv.capabilities,['tv.watch']);
  assert.equal(ACTIONS.tv.need,'fun');
  assert.equal(ACTIONS.tv.duration,36);
  assert.equal(TV_WATCH_POSE.x,TV_APPROACH.x);
  assert.equal(TV_WATCH_POSE.z,TV_APPROACH.z);
  const world=newFurnitureWorld();
  const target=resolveActionFurniture(world,'tv','home-tv-1');
  assert.ok(target);
  const at=furnitureActionApproach(world,'tv',target.instanceId);
  assert.deepEqual(at,TV_APPROACH);
  assert.ok(findPath(residentPositions[0],at,world));
  assert.equal(resolveActionFurniture(world,'tv','wrong-tv-id'),null);
});

test('watching grants Fun only after arrival and only for the action duration',()=>{
  const root=newHousehold();
  root.position={...residentPositions[0]};
  root.needs.fun=40;
  assert.equal(chooseResidentAction(root,'tv',false,'alex','home-tv-1'),true);
  assert.equal(root.action.targetInstanceId,'home-tv-1');
  const before=root.needs.fun;
  tick(root,1,root.world);
  assert.ok(root.needs.fun<before,'no gain while walking toward TV');
  arrive(root);
  const watchingStart=root.needs.fun;
  tick(root,5,root.world);
  assert.ok(root.needs.fun>watchingStart,'watching accrues actual Fun');
  assert.ok(root.action?.id==='tv');
  tick(root,100,root.world);
  assert.equal(root.action,null,'ended action does not repeat reward');
});

test('independent purchased TVs route to their own physical screen and persist in v1',()=>{
  const world=newFurnitureWorld(),shop=newFurnitureShop();
  const pose=findMarketPlacement(world,shop,'tv',ctx);
  assert.ok(pose,'at least one reasonable second TV position should fit');
  const purchase=buyMarketItem(world,shop,'tv',pose,ctx);
  assert.equal(purchase.ok,true,JSON.stringify(purchase));
  assert.equal(purchase.shop.credits,shop.credits-650);
  const id=purchase.instanceId;
  assert.ok(id.startsWith('shop-tv-'));
  const own=furnitureActionApproach(purchase.world,'tv',id);
  const original=furnitureActionApproach(purchase.world,'tv','home-tv-1');
  assert.notDeepEqual(own,original);
  const root=newHousehold();
  root.world.furniture=purchase.world;
  root.shop=purchase.shop;
  root.position={...residentPositions[0]};
  root.otherSim.position={...residentPositions[1]};
  assert.equal(chooseResidentAction(root,'tv',false,'alex',id),true);
  assert.equal(furnitureAvailable(root,'tv','mira','home-tv-1'),true);
  assert.equal(chooseResidentAction(root,'tv',false,'mira','home-tv-1'),true);
  const restored=loadHousehold(copy(root));
  assert.equal(restored.version,1);
  assert.equal(restored.action.targetInstanceId,id);
  assert.equal(restored.otherSim.action.targetInstanceId,'home-tv-1');
  assert.equal(restored.shop.credits,shop.credits-650);
  assert.equal(resolveActionFurniture(restored.world,'tv',id).instanceId,id);
  assert.equal(furnitureAvailable(restored,'tv','mira',id),false);
  const screen=furniturePoint(restored.world,'tv',TV_APPROACH,id);
  assert.deepEqual(screen,own);
  assert.equal(furniturePose(restored.world,'tv',TV_WATCH_POSE,'missing-tv'),null);
  assert.notDeepEqual(furniturePose(restored.world,'tv',TV_WATCH_POSE,id),
    furniturePose(restored.world,'tv',TV_WATCH_POSE,'home-tv-1'));
});

test('screen plays only for the watched instance, never for idle/queue/walking',()=>{
  const first={action:{id:'tv',phase:'walking',targetInstanceId:'shop-tv-1'}};
  const second={action:{id:'sofa',phase:'using',targetInstanceId:'home-sofa-1'}};
  assert.deepEqual(tvScreenFrame([first,second],'shop-tv-1',6),{on:false,frame:0});
  first.action.phase='using';
  assert.deepEqual(tvScreenFrame([first,second],'home-tv-1',6),{on:false,frame:0});
  assert.deepEqual(tvScreenFrame([first,second],'shop-tv-1',6.9),{on:true,frame:2});
  first.action=null;
  assert.deepEqual(tvScreenFrame([first,second],'shop-tv-1',9),{on:false,frame:0});
  assert.deepEqual(tvScreenFrame([{}],null,9),{on:false,frame:0});
  // A legacy untargeted action is attached to the original set, never copied TVs.
  assert.equal(tvScreenFrame([{action:{id:'tv',phase:'using'}}],'home-tv-1',0).on,true);
  assert.equal(tvScreenFrame([{action:{id:'tv',phase:'using'}}],'shop-tv-2',0).on,false);
});

test('busy TV cannot be stored or sold; an invalid purchase does not change credits',()=>{
  const world=newFurnitureWorld(),shop=newFurnitureShop();
  const purchase=buyMarketItem(world,shop,'tv',findMarketPlacement(world,shop,'tv',ctx),ctx);
  assert.equal(purchase.ok,true);
  const opts={lockedInstanceIds:[purchase.instanceId]};
  assert.equal(storeMarketItem(purchase.world,purchase.shop,purchase.instanceId,opts).reason,'reserved');
  assert.equal(sellMarketItem(purchase.world,purchase.shop,purchase.instanceId,opts).reason,'reserved');
  const denied=buyMarketItem(world,shop,'tv',{x:9,z:9,yaw:0},ctx);
  assert.equal(denied.ok,false);
  assert.equal(shop.credits,5000);
});

test('Safari 3D scene wires original and bought TV pickers and only-on-usage frames',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(game,/touchBox\('tv','tv glass'/);
  assert.match(game,/const tvCopies=game.world.furniture.instances/);
  assert.match(game,/id:'tv',instanceId:item.instanceId/);
  assert.match(game,/selectedFurnitureInstanceId=\['sofa','bed','tv'\]/);
  assert.match(game,/tvScreenFrame\(\[game,game.otherSim\],item.instanceId,effectTime,/);
  assert.match(game,/program.enabled=frame.on/);
  assert.match(workflow,/node --check src\/tv-interaction.js/);
  assert.match(workflow,/cp src\/tv-interaction.js site\/src\//);
});
