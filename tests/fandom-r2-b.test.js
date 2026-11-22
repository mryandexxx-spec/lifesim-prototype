import test from 'node:test';
import assert from 'node:assert/strict';
import {SPORTS_TEAMS} from '../src/sports-catalog.js';
import {sportsCrest} from '../src/sports-identity.js';
import {FURNITURE_PRODUCTS,FURNITURE_TYPE_BY_PREFAB,PROCEDURAL_NEW_PREFABS}
  from '../src/furniture-products.js';
import {proceduralFurnitureModel} from '../src/furniture-procedural-library.js';
import {FURNITURE_CATALOG,newFurnitureWorld} from '../src/furniture-catalog.js';
import {marketListing,newFurnitureShop,buyMarketItem,findMarketPlacement,sellMarketItem,restoreMarketItem,storeMarketItem}
  from '../src/furniture-shop.js';
import {canMoveFurniture} from '../src/furniture-editor.js';
import {selectShopCatalog} from '../src/shop-catalog-selector.js';
import {newHousehold,loadHousehold} from '../src/household.js';
import {sportsPhoneView} from '../src/sports-phone-model.js';
import {selectSportsClub} from '../src/sports-fandom.js';
const people={residents:[{x:-.8,z:2.95},{x:-.25,z:.35}]};
test('R2-B two real floor-only original 3D items are offered in six independent club colorways',()=>{
  const list=selectShopCatalog({typeCategoryId:'type.decor.sports'});
  assert.equal(list.length,12);
  assert.equal(new Set(list.map(x=>x.itemId)).size,12);
  assert.equal(FURNITURE_TYPE_BY_PREFAB.fanflag,'type.decor.sports');
  assert.equal(FURNITURE_TYPE_BY_PREFAB.fanstand,'type.decor.sports');
  for(const type of ['fanflag','fanstand']){
    assert.equal(FURNITURE_CATALOG[type].templateOnly,true);
    assert.equal(FURNITURE_CATALOG[type].walkThrough,false);
    assert.ok(PROCEDURAL_NEW_PREFABS.includes(type));
    assert.equal(newFurnitureWorld().instances.some(x=>x.prefabId===type),false);
    for(const t of SPORTS_TEAMS){
      const item=list.find(x=>x.itemId===type+'.'+t.id);
      assert.equal(item.prefabId,type);
      assert.equal(item.price,type==='fanflag'?35:55);
      assert.deepEqual(item.capabilities,['decor']);
      const shape=proceduralFurnitureModel(item.modelKey);
      assert.ok(shape.parts.length>=6);
      assert.ok(shape.parts.some(p=>p.color===t.color.toLowerCase()));
      assert.equal(shape.parts.every(p=>p.color.startsWith('#')),true);
    }
  }
});
test('R2-B buying physical club decor deducts the canonical wallet and persists SKU, without unearned buffs',()=>{
  const w=newFurnitureWorld(),shop=newFurnitureShop(),id='fanflag.moon-foxes';
  const pose=findMarketPlacement(w,shop,id,people);
  assert.ok(pose);
  const paid=buyMarketItem(w,shop,id,pose,people);
  assert.equal(paid.ok,true);
  assert.equal(paid.amount,-35);
  assert.equal(paid.shop.credits,shop.credits-35);
  assert.equal(paid.world.instances.find(x=>x.instanceId===paid.instanceId).itemDefinitionId,id);
  assert.equal(canMoveFurniture(paid.world.instances.find(x=>x.instanceId===paid.instanceId)),true);
  const root=newHousehold('2026-11-22');
  root.world.furniture=paid.world;root.shop=paid.shop;
  const restored=loadHousehold(JSON.parse(JSON.stringify(root)),'2026-11-22');
  assert.equal(restored.shop.credits,paid.shop.credits);
  const item=restored.world.furniture.instances.find(x=>x.instanceId===paid.instanceId);
  assert.equal(item?.itemDefinitionId,id);
  assert.ok(marketListing().find(x=>x.itemId===id));
});
test('R2-B digital club emblems and profile avatars are read-only, personal and original',()=>{
  const root=newHousehold('2026-11-22'),old=JSON.stringify(root);
  const crests=SPORTS_TEAMS.map(t=>sportsCrest(t.id));
  assert.equal(new Set(crests.map(x=>x.symbol)).size,SPORTS_TEAMS.length);
  assert.ok(crests.every((c,i)=>c.teamId===SPORTS_TEAMS[i].id&&
    c.color===SPORTS_TEAMS[i].color&&c.symbol.length>0));
  assert.equal(sportsCrest('missing'),null);
  assert.equal(JSON.stringify(root),old);
  const club=SPORTS_TEAMS[1];
  assert.equal(selectSportsClub(root,'mira',club.id).ok,true);
  const v=sportsPhoneView(root,'mira');
  assert.equal(v.crest.teamId,club.id);
  assert.equal(sportsPhoneView(root,'alex').crest,null);
  assert.equal(sportsPhoneView(root,'mira').teamCrests.length,6);
});
