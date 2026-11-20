import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold} from '../src/household.js';
import {outdoorCellAt,restoreOutdoorsWorld} from '../src/lot-surface.js';
import {poolWaterPrice,poolCellBounds} from '../src/pool-topology.js';
import {POOL_FIXTURE_PRICES,poolHasExit,poolFixtureSite} from '../src/pool-equipment.js';
import {previewPoolTiles,previewPoolFixture,previewPoolHistory,
  poolEditorSnapshot,commitPoolPreview,commitPoolPreviewPersisted}
  from '../src/pool-editor.js';

const copy=v=>JSON.parse(JSON.stringify(v));
const at=(x,z)=>outdoorCellAt(x+.25,z+.25);
const base=at(18,8);
function rich(){const r=newHousehold();r.shop.credits=20000;return r;}
const done=(root,proposal)=>{
  assert.equal(proposal.ok,true,proposal.reason);
  const applied=commitPoolPreview(root,proposal);
  assert.equal(applied.ok,true,applied.reason);
  return applied.root;
};
const tiles=(root,cells,operation='paint')=>previewPoolTiles(root,{operation,cells});
const fixture=(root,kind,cell,side,operation='fixture-add',fixtureId)=>
  previewPoolFixture(root,{operation,kind,edgeCell:cell,side,fixtureId});

test('D1b: old root-v1 save shape stays untouched until pool edit',()=>{
  const old=rich(),loaded=loadHousehold(copy(old));
  assert.equal(Object.hasOwn(loaded.world.outdoors,'pools'),false);
  assert.equal(Object.hasOwn(loaded.world.outdoors,'poolFixtures'),false);
  assert.deepEqual(loaded.world.outdoors,old.world.outdoors);
  assert.equal(poolWaterPrice(1,1),617);
  assert.deepEqual(POOL_FIXTURE_PRICES,{ladder:120,steps:180,board:400});
});

test('D1b: one tile pays basin base once; brush addition bills 17/18 exactly',()=>{
  let root=rich();
  const init=tiles(root,[base]);
  assert.equal(init.ok,true,init.reason);
  assert.equal(init.cost,617);
  assert.equal(init.areaSquareMetres,.25);
  assert.equal(init.basins,1);
  assert.equal(init.swimReady,false,'pool never creates an automatic entry');
  root=done(root,init);
  assert.equal(root.world.outdoors.pools[0].poolId,'pool-1');
  assert.equal(root.shop.credits,19383);
  const duplicate=commitPoolPreview(root,init);
  assert.equal(duplicate.reason,'stale-preview');
  const more=tiles(root,[base+1]);
  assert.equal(more.cost,18);
  root=done(root,more);
  const erase=tiles(root,[base+1],'erase');
  assert.equal(erase.cost,-12);
  root=done(root,erase);
  assert.equal(root.shop.credits,19377,'resale does not mint credits');
  assert.equal(root.world.outdoors.poolTxnSeq,3);
  const loaded=loadHousehold(copy(root));
  assert.deepEqual(loaded.world.outdoors,root.world.outdoors);
  assert.deepEqual(loaded.shop,root.shop);
  assert.equal(loaded.version,1);
});

test('D1b: freeform split surcharge, merge refund, 4-basin and 512-cell caps',()=>{
  let root=rich();
  root=done(root,tiles(root,[base,base+1,base+2]));
  const split=tiles(root,[base+1],'erase');
  assert.equal(split.cost,600-12,'split purchases extra basin, refunds removed tile');
  root=done(root,split);
  assert.equal(root.world.outdoors.pools.length,2);
  assert.deepEqual(root.world.outdoors.pools.map(p=>p.poolId),
    ['pool-1','pool-2']);
  const merge=tiles(root,[base+1]);
  assert.equal(merge.cost,-402,'merge returns 70% of reduced total price');
  root=done(root,merge);
  assert.equal(root.world.outdoors.pools.length,1);
  assert.equal(tiles(root,[base+5,base+7,base+9,base+11]).reason,
    'pool-component-limit');
  assert.equal(tiles(root,[3072]).reason,'invalid-cells');
  assert.equal(tiles(root,[base,base]).reason,'duplicate-cells');
  assert.equal(tiles(root,[base]).reason,'unchanged');
});

test('D1b: player places ladder and steps, no exit before; board needs 2m water landing',()=>{
  let root=rich();
  root=done(root,tiles(root,[base,base+1,base+64,base+65]));
  assert.equal(fixture(root,'board',base,'west').reason,'unsafe-rim-or-landing');
  assert.equal(root.world.outdoors.poolFixtures.length,0);
  const ladder=fixture(root,'ladder',base,'west');
  assert.equal(ladder.cost,120);
  root=done(root,ladder);
  assert.equal(root.world.outdoors.poolFixtures[0].fixtureId,'fixture-1');
  assert.equal(root.world.outdoors.poolFixtures[0].side,'west');
  assert.equal(ladder.swimReady,true);
  assert.equal(poolHasExit(root.world.outdoors,'pool-1'),true);
  assert.equal(fixture(root,'steps',base,'west').reason,'occupied-rim');
  root=done(root,fixture(root,'steps',base+1,'north'));
  assert.equal(root.world.outdoors.poolFixtures.length,2);
  assert.equal(root.world.outdoors.poolFixtures[1].purchasePriceCredits,180);
  assert.equal(tiles(root,[base],'erase').ok,false,
    'removing a ladder anchor needs explicit accessory relocation/removal');
  const restored=loadHousehold(copy(root));
  assert.deepEqual(restored.world.outdoors,root.world.outdoors);
  const remove=previewPoolFixture(root,{operation:'fixture-remove',
    fixtureId:'fixture-1'});
  assert.equal(remove.cost,-84);
  root=done(root,remove);
  assert.equal(root.world.outdoors.poolFixtures.length,1);
});

test('D1b: safe feet-first board patch is 4x4, not a prefab rectangle-only pool',()=>{
  let root=rich();
  const cells=[];
  for(let z=0;z<4;z++)for(let x=0;x<4;x++)cells.push(base+z*64+x);
  root=done(root,tiles(root,cells));
  const board=fixture(root,'board',base+64,'west');
  assert.equal(board.ok,true,board.reason);
  assert.equal(board.cost,400);
  root=done(root,board);
  assert.equal(root.world.outdoors.poolFixtures[0].kind,'board');
  assert.equal(root.world.outdoors.poolFixtures[0].side,'west');
  assert.equal(root.world.outdoors.poolFixtures[0].purchasePriceCredits,400);
  assert.equal(root.world.outdoors.pools[0].cells.length,16);
  assert.equal(poolFixtureSite(root.world.outdoors.pools[0],base+64,
    'west','board')!==null,true);
  assert.equal(root.world.outdoors.poolFixtures.length,1);
  assert.equal(poolHasExit(root.world.outdoors,'pool-1'),false,
    'a springboard is not a swimming exit');
});

test('D1b: stale Apply, insufficient money, invalid fixtures, tampering cannot mint',()=>{
  const root=rich();
  root.shop.credits=616;
  assert.equal(tiles(root,[base]).reason,'insufficient-credits');
  root.shop.credits=20000;
  const valid=tiles(root,[base]);
  const fake={...valid,cost:-500};
  assert.equal(commitPoolPreview(root,fake).reason,'tampered-preview');
  const changed=copy(root);
  changed.shop.credits+=100; // e.g. asynchronous salary earned after preview
  assert.equal(commitPoolPreview(changed,valid).reason,'stale-preview');
  const after=done(root,valid);
  assert.equal(fixture(after,'ladder',base,'bad').reason,'unsafe-rim-or-landing');
  assert.equal(fixture(after,'board',base,'west').reason,'unsafe-rim-or-landing');
});

test('D1b: existing editor undo/redo targets re-quote using current salary',()=>{
  let root=rich(),before=poolEditorSnapshot(root);
  root=done(root,tiles(root,[base,base+1]));
  const built=poolEditorSnapshot(root);
  const balanceAfterBuild=root.shop.credits;
  root={...root,shop:{...root.shop,credits:root.shop.credits+100}};
  const inverse=previewPoolHistory(root,before);
  assert.equal(inverse.ok,true,inverse.reason);
  assert.ok(inverse.cost<0);
  root=done(root,inverse);
  assert.equal(root.shop.credits,balanceAfterBuild+100-inverse.cost);
  assert.equal(root.world.outdoors.pools.length,0);
  root=done(root,previewPoolHistory(root,built));
  assert.equal(root.world.outdoors.pools.length,1);
  assert.equal(root.world.outdoors.poolTxnSeq,3);
  assert.ok(root.shop.credits<=balanceAfterBuild+100,
    'replaying inverse history cannot create wallet arbitrage');
});

test('D1b: failed single-root persistence yields no in-memory wallet changes',()=>{
  const root=rich(),old=copy(root);
  const draft=tiles(root,[base]);
  assert.equal(commitPoolPreviewPersisted(root,draft,()=>false).reason,'save-failed');
  assert.equal(commitPoolPreviewPersisted(root,draft,()=>{throw Error('quota');}).reason,
    'save-failed');
  assert.deepEqual(root,old);
  const committed=commitPoolPreviewPersisted(root,draft,()=>true);
  assert.equal(committed.ok,true,committed.reason);
  assert.equal(root.shop.credits,old.shop.credits,'original root immutable');
  assert.equal(committed.root.shop.credits,old.shop.credits-617);
});

test('D1b: occupied pool reservation blocks edits and existing households load',()=>{
  const root=rich();
  root.actionQueues.byResident.alex.push({type:'pool',poolId:'pool-1'});
  assert.equal(tiles(root,[base]).reason,'reserved-pool');
  root.actionQueues.byResident.alex=[];
  const changed=done(root,tiles(root,[base]));
  const corrupt=copy(changed);
  corrupt.world.outdoors.poolFixtures=[
    {fixtureId:'fixture-1',poolId:'pool-999',kind:'ladder',edgeCell:base,
      side:'west',purchasePriceCredits:120},
    {fixtureId:'fixture-2',poolId:'pool-1',kind:'ladder',edgeCell:base,
      side:'west',purchasePriceCredits:200}
  ];
  const loaded=loadHousehold(corrupt);
  assert.equal(loaded.world.outdoors.poolFixtures.length,0);
  assert.equal(loaded.world.outdoors.pools.length,1);
  assert.deepEqual(loaded.shop,changed.shop);
  assert.deepEqual(loaded.world.furniture,changed.world.furniture);
});
