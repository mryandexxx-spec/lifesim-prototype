/** LOT-E1: measured canonical mixed-yard A* timings; CI host is NOT an iPhone.
 * Sampling is report-only; strict assertions cover routes and root-v1 safety.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {newHousehold,loadHousehold} from '../src/household.js';
import {outdoorCellAt} from '../src/lot-surface.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit,
  previewOutdoorPaint,commitOutdoorPreview} from '../src/outdoor-proposals.js';
import {findPath,isWalkable,isClearLine} from '../src/navigation.js';
import {gardenApproach} from '../src/gardening.js';
import {outdoorBenchApproach} from '../src/outdoor-interactions.js';
import {poolAccessPoints} from '../src/pool-navigation.js';
import {SAVE_KEY} from '../src/simulation.js';

const base=outdoorCellAt(18.25,8.25);
const json=value=>JSON.parse(JSON.stringify(value));
let root=newHousehold('2026-11-21');
root.shop.credits=30000;
root.autonomy.enabled=false;
root.otherSim.autonomy.enabled=false;
root.world.outdoors={...root.world.outdoors,revision:1,
  pools:[{poolId:'pool-1',cells:Array.from({length:16},(_,i)=>
    base+Math.floor(i/4)*64+i%4).sort((a,b)=>a-b)}],
  poolFixtures:[{fixtureId:'fixture-1',poolId:'pool-1',kind:'ladder',
    edgeCell:base,side:'west',purchasePriceCredits:120}],
  nextPoolId:2,nextFixtureId:2,poolTxnSeq:1};

function place(itemId,x,z){
  const draft=previewOutdoorFeatureEdit(root,{operation:'place',
    itemId,pose:{x,z,yaw:0}});
  assert.equal(draft.ok,true,itemId+': '+draft.reason);
  const receipt=commitOutdoorFeatureEdit(root,draft);
  assert.equal(receipt.ok,true,receipt.reason);
  root=receipt.root;
}
place('garden.herb.mint',19,11);
place('garden.bench',18,-8);
const ground=previewOutdoorPaint(root,{
  from:{x:21,z:5},to:{x:21,z:5},kind:'stone'});
assert.equal(ground.ok,true,ground.reason);
const applied=commitOutdoorPreview(root,ground);
assert.equal(applied.ok,true,applied.reason);
root=applied.root;

const garden=root.world.outdoors.features.find(f=>f.itemId==='garden.herb.mint');
const bench=root.world.outdoors.features.find(f=>f.itemId==='garden.bench');
assert.ok(garden&&bench,'both outdoor features must be saved');
const gardenGoal=gardenApproach(root.world,garden.instanceId,root.otherSim.position)?.goal;
const benchGoal=outdoorBenchApproach(root.world,bench.instanceId);
const poolGoal=poolAccessPoints(root.world,'pool-1',{from:root.position})[0]?.dryApproach;
assert.ok(gardenGoal&&benchGoal&&poolGoal,'real approaches for garden, bench and pool');

const scenarios=[
  {name:'alex-home-to-pool',from:root.position,to:poolGoal},
  {name:'mira-home-to-garden',from:root.otherSim.position,to:gardenGoal},
  {name:'alex-home-to-bench',from:root.position,to:benchGoal},
  {name:'pool-to-garden',from:poolGoal,to:gardenGoal},
  {name:'garden-to-home',from:gardenGoal,to:root.position},
  {name:'mira-home-to-yard',from:root.otherSim.position,to:{x:21,z:5}}
];
const originSnapshot=json({shop:root.shop,financialHistory:root.financialHistory,
  actionQueues:root.actionQueues,world:root.world});
assert.equal(root.version,1);
assert.equal(SAVE_KEY,'lifesim.room01.v1');
assert.equal(root.world.outdoors.pools.length,1);
const restored=loadHousehold(json(root));
assert.deepEqual(restored.shop,root.shop);
assert.deepEqual(restored.financialHistory,root.financialHistory);
assert.deepEqual(restored.actionQueues,root.actionQueues);

function route(world,scenario){
  assert.equal(isWalkable(scenario.to.x,scenario.to.z,world),true,
    scenario.name+' destination must be physically reachable');
  const start=performance.now();
  const path=findPath(scenario.from,scenario.to,world);
  const ms=performance.now()-start;
  assert.ok(path&&path.length,scenario.name+' A* route must exist');
  let previous=scenario.from;
  for(const node of path){
    assert.ok(isClearLine(previous,node,world),
      scenario.name+' must not cross pool, plants, construction or furniture');
    previous=node;
  }
  assert.deepEqual(path.at(-1),scenario.to,
    scenario.name+' route must arrive at original requested destination');
  return ms;
}
const times={cold:[],warm:[],editedCold:[],editedWarm:[]};
for(const scenario of scenarios){
  // Construction is the actual topology WeakMap cache key. Distinct identities
  // prove cold construction of the walkability grid (not cold process startup).
  const coldWorld={...root.world,
    construction:{...root.world.construction}};
  times.cold.push(route(coldWorld,scenario));
}
for(let iteration=0;iteration<12;iteration++)
  for(const scenario of scenarios)times.warm.push(route(root.world,scenario));

// Genuine paid ground edit increments outdoors revision and rekeys dynamic A*.
const revision=root.world.outdoors.revision;
const edit=previewOutdoorPaint(root,{
  from:{x:21,z:6},to:{x:21,z:6},kind:'gravel'});
assert.equal(edit.ok,true,edit.reason);
const result=commitOutdoorPreview(root,edit);
assert.equal(result.ok,true,result.reason);
const edited=result.root;
assert.equal(edited.world.outdoors.revision,revision+1);
assert.equal(edited.world.outdoors.pools.length,1);
assert.equal(edited.world.outdoors.features.length,2);
assert.equal(edited.actionQueues.nextSeq,root.actionQueues.nextSeq);
for(const scenario of scenarios)times.editedCold.push(route(edited.world,scenario));
for(let iteration=0;iteration<12;iteration++)
  for(const scenario of scenarios)times.editedWarm.push(route(edited.world,scenario));
assert.deepEqual(json({shop:root.shop,financialHistory:root.financialHistory,
  actionQueues:root.actionQueues,world:root.world}),originSnapshot,
  'measuring routes and testing immutable edits must not touch the saved original root');
assert.equal(edited.financialHistory.entries.length,
  root.financialHistory.entries.length+1,'one actual ground edit = one ledger entry');
assert.deepEqual(loadHousehold(json(edited)).world.outdoors,
  edited.world.outdoors,'edited mixed world survives root-v1 reload');

function percentile(values,p){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.ceil(p*sorted.length)-1];
}
const stats=values=>({
  samples:values.length,
  p50Ms:+percentile(values,.50).toFixed(3),
  p95Ms:+percentile(values,.95).toFixed(3),
  p99Ms:+percentile(values,.99).toFixed(3),
  maxMs:+Math.max(...values).toFixed(3)
});
const report={
  stage:'LOT-E1a',platform:'GitHub Actions Node.js (not iPhone Safari)',
  engine:'canonical root-v1 A* dynamic grid + mixed C/D outdoors',
  date:'2026-11-21',saveKey:SAVE_KEY,scenarioNames:scenarios.map(s=>s.name),
  routeSuccess:scenarios.length,series:Object.fromEntries(
    Object.entries(times).map(([key,values])=>[key,stats(values)])),
  processMemory:{
    rssBytes:process.memoryUsage().rss,
    heapUsedBytes:process.memoryUsage().heapUsed
  },
  iPhoneSafariVerified:false,performanceBudgetStatus:'baseline only; no invented threshold'
};
fs.mkdirSync('artifacts/lot-e1',{recursive:true});
fs.writeFileSync('artifacts/lot-e1/navigation.json',JSON.stringify(report,null,2));
console.log('LOT-E1 measured A* baseline:',JSON.stringify(report));
