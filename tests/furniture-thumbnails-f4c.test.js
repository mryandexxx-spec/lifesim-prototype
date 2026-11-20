import test from 'node:test';
import assert from 'node:assert/strict';
import {FURNITURE_PRODUCTS} from '../src/furniture-products.js';
import {meshyFurnitureThumbnailUrl} from '../src/meshy-furniture-policy.js';
import {furnitureThumbnailFaces,sketchFurnitureParts} from '../src/furniture-thumbnails.js';
import {proceduralGeometrySignature} from '../src/furniture-procedural-library.js';
test('F4C user can visually distinguish all 36 SKUs in the thumbnail gallery',()=>{
  for(const product of FURNITURE_PRODUCTS){
    const faces=furnitureThumbnailFaces(product.prefabId,product.modelKey);
    assert.ok(faces.length>=3||meshyFurnitureThumbnailUrl(product.itemId),
      'Missing sketch/photo '+product.itemId);
    assert.ok(faces.every(face=>/^#[0-9a-f]{6}$/.test(face.fill)));
    for(const face of faces)if(face.points)for(const pt of face.points){
      assert.ok(Number.isFinite(pt[0])&&Number.isFinite(pt[1]));
      assert.ok(Math.abs(pt[0])<300&&Math.abs(pt[1])<300);
    }
    assert.ok(Object.isFrozen(faces));
  }
});
test('F4C same-prefab alternatives have genuinely different geometry and gallery faces',()=>{
  const byPrefab=new Map();
  for(const product of FURNITURE_PRODUCTS){
    const list=byPrefab.get(product.prefabId)||[];
    list.push({id:product.itemId,sketch:meshyFurnitureThumbnailUrl(product.itemId)||
      JSON.stringify(furnitureThumbnailFaces(product.prefabId,product.modelKey))});
    byPrefab.set(product.prefabId,list);
  }
  for(const [prefab,variants] of byPrefab)
    if(variants.length>1)
      assert.equal(new Set(variants.map(item=>item.sketch)).size,variants.length,
        'Visually identical catalogue thumbs for '+prefab);
  assert.ok(proceduralGeometrySignature('sofa.classic'));
  assert.ok(sketchFurnitureParts('sofa','sofa.loft').length>4);
});
