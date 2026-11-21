/** LOT-D3b: 30 canonical game days and 100 reversible water edits.
 * Headless simulation only; separate real PlayCanvas/WebGL rotation smoke.
 * Stress budgets and execution timing are reported, not hard-coded device FPS.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {outdoorCellAt} from '../src/lot-surface.js';
import {previewPoolTiles,previewPoolHistory,poolEditorSnapshot,
  commitPoolPreview} from '../src/pool-editor.js';
import {poolComponents} from '../src/pool-topology.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {SAVE_KEY} from '../src/simulation.js';

const at=(x,z)=>outdoorCellAt(x+.25,z+.25);
const first=at(18,8);
const water=Array.from({length:16},(_,i)=>first+Math.floor(i/4)*64+i%4).sort((a,b)=>a-b);
const json=x=>JSON.parse(JSON.stringify(x));
const fixture={fixtureId:'fixture-1',poolId:'pool-1',kind:'ladder',
  edgeCell:first,side:'west',purchasePriceCredits:120};
const poolRoot=()=>{
  const r=newHousehold('2026-11-21');
  r.shop.credits=30000;
  r.world.outdoors={...r.world.outdoors,revision:1,
    pools:[{poolId:'pool-1',cells:water}],poolFixtures:[fixture],
    nextPoolId:2,nextFixtureId:2,poolTxnSeq:1};
  return r;
};
function commit(root,draft){
  assert.equal(draft.ok,true,draft.reason);
  const result=commitPoolPreview(root,draft);
  assert.equal(result.ok,true,result.reason);
  return result.root;
}
const assertHousehold=(root)=>{
  assert.equal(root.version,1);
  assert.ok(Number.isFinite(root.minutes));
  assert.equal(root.otherSim.minutes,root.minutes);
  assert.equal(root.world.outdoors.pools.length,1);
  assert.deepEqual(poolComponents(root.world.outdoors.pools[0].cells),
    [root.world.outdoors.pools[0].cells]);
  assert.equal(root.world.outdoors.poolFixtures.length,1);
  assert.ok(Number.isSafeInteger(root.shop.credits)&&root.shop.credits>=0);
  for(const actor of [root,root.otherSim]){
    assert.ok(Number.isFinite(actor.position.x)&&Number.isFinite(actor.position.z));
    for(const v of Object.values(actor.needs))
      if(typeof v==='number')assert.ok(Number.isFinite(v));
  }
  for(const residentId of ['alex','mira'])
    assert.ok((root.actionQueues.byResident[residentId]||[]).length<=12);
};

test('D3b: thirty days of shared clock, garden, pool, work, bills, reload and bounded two-person state',()=>{
  let root=poolRoot();
  const garden=previewOutdoorFeatureEdit(root,{operation:'place',
    itemId:'garden.herb.mint',pose:{x:19,z:11,yaw:0}});
  assert.equal(garden.ok,true,garden.reason);
  root=commitOutdoorFeatureEdit(root,garden).root;
  const start=root.minutes,seedBalance=root.shop.credits;
  const t0=performance.now();
  for(let day=0;day<30;day++){
    for(let hour=0;hour<24;hour++)tickHousehold(root,60);
    assert.equal(root.minutes,start+(day+1)*1440,'exact shared day boundaries');
    assertHousehold(root);
    assert.equal(root.world.outdoors.features.length,1);
    assert.equal(root.world.outdoors.pools[0].cells.length,16);
    // Real v1 serialization/loader every fifth day, including finance and
    // individual resident autonomy states. No artificial minute advance.
    if(day%5===4){
      const persisted=json(root);
      const loaded=loadHousehold(persisted);
      assert.equal(loaded.minutes,root.minutes);
      assert.equal(loaded.shop.credits,root.shop.credits);
      assert.deepEqual(loaded.world.outdoors.pools,root.world.outdoors.pools);
      assert.equal(loaded.world.outdoors.features.length,1);
      root=loaded;
    }
  }
  const duration=performance.now()-t0;
  assert.equal(root.minutes-start,43200);
  assert.ok(root.financialHistory,'one real household financial ledger');
  assert.ok(root.shop.credits>=0&&seedBalance>=0);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  console.log('LOT-D3b 30-day household stress:',JSON.stringify({
    days:30,gameMinutes:root.minutes-start,elapsedMs:Math.round(duration),
    credits:root.shop.credits,poolCells:16,residents:2,serializedReloads:6
  }));
});

test('D3b: 100 pool tile edit/undo loops preserve root-v1, credits and existing ladder',()=>{
  let root=poolRoot(),original=poolEditorSnapshot(root);
  const startWallet=root.shop.credits,t0=performance.now();
  for(let i=0;i<100;i++){
    const before=root.shop.credits;
    root=commit(root,previewPoolTiles(root,{operation:'paint',cells:[first+4]}));
    assert.equal(root.world.outdoors.pools[0].cells.length,17);
    root=commit(root,previewPoolHistory(root,original));
    assert.equal(root.world.outdoors.pools[0].cells.length,16);
    assert.equal(root.world.outdoors.poolFixtures.length,1);
    assert.ok(root.shop.credits<=before,'paid add + 70% refund cannot mint');
    assertHousehold(root);
    if(i%20===19){
      const reloaded=loadHousehold(json(root));
      assert.equal(reloaded.world.outdoors.pools[0].cells.length,16);
      assert.equal(reloaded.shop.credits,root.shop.credits);
      root=reloaded;
      original=poolEditorSnapshot(root);
    }
  }
  assert.equal(root.world.outdoors.poolTxnSeq,201);
  assert.ok(root.shop.credits<=startWallet);
  assert.equal(root.version,1);
  console.log('LOT-D3b 100 pool edit/undo loops:',JSON.stringify({
    loops:100,transactions:200,elapsedMs:Math.round(performance.now()-t0),
    credits:root.shop.credits,unchangedPoolCells:16
  }));
});
