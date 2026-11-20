import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {FURNITURE_PRODUCT_BY_ID} from '../src/furniture-products.js';
import {FURNITURE_CATALOG} from '../src/furniture-catalog.js';
import {MESHY_FURNITURE_SKUS,meshyFurnitureSpec,meshyFurnitureFit,
  meshyFurnitureUrl,MESHY_FURNITURE_DISPLAY_HEIGHT} from '../src/meshy-furniture-policy.js';

const manifest=JSON.parse(readFileSync(new URL('../assets/furniture/meshy-room-v1/manifest.json',import.meta.url)));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const round=n=>Math.round(n*1000)/1000;
function parseGLB(bytes){
 const data=Buffer.from(bytes);
 assert.equal(data.toString('ascii',0,4),'glTF');
 assert.equal(data.readUInt32LE(4),2);
 assert.equal(data.readUInt32LE(8),data.length);
 const len=data.readUInt32LE(12);
 return JSON.parse(data.toString('utf8',20,20+len));
}
function coordinates(spec,fit){
 const {min,max}=spec.bounds;
 const points=[];
 for(const x of [min[0],max[0]])
  for(const y of [min[1],max[1]])
   for(const z of [min[2],max[2]]){
    const xx=x*fit.scale.x+fit.offset.x;
    const yy=fit.rotationX ? z*fit.scale.z+fit.offset.y : y*fit.scale.y+fit.offset.y;
    const zz=fit.rotationX ? -y*fit.scale.y+fit.offset.z : z*fit.scale.z+fit.offset.z;
    points.push([xx,yy,zz]);
   }
 return [0,1,2].map(axis=>[
  Math.min(...points.map(p=>p[axis])),Math.max(...points.map(p=>p[axis]))]);
}
test('all 15 owner-approved existing SKUs are bound to their actual optimized GLB',()=>{
 assert.equal(MESHY_FURNITURE_SKUS.length,15);
 assert.deepEqual(new Set(MESHY_FURNITURE_SKUS),new Set(manifest.items.map(x=>x.sku)));
 assert.equal(MESHY_FURNITURE_DISPLAY_HEIGHT,2.05,'Alex/Mira cosmetic visual height');
 assert.equal(meshyFurnitureSpec('legacy.bed'),null,'unchanged starter and unsupported SKU');
 assert.equal(meshyFurnitureUrl('legacy.bed'),null);
 for(const item of manifest.items){
  const spec=meshyFurnitureSpec(item.sku);
  assert.ok(spec,item.sku);
  assert.equal(FURNITURE_PRODUCT_BY_ID[item.sku].prefabId,spec.prefabId);
  assert.equal(meshyFurnitureUrl(item.sku),
    './assets/furniture/meshy-room-v1/'+item.sku+'.glb');
  const file=readFileSync(new URL('../'+item.file,import.meta.url));
  assert.equal(file.length,item.bytes,item.sku+' byte length');
  assert.equal(hash(file),item.sha256,item.sku+' sha256');
  const glb=parseGLB(file),mesh=glb.meshes?.[0];
  assert.ok(mesh&&mesh.primitives.length>=1);
  for(const primitive of mesh.primitives){
   const pos=glb.accessors[primitive.attributes.POSITION];
   for(let i=0;i<3;i++){
    assert.ok(Math.abs(pos.min[i]-spec.bounds.min[i])<.003,item.sku+' min '+i);
    assert.ok(Math.abs(pos.max[i]-spec.bounds.max[i])<.003,item.sku+' max '+i);
   }
  }
 }
});
test('asset fit keeps each model inside canonical collision footprint',()=>{
 for(const sku of MESHY_FURNITURE_SKUS){
  const spec=meshyFurnitureSpec(sku),fit=meshyFurnitureFit(sku);
  const bounds=coordinates(spec,fit);
  const def=FURNITURE_CATALOG[spec.prefabId];
  const fw=def.footprint.maxX-def.footprint.minX;
  const fd=def.footprint.maxZ-def.footprint.minZ;
  assert.ok(round(bounds[0][1]-bounds[0][0])<=fw+.003,sku+' width');
  assert.ok(round(bounds[2][1]-bounds[2][0])<=fd+.003,sku+' depth');
  assert.ok(round(bounds[1][1]-bounds[1][0])<=spec.height+.003,sku+' height');
  if(spec.mount==='wall')
   assert.ok(Math.abs(bounds[1][0]+bounds[1][1])<.003,sku+' wall mount center');
  else assert.ok(bounds[1][0]>=-.002,sku+' ground clearance');
  assert.ok(Number.isFinite(fit.scale.x)&&fit.scale.x>0);
  assert.ok(Number.isFinite(fit.scale.y)&&fit.scale.y>0);
  assert.ok(Number.isFinite(fit.scale.z)&&fit.scale.z>0);
  if(spec.prefabId==='rug'){
   assert.equal(fit.rotationX,-90,sku);
   assert.ok(bounds[1][1]-bounds[1][0]<=.025,'rug must be flat');
  }
  if(['sofa','armchair','bed'].includes(spec.prefabId))
   assert.ok(spec.height<MESHY_FURNITURE_DISPLAY_HEIGHT,
    'seating and bed height relative to residents');
 }
});
test('unknown, inherited and invalid values cannot accidentally overwrite v1 objects',()=>{
 for(const sku of ['',null,'sofa.classic','legacy.sofa','stove.copper','__proto__']){
  assert.equal(meshyFurnitureSpec(sku),null);
  assert.equal(meshyFurnitureFit(sku),null);
 }
});
