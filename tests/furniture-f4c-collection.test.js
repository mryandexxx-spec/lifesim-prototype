import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FURNITURE_PRODUCTS,FURNITURE_LEGACY_OFFERS,
  FURNITURE_TYPE_BY_PREFAB,FURNITURE_SHOP_TYPES,PROCEDURAL_NEW_PREFABS,
  PROCEDURAL_DEFAULT_SKU} from '../src/furniture-products.js';
import {proceduralFurnitureModel,proceduralGeometrySignature,
  PROCEDURAL_FURNITURE_MODELS} from '../src/furniture-procedural-library.js';
import {FURNITURE_CATALOG,newFurnitureWorld,restoreFurnitureWorld,
  furnitureObstacles,ORIGINAL_FURNITURE} from '../src/furniture-catalog.js';
import {newFurnitureShop,marketListing,findMarketPlacement,buyMarketItem,
  storeMarketItem,restoreMarketItem,sellMarketItem,SHOP_START_CREDITS,
  SHOP_SELL_PERCENT} from '../src/furniture-shop.js';
import {canMoveFurniture} from '../src/furniture-editor.js';
import {legacyObjectRegistry} from '../src/object-legacy-adapter.js';
import {selectShopCatalog,shopCategoryOptions} from '../src/shop-catalog-selector.js';
import {newHousehold,loadHousehold} from '../src/household.js';

const R=legacyObjectRegistry(),offers=selectShopCatalog();
const text=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const people={residents:[{x:-.8,z:2.95},{x:-.25,z:.36}]};
test('F4C: original shop assortment plus the H5 functional easel',()=>{
  assert.equal(FURNITURE_PRODUCTS.length,47);
  assert.equal(offers.length,47);
  assert.equal(FURNITURE_LEGACY_OFFERS.length,6);
  assert.equal(PROCEDURAL_NEW_PREFABS.length,15);
  assert.equal(ORIGINAL_FURNITURE.length,10);
  assert.equal(marketListing().length,47);
  assert.equal(new Set(FURNITURE_PRODUCTS.map(x=>x.itemId)).size,47);
  assert.equal(SHOP_START_CREDITS,5000);
  assert.equal(SHOP_SELL_PERCENT,70);
});
test('F4C: every sellable SKU has a safe mapped prefab, room, type and immutable model identity',()=>{
  for(const item of FURNITURE_PRODUCTS){
    const def=R.items[item.itemId];
    assert.ok(def,'Missing registry SKU '+item.itemId);
    assert.equal(def.prefabId,item.prefabId);
    assert.ok(FURNITURE_CATALOG[item.prefabId]);
    assert.ok(def.categoryIds.some(id=>id.startsWith('room.')));
    assert.ok(def.categoryIds.some(id=>id.startsWith('type.')));
    assert.equal(def.price,item.price);
    assert.equal(def.rendererKey,item.modelKey||item.prefabId);
    if(item.modelKey)assert.ok(proceduralFurnitureModel(item.modelKey),
      'Missing procedural model '+item.modelKey);
  }
});
test('F4C: each new floor prefab is template-only, safely movable, not gifted into legacy homes',()=>{
  const world=newFurnitureWorld();
  assert.equal(world.instances.length,10);
  for(const prefab of PROCEDURAL_NEW_PREFABS){
    const def=FURNITURE_CATALOG[prefab];
    assert.equal(def.templateOnly,true);
    assert.ok(def.footprint.maxX>def.footprint.minX);
    assert.ok(def.footprint.maxZ>def.footprint.minZ);
    assert.equal(world.instances.some(x=>x.prefabId===prefab),false);
    assert.ok(PROCEDURAL_DEFAULT_SKU[prefab]);
    const sample={prefabId:prefab,location:'home'};
    assert.equal(canMoveFurniture(sample),true);
    assert.ok(FURNITURE_TYPE_BY_PREFAB[prefab]);
  }
  assert.deepEqual(restoreFurnitureWorld(JSON.parse(JSON.stringify(world))),world);
});
test('F4C: all 35 crafted modelKeys are visually different by actual dimensions/shape',()=>{
  const authored=FURNITURE_PRODUCTS.filter(x=>x.modelKey);
  assert.equal(authored.length,39);
  assert.equal(Object.keys(PROCEDURAL_FURNITURE_MODELS).length,39);
  assert.equal(new Set(authored.map(x=>x.modelKey)).size,39);
  const geometry=new Map();
  for(const offer of authored){
    const shape=proceduralFurnitureModel(offer.modelKey);
    assert.ok(shape.parts.length>=3);
    assert.ok(Object.isFrozen(shape));
    assert.ok(Object.isFrozen(shape.parts));
    assert.ok(shape.parts.every(x=>Object.isFrozen(x)));
    const signature=proceduralGeometrySignature(offer.modelKey);
    const past=geometry.get(offer.prefabId)||[];
    assert.ok(!past.includes(signature),'Recolored duplicate silhouette: '+offer.modelKey);
    past.push(signature);geometry.set(offer.prefabId,past);
  }
  assert.equal(proceduralFurnitureModel('__unknown__'),null);
  assert.equal(proceduralGeometrySignature('__unknown__'),null);
});
test('F4C: interiors have functional category hierarchy without inventing action capabilities',()=>{
  assert.equal(shopCategoryOptions('type').some(x=>x.id==='type.seating'),true);
  assert.ok(FURNITURE_SHOP_TYPES.some(x=>x.id==='type.storage.wardrobes'));
  assert.equal(selectShopCatalog({typeCategoryId:'type.seating'}).length,8);
  assert.equal(selectShopCatalog({typeCategoryId:'type.seating.armchairs'}).length,2);
  assert.equal(selectShopCatalog({typeCategoryId:'type.decor.rugs'}).length,2);
  assert.equal(selectShopCatalog({typeCategoryId:'type.tables.dining'}).length,2);
  assert.equal(selectShopCatalog({typeCategoryId:'type.nonexistent'}).length,0);
  for(const p of ['armchair.wing','armchair.shell','chair.loft','chair.cross']){
    assert.deepEqual(R.items[p].effects,[]);
    assert.equal(R.items[p].capabilities.includes('relax'),false,
      'Sitting does not invent a sofa-style recovery reward');
    assert.equal(R.items[p].capabilities.includes('seat'),true,
      'F4D provides real physical seat interactions');
  }
  assert.equal(R.items['sofa.comfort'].effects[0].amount,0.2);
});
test('F4C: client can combine type, room and search without showing hidden offers',()=>{
  const s=selectShopCatalog({roomCategoryId:'room.bedroom',
    typeCategoryId:'type.storage',searchText:'КОМОД «'});
  assert.equal(s.length,2);
  assert.ok(s.every(x=>x.prefabId==='dresser'));
  assert.deepEqual(selectShopCatalog({typeCategoryId:'type.seating.sofas',
    searchText:'ДИВАН'}).map(x=>x.itemId).sort(),
    ['legacy.sofa','sofa.comfort','sofa.loft','sofa.classic'].sort());
  assert.equal(selectShopCatalog({typeCategoryId:'type.lighting',searchText:'стол'}).length,0);
  assert.equal(selectShopCatalog({searchText:'  пальма  '}).length,1);
  assert.deepEqual(selectShopCatalog({roomCategoryId:'room.not-found'}),[]);
});
test('F4C: decorative carpets do not become impenetrable A* walls or collide with furniture',()=>{
  const world=newFurnitureWorld();
  const rect={schema:1,revision:1,instances:[...world.instances,
    {instanceId:'shop-rug-1',prefabId:'rug',location:'home',x:1.25,z:1.5,yaw:0,
      itemDefinitionId:'rug.geo',purchasePriceCredits:145}]};
  const restored=restoreFurnitureWorld(rect);
  assert.equal(restored.instances.length,11);
  assert.equal(furnitureObstacles(restored).some(x=>x.instanceId==='shop-rug-1'),false);
  assert.equal(FURNITURE_CATALOG.rug.walkThrough,true);
});
test('F4C: a variety of new item types can really be placed through atomic shop transactions',()=>{
  for(const id of ['rug.geo','floorlamp.arc','sculpture.balance','chair.cross',
    'armchair.wing','dresser.reed','mirror.panel','diningtable.farm','wardrobe.open']){
    const world=newFurnitureWorld(),shop=newFurnitureShop();
    const pose=findMarketPlacement(world,shop,id,people);
    assert.ok(pose,'No valid purchasable 3D pose for '+id);
    const buy=buyMarketItem(world,shop,id,pose,people);
    assert.equal(buy.ok,true,id+' '+buy.reason);
    const owned=buy.world.instances.find(x=>x.instanceId===buy.instanceId);
    assert.equal(owned.itemDefinitionId,id);
    assert.equal(owned.prefabId,FURNITURE_PRODUCTS.find(x=>x.itemId===id).prefabId);
    assert.equal(buy.shop.credits,shop.credits-FURNITURE_PRODUCTS.find(x=>x.itemId===id).price);
    assert.equal(world.instances.length,10);
    const stored=storeMarketItem(buy.world,buy.shop,buy.instanceId,people);
    assert.equal(stored.ok,true,id+' store');
    const restored=restoreMarketItem(stored.world,stored.shop,buy.instanceId,pose,people);
    assert.equal(restored.ok,true,id+' restore');
    const sold=sellMarketItem(restored.world,restored.shop,buy.instanceId,people);
    assert.equal(sold.ok,true,id+' sell');
    assert.equal(sold.world.instances.length,10);
    assert.ok(sold.shop.credits<=5000);
  }
});
test('F4C: v1 save/reload preserves SKU and actual paid-price snapshots',()=>{
  const household=newHousehold();
  const pose=findMarketPlacement(household.world.furniture,household.shop,'floorlamp.tripod',people);
  assert.ok(pose);
  const tx=buyMarketItem(household.world.furniture,household.shop,'floorlamp.tripod',pose,people);
  assert.equal(tx.ok,true);
  household.world.furniture=tx.world;household.shop=tx.shop;
  const restored=loadHousehold(JSON.parse(JSON.stringify(household)));
  const item=restored.world.furniture.instances.find(x=>x.instanceId===tx.instanceId);
  assert.equal(item.itemDefinitionId,'floorlamp.tripod');
  assert.equal(item.purchasePriceCredits,210);
  assert.equal(restored.shop.credits,5000-210);
  assert.equal(restored.version,1);
  assert.equal(restored.world.furniture.schema,1);
});
test('F4C: full catalogue is generated only from authored data; generic script renders models',()=>{
  const game=text('../src/game.js'),html=text('../index.html'),pages=text('../.github/workflows/pages.yml');
  assert.match(game,/for\(const prefabId of PROCEDURAL_NEW_PREFABS\)/);
  assert.match(game,/proceduralFurnitureModel\(product\?\.modelKey\)/);
  assert.match(game,/applySkuModel\(node,item.itemDefinitionId\|\|/);
  assert.match(game,/applySkuModel\(shopPreviewEntity,shopSelectedItemId\)/);
  assert.match(game,/shopTypeCategory/);
  assert.match(game,/shopSearchText/);
  assert.match(html,/id="furnish-type-tabs"/);
  assert.match(html,/id="furnish-search"/);
  assert.match(html,/1\.2u-h2-music-fix1-cache-f4c/);
  assert.match(pages,/node --check src\/furniture-procedural-library\.js/);
  assert.match(pages,/src\/furniture-procedural-library\.js src\/furniture-thumbnails\.js src\/seat-furniture\.js src\/dining\.js src\/furniture-interactions\.js site\/src\//);
  assert.doesNotMatch(game,/if\(item\.itemId==='armchair\.wing'\)/);
});
