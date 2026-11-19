import {readFileSync} from 'node:fs';
/** LOT-B3: no phantom bench rewards, bounded lights and honest economy. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {ACTIONS,chooseAction,arrive} from '../src/simulation.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {outdoorBenchApproach,outdoorBenchPose,outdoorLightFactor,outdoorBenchAvailable} from '../src/outdoor-interactions.js';
import {isWalkable,findPath} from '../src/navigation.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const place=(root,itemId,x,z,yaw=0)=>{
  const p=previewOutdoorFeatureEdit(root,{operation:'place',itemId,pose:{x,z,yaw}});
  assert.ok(p.ok,p.reason);const done=commitOutdoorFeatureEdit(root,p);
  assert.ok(done.ok,done.reason);return done.root;
};
test('B3 all four products match catalogue prices and retain paid instance IDs',()=>{
  const h=newHousehold();const a=place(h,'garden.bench',19,8);
  assert.equal(a.world.outdoors.features[0].purchasePriceCredits,240);
  const b=place(a,'garden.table',21,7);
  assert.equal(b.world.outdoors.features.at(-1).purchasePriceCredits,220);
  const c=place(b,'light.path',18,6);
  assert.equal(c.world.outdoors.features.at(-1).purchasePriceCredits,120);
  const d=place(c,'light.standing',21,9);
  assert.equal(d.world.outdoors.features.at(-1).purchasePriceCredits,180);
  assert.equal(d.financialHistory.entries.length,4);
  assert.equal(d.shop.credits,h.shop.credits-760);
  assert.deepEqual(loadHousehold(clone(d)).world.outdoors,d.world.outdoors);
});
test('B3 bench approach is outside footprint and genuinely reachable for both actors',()=>{
  const h=place(newHousehold(),'garden.bench',19,8,90);
  const bench=h.world.outdoors.features[0],p=outdoorBenchApproach(h.world,bench.instanceId);
  assert.ok(isWalkable(p.x,p.z,h.world));
  for(const actor of [h,h.otherSim])assert.ok(findPath(actor.position,p,h.world));
  const visual=outdoorBenchPose(h.world,bench.instanceId,1);
  assert.ok(Math.abs(visual.x-bench.x)<.02);
  assert.ok(visual.sofaWeight>.99);
});
test('B3 realistic bench time increases fun only while using; save/reload/idempotence',()=>{
  let h=place(newHousehold(),'garden.bench',19,8);
  h.paused=false;h.otherSim.paused=false;h.autonomy.enabled=false;
  const id=h.world.outdoors.features[0].instanceId,p=outdoorBenchApproach(h.world,id);
  h.position={...p};
  assert.ok(chooseAction(h,'bench'));
  h.action.targetInstanceId=id;
  let before=h.needs.fun;
  tickHousehold(h,5);
  assert.ok(h.needs.fun<=before,'walking must never restore Fun');
  arrive(h);
  before=h.needs.fun;
  tickHousehold(h,8);
  assert.ok(h.needs.fun>before,'rest credits only real elapsed using minutes');
  let restored=loadHousehold(clone(h));
  assert.equal(restored.action?.id,'bench');
  assert.equal(restored.action.targetInstanceId,id);
  assert.equal(restored.action.phase,'using');
  const total=restored.needs.fun;
  tickHousehold(restored,10);
  assert.ok(restored.needs.fun>total);
  assert.ok(restored.action.elapsed<=ACTIONS.bench.duration);
  restored.paused=true;
  const frozen=restored.needs.fun;tickHousehold(restored,30);
  assert.equal(restored.needs.fun,frozen,'pause provides no rewards');
});
test('B3 bench cannot be moved/sold while in use or reserved in the queue',()=>{
  const h=place(newHousehold(),'garden.bench',19,8);
  const id=h.world.outdoors.features[0].instanceId;
  h.action={id:'bench',phase:'using',elapsed:3,automatic:false,targetInstanceId:id};
  assert.equal(previewOutdoorFeatureEdit(h,{operation:'sell',instanceId:id}).reason,'reserved-bench');
  h.action=null;h.actionQueues.byResident.mira.push({type:'outdoor',instanceId:id,seq:1});
  assert.equal(previewOutdoorFeatureEdit(h,{operation:'move',instanceId:id,pose:{x:21,z:7,yaw:0}}).reason,'reserved-bench');
  h.actionQueues.byResident.mira.length=0;
  const sell=previewOutdoorFeatureEdit(h,{operation:'sell',instanceId:id});
  assert.equal(sell.cost,-168);
  const result=commitOutdoorFeatureEdit(h,sell);
  assert.ok(result.ok);
  assert.equal(result.root.financialHistory.entries.at(-1).kind,'sale');
});
test('B3 auto light follows game daylight and never emits daytime sources',()=>{
  assert.equal(outdoorLightFactor({normalizedDaylight:1}),0);
  assert.equal(outdoorLightFactor({normalizedDaylight:0}),1);
  assert.ok(outdoorLightFactor({normalizedDaylight:.2})>0);
  assert.equal(outdoorLightFactor({normalizedDaylight:NaN}),0);
});
test('B3 restores malformed action without phantom bonus and old saves remain compatible',()=>{
  const h=newHousehold();const old=clone(h);
  old.action={id:'bench',phase:'using',elapsed:19,automatic:false,
    targetInstanceId:'out-908'};
  const next=loadHousehold(old);
  assert.equal(next.action,null);
  assert.equal(next.shop.credits,h.shop.credits);
  assert.equal(next.world.outdoors.features.length,0);
});

test('B3 scene renderer includes owned garden furniture and lights',()=>{
  const source=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const filter=source.match(/const renderOutdoorFeatures=\(\)=>\{[\s\S]*?for\(const item of game\.world\?\.outdoors\?\.features\|\|\[\]\)\{[\s\S]*?if\(!def\|\|!\[([^\]]+)\]\.includes\(def\.category\)\)continue;/);
  assert.ok(filter,'renderer must iterate saved outdoor features with explicit category filter');
  for(const category of ['tree','shrub','flower','fence','furniture','light'])
    assert.ok(filter[1].includes("'"+category+"'"),'renderer skips '+category);
  for(const itemId of ['garden.bench','garden.table'])
    assert.ok(source.includes("item.itemId==='"+itemId+"'"),
      'scene must render '+itemId);
  assert.ok(source.includes("def.category==='light'"),
    'both lamp SKUs must share the light rendering branch');
});
