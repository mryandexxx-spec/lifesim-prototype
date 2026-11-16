import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ROOM,isWalkable,findPath} from '../src/navigation.js';
import {CAMERA_INITIAL,CAMERA_BOUNDS,panCamera} from '../src/camera-controls.js';
import {cameraPlacementPose,dragShopPlacement} from '../src/furniture-placement-preview.js';
import {FURNITURE_CATALOG,newFurnitureWorld,furnitureActionApproach} from '../src/furniture-catalog.js';
import {newFurnitureShop,buyMarketItem} from '../src/furniture-shop.js';
import {furniturePoint,furniturePose} from '../src/furniture-transform.js';
import {newHousehold,loadHousehold,chooseResidentAction,furnitureAvailable} from '../src/household.js';
import {arrive} from '../src/simulation.js';
import {tickHousehold} from '../src/household.js';
import {createSofaTransition,sofaTransitionPose} from '../src/sofa-transition.js';
import {PURCHASED_SEAT_PROFILES,purchasedSeatPose,purchasedSeatSurface,
  purchasedSeatPrefab} from '../src/seat-furniture.js';
const people={residents:[{x:-.25,z:.35},{x:-.80,z:2.95}]};
const copy=x=>JSON.parse(JSON.stringify(x));
const text=p=>readFileSync(new URL(p,import.meta.url),'utf8');
function bought(root,sku,pose){
  const res=buyMarketItem(root.world.furniture,root.shop,sku,pose,people);
  assert.equal(res.ok,true,sku+' must be purchasable: '+res.reason);
  root.world.furniture=res.world;root.shop=res.shop;
  return res.instanceId;
}
test('F4D: east wing exactly doubles playable area without translating original furniture',()=>{
  const oldWidth=4.62-(-4.62);
  assert.equal(ROOM.minX,-4.62);
  assert.equal(ROOM.maxX,13.86);
  assert.equal((ROOM.maxX-ROOM.minX)/oldWidth,2);
  assert.equal(ROOM.minZ,-3.96);
  assert.equal(ROOM.maxZ,3.98);
  const original=newFurnitureWorld();
  assert.equal(original.instances.length,10);
  assert.deepEqual(original.instances.find(x=>x.prefabId==='sofa').x,1.355);
  assert.equal(isWalkable(11.4,0,original),true);
  assert.ok(findPath({x:-.25,z:.35},{x:11.4,z:0},original)?.length>1);
  assert.equal(isWalkable(14.3,0,original),false);
});
test('F4D: camera and buy-preview reach the new half, saving restores east positions',()=>{
  assert.ok(CAMERA_BOUNDS.maxX>11);
  const at=cameraPlacementPose({...CAMERA_INITIAL,centerX:11.6,centerZ:0});
  assert.ok(at.x>10);
  const moved=dragShopPlacement(CAMERA_INITIAL,{x:11,z:0,yaw:90},0,0,700);
  assert.equal(moved.x,11);
  const root=newHousehold();
  const chair=bought(root,'chair.loft',{x:10,z:0,yaw:90});
  const restored=loadHousehold(copy(root));
  assert.equal(restored.version,1);
  assert.equal(restored.world.furniture.instances.find(i=>i.instanceId===chair).x,10);
  assert.equal(restored.shop.credits,root.shop.credits);
  root.position.x=11.3;
  assert.equal(loadHousehold(copy(root)).position.x,11.3);
});
test('F4D: every new chair type uses one real seat action and one rotated approach',()=>{
  for(const type of ['chair','armchair']){
    const def=FURNITURE_CATALOG[type];
    assert.equal(def.actionId,'seat');
    assert.ok(def.capabilities.includes('seat'));
    assert.ok(def.seating.includes('sitting'));
    assert.ok(PURCHASED_SEAT_PROFILES[type]);
  }
  const root=newHousehold();
  const ids=[
    bought(root,'chair.cross',{x:8,z:-2,yaw:90}),
    bought(root,'armchair.shell',{x:11,z:2,yaw:180})
  ];
  for(const id of ids){
    const target=root.world.furniture.instances.find(i=>i.instanceId===id);
    const pt=furnitureActionApproach(root.world,'seat',id);
    assert.ok(pt);
    assert.ok(isWalkable(pt.x,pt.z,root.world));
    assert.ok(findPath(root.position,pt,root.world));
    assert.equal(purchasedSeatPrefab(root.world,id),target.prefabId);
    const anchor=purchasedSeatSurface(root.world,id);
    assert.ok(anchor.contact.y>.60 && anchor.contact.y<.67);
    assert.ok(Math.hypot(anchor.contact.x-pt.x,anchor.contact.z-pt.z)>.5);
    const motion=sofaTransitionPose({progress:1});
    const posed=purchasedSeatPose(root.world,id,motion);
    assert.ok(posed && Math.abs(posed.y-motion.y)>.20);
    assert.equal(posed.yaw,180-target.yaw);
    assert.ok(furniturePoint(root.world,target.prefabId,{x:0,z:0},id));
    assert.ok(furniturePose(root.world,target.prefabId,{x:0,z:0,yaw:180},id));
  }
});
test('F4D: real occupancy and household v1 reload for different seat instances',()=>{
  const root=newHousehold();
  const left=bought(root,'chair.loft',{x:8,z:-2,yaw:0});
  const right=bought(root,'armchair.wing',{x:11,z:1,yaw:0});
  assert.equal(chooseResidentAction(root,'seat',false,'alex',left),true);
  assert.equal(furnitureAvailable(root,'seat','mira',left),false);
  assert.equal(furnitureAvailable(root,'seat','mira',right),true);
  assert.equal(chooseResidentAction(root,'seat',false,'mira',right),true);
  assert.equal(root.action.targetInstanceId,left);
  assert.equal(root.otherSim.action.targetInstanceId,right);
  const restored=loadHousehold(copy(root));
  assert.equal(restored.action?.targetInstanceId,left);
  assert.equal(restored.otherSim.action?.targetInstanceId,right);
  assert.equal(chooseResidentAction(root,'seat',false,'mira',left),false);
  root.otherSim.action.targetInstanceId=left; // corrupted duplicate saved booking
  const repaired=loadHousehold(copy(root));
  assert.equal(repaired.action.targetInstanceId,left);
  assert.equal(repaired.otherSim.action,null);
});
test('F4D: sitting earns no invented Fun/XP and can conclude at full Fun',()=>{
  const root=newHousehold();
  const id=bought(root,'chair.loft',{x:9,z:0,yaw:0});
  root.needs.fun=100;
  root.otherSim.autonomy.enabled=false;root.autonomy.enabled=false;
  assert.equal(chooseResidentAction(root,'seat',false,'alex',id),true);
  arrive(root);
  tickHousehold(root,1);
  assert.equal(root.action?.id,'seat');
  assert.ok(root.needs.fun<100);
  assert.ok(root.action.elapsed>0);
  assert.equal(root.action.targetInstanceId,id);
  assert.equal(root.version,1);
});
test('F4D: packed placements reject chairs with no walkable approach, other items unchanged',()=>{
  const root=newHousehold();
  const blocked=buyMarketItem(root.world.furniture,root.shop,'chair.loft',
    {x:12.9,z:-3.4,yaw:0},people);
  assert.equal(blocked.ok,false);
  assert.ok(['unreachable-seat','room-bounds'].includes(blocked.reason));
  assert.ok(root.world.furniture.instances.every(x=>x.prefabId!=='chair'));
  const old=loadHousehold(copy(root));
  assert.equal(old.world.furniture.instances.length,10);
});
test('F4D: runtime contract and Pages delivery expose the new action',()=>{
  const game=text('../src/game.js'),html=text('../index.html'),workflow=text('../.github/workflows/pages.yml');
  assert.match(game,/purchasedSeatPose\(game\.world/);
  assert.match(game,/chairSeats=game\.world\.furniture\.instances/);
  assert.match(game,/actionId:useId==='seat'\?'sofa':useId/);
  assert.match(game,/actionId:miraUseId==='seat'\?'sofa':miraUseId/);
  assert.match(game,/box\('floor',4\.625,-0\.032,0,19\.25/);
  assert.match(html,/1\.2v · F4D/);
  assert.match(html,/seat-furniture\.js\?v=1\.2v-f4d/);
  assert.match(workflow,/node --check src\/seat-furniture\.js/);
  assert.match(workflow,/src\/seat-furniture\.js site\/src\//);
});
