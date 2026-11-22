import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MESHY_ROOM_V3_ENTRIES} from '../src/meshy-room-v3-data.js';
import {MESHY_ROOM_V3_SKUS,meshyFurnitureSpec,meshyFurnitureFit,
  meshyFurnitureDisplaySku,meshyStarterFurnitureSku,
  meshyFurnitureUrl,meshyFurnitureThumbnailUrl} from '../src/meshy-furniture-policy.js';
import {FURNITURE_CATALOG,newFurnitureWorld,restoreFurnitureWorld} from '../src/furniture-catalog.js';
import {FURNITURE_PRODUCT_BY_ID,FURNITURE_PRODUCTS} from '../src/furniture-products.js';

const manifest=JSON.parse(readFileSync(new URL('../assets/furniture/meshy-room-v3/manifest.json',import.meta.url),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const original=newFurnitureWorld();

test('13 real V3 GLB are exact, independently-identified SKU/fixture models, no new products',()=>{
  assert.equal(MESHY_ROOM_V3_ENTRIES.length,13);
  assert.equal(MESHY_ROOM_V3_SKUS.length,13);
  assert.equal(new Set(MESHY_ROOM_V3_SKUS).size,13);
  assert.equal(FURNITURE_PRODUCTS.length,82,'existing catalog prices/stock unchanged');
  assert.equal(original.instances.length,10);
  assert.equal(manifest.records.length,13);
  const manifestIds=new Set(manifest.records.map(x=>x.sku));
  assert.deepEqual(new Set(MESHY_ROOM_V3_SKUS),manifestIds);
  for(const spec of MESHY_ROOM_V3_ENTRIES){
    assert.ok(FURNITURE_CATALOG[spec.prefabId],spec.sku+' known footprint');
    assert.equal(meshyFurnitureSpec(spec.sku)?.prefabId,spec.prefabId);
    if(spec.sku==='fixture.counter'){
      assert.equal(FURNITURE_PRODUCT_BY_ID[spec.sku],undefined);
      assert.equal(meshyStarterFurnitureSku('counter'),spec.sku);
    }else{
      assert.equal(FURNITURE_PRODUCT_BY_ID[spec.sku].prefabId,spec.prefabId);
      assert.equal(meshyFurnitureDisplaySku(spec.sku),spec.sku);
    }
    assert.equal(meshyFurnitureUrl(spec.sku),'./assets/furniture/meshy-room-v3/'+spec.sku+'.glb');
    assert.equal(meshyFurnitureThumbnailUrl(spec.sku),
      './assets/furniture/meshy-room-v3/thumbnails/'+spec.sku+'.png');
  }
  assert.equal(meshyStarterFurnitureSku('sofa'),'sofa.comfort');
  assert.equal(meshyStarterFurnitureSku('bed'),'bed.platform');
});

test('V3 GLB actual mesh POSITION bounds, optimized bytes and hashes all agree',()=>{
  for(const item of MESHY_ROOM_V3_ENTRIES){
    const record=manifest.records.find(r=>r.sku===item.sku);
    assert.ok(record);
    const raw=readFileSync(new URL('../assets/furniture/meshy-room-v3/'+item.sku+'.glb',import.meta.url));
    assert.equal(raw.toString('ascii',0,4),'glTF');
    assert.equal(raw.readUInt32LE(8),raw.length);
    assert.equal(raw.length,record.bytes);
    assert.equal(hash(raw),record.sha256);
    const length=raw.readUInt32LE(12);
    const gltf=JSON.parse(raw.toString('utf8',20,20+length));
    const mins=[Infinity,Infinity,Infinity],maxs=[-Infinity,-Infinity,-Infinity];
    for(const mesh of gltf.meshes)for(const primitive of mesh.primitives){
      const accessor=gltf.accessors[primitive.attributes.POSITION];
      assert.ok(accessor.min&&accessor.max);
      for(let i=0;i<3;i++){mins[i]=Math.min(mins[i],accessor.min[i]);maxs[i]=Math.max(maxs[i],accessor.max[i]);}
    }
    assert.deepEqual(item.bounds.min,mins,item.sku+' real min');
    assert.deepEqual(item.bounds.max,maxs,item.sku+' real max');
    assert.ok(record.triangles<=5000,item.sku+' mobile triangle budget');
    assert.ok(record.bytes<650000,item.sku+' mobile download budget');
  }
});

test('Fitted V3 visuals are finite and aligned with old gameplay footprints, without migrations',()=>{
  for(const spec of MESHY_ROOM_V3_ENTRIES){
    const fit=meshyFurnitureFit(spec.sku);
    assert.ok(fit&&fit.scale&&fit.offset);
    assert.ok([...Object.values(fit.scale),...Object.values(fit.offset)]
      .every(x=>Number.isFinite(x)));
    assert.ok(Object.values(fit.scale).every(x=>x>0));
    assert.equal(fit.prefabId,spec.prefabId);
    assert.equal(fit.mount,'floor');
    assert.ok(fit.rotationY%90===0);
    const fp=FURNITURE_CATALOG[spec.prefabId].footprint;
    assert.ok(fit.footprint.width<=fp.maxX-fp.minX+.001);
    assert.ok(fit.footprint.depth<=fp.maxZ-fp.minZ+.001);
    assert.ok(Math.abs(fit.footprint.height-spec.height)<.0001);
  }
  const old=JSON.parse(JSON.stringify(original));
  const legacyPurchased={
    instanceId:'shop-sofa-classic-1',prefabId:'sofa',x:4,z:0,yaw:0,
    location:'storage',itemDefinitionId:'sofa.classic',purchasePriceCredits:640};
  old.instances.push(legacyPurchased);
  assert.deepEqual(restoreFurnitureWorld(old),old);
  assert.deepEqual(original.instances,newFurnitureWorld().instances,'starter ids unchanged');
});

test('Store artwork is generated from identical 13 GLBs; existing scene and action rules preserved',()=>{
  for(const spec of MESHY_ROOM_V3_ENTRIES){
    const path=new URL('../assets/furniture/meshy-room-v3/thumbnails/'+spec.sku+'.png',import.meta.url);
    assert.ok(existsSync(path),'Missing GLB shop thumbnail '+spec.sku);
    const bytes=readFileSync(path);
    assert.ok(bytes.length>1500,spec.sku+' screenshot');
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16),300);
    assert.equal(bytes.readUInt32BE(20),225);
  }
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  assert.match(game,/withDecor\('counter',\(\)=>\{/);
  assert.match(game,/meshyFurniture\.attach\(node,meshyStarterFurnitureSku\(prefabId\)\)/);
  assert.match(game,/meshyFurniture\.attach\(node,meshyFurnitureDisplaySku\(item\.itemDefinitionId\)/);
  assert.match(game,/photo\.src=meshyFurnitureThumbnailUrl\(meshSku\)/);
  assert.match(game,/meshyFurniture\.useProcedural\(node,active\|\|washing\)/);
  assert.match(game,/meshyFurniture\.setBedCover\(node,slot/);
  const visual=readFileSync(new URL('../src/meshy-furniture-visual.js',import.meta.url),'utf8');
  assert.match(visual,/bed\.canopy/);
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(pages,/cp src\/meshy-room-v3-data\.js site\/src/);
  assert.match(pages,/cp assets\/furniture\/meshy-room-v3\/\*\.glb site\/assets\/furniture\/meshy-room-v3\//);
  assert.match(pages,/cp assets\/furniture\/meshy-room-v3\/thumbnails\/\*\.png site\/assets\/furniture\/meshy-room-v3\/thumbnails\//);
});
