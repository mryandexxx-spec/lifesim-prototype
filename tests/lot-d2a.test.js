import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold} from '../src/household.js';
import {outdoorCellAt} from '../src/lot-surface.js';
import {findPath,isWalkable} from '../src/navigation.js';
import {enqueueAction,restoreActionQueues} from '../src/action-queue.js';
import {poolFixtureSite} from '../src/pool-equipment.js';
import {findPoolWaterPath,poolSwimSlots,poolAccessPoints,planPoolEntry,
  planPoolExit,planPoolRecovery,planPoolAdmission} from '../src/pool-navigation.js';

const at=(x,z)=>outdoorCellAt(x+.25,z+.25);
const base=at(18,8);
const rectangle=(w,h,start=base)=>Array.from({length:w*h},(_,n)=>
  start+Math.floor(n/w)*64+n%w).sort((a,b)=>a-b);
const copy=v=>JSON.parse(JSON.stringify(v));
function addPool(root,cells=rectangle(4,4),fixtures=[]){
  root.world.outdoors={...root.world.outdoors,
    revision:(root.world.outdoors.revision||0)+1,
    pools:[{poolId:'pool-1',cells:[...cells].sort((a,b)=>a-b)}],
    poolFixtures:fixtures};
  return root;
}
function equipment(kind,edgeCell,side,id='fixture-1'){
  return {fixtureId:id,poolId:'pool-1',kind,edgeCell,side,
    purchasePriceCredits:{ladder:120,steps:180,board:400}[kind]};
}
const withLadder=()=>addPool(newHousehold(),rectangle(4,4),
  [equipment('ladder',base,'west')]);
const cellEnd=base+3*64+3;

test('LOT-D2a: old version-1 saves and empty pool world remain untouched',()=>{
  const old=newHousehold(),restored=loadHousehold(copy(old));
  assert.equal(restored.version,1);
  assert.deepEqual(restored.world.outdoors,old.world.outdoors);
  assert.deepEqual(restored.actionQueues,old.actionQueues);
  assert.deepEqual(restored.shop,old.shop);
  assert.deepEqual(poolSwimSlots(restored.world,'pool-1'),[]);
  assert.equal(planPoolEntry(restored.world,old.position,'pool-1'),null);
  assert.equal(planPoolRecovery(restored.world,'pool-1',base),null);
});

test('LOT-D2a: four-neighbour water A* never cuts dry gap, wall or diagonal',()=>{
  const shape=[base,base+1,base+64,base+128,base+129];
  const root=addPool(newHousehold(),shape);
  assert.deepEqual(findPoolWaterPath(root.world,'pool-1',base+1,base+129),
    [base+1,base,base+64,base+128,base+129]);
  assert.equal(findPoolWaterPath(root.world,'pool-1',base+1,base+65),null);
  assert.equal(findPoolWaterPath(root.world,'pool-1',base,base+129,
    {blockedCells:[base+64]}),null);
  assert.equal(findPoolWaterPath(root.world,'pool-1',base,3072),null);
  assert.equal(findPoolWaterPath(root.world,'pool-999',base,base+1),null);
  assert.equal(findPath({x:17,z:8.25},{x:18.25,z:8.25},root.world),null,
    'land A* cannot be diverted through wet path');
});

test('LOT-D2a: a real 1 x 2m corridor is required; no preset pool size',()=>{
  const narrow=addPool(newHousehold(),rectangle(1,8));
  assert.deepEqual(poolSwimSlots(narrow.world,'pool-1'),[]);
  const minimum=addPool(newHousehold(),rectangle(2,4));
  assert.equal(poolSwimSlots(minimum.world,'pool-1').length,1);
  const wide=addPool(newHousehold(),rectangle(4,4));
  const slots=poolSwimSlots(wide.world,'pool-1');
  assert.equal(slots.length,2);
  assert.ok(slots.every(s=>s.cells.length===8&&wide.world.outdoors.pools[0].cells.includes(s.anchorCell)));
  assert.equal(new Set(slots.flatMap(s=>s.cells)).size,16,'occupied corridors cannot overlap');
  assert.equal(poolSwimSlots(wide.world,'pool-1',
    {reservedCells:slots[0].cells}).length,1);
});

test('LOT-D2a: no fixture means no admission and no reward shortcut',()=>{
  const root=addPool(newHousehold());
  assert.equal(planPoolEntry(root.world,root.position,'pool-1'),null);
  assert.deepEqual(poolAccessPoints(root.world,'pool-1'),[]);
  assert.deepEqual(poolSwimSlots(root.world,'pool-1').length,2);
  assert.equal(root.needs.fun,76);
  assert.equal(root.action,null);
});

test('LOT-D2a: choose reachable ladder on dry land, never wet land A*',()=>{
  const root=withLadder();
  const site=poolFixtureSite(root.world.outdoors.pools[0],base,'west','ladder');
  assert.ok(site);
  assert.ok(isWalkable(site.dryApproach.x,site.dryApproach.z,root.world));
  const entry=planPoolEntry(root.world,root.position,'pool-1');
  assert.ok(entry,'fixture and water corridor are reachable');
  assert.equal(entry.kind,'ladder');
  assert.equal(entry.fixtureId,'fixture-1');
  assert.deepEqual(entry.dryApproach,site.dryApproach);
  assert.ok(entry.landPath.length>0);
  assert.equal(entry.wetPath[0],base);
  assert.equal(entry.wetPath.at(-1),entry.slot.anchorCell);
  assert.equal(entry.revision,root.world.outdoors.revision);
  const exit=planPoolExit(root.world,'pool-1',entry.slot.anchorCell);
  assert.equal(exit.fixtureId,'fixture-1');
  assert.equal(exit.waterPath[0],entry.slot.anchorCell);
  assert.equal(exit.waterPath.at(-1),base);
});

test('LOT-D2a: missing or reserved exit fails without ghost admission',()=>{
  const root=withLadder();
  assert.equal(planPoolEntry(root.world,root.position,'pool-1',
    {blockedFixtureIds:['fixture-1']}),null);
  assert.equal(planPoolExit(root.world,'pool-1',base,
    {blockedFixtureIds:['fixture-1']}),null);
  assert.equal(planPoolExit(root.world,'pool-1',base+1,
    {blockedCells:[base]}),null);
  const recovered=planPoolRecovery(root.world,'pool-1',cellEnd);
  assert.equal(recovered.kind,'assisted-shore');
  assert.ok(isWalkable(recovered.dryApproach.x,recovered.dryApproach.z,root.world));
  root.world.outdoors.poolFixtures=[];
  assert.equal(planPoolEntry(root.world,root.position,'pool-1'),null);
  assert.equal(planPoolExit(root.world,'pool-1',cellEnd),null);
  assert.ok(planPoolRecovery(root.world,'pool-1',cellEnd),'no ladder is not a trap');
});

test('LOT-D2a: board requires an independent exit and safe 2x2m landing',()=>{
  const root=addPool(newHousehold(),rectangle(4,4),
    [equipment('board',base+64,'west','fixture-2')]);
  assert.equal(planPoolEntry(root.world,root.position,'pool-1',{jump:true}),null);
  root.world.outdoors.poolFixtures.push(equipment('ladder',base,'north'));
  assert.equal(planPoolEntry(root.world,root.position,'pool-1',{jump:false})?.kind,'ladder');
  assert.equal(planPoolEntry(root.world,root.position,'pool-1',{jump:true})?.kind,'board');
  assert.ok(poolAccessPoints(root.world,'pool-1',{board:true}).length===1);
  assert.ok(poolAccessPoints(root.world,'pool-1').every(p=>p.kind!=='board'));
  const exit=planPoolExit(root.world,'pool-1',cellEnd);
  assert.equal(exit.fixtureId,'fixture-1','board never becomes an emergency exit');
});

test('LOT-D2a: one ladder serializes transitions and protects separate water lanes',()=>{
  const root=withLadder();
  const first=planPoolAdmission(root,'alex','pool-1');
  assert.ok(first);
  root.action={id:'swim',phase:'using',stage:'entering',poolId:'pool-1',
    fixtureId:first.fixtureId,slotCells:first.slot.cells,slotId:first.slot.slotId,
    automatic:false,elapsed:0};
  assert.equal(planPoolAdmission(root,'mira','pool-1'),null,
    'a ladder is exclusive while someone is entering');
  root.action.stage='swimming';
  const second=planPoolAdmission(root,'mira','pool-1');
  assert.ok(second,'second resident can swim simultaneously once entry frees');
  assert.notEqual(first.slot.slotId,second.slot.slotId);
  assert.equal(first.slot.cells.some(c=>second.slot.cells.includes(c)),false);
  root.action.stage='exiting';
  assert.equal(planPoolAdmission(root,'mira','pool-1'),null,
    'the exit transition also owns the ladder');
});

test('LOT-D2a: persistent pool commands preserve v1 FIFO, reject malicious intents',()=>{
  const root=withLadder();
  const queue=root.actionQueues;
  const first=enqueueAction(queue,'alex',{type:'pool',poolId:'pool-1',actionId:'swim'});
  const second=enqueueAction(queue,'mira',
    {type:'pool',poolId:'pool-1',actionId:'jump',fixtureId:'fixture-2'});
  assert.ok(first&&second);
  assert.ok(first.seq<second.seq);
  assert.equal(enqueueAction(queue,'alex',{type:'pool',poolId:'bad',actionId:'swim'}),null);
  assert.equal(enqueueAction(queue,'alex',{type:'pool',poolId:'pool-1',actionId:'jump'}),null);
  assert.equal(enqueueAction(queue,'alex',{type:'pool',poolId:'pool-1',
    actionId:'swim',fixtureId:'../../etc'}),null);
  const restored=restoreActionQueues(copy(queue),['alex','mira']);
  assert.deepEqual(restored,queue);
  assert.equal(planPoolAdmission(root,'mira','pool-1'),null,
    'newer queued task cannot pass an older request for the same pool');
  const unchanged=copy(root);
  assert.equal(unchanged.version,1);
  assert.deepEqual(unchanged.shop,root.shop);
  assert.equal(unchanged.actionQueues.nextSeq,queue.nextSeq);
});
