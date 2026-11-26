import test from 'node:test';
import assert from 'node:assert/strict';
import {furnitureLabelTargets,furniturePoint} from '../src/furniture-transform.js';
import {newFurnitureWorld,FURNITURE_CATALOG} from '../src/furniture-catalog.js';
const meta=Object.fromEntries(Object.values(FURNITURE_CATALOG).filter(d=>d.actionId).map(d=>[d.actionId,{anchor:[0,1.4,0]}]));
meta.bed={anchor:[-2.5,1.22,-1.48]};
test('installed interaction labels retain authored legacy offset and exclude decor',()=>{
 const world=newFurnitureWorld(),labels=furnitureLabelTargets(world,meta);
 assert.equal(labels.some(l=>l.instanceId==='home-plant-1'),false);
 const bed=labels.find(l=>l.instanceId==='home-bed-1');
 assert.deepEqual([bed.x,bed.y,bed.z],[-2.5,1.22,-1.48]);
 const item=world.instances.find(i=>i.instanceId===bed.instanceId);item.x+=1;item.yaw=90;
 const moved=furnitureLabelTargets(world,meta).find(l=>l.instanceId===bed.instanceId);
 assert.deepEqual({x:moved.x,z:moved.z},furniturePoint(world,'bed',{x:-2.5,z:-1.48},bed.instanceId));
});
test('purchased action aliases and duplicates get independent exact identities; stored objects disappear',()=>{
 const world=newFurnitureWorld();
 for(const [prefabId,x] of [['easel',2],['easel',5],['chair',4],['armchair',6],['bookcase',7],['floorlamp',8],['stove',9],['diningtable',10]])
   world.instances.push({instanceId:'shop-'+prefabId+'-'+x,prefabId,x,z:2,yaw:90,location:'home'});
 let labels=furnitureLabelTargets(world,meta);
 assert.deepEqual(labels.filter(t=>t.actionId==='paint').map(t=>[t.instanceId,t.x,t.z]),[['shop-easel-2',2,2],['shop-easel-5',5,2]]);
 assert.deepEqual(labels.filter(t=>t.actionId==='seat').map(t=>t.title),['Стул','Кресло']);
 assert.ok(labels.some(t=>t.actionId==='hobby'));assert.ok(labels.some(t=>t.actionId==='lamp'));assert.ok(labels.some(t=>t.actionId==='cook'));assert.ok(labels.some(t=>t.actionId==='dining'));
 world.instances.find(i=>i.instanceId==='shop-easel-2').location='storage';
 world.instances=world.instances.filter(i=>i.instanceId!=='shop-easel-5');
 assert.equal(furnitureLabelTargets(world,meta).filter(t=>t.actionId==='paint').length,0);
});
