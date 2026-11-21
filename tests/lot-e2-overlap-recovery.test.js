/** LOT-E2: preserve paid pool infrastructure when optional outdoor records are corrupt.
 * Regression against v1 loader precedence: valid water and exits must not be
 * silently destroyed by an overlapping stray decoration in a damaged save.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold} from '../src/household.js';
import {outdoorCellAt} from '../src/lot-surface.js';
import {poolFixtureSite} from '../src/pool-equipment.js';
import {SAVE_KEY} from '../src/simulation.js';

const clone=x=>JSON.parse(JSON.stringify(x));
const base=outdoorCellAt(18.25,8.25);
const poolCells=Array.from({length:16},(_,i)=>base+Math.floor(i/4)*64+i%4)
  .sort((a,b)=>a-b);
function paidPoolRoot(){
  const root=newHousehold('2026-11-21');
  root.shop.credits=890;
  root.world.outdoors={...root.world.outdoors,revision:4,
    pools:[{poolId:'pool-1',cells:poolCells}],
    poolFixtures:[{fixtureId:'fixture-1',poolId:'pool-1',kind:'ladder',
      edgeCell:base,side:'west',purchasePriceCredits:120}],
    nextPoolId:2,nextFixtureId:2,poolTxnSeq:4};
  return loadHousehold(clone(root));
}
function assertInfrastructure(root,original){
  assert.equal(root.version,1);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.deepEqual(root.world.outdoors.pools,original.world.outdoors.pools,
    'previously paid pool must survive damaged optional outdoor feature');
  assert.deepEqual(root.world.outdoors.poolFixtures,original.world.outdoors.poolFixtures,
    'previously paid ladder must remain attached');
  for(const name of ['shop','financialHistory','actionQueues','kitchen','careerSystem'])
    assert.deepEqual(root[name],original[name],name+' must not be repaired by inventing receipts');
  assert.deepEqual(loadHousehold(clone(root)).world.outdoors,root.world.outdoors,
    'repaired root-v1 payload must be idempotent after save/reload');
}
test('LOT-E2 red: malformed optional decoration on paid pool water cannot erase pool or ladder',()=>{
  const original=paidPoolRoot();
  assert.equal(original.world.outdoors.pools.length,1);
  assert.equal(original.world.outdoors.poolFixtures.length,1);
  const corrupt=clone(original);
  corrupt.world.outdoors.features.push({instanceId:'out-99',
    itemId:'garden.bench',x:18.5,z:8.5,yaw:0,purchasePriceCredits:240});
  corrupt.world.outdoors.nextId=100;
  const restored=loadHousehold(corrupt);
  assertInfrastructure(restored,original);
  assert.equal(restored.world.outdoors.features.some(x=>x.instanceId==='out-99'),false);
});
test('LOT-E2 red: malformed optional item on paid ladder landing cannot erase its exit',()=>{
  const original=paidPoolRoot();
  const pool=original.world.outdoors.pools[0];
  const landing=poolFixtureSite(pool,base,'west','ladder').dryApproach;
  const x=Math.round(landing.x*4)/4,z=Math.round(landing.z*4)/4;
  const corrupt=clone(original);
  corrupt.world.outdoors.features.push({instanceId:'out-98',
    itemId:'light.path',x,z,yaw:0,purchasePriceCredits:120});
  corrupt.world.outdoors.nextId=99;
  const restored=loadHousehold(corrupt);
  assertInfrastructure(restored,original);
  assert.equal(restored.world.outdoors.features.some(f=>f.instanceId==='out-98'),false);
});
