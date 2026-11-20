import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MESHY_ROOM_V2_ENTRIES,MESHY_ROOM_V2_PRODUCTS} from '../src/meshy-room-v2-data.js';
import {MESHY_ROOM_V2_SKUS,meshyFurnitureSpec,meshyFurnitureFit,
  meshyFurnitureUrl,meshyFurnitureThumbnailUrl,meshyStarterFurnitureSku,
  meshyFurnitureDisplaySku} from '../src/meshy-furniture-policy.js';
import {FURNITURE_PRODUCTS,furnitureProduct} from '../src/furniture-products.js';
import {FURNITURE_CATALOG,newFurnitureWorld,restoreFurnitureWorld} from '../src/furniture-catalog.js';
import {marketListing,newFurnitureShop,findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
const manifest=JSON.parse(readFileSync(new URL('../assets/furniture/meshy-room-v2/manifest.json',import.meta.url),'utf8'));
const hash=data=>createHash('sha256').update(data).digest('hex');
test('Batch02 35 stable visual IDs, 23 opt-in decorative shop SKUs, originals unchanged',()=>{
  assert.equal(MESHY_ROOM_V2_ENTRIES.length,35);
  assert.equal(MESHY_ROOM_V2_SKUS.length,35);
  assert.equal(MESHY_ROOM_V2_PRODUCTS.length,23);
  assert.equal(FURNITURE_PRODUCTS.length,70);
  assert.equal(marketListing().length,70);
  assert.equal(newFurnitureWorld().instances.length,10);
  for(const product of MESHY_ROOM_V2_PRODUCTS){
    assert.equal(furnitureProduct(product.itemId)?.prefabId,product.prefabId);
    assert.ok(FURNITURE_CATALOG[product.prefabId]);
    assert.equal(FURNITURE_CATALOG[product.prefabId].actionId,null,
      'do not invent action gameplay for decorative composites');
  }
  assert.equal(meshyStarterFurnitureSku('fridge'),'fixture.fridge');
  assert.equal(meshyStarterFurnitureSku('shower'),'fixture.shower');
  assert.equal(meshyStarterFurnitureSku('toilet'),'fixture.toilet');
  assert.equal(meshyStarterFurnitureSku('nightstand'),'nightstand.open');
  assert.equal(meshyStarterFurnitureSku('tv'),'legacy.tv');
  assert.equal(meshyFurnitureDisplaySku('legacy.nightstand'),'nightstand.open');
});
test('Every Meshy batch02 GLB matches original confirmed sha, size and bounds',()=>{
  assert.equal(manifest.records.length,35);
  assert.deepEqual(new Set(manifest.records.map(r=>r.slug)),
    new Set(MESHY_ROOM_V2_ENTRIES.map(r=>r.slug)));
  for(const record of manifest.records){
    const spec=MESHY_ROOM_V2_ENTRIES.find(r=>r.slug===record.slug);
    assert.ok(spec);
    assert.equal(spec.sha256,record.sha256);
    const bin=readFileSync(new URL('../'+record.file,import.meta.url));
    assert.equal(bin.length,record.bytes);
    assert.equal(hash(bin),record.sha256);
    assert.equal(bin.toString('ascii',0,4),'glTF');
    assert.equal(bin.readUInt32LE(4),2);
    assert.equal(bin.readUInt32LE(8),bin.length);
    const jsonLength=bin.readUInt32LE(12);
    const gltf=JSON.parse(bin.toString('utf8',20,20+jsonLength));
    const indices=gltf.meshes?.[0]?.primitives?.[0]?.indices;
    assert.ok(Number.isInteger(indices));
    const position=gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION];
    assert.deepEqual(position.min,record.bounds.min);
    assert.deepEqual(position.max,record.bounds.max);
    assert.ok(record.geometry_unchanged);
    assert.ok(record.triangles<=5000,record.slug+' mobile geometry');
    assert.ok(meshyFurnitureUrl(spec.sku).endsWith('/'+record.slug+'.glb'));
  }
});
test('35 actual GLB fit specs are positive and preserve the canonical prefab footprint',()=>{
  for(const item of MESHY_ROOM_V2_ENTRIES){
    const fit=meshyFurnitureFit(item.sku),def=FURNITURE_CATALOG[item.prefabId];
    assert.ok(fit&&def,item.sku);
    assert.ok([fit.scale.x,fit.scale.y,fit.scale.z,...Object.values(fit.offset)]
      .every(x=>Number.isFinite(x)),item.sku);
    assert.ok(fit.scale.x>0&&fit.scale.y>0&&fit.scale.z>0,item.sku);
    const width=def.footprint.maxX-def.footprint.minX;
    const depth=def.footprint.maxZ-def.footprint.minZ;
    assert.ok(fit.footprint.width<=width+.01&&fit.footprint.depth<=depth+.01);
    assert.ok([0,90,-90,180].includes(fit.rotationY));
    assert.equal(meshyFurnitureThumbnailUrl(item.sku),
      './assets/furniture/meshy-room-v2/thumbnails/'+item.slug+'.png');
  }
});
test('All 35 true-GLB storefront PNGs are present after ingestion',()=>{
  for(const item of MESHY_ROOM_V2_ENTRIES){
    const path=new URL('../assets/furniture/meshy-room-v2/thumbnails/'+item.slug+'.png',import.meta.url);
    assert.ok(existsSync(path),item.slug+' missing real GLB image');
    const binary=readFileSync(path);
    assert.ok(binary.length>1500);
    assert.equal(binary.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  }
});
test('Root-v1 old save is never overwritten by new template-only categories',()=>{
  const old=newFurnitureWorld(),clone=JSON.parse(JSON.stringify(old));
  assert.deepEqual(restoreFurnitureWorld(clone),old);
  assert.equal(old.instances.some(x=>x.prefabId.startsWith('mesh')),false);
  const item=MESHY_ROOM_V2_PRODUCTS.find(x=>x.prefabId==='meshsmall');
  assert.ok(item);
  const world=newFurnitureWorld(),shop=newFurnitureShop();
  const people={residents:[{x:-.8,z:2.95},{x:-.25,z:.36}]};
  const pose=findMarketPlacement(world,shop,item.itemId,people);
  assert.ok(pose,'small decor gets real shop placement');
  const tx=buyMarketItem(world,shop,item.itemId,pose,people);
  assert.equal(tx.ok,true,tx.reason);
  assert.equal(tx.world.instances.find(x=>x.instanceId===tx.instanceId).itemDefinitionId,item.itemId);
});
