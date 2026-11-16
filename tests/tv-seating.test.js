import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold,chooseResidentAction,furnitureAvailable} from '../src/household.js';
import {newFurnitureWorld} from '../src/furniture-catalog.js';
import {chooseTvSofa,tvSofaView} from '../src/tv-seating.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {furniturePose} from '../src/furniture-transform.js';
import {SOFA_POSE} from '../src/pose-config.js';
import {stepAnimation,createAnimationState} from '../src/animations.js';
import {arrive,tick} from '../src/simulation.js';
import {enqueueAction} from '../src/action-queue.js';
const copy=v=>JSON.parse(JSON.stringify(v));

test('original television is visible from the original sofa, including a quarter-turn',()=>{
  const world=newFurnitureWorld();
  const visible=tvSofaView(world,'home-sofa-1','home-tv-1');
  assert.ok(visible,'original living-room sofa must actually see original television');
  assert.ok(visible.distance>1&&visible.distance<5.5);
  assert.ok(Math.abs(visible.torsoYaw)<=30);
  const root=newHousehold();
  const seat=chooseTvSofa(root,'alex','home-tv-1');
  assert.equal(seat?.sofaId,'home-sofa-1');
  assert.deepEqual(furnitureActionApproach(root.world,'sofa',seat.sofaId),
    {x:1.35,z:.52});
  world.instances.find(i=>i.instanceId==='home-sofa-1').yaw=90;
  assert.ok(tvSofaView(world,'home-sofa-1','home-tv-1'),'quarter turn should still face screen');
  world.instances.find(i=>i.instanceId==='home-sofa-1').yaw=180;
  assert.equal(tvSofaView(world,'home-sofa-1','home-tv-1'),null,'turning seat away rejects viewing');
});
test('visible screen is not blocked by another large piece of furniture',()=>{
  const world=newFurnitureWorld();
  assert.ok(tvSofaView(world,'home-sofa-1','home-tv-1'));
  world.instances.push({instanceId:'shop-fridge-84',prefabId:'fridge',location:'home',
    x:2.5,z:.88,yaw:0});
  assert.equal(tvSofaView(world,'home-sofa-1','home-tv-1'),null);
  assert.equal(tvSofaView(world,'missing-sofa','home-tv-1'),null);
  assert.equal(tvSofaView(world,'home-sofa-1','missing-tv'),null);
});
test('TV chooses real sofa, preserves selected TV instance and blocks ordinary rest',()=>{
  const root=newHousehold();
  assert.ok(chooseResidentAction(root,'tv',false,'alex','home-tv-1'));
  assert.equal(root.action?.id,'tv');
  assert.equal(root.action?.watchSeatInstanceId,'home-sofa-1');
  assert.equal(root.action?.targetInstanceId,'home-tv-1');
  assert.equal(furnitureAvailable(root,'sofa','mira','home-sofa-1'),false);
  assert.equal(furnitureAvailable(root,'tv','mira','home-tv-1'),false);
  const restored=loadHousehold(copy(root));
  assert.equal(restored.version,1);
  assert.equal(restored.action.watchSeatInstanceId,'home-sofa-1');
  assert.equal(restored.action.targetInstanceId,'home-tv-1');
});
test('sofa already occupied or queued: TV falls back to previously available standing watch',()=>{
  const root=newHousehold();
  assert.ok(chooseResidentAction(root,'sofa',false,'mira','home-sofa-1'));
  assert.equal(chooseTvSofa(root,'alex','home-tv-1'),null);
  assert.ok(chooseResidentAction(root,'tv',false,'alex','home-tv-1'));
  assert.equal(root.action.watchSeatInstanceId,undefined);
  const other=newHousehold();
  assert.ok(enqueueAction(other.actionQueues,'mira',
    {type:'object',actionId:'sofa',targetInstanceId:'home-sofa-1'}));
  assert.equal(chooseTvSofa(other,'alex','home-tv-1'),null);
});
test('two different screens are independent, but two users cannot take the same couch',()=>{
  const root=newHousehold();
  const original=root.world.furniture.instances.find(i=>i.prefabId==='tv');
  root.world.furniture.instances.push({...original,instanceId:'shop-tv-66',x:4.0,z:3.0,yaw:180});
  root.world.furniture.revision++;
  assert.ok(chooseResidentAction(root,'tv',false,'alex','home-tv-1'));
  assert.ok(chooseResidentAction(root,'tv',false,'mira','shop-tv-66'));
  assert.equal(root.action.watchSeatInstanceId,'home-sofa-1');
  assert.equal(root.otherSim.action.watchSeatInstanceId,undefined,'Mira must stand rather than steal seat');
  assert.equal(root.otherSim.action.targetInstanceId,'shop-tv-66');
});
test('legacy/stale/duplicate v1 TV reservations are harmless and sanitized',()=>{
  const root=newHousehold();
  root.action={id:'tv',phase:'using',elapsed:3,automatic:false,targetInstanceId:'home-tv-1'};
  assert.equal(loadHousehold(copy(root)).action.watchSeatInstanceId,undefined,
    'old saves never silently start a seated action');
  root.action.watchSeatInstanceId='shop-sofa-missing';
  assert.equal(loadHousehold(copy(root)).action.watchSeatInstanceId,undefined);
  root.action.watchSeatInstanceId='home-sofa-1';
  root.otherSim.action={...root.action};
  const loaded=loadHousehold(copy(root));
  assert.equal(loaded.action.watchSeatInstanceId,'home-sofa-1');
  assert.equal(loaded.otherSim.action.watchSeatInstanceId,undefined,
    'duplicate seat cannot survive restore');
});
test('seated TV pauses Energy drain only while watching; standing TV keeps normal decay',()=>{
  const sit=newHousehold();
  assert.ok(chooseResidentAction(sit,'tv',false,'alex','home-tv-1'));
  const seatedEnergy=sit.needs.energy,seatedFun=sit.needs.fun;
  tick(sit,4,sit.world);
  assert.ok(sit.needs.energy<seatedEnergy,'walking costs Energy');
  arrive(sit);
  const energyOnArrival=sit.needs.energy,funOnArrival=sit.needs.fun;
  tick(sit,5,sit.world);
  assert.equal(sit.needs.energy,energyOnArrival);
  assert.ok(sit.needs.fun>funOnArrival);
  assert.ok(funOnArrival<=seatedFun,'walking yields no free Fun');
  const stand=newHousehold();
  assert.ok(chooseResidentAction(stand,'sofa',false,'mira','home-sofa-1'));
  assert.ok(chooseResidentAction(stand,'tv',false,'alex','home-tv-1'));
  const beforeStand=stand.needs.energy;
  arrive(stand);tick(stand,5,stand.world);
  assert.ok(stand.needs.energy<beforeStand,'standing is still tiring');
});
test('seated glance is a shoulder/head twist, not full avatar rotation',()=>{
  const normal=stepAnimation(createAnimationState(),{using:'tv',sofaWeight:1,tvGazeYaw:0},.06);
  const watching=stepAnimation(createAnimationState(),{using:'tv',sofaWeight:1,tvGazeYaw:-29},.06);
  assert.ok(watching.spineTwist<normal.spineTwist);
  assert.ok(watching.spineTwist>-30);
  assert.notDeepEqual(watching.legs,[0,0],'existing sofa hips/seat are reused');
  assert.ok(furniturePose(newFurnitureWorld(),'sofa',SOFA_POSE,'home-sofa-1'));
});
test('runtime routes to reserved sofa, animation targets and stores lock both ID resources',()=>{
  const g=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const w=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(g,/chooseTvSofa\(game,actorId/);
  assert.match(g,/watchSeatInstanceId\)\?paths\[residentId\]/);
  assert.match(g,/sofaVisualTargets\.alex=alexDining\?game\.action\.diningSeatInstanceId:/);
  assert.match(g,/sofaVisualTargets\.mira=miraDining\?game\.otherSim\.action\.diningSeatInstanceId:/);
  assert.match(g,/actor\.action\.watchSeatInstanceId\)\s*busy\.add\(actor\.action\.watchSeatInstanceId\)/);
  assert.match(g,/tvGazeYaw:alexWatchSeat/);
  assert.match(g,/tvGazeYaw:miraWatchSeat/);
  assert.match(w,/node --check src\/tv-seating\.js/);
  assert.match(w,/cp src\/tv-seating\.js site\/src\//);
});
