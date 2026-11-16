import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createObjectRegistry,getObjectItem,filterObjectItems} from '../src/object-definition-registry.js';
import {proposeObjectEffectDeltas,calculateObjectEffectChanges} from '../src/object-effect-engine.js';
import {legacyObjectRegistry,legacyItemIdForPrefab} from '../src/object-legacy-adapter.js';
import {FURNITURE_CATALOG,newFurnitureWorld} from '../src/furniture-catalog.js';
import {SHOP_ITEMS,newFurnitureShop,marketListing} from '../src/furniture-shop.js';
import {ACTIONS,newGame} from '../src/simulation.js';
const categories=[
  {id:'room.living',facet:'room',label:'Гостиная'},
  {id:'room.living.seating',facet:'room',parentId:'room.living',label:'Мягкая мебель'},
  {id:'function.rest',facet:'function',label:'Отдых'},
  {id:'room.garden',facet:'room',label:'Сад'}
];
const stats=[
  {id:'needs.energy',label:'Энергия',min:0,max:100},
  {id:'mood.environment',label:'Уют',min:-5,max:5},
  {id:'skills.cooking',label:'Готовка',min:0,max:10}
];
const attributes=[{id:'comfort',label:'Комфорт',min:1,max:10}];
const triggers=[{id:'item.use.tick'},{id:'item.use.complete'},
  {id:'item.presence.tick'},{id:'item.crafted'}];
const sofa={
  id:'sofa.comfy.v2',prefabId:'sofa',rendererKey:'sofa',name:'Диван с подушками',
  categoryIds:['room.living.seating','function.rest'],capabilities:['relax'],
  ratings:{comfort:8},price:750,effects:[
    {id:'soft.seat',trigger:'item.use.tick',actionId:'sofa',
      statId:'needs.energy',mode:'perMinute',amount:0.3,
      stacking:'highest',group:'energy.sofa'},
    {id:'rest.finished',trigger:'item.use.complete',actionId:'sofa',
      statId:'mood.environment',mode:'once',amount:2,
      stacking:'unique',group:'completion.sofa'}
  ]
};
const garden={
  id:'plant.lavender',prefabId:'plant',rendererKey:'plant',name:'Ароматная лаванда',
  categoryIds:['room.garden'],capabilities:['decor'],ratings:{},price:190,
  effects:[{id:'scent',trigger:'item.presence.tick',statId:'mood.environment',
    mode:'perMinute',amount:0.4,stacking:'sum',group:'flowers'}]
};
const make=(more={})=>createObjectRegistry({categories,stats,attributes,triggers,
  items:[sofa,garden],...more});
test('F4b0 registers new products, room/function facets and quality without a switch',()=>{
  const r=make();
  assert.equal(r.schema,1);
  assert.ok(Object.isFrozen(r.items['sofa.comfy.v2'].effects[0]));
  assert.equal(getObjectItem(r,'sofa.comfy.v2').ratings.comfort,8);
  assert.equal(getObjectItem(r,'sofa.comfy.v2').prefabId,'sofa');
  assert.equal(getObjectItem(r,'sofa.comfy.v2').rendererKey,'sofa');
  assert.equal(filterObjectItems(r,{categoryId:'room.living'}).length,1);
  assert.equal(filterObjectItems(r,{categoryId:'function.rest'})[0].id,'sofa.comfy.v2');
  assert.equal(filterObjectItems(r,{capability:'decor'})[0].id,'plant.lavender');
  assert.deepEqual(filterObjectItems(r,{categoryId:'room.unknown'}),[]);
});
test('F4b0 safely rejects duplicate products, missing facets, unknown stats and triggers',()=>{
  assert.throws(()=>make({items:[sofa,sofa]}),/duplicate item/);
  assert.throws(()=>make({items:[{...sofa,categoryIds:['room.missing']}]}),/unknown category/);
  assert.throws(()=>make({items:[{...sofa,ratings:{speed:10}}]}),/unknown rating/);
  assert.throws(()=>make({items:[{...sofa,effects:[{...sofa.effects[0],statId:'money.free'}]}]}),/unknown stat/);
  assert.throws(()=>make({items:[{...sofa,effects:[{...sofa.effects[0],trigger:'on.magic'}]}]}),/unknown trigger/);
  assert.throws(()=>make({categories:[...categories,{id:'room.bad',label:'Bad',facet:'room',parentId:'room.missing'}]}),/missing parent/);
  assert.throws(()=>make({categories:[
    {id:'room.aaa',label:'A',facet:'room',parentId:'room.bbb'},
    {id:'room.bbb',label:'B',facet:'room',parentId:'room.aaa'}]}),/cyclic category/);
  assert.throws(()=>make({items:[{...sofa,ratings:{comfort:111}}]}),/invalid rating/);
});
test('F4b0 only proposes rate effects for real active home use, not pause/storage/wrong action',()=>{
  const r=make(),request={itemId:sofa.id,instanceId:'shop-sofa-123',
    location:'home',active:true,trigger:'item.use.tick',actionId:'sofa',minutes:10};
  const result=proposeObjectEffectDeltas(r,request);
  assert.equal(result.length,1);
  assert.equal(result[0].delta,3);
  assert.deepEqual(proposeObjectEffectDeltas(r,{...request,active:false}),[]);
  assert.deepEqual(proposeObjectEffectDeltas(r,{...request,location:'storage'}),[]);
  assert.deepEqual(proposeObjectEffectDeltas(r,{...request,actionId:'bed'}),[]);
  assert.deepEqual(proposeObjectEffectDeltas(r,{...request,minutes:0}),[]);
  assert.deepEqual(proposeObjectEffectDeltas(r,{...request,minutes:NaN}),[]);
  assert.deepEqual(proposeObjectEffectDeltas(r,{...request,itemId:'not.installed'}),[]);
});
test('F4b0 completion bonuses require explicit verified event ID; cancellation is neutral',()=>{
  const r=make(),request={itemId:sofa.id,instanceId:'shop-sofa-1',
    location:'home',active:true,trigger:'item.use.complete',actionId:'sofa'};
  assert.deepEqual(proposeObjectEffectDeltas(r,request),[]);
  assert.deepEqual(proposeObjectEffectDeltas(r,{...request,active:false,eventId:'cancelled'}),[]);
  const result=proposeObjectEffectDeltas(r,{...request,eventId:'accepted:123'});
  assert.equal(result.length,1);assert.equal(result[0].delta,2);
  assert.equal(result[0].eventId,'accepted:123');
});
test('F4b0 stacking highest/unique/sum is deterministic and clamps real stat bounds',()=>{
  const r=make(),using=(id,itemId,trigger,actionId,minutes,eventId)=>proposeObjectEffectDeltas(r,{
    itemId,instanceId:id,location:'home',active:true,trigger,actionId,minutes,eventId});
  const left=using('shop-sofa-1',sofa.id,'item.use.tick','sofa',10);
  const right=using('shop-sofa-2',sofa.id,'item.use.tick','sofa',20);
  const flowers=using('shop-plant-1',garden.id,'item.presence.tick',null,10);
  const same=using('shop-plant-2',garden.id,'item.presence.tick',null,10);
  const results=calculateObjectEffectChanges(r,[...left,...right,...flowers,...same,
    ...left],{'needs.energy':97,'mood.environment':0});
  assert.deepEqual(results.map(x=>x.statId),['mood.environment','needs.energy']);
  assert.deepEqual(results.map(x=>x.delta),[8,6]);
  assert.deepEqual(results.map(x=>x.next),[5,100]);
  const first=using('shop-sofa-1',sofa.id,'item.use.complete','sofa',1,'event-1');
  const second=using('shop-sofa-2',sofa.id,'item.use.complete','sofa',1,'event-2');
  assert.equal(calculateObjectEffectChanges(r,[...first,...second],{'mood.environment':0})[0].delta,2);
});
test('F4b0 a completely new bonus/trigger needs authoring data only',()=>{
  const upgraded=make({items:[{...sofa,effects:[{
    id:'chef.inspired',trigger:'item.crafted',statId:'skills.cooking',amount:1.5,
    mode:'once',stacking:'sum',group:'crafting'
  }]}]});
  const good=proposeObjectEffectDeltas(upgraded,{itemId:sofa.id,instanceId:'new-thing',
    location:'home',active:true,trigger:'item.crafted',eventId:'c-100'});
  assert.equal(good[0].statId,'skills.cooking');
  assert.deepEqual(calculateObjectEffectChanges(upgraded,good,{'skills.cooking':9})[0],
    {statId:'skills.cooking',delta:1.5,next:10});
});
test('F4b0 legacy bridge maps all ten original prefabs, with no newly minted gameplay buffs',()=>{
  const r=legacyObjectRegistry();
  assert.equal(Object.values(r.items).length,Object.keys(FURNITURE_CATALOG).length+29);
  for(const original of Object.values(FURNITURE_CATALOG)){
    const item=getObjectItem(r,legacyItemIdForPrefab(original.prefabId));
    assert.equal(item.prefabId,original.prefabId);
    assert.equal(item.rendererKey,original.rendererKey);
    assert.deepEqual(item.effects,[]);
  }
  assert.equal(legacyItemIdForPrefab('unknown'),null);
  const available=Object.values(r.items).filter(item=>item.price!==null);
  assert.deepEqual(available.map(i=>i.price).sort((a,b)=>a-b),
    marketListing().map(i=>i.price).sort((a,b)=>a-b));
  assert.equal(ACTIONS.tv.need,'fun');
});
test('F4b0 pure library does not change wallet/world/saves, catalog or existing gameplay',()=>{
  const world=newFurnitureWorld(),shop=newFurnitureShop(),sim=newGame();
  const before=JSON.stringify({world,shop,sim,listing:marketListing()});
  const r=legacyObjectRegistry();
  const result=proposeObjectEffectDeltas(r,{
    itemId:legacyItemIdForPrefab('tv'),instanceId:'home-tv-1',
    location:'home',active:true,trigger:'item.use.tick',minutes:20,actionId:'tv'});
  assert.deepEqual(result,[]);
  assert.equal(JSON.stringify({world,shop,sim,listing:marketListing()}),before);
  assert.deepEqual(Object.keys(world.instances[0]).sort(),
    ['instanceId','location','prefabId','x','yaw','z'].sort());
});
test('F4b0 Pages packaging checks future modules; no new runtime on scene import',()=>{
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(pages,/node --check src\/object-definition-registry\.js/);
  assert.match(pages,/node --check src\/object-effect-engine\.js/);
  assert.match(pages,/cp src\/object-definition-registry\.js src\/object-effect-engine\.js src\/object-legacy-adapter\.js src\/shop-catalog-selector\.js site\/src\//);
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/src\/game\.js\?v=1\.2t/);
});
