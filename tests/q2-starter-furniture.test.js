import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold} from '../src/household.js';
import {ORIGINAL_FURNITURE,furnitureProvenance,resolveActionFurniture} from '../src/furniture-catalog.js';
import {createFurnitureEditor} from '../src/furniture-editor.js';
import {recordFinanceChange} from '../src/finance-ledger.js';
import {newFurnitureShop,STARTER_SELL_PERCENT,SHOP_SELL_PERCENT,starterAppraisal,
  canTradeMarketInstance,buyMarketItem,findMarketPlacement,findStoredPlacement,
  storeMarketItem,restoreMarketItem,sellMarketItem} from '../src/furniture-shop.js';

const clone=v=>JSON.parse(JSON.stringify(v));
const residents=[{x:-.8,z:2.95},{x:-.25,z:.35}];
const opts={residents};
const starter=(world,type)=>world.instances.find(x=>x.instanceId==='home-'+type+'-1');
const reloaded=root=>loadHousehold(clone(root));
function set(root,tx){
  assert.equal(tx.ok,true,tx.reason||'transaction failed');
  root.world.furniture=tx.world;root.shop=tx.shop;
  return reloaded(root);
}
test('Q2 provenance is stable without root/furniture schema migration',()=>{
  const root=newHousehold();
  assert.equal(root.version,1);assert.equal(root.world.furniture.schema,1);
  for(const item of ORIGINAL_FURNITURE)
    assert.equal(furnitureProvenance(item),'starter');
  assert.equal(furnitureProvenance({instanceId:'home-bed-2',prefabId:'bed'}),'unknown');
  assert.equal(furnitureProvenance({instanceId:'home-bed-1',prefabId:'sofa'}),'unknown');
  assert.equal(furnitureProvenance({instanceId:'shop-bed-7',prefabId:'bed'}),'purchased');
  assert.deepEqual(reloaded(root).world.furniture,root.world.furniture);
});
test('Q2 original bed: buy replacement → warehouse → reload → restore → sell → reload',()=>{
  let root=newHousehold();root.shop=newFurnitureShop();
  const original=starter(root.world.furniture,'bed');
  assert.equal(starterAppraisal(original),850);
  assert.equal(storeMarketItem(root.world.furniture,root.shop,original.instanceId,opts)
    .reason,'last-essential');
  const pose=findMarketPlacement(root.world.furniture,root.shop,'bed',opts);
  assert.ok(pose,'a second bed must have a reachable legitimate placement');
  root=set(root,buyMarketItem(root.world.furniture,root.shop,'bed',pose,opts));
  const purchaseId=root.world.furniture.instances.find(x=>
    x.prefabId==='bed'&&x.instanceId!==original.instanceId).instanceId;
  assert.equal(furnitureProvenance(root.world.furniture.instances.find(i=>i.instanceId===purchaseId)),'purchased');
  root=set(root,storeMarketItem(root.world.furniture,root.shop,original.instanceId,opts));
  assert.equal(root.world.furniture.instances.find(i=>i.instanceId===original.instanceId).location,'storage');
  assert.equal(root.shop.credits,5000-850,'storage must pay nothing');
  assert.equal(resolveActionFurniture(root.world,'bed',original.instanceId),null);
  assert.equal(resolveActionFurniture(root.world,'bed',purchaseId).instanceId,purchaseId);
  const restoredPose=findStoredPlacement(root.world.furniture,root.shop,original.instanceId,opts);
  assert.ok(restoredPose);
  root=set(root,restoreMarketItem(root.world.furniture,root.shop,original.instanceId,restoredPose,opts));
  assert.equal(root.shop.credits,5000-850,'restore is free');
  assert.equal(resolveActionFurniture(root.world,'bed',original.instanceId).instanceId,original.instanceId);
  const sold=sellMarketItem(root.world.furniture,root.shop,original.instanceId,opts);
  assert.equal(sold.ok,true,sold.reason);
  assert.equal(sold.amount,Math.floor(850*STARTER_SELL_PERCENT/100));
  root=set(root,sold);
  assert.equal(root.shop.credits,5000-850+255);
  assert.equal(root.world.furniture.instances.some(i=>i.instanceId===original.instanceId),false);
  assert.equal(resolveActionFurniture(root.world,'bed',original.instanceId),null);
  assert.equal(sellMarketItem(root.world.furniture,root.shop,original.instanceId,opts).ok,false);
  assert.equal(storeMarketItem(root.world.furniture,root.shop,original.instanceId,opts).ok,false);
  assert.equal(resolveActionFurniture(root.world,'bed',purchaseId).instanceId,purchaseId);
});
test('Q2 sofa, television, nightstand, plant and coffee table use starter appraisal, once',()=>{
  for(const [type,price] of [['sofa',550],['tv',650],['table',250],
    ['nightstand',170],['plant',130]]){
    let root=newHousehold(),id=starter(root.world.furniture,type).instanceId;
    assert.equal(canTradeMarketInstance(starter(root.world.furniture,type)),true);
    const stored=storeMarketItem(root.world.furniture,root.shop,id,opts);
    assert.equal(stored.ok,true,type);
    root=set(root,stored);
    const sold=sellMarketItem(root.world.furniture,root.shop,id,opts);
    assert.equal(sold.ok,true,type);
    assert.equal(sold.amount,Math.floor(price*.3),type);
    root=set(root,sold);
    assert.equal(sellMarketItem(root.world.furniture,root.shop,id,opts).ok,false);
    assert.equal(root.world.furniture.instances.some(i=>i.instanceId===id),false);
  }
});
test('Q2 guard prevents deleting essential last installed item and busy/queued targets',()=>{
  const root=newHousehold(),w=root.world.furniture;
  for(const type of ['bed','toilet','shower','fridge']){
    const id=starter(w,type).instanceId;
    assert.equal(storeMarketItem(w,root.shop,id,opts).reason,'last-essential');
    assert.equal(sellMarketItem(w,root.shop,id,opts).reason,'last-essential');
  }
  assert.equal(canTradeMarketInstance(starter(w,'counter')),false);
  assert.equal(storeMarketItem(w,root.shop,'home-counter-1',opts).reason,'protected-item');
  for(const type of ['bed','sofa','tv','plant']){
    const id=starter(w,type).instanceId;
    const lock={...opts,lockedInstanceIds:[id]};
    assert.equal(storeMarketItem(w,root.shop,id,lock).reason,'reserved');
    assert.equal(sellMarketItem(w,root.shop,id,lock).reason,'reserved');
  }
  const bogus=clone(w);bogus.instances.push({...starter(w,'bed'),instanceId:'shop-bed-11',location:'storage'});
  assert.equal(storeMarketItem(bogus,root.shop,'home-bed-1',opts).reason,'last-essential');
});
test('Q2 a purchased SKU still sells at 70% of actual paid, even after reload',()=>{
  let root=newHousehold(),pose=findMarketPlacement(root.world.furniture,root.shop,'plant.amber',opts);
  assert.ok(pose);
  root=set(root,buyMarketItem(root.world.furniture,root.shop,'plant.amber',pose,opts));
  const item=root.world.furniture.instances.find(x=>x.instanceId.startsWith('shop-plant-'));
  assert.equal(item.purchasePriceCredits,130);
  const sold=sellMarketItem(root.world.furniture,root.shop,item.instanceId,opts);
  assert.equal(sold.amount,Math.floor(130*SHOP_SELL_PERCENT/100));
  root=set(root,sold);
  assert.equal(root.shop.credits,5000-130+91);
  assert.equal(sellMarketItem(root.world.furniture,root.shop,item.instanceId,opts).ok,false);
});
test('Q2 undo/redo after starter sale has no double payment; cancellation leaves state untouched',()=>{
  const root=newHousehold(),editor=createFurnitureEditor(root.world.furniture,root.shop);
  const id='home-sofa-1',start=editor.state();
  const quote=sellMarketItem(start.world,start.shop,id,opts);
  assert.equal(quote.amount,165);
  assert.equal(editor.state().shop.credits,5000,'quoting/cancellation are side-effect free');
  const sold=editor.transactMarket(quote);
  assert.equal(sold.shop.credits,5165);
  assert.equal(editor.undo().shop.credits,5000);
  assert.equal(editor.redo().shop.credits,5165);
  assert.equal(editor.undo().shop.credits,5000);
  assert.equal(editor.redo().shop.credits,5165);
  assert.equal(sellMarketItem(editor.state().world,editor.state().shop,id,opts).ok,false);
  root.world.furniture=editor.state().world;root.shop=editor.state().shop;
  const after=reloaded(root);
  assert.equal(after.shop.credits,5165);
  assert.equal(sellMarketItem(after.world.furniture,after.shop,id,opts).ok,false);
  const ledger=recordFinanceChange({shop:start.shop,financialHistory:null,minutes:0},sold.shop,
    {kind:'sale',sourceId:id,atGameMinute:0});
  assert.equal(ledger.ok,true);
  const duplicate=recordFinanceChange({shop:start.shop,financialHistory:ledger.financialHistory,minutes:0},
    sold.shop,{kind:'sale',sourceId:id,atGameMinute:0,receiptId:ledger.entry.id});
  assert.equal(duplicate.reason,'duplicate-transaction');
});
test('Q2 GUI has an instance-specific render and hit-volume guard for sold originals',async()=>{
  const {readFileSync}=await import('node:fs');
  const source=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  assert.match(source,/\.\.\.origin,location:'storage'/);
  assert.match(source,/item\.instanceId===originalId&&item\.location==='home'/);
  assert.match(source,/furnitureBounds\(game\.world,volume\.fixtureType,\s*volume\.bounds,originalId\)/);
  assert.match(source,/findOwnedPlacement\(game\.world\.furniture,game\.shop/);
  assert.match(readFileSync(new URL('../src/furniture-owned-preview.js',import.meta.url),'utf8'),/findStoredPlacement\(world,shop,id,opts\)/);
  assert.match(source,/pending\.targetInstanceId/);
});
