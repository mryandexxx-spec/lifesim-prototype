import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {FURNITURE_PRODUCTS,FURNITURE_LEGACY_OFFERS,FURNITURE_APPEARANCES,
  furnitureProduct,compatibleFurnitureProduct} from '../src/furniture-products.js';
import {FURNITURE_CATALOG,newFurnitureWorld,restoreFurnitureWorld} from '../src/furniture-catalog.js';
import {MARKET_OFFERS,SHOP_ITEMS,marketListing,newFurnitureShop,findMarketPlacement,
  buyMarketItem,storeMarketItem,restoreMarketItem,sellMarketItem} from '../src/furniture-shop.js';
import {legacyObjectRegistry} from '../src/object-legacy-adapter.js';
import {selectShopCatalog,shopCategoryOptions} from '../src/shop-catalog-selector.js';
import {createFurnitureEditor} from '../src/furniture-editor.js';
import {loadHousehold,newHousehold} from '../src/household.js';
const copy=value=>JSON.parse(JSON.stringify(value));
const src=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const people={residents:[{x:-.8,z:2.95},{x:-.25,z:.35}]};
test('F4b2 canonical products preserve six old SKU prices plus a same-price plant colorway',()=>{
  assert.equal(FURNITURE_PRODUCTS.length,8);
  assert.deepEqual(FURNITURE_LEGACY_OFFERS.map(x=>x.prefabId),
    ['plant','table','nightstand','tv','sofa','bed']);
  assert.deepEqual(SHOP_ITEMS.map(x=>x.price),[130,250,170,650,550,850]);
  assert.equal(MARKET_OFFERS.length,8);
  const amber=furnitureProduct('plant.amber');
  assert.equal(amber.prefabId,'plant');
  assert.equal(amber.price,130);
  assert.equal(amber.appearanceId,'foliage.amber');
  assert.ok(FURNITURE_APPEARANCES['foliage.amber']['leaf crown']);
  assert.equal(compatibleFurnitureProduct('sofa','plant.amber'),null);
  assert.equal(compatibleFurnitureProduct('plant','plant.amber'),amber);
  assert.equal(furnitureProduct('<script>'),null);
});
test('F4b2 registry and UI expose two distinct plant SKU with shared renderer/need effects',()=>{
  const r=legacyObjectRegistry();
  const base=r.items['legacy.plant'],amber=r.items['plant.amber'];
  assert.equal(amber.prefabId,base.prefabId);
  assert.equal(amber.rendererKey,base.rendererKey);
  assert.deepEqual(amber.capabilities,base.capabilities);
  assert.deepEqual(amber.categoryIds,base.categoryIds);
  assert.deepEqual(amber.effects,[]);
  assert.equal(amber.appearanceId,'foliage.amber');
  const offers=selectShopCatalog();
  assert.equal(offers.length,8);
  assert.equal(offers.filter(x=>x.prefabId==='plant').length,2);
  assert.deepEqual(offers.filter(x=>x.prefabId==='plant').map(x=>x.itemId),
    ['legacy.plant','plant.amber']);
  assert.equal(offers.at(-1).effectText.includes('дополнительного бонуса'),true);
  assert.equal(offers.find(x=>x.itemId==='bookcase.starter').prefabId,'bookcase');
  assert.deepEqual(selectShopCatalog({roomCategoryId:'room.decor'}).map(x=>x.itemId),
    ['legacy.plant','plant.amber']);
  assert.equal(shopCategoryOptions('room').filter(x=>x.id==='room.decor').length,1);
  assert.deepEqual(marketListing().map(x=>x.price),[130,250,170,650,550,850,320,130]);
});
test('F4b2 two plant SKUs both buy via one prefab without clone ID conflicts or hidden charge',()=>{
  const w=newFurnitureWorld(),shop=newFurnitureShop();
  const firstPose=findMarketPlacement(w,shop,'legacy.plant',people);
  assert.ok(firstPose);
  const first=buyMarketItem(w,shop,'legacy.plant',firstPose,people);
  assert.equal(first.ok,true);
  assert.equal(first.shop.credits,4870);
  const nextPose=findMarketPlacement(first.world,first.shop,'plant.amber',people);
  assert.ok(nextPose,'second plant must have accessible placement');
  const second=buyMarketItem(first.world,first.shop,'plant.amber',nextPose,people);
  assert.equal(second.ok,true);
  assert.equal(second.shop.credits,4740);
  assert.notEqual(first.instanceId,second.instanceId);
  const green=second.world.instances.find(x=>x.instanceId===first.instanceId);
  const amber=second.world.instances.find(x=>x.instanceId===second.instanceId);
  assert.equal(green.prefabId,amber.prefabId);
  assert.equal(green.itemDefinitionId,'legacy.plant');
  assert.equal(amber.itemDefinitionId,'plant.amber');
  assert.equal(green.purchasePriceCredits,130);
  assert.equal(amber.purchasePriceCredits,130);
  assert.equal(w.instances.length,10,'original world stays immutable until commit');
  const denied=buyMarketItem(w,shop,'plant.not-registered',nextPose,people);
  assert.equal(denied.ok,false);
  assert.equal(denied.reason,'not-in-shop');
  assert.equal(shop.credits,5000);
});
test('F4b2 v1 saved world roundtrip keeps optional SKU and price for new items only',()=>{
  const old=newFurnitureWorld(),raw=copy(old);
  assert.deepEqual(restoreFurnitureWorld(raw),raw,'old world does not receive forced fields');
  const pose=findMarketPlacement(old,newFurnitureShop(),'plant.amber',people);
  const purchased=buyMarketItem(old,newFurnitureShop(),'plant.amber',pose,people);
  assert.equal(purchased.ok,true);
  const saved=copy(purchased.world),reloaded=restoreFurnitureWorld(saved);
  assert.deepEqual(reloaded,saved);
  assert.equal(reloaded.schema,1);
  assert.equal(reloaded.instances[0].itemDefinitionId,undefined);
  assert.equal(reloaded.instances.at(-1).itemDefinitionId,'plant.amber');
  assert.equal(reloaded.instances.at(-1).purchasePriceCredits,130);
});
test('F4b2 unknown/mismatched/unsafe SKU is stripped without destroying the old home',()=>{
  const old=newFurnitureWorld();
  for(const bad of [
    {itemDefinitionId:'unknown.removed',purchasePriceCredits:999999},
    {itemDefinitionId:'plant.amber',purchasePriceCredits:130,changePrefab:'sofa'},
    {itemDefinitionId:'plant.amber',purchasePriceCredits:-1},
    {itemDefinitionId:'plant.amber',purchasePriceCredits:1_000_001},
    {itemDefinitionId:'plant.amber',purchasePriceCredits:1.25}
  ]){
    const w=copy(old);
    const target=w.instances.find(x=>x.prefabId===(bad.changePrefab||'plant'));
    Object.assign(target,bad);delete target.changePrefab;
    const restored=restoreFurnitureWorld(w);
    assert.equal(restored.instances.length,old.instances.length);
    assert.equal(restored.instances[0].instanceId,old.instances[0].instanceId);
    if(bad.changePrefab||bad.itemDefinitionId==='unknown.removed')
      assert.equal(restored.instances.find(x=>x.instanceId===target.instanceId).itemDefinitionId,undefined);
    else {
      const instance=restored.instances.find(x=>x.instanceId===target.instanceId);
      assert.equal(instance.itemDefinitionId,'plant.amber');
      assert.equal(instance.purchasePriceCredits,undefined);
    }
  }
});
test('F4b2 warehouse, return, undo/redo and full household load retain the variant ID',()=>{
  const root=newHousehold(),session=createFurnitureEditor(root.world.furniture,root.shop);
  const pose=findMarketPlacement(session.state().world,session.state().shop,'plant.amber',people);
  const purchase=buyMarketItem(session.state().world,session.state().shop,'plant.amber',pose,people);
  assert.equal(purchase.ok,true);
  const bought=session.transactMarket(purchase);
  assert.equal(bought.ok,true);
  const id=bought.instanceId;
  assert.equal(session.undo().world.instances.find(x=>x.instanceId===id),undefined);
  const redo=session.redo();
  assert.equal(redo.world.instances.find(x=>x.instanceId===id).itemDefinitionId,'plant.amber');
  const store=storeMarketItem(redo.world,redo.shop,id);
  assert.equal(store.ok,true);
  const stored=session.transactMarket(store);
  assert.equal(stored.world.instances.find(x=>x.instanceId===id).location,'storage');
  assert.equal(stored.world.instances.find(x=>x.instanceId===id).itemDefinitionId,'plant.amber');
  const restore=restoreMarketItem(stored.world,stored.shop,id,pose,people);
  assert.equal(restore.ok,true);
  const back=session.transactMarket(restore);
  assert.equal(back.world.instances.find(x=>x.instanceId===id).itemDefinitionId,'plant.amber');
  root.world.furniture=back.world;root.shop=back.shop;
  const loaded=loadHousehold(copy(root));
  assert.equal(loaded.version,1);
  assert.equal(loaded.world.furniture.instances.find(x=>x.instanceId===id).itemDefinitionId,'plant.amber');
  assert.equal(loaded.shop.credits,4870);
});
test('F4b2 sale uses saved paid price (70%) rather than current catalog price',()=>{
  const w=newFurnitureWorld(),wallet=newFurnitureShop();
  const pose=findMarketPlacement(w,wallet,'plant.amber',people);
  const bought=buyMarketItem(w,wallet,'plant.amber',pose,people);
  const item=bought.world.instances.find(x=>x.instanceId===bought.instanceId);
  const stored=storeMarketItem(bought.world,bought.shop,item.instanceId);
  const changed=copy(stored.world);
  const saved=changed.instances.find(x=>x.instanceId===item.instanceId);
  saved.purchasePriceCredits=200; // test future price rebalancing snapshot
  const result=sellMarketItem(changed,stored.shop,item.instanceId);
  assert.equal(result.ok,true);
  assert.equal(result.amount,140);
  assert.equal(result.shop.credits,4870+140);
  assert.equal(result.world.instances.some(x=>x.instanceId===item.instanceId),false);
  assert.equal(sellMarketItem(result.world,result.shop,item.instanceId).ok,false);
  const oldPlant=w.instances.find(x=>x.prefabId==='plant');
  assert.equal(sellMarketItem(w,wallet,oldPlant.instanceId).amount,91);
  assert.equal(FURNITURE_CATALOG.plant.price,null);
});
test('F4b2 nonmatching old save metadata cannot mint a larger refund',()=>{
  const w=newFurnitureWorld(),wallet=newFurnitureShop();
  const old=w.instances.find(x=>x.prefabId==='plant');
  const changed=copy(w);
  const changedItem=changed.instances.find(x=>x.instanceId===old.instanceId);
  changedItem.itemDefinitionId='unavailable.variant';
  changedItem.purchasePriceCredits=999999;
  const restored=restoreFurnitureWorld(changed);
  assert.equal(restored.instances.find(x=>x.instanceId===old.instanceId).itemDefinitionId,undefined);
  assert.equal(restored.instances.find(x=>x.instanceId===old.instanceId).purchasePriceCredits,undefined);
  assert.equal(sellMarketItem(restored,wallet,old.instanceId).amount,91);
});
test('F4b2 product appearance is applied only on the bought clone, not every plant',()=>{
  const game=src('../src/game.js');
  assert.match(game,/const applyItemAppearance=\(node,itemDefinitionId\)=>/);
  assert.match(game,/if\(item.itemDefinitionId\)applyItemAppearance\(node,item.itemDefinitionId\)/);
  assert.match(game,/if\(shopSelectedItemId\)applyItemAppearance\(shopPreviewEntity,shopSelectedItemId\)/);
  const start=game.indexOf('  const updateDecorNodes=(previewId=null,previewPose=null)=>{');
  const end=game.indexOf('  const primitive =',start);
  assert.ok(start>0&&end>start);
  const originalId='home-plant-1',variantId='shop-plant-12';
  let clones=0,style=[];
  const node=()=>({enabled:true,setPosition(){},setEulerAngles(){},destroy(){}});
  const nodes=new Map([[originalId,node()]]);
  const ctx={game:{world:{furniture:{instances:[
    {instanceId:originalId,prefabId:'plant',location:'home',x:4.175,z:3.22,yaw:0},
    {instanceId:variantId,prefabId:'plant',itemDefinitionId:'plant.amber',
      location:'home',x:0,z:0,yaw:0}]}}},
    decorNodes:nodes,decorTemplates:new Map([['plant',{clone(){clones++;return node();}}]]),
    MARKET_OFFERS:[{prefabId:'plant'}],app:{root:{addChild(){}}},
    applyItemAppearance:(node,id)=>style.push(id),refreshSofaSeat(){}};
  runInNewContext('(()=>{'+game.slice(start,end)+'\nupdateDecorNodes();})()',ctx,{timeout:1200});
  assert.equal(clones,1);
  assert.deepEqual(style,['plant.amber']);
});
test('F4b2 iPhone UI retains two independent SKU selections even with same prefab',()=>{
  const game=src('../src/game.js');
  assert.match(game,/const active=button\.dataset\.itemId===shopSelectedItemId/);
  assert.match(game,/button\.addEventListener\('click',\(\)=>chooseShopProduct\(item\.itemId\)\)/);
  assert.match(game,/const offer=shopListings\.find\(x=>x\.itemId===itemId\)/);
  assert.match(game,/const listing=shopListings\.find\(i=>i\.itemId===shopSelectedItemId\)/);
  assert.match(game,/buyMarketItem\(game\.world\.furniture,game\.shop,shopSelectedItemId/);
  assert.match(game,/shopPose=findMarketPlacement\(game\.world\.furniture,game\.shop,shopSelectedItemId/);
  assert.match(src('../src/furniture-shop.js'),/purchasePriceCredits/);
});
test('F4b2 Pages packages product source; visible bundle/lock bump without schema change',()=>{
  const pages=src('../.github/workflows/pages.yml');
  const html=src('../index.html');
  const pkg=JSON.parse(src('../package.json'));
  const lock=JSON.parse(src('../package-lock.json'));
  assert.match(pages,/node --check src\/furniture-products\.js/);
  assert.match(pages,/cp src\/furniture-products\.js site\/src\//);
  assert.match(html,/src\/game\.js\?v=1\.2m/);
  assert.match(html,/styles\.css\?v=1\.2m/);
  assert.equal(pkg.version,'1.0.0-alpha.66');
  assert.equal(lock.version,pkg.version);
  assert.deepEqual(newFurnitureShop(),{schema:1,credits:5000,nextId:1});
});
