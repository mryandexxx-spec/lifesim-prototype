import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {advanceGardens,advanceGardenRecord,gardenView,gardenApproach,
  gardenActionAllowed,gardenBusy,settleGardenAction,newGardenRecord,
  GARDEN_DURATION,GARDEN_LIMIT,GARDEN_MATURE_MINUTES} from '../src/gardening.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {restoreOutdoorsWorld} from '../src/lot-surface.js';
import {OUTDOOR_CATALOG} from '../src/outdoor-catalog.js';
import {sanitizeQueueCommand,enqueueAction} from '../src/action-queue.js';
import {findPath,isWalkable} from '../src/navigation.js';

const copy=x=>JSON.parse(JSON.stringify(x));
const pose=(x=19,z=8)=>({x,z,yaw:0});
function place(root,itemId='garden.herb.mint',p=pose()){
  const preview=previewOutdoorFeatureEdit(root,{operation:'place',itemId,pose:p});
  assert.equal(preview.ok,true,preview.reason);
  const result=commitOutdoorFeatureEdit(root,preview);
  assert.equal(result.ok,true,result.reason);
  return result.root;
}
const gardenId=root=>root.world.outdoors.features.find(x=>
  OUTDOOR_CATALOG[x.itemId]?.category==='garden').instanceId;
function advance(root,gameMinutes){root.minutes=gameMinutes;
  root.otherSim.minutes=gameMinutes;advanceGardens(root.world.outdoors,gameMinutes);}

test('C1: approved four species have correct category, price and footprint',()=>{
  for(const id of ['garden.flower.calendula','garden.flower.cornflower']){
    assert.equal(OUTDOOR_CATALOG[id].price,120);
    assert.equal(OUTDOOR_CATALOG[id].width,1);
    assert.equal(OUTDOOR_CATALOG[id].walkThrough,false);
  }
  for(const id of ['garden.herb.mint','garden.herb.melissa'])
    assert.equal(OUTDOOR_CATALOG[id].price,110);
  assert.equal(GARDEN_LIMIT,8);
  assert.equal(GARDEN_MATURE_MINUTES,4320);
  for(const id of ['flower.daisy','flower.tulip','flower.lavender'])
    assert.equal(OUTDOOR_CATALOG[id].category,'flower','B2 decor remains decorative');
});

test('C1: buy is atomic, one receipt and persists exactly one keyed garden',()=>{
  const root=newHousehold(),start=root.shop.credits;
  const next=place(root);
  const id=gardenId(next);
  assert.equal(next.shop.credits,start-110);
  assert.equal(next.financialHistory.entries.length,1);
  assert.equal(next.world.outdoors.gardens[id].plantedAt,root.minutes);
  assert.equal(next.world.outdoors.features.length,1);
  const old=loadHousehold(copy(next));
  assert.deepEqual(old.world.outdoors.gardens,next.world.outdoors.gardens);
  assert.equal(old.shop.credits,start-110);
  assert.equal(old.financialHistory.entries.length,1);
  assert.equal(previewOutdoorFeatureEdit(next,{
    operation:'place',itemId:'garden.flower.calendula',pose:pose()
  }).reason,'overlap-outdoor');
});

test('C1: 36h wet-time, dry stall and resumption without wall clock',()=>{
  const state=newGardenRecord(480);
  const one={...state,hydratedUntil:2640,lastWateredAt:480};
  assert.equal(advanceGardenRecord(one,1920).progressWetMinutes,1440);
  const dry=advanceGardenRecord(one,4800);
  assert.equal(dry.progressWetMinutes,2160);
  assert.equal(dry.evaluatedAt,4800);
  assert.equal(advanceGardenRecord(dry,9000).progressWetMinutes,2160);
  const restored=advanceGardenRecord({...dry,hydratedUntil:6960,lastWateredAt:4800},6240);
  assert.equal(restored.progressWetMinutes,3600);
  assert.equal(advanceGardenRecord({...restored,hydratedUntil:9000},6960).progressWetMinutes,4320);
  assert.equal(GARDEN_DURATION.water,15);
  assert.equal(GARDEN_DURATION.admire,8);
});

test('C1: all four named growth stages derive only from accumulated wet time',()=>{
  const root=place(newHousehold()),id=gardenId(root);
  const r=root.world.outdoors.gardens[id];
  for(const [progress,stage] of [[0,0],[1439,0],[1440,1],[2879,1],[2880,2],[4319,2],[4320,3]]){
    Object.assign(r,{progressWetMinutes:progress,evaluatedAt:root.minutes});
    const view=gardenView(root.world.outdoors,id,root.minutes);
    assert.equal(view.stage,stage);
    assert.equal(view.mature,progress===4320);
  }
});

test('C1: both residents need a real reachable A* approach, no wandering into bed',()=>{
  const root=place(newHousehold(),'garden.flower.cornflower',pose(19,8));
  const id=gardenId(root);
  for(const person of [root,root.otherSim]){
    const plan=gardenApproach(root.world,id,person.position);
    assert.ok(plan,'route exists to bed');
    assert.equal(isWalkable(plan.goal.x,plan.goal.z,root.world),true);
    assert.ok(findPath(person.position,plan.goal,root.world));
    assert.ok(Math.hypot(plan.goal.x-19,plan.goal.z-8)>.7);
  }
});

test('C1: one confirmed water action completes in household time, not in queue or on reload',()=>{
  const root=place(newHousehold()),id=gardenId(root);
  const approach=gardenApproach(root.world,id,root.position);
  root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
  root.position={...approach.goal};
  root.action={id:'garden',phase:'using',automatic:false,elapsed:0,
    targetInstanceId:id,gardenActionId:'water',gardenGoal:{...approach.goal}};
  const initial=root.needs.energy;
  tickHousehold(root,15);
  assert.equal(root.action,null);
  assert.equal(root.world.outdoors.gardens[id].lastWateredAt,root.minutes);
  assert.equal(root.world.outdoors.gardens[id].hydratedUntil,root.minutes+2160);
  assert.ok(root.needs.energy<initial-2);
  const time=root.world.outdoors.gardens[id].lastWateredAt;
  tickHousehold(root,15);
  assert.equal(root.world.outdoors.gardens[id].lastWateredAt,time);
  const reloaded=loadHousehold(copy(root));
  assert.equal(reloaded.world.outdoors.gardens[id].lastWateredAt,time);
  assert.equal(gardenActionAllowed(reloaded,'alex',id,'water'),false);
});

test('C1: 24h watering cooldown is shared by both residents; no premature retry',()=>{
  const root=place(newHousehold()),id=gardenId(root);
  assert.equal(gardenActionAllowed(root,'alex',id,'water'),true);
  assert.equal(settleGardenAction(root,'alex',id,'water'),true);
  assert.equal(settleGardenAction(root,'mira',id,'water'),false);
  assert.equal(gardenActionAllowed(root,'mira',id,'water'),false);
  advance(root,root.minutes+1439);
  assert.equal(gardenActionAllowed(root,'mira',id,'water'),false);
  advance(root,root.minutes+1);
  assert.equal(gardenActionAllowed(root,'mira',id,'water'),true);
  assert.equal(settleGardenAction(root,'mira',id,'water'),true);
});

test('C1: mature admiration grants +5 Fun once per resident across all beds',()=>{
  const root=place(newHousehold()),id=gardenId(root);
  root.world.outdoors.gardens[id].progressWetMinutes=4320;
  root.needs.fun=20;root.otherSim.needs.fun=33;
  assert.equal(gardenActionAllowed(root,'alex',id,'water'),false);
  assert.equal(settleGardenAction(root,'alex',id,'admire'),true);
  assert.equal(root.needs.fun,25);
  assert.equal(settleGardenAction(root,'alex',id,'admire'),false);
  assert.equal(settleGardenAction(root,'mira',id,'admire'),true);
  assert.equal(root.otherSim.needs.fun,38);
  const saved=loadHousehold(copy(root));
  assert.equal(settleGardenAction(saved,'alex',id,'admire'),false);
  advance(saved,saved.minutes+1440);
  assert.equal(settleGardenAction(saved,'alex',id,'admire'),true);
  assert.equal(saved.needs.fun,30);
});

test('C1: pending/active garden reservations block sale and move, then 70% refund',()=>{
  let root=place(newHousehold()),id=gardenId(root),credits=root.shop.credits;
  assert.deepEqual(sanitizeQueueCommand('alex',{type:'garden',actionId:'water',instanceId:id},
    ['alex','mira']),{type:'garden',actionId:'water',instanceId:id});
  assert.equal(enqueueAction(root.actionQueues,'alex',{type:'garden',actionId:'water',instanceId:id})!==null,true);
  assert.equal(gardenBusy(root,id),true);
  assert.equal(previewOutdoorFeatureEdit(root,{operation:'sell',instanceId:id}).reason,'reserved-garden');
  root.actionQueues.byResident.alex.length=0;
  const preview=previewOutdoorFeatureEdit(root,{operation:'sell',instanceId:id});
  assert.ok(preview.ok,preview.reason);
  root=commitOutdoorFeatureEdit(root,preview).root;
  assert.equal(root.shop.credits,credits+77);
  assert.equal(root.world.outdoors.features.length,0);
  assert.equal(root.world.outdoors.gardens?.[id],undefined);
  assert.equal(previewOutdoorFeatureEdit(root,{operation:'sell',instanceId:id}).ok,false);
});

test('C1: legacy/root-v1 and corrupt plant metadata isolate damage',()=>{
  const old=newHousehold();
  assert.equal(loadHousehold(copy(old)).world.outdoors.features.length,0);
  const root=place(newHousehold()),id=gardenId(root);
  const saved=copy(root);
  saved.world.outdoors.gardens[id].progressWetMinutes=1e100;
  const clean=loadHousehold(saved);
  assert.equal(clean.world.outdoors.gardens[id].progressWetMinutes,0);
  assert.equal(clean.shop.credits,root.shop.credits);
  assert.equal(clean.world.furniture.instances.length,root.world.furniture.instances.length);
  assert.deepEqual(restoreOutdoorsWorld(null),{
    schema:1,revision:0,ground:[],features:[],nextId:1});
});

test('C1: UI and deploy contract includes distinct garden category, popup and 3D stages',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(html,/<option value="garden">/);
  assert.match(html,/ground-walk-info/);
  assert.match(game,/beginGardenAction/);
  assert.match(game,/gardenStageSignature/);
  assert.match(game,/part\('box','garden rich soil'/);
  assert.match(game,/offerWorldAction\(point,def.name,action==='water'/);
  assert.match(pages,/cp src\/gardening\.js site\/src\//);
});
