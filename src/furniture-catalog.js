/** F0: immutable authored furniture definitions + independent serializable instances.
 * No PlayCanvas, browser globals, money, UI, or action simulation dependency.
 * All legacy assets stay at their exact original location until the F1 editor.
 */
import {FRIDGE_LAYOUT} from './fridge-interaction.js';
import {SHOWER_LAYOUT} from './shower-interaction.js';
import {TOILET_LAYOUT} from './toilet-interaction.js';
import {TV_APPROACH} from './tv-interaction.js';
import {compatibleFurnitureProduct} from './furniture-products.js';

export const FURNITURE_SCHEMA=1;
const finite=(n)=>typeof n==='number'&&Number.isFinite(n);
export const validFurnitureInstanceId=id=>typeof id==='string'&&/^[a-z][a-z0-9-]{2,63}$/.test(id);
const limits=Object.freeze({minX:-4.8,maxX:4.8,minZ:-4.2,maxZ:4.2});
const original=[
  {prefabId:'bed',instanceId:'home-bed-1',name:'Уютная кровать',category:'Спальня',
    actionId:'bed',capabilities:['sleep'],x:-2.62,z:-1.425,rect:[-3.83,-1.41,-2.69,-.16]},
  {prefabId:'nightstand',instanceId:'home-nightstand-1',name:'Прикроватный столик',
    category:'Спальня',capabilities:['decor'],x:-4.23,z:-3.35,rect:[-4.56,-3.90,-3.69,-3.01]},
  {prefabId:'counter',instanceId:'home-counter-1',name:'Кухонная столешница',
    category:'Кухня',capabilities:['surface'],x:1.695,z:-3.315,rect:[.52,2.87,-3.84,-2.79]},
  {prefabId:'fridge',instanceId:'home-fridge-1',name:'Холодильник',category:'Кухня',
    actionId:'fridge',capabilities:['food.take'],x:3.45,z:-2.875,
    rect:[2.86,4.04,-3.49,-2.26],
    approach:[FRIDGE_LAYOUT.approach.x,FRIDGE_LAYOUT.approach.z],
    extras:[{name:'fridge-door-sweep',rect:[FRIDGE_LAYOUT.sweep.minX,FRIDGE_LAYOUT.sweep.maxX,
      FRIDGE_LAYOUT.sweep.minZ,FRIDGE_LAYOUT.sweep.maxZ]}]},
  {prefabId:'sofa',instanceId:'home-sofa-1',name:'Диван',category:'Гостиная',
    actionId:'sofa',capabilities:['relax'],x:1.355,z:1.59,
    rect:[-.07,2.78,.89,2.29],approach:[1.35,.52]},
  {prefabId:'table',instanceId:'home-table-1',name:'Журнальный столик',
    category:'Гостиная',capabilities:['surface'],x:1.34,z:-.26,rect:[.59,2.09,-.65,.13]},
  {prefabId:'tv',instanceId:'home-tv-1',name:'Телевизор',category:'Гостиная',
    actionId:'tv',capabilities:['tv.watch'],x:3.865,z:.345,rect:[3.43,4.30,-.49,1.18],
    approach:[TV_APPROACH.x,TV_APPROACH.z]},
  {prefabId:'shower',instanceId:'home-shower-1',name:'Душевая',category:'Ванная',
    actionId:'shower',capabilities:['hygiene.shower'],x:-3.695,z:2.515,
    rect:[-4.65,-2.74,1.54,3.49],
    approach:[SHOWER_LAYOUT.approach.x,SHOWER_LAYOUT.approach.z]},
  {prefabId:'toilet',instanceId:'home-toilet-1',name:'Унитаз',category:'Ванная',
    actionId:'toilet',capabilities:['bladder.toilet'],x:(TOILET_LAYOUT.bounds.minX+TOILET_LAYOUT.bounds.maxX)/2,
    z:(TOILET_LAYOUT.bounds.minZ+TOILET_LAYOUT.bounds.maxZ)/2,
    rect:[TOILET_LAYOUT.bounds.minX,TOILET_LAYOUT.bounds.maxX,TOILET_LAYOUT.bounds.minZ,TOILET_LAYOUT.bounds.maxZ],
    approach:[TOILET_LAYOUT.approach.x,TOILET_LAYOUT.approach.z]},
  {prefabId:'plant',instanceId:'home-plant-1',name:'Растение',category:'Декор',
    capabilities:['decor'],x:4.175,z:3.22,rect:[3.83,4.52,2.78,3.66]},
  // Template-only procedural 3D model: not gifted to existing saves and
  // never in initial world. Purchased copies have real individual instance IDs.
  {prefabId:'bookcase',instanceId:'template-bookcase-1',name:'Книжный шкаф',
    category:'Гостиная',actionId:'hobby',capabilities:['books.borrow'],
    templateOnly:true,x:0,z:0,rect:[-.53,.53,-.27,.27],approach:[0,.92]}
];
const frozenRect=(r,cx,cz)=>Object.freeze({
  minX:r[0]-cx,maxX:r[1]-cx,minZ:r[2]-cz,maxZ:r[3]-cz
});
export const FURNITURE_CATALOG=Object.freeze(Object.fromEntries(original.map(item=>{
  const footprint=frozenRect(item.rect,item.x,item.z);
  const extras=Object.freeze((item.extras||[]).map(e=>Object.freeze({
    name:e.name,footprint:frozenRect(e.rect,item.x,item.z)
  })));
  const approach=item.approach
    ?Object.freeze({x:item.approach[0]-item.x,z:item.approach[1]-item.z}):null;
  return [item.prefabId,Object.freeze({
    prefabId:item.prefabId,name:item.name,category:item.category,
    actionId:item.actionId||null,capabilities:Object.freeze(item.capabilities),
    footprint,extras,approach,rendererKey:item.prefabId,version:1,
    maxOccupants:item.prefabId==='bed'?2:1,
    sellable:!['shower','toilet'].includes(item.prefabId),
    price:null, // F2 will set player-facing prices before enabling transactions.
    effects:Object.freeze([]), // F3/F4 hook effects into actual action receipts.
    interactionSlots:approach?Object.freeze([{kind:'approach',position:approach}]):Object.freeze([])
  })];
})));
export const LEGACY_FURNITURE_IDS=Object.freeze(Object.fromEntries(original.map(item=>
  [item.prefabId,item.instanceId])));
export const ACTION_PREFABS=Object.freeze(Object.fromEntries(original.filter(x=>x.actionId).map(x=>
  [x.actionId,x.prefabId])));
// Authored geometry origins are different from household's initial inventory.
// A template can be cloned when purchased without gifting a free item to old saves.
export const FURNITURE_TEMPLATES=Object.freeze(original.filter(item=>item.templateOnly)
  .map(item=>Object.freeze({instanceId:item.instanceId,prefabId:item.prefabId,
    x:item.x,z:item.z,yaw:0,location:'storage'})));
export const ORIGINAL_FURNITURE=Object.freeze(original.filter(item=>!item.templateOnly).map(item=>Object.freeze({
  instanceId:item.instanceId,prefabId:item.prefabId,x:item.x,z:item.z,yaw:0,location:'home'
})));
export function newFurnitureWorld(){
  return {schema:FURNITURE_SCHEMA,revision:0,instances:ORIGINAL_FURNITURE.map(i=>({...i}))};
}
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const poseValid=v=>finite(v.x)&&finite(v.z)&&v.x>=limits.minX&&v.x<=limits.maxX&&
  v.z>=limits.minZ&&v.z<=limits.maxZ&&[0,90,180,270].includes(v.yaw);
export function restoreFurnitureWorld(raw){
  if(!record(raw)||raw.schema!==FURNITURE_SCHEMA||!Array.isArray(raw.instances)||
    raw.instances.length>128)return newFurnitureWorld();
  const seen=new Set(),instances=[];
  for(const item of raw.instances){
    if(!record(item)||!validFurnitureInstanceId(item.instanceId)||
      !Object.hasOwn(FURNITURE_CATALOG,item.prefabId)||!poseValid(item)||
      !['home','storage'].includes(item.location)||seen.has(item.instanceId))
      return newFurnitureWorld();
    seen.add(item.instanceId);
    const restored={instanceId:item.instanceId,prefabId:item.prefabId,
      x:item.x,z:item.z,yaw:item.yaw,location:item.location};
    // Additive optional v1 fields: old homes retain their exact shape. Unknown
    // variants or a mismatched prefab fall back to the existing 3D object,
    // never reset an otherwise healthy household or grant unverified refunds.
    const product=compatibleFurnitureProduct(item.prefabId,item.itemDefinitionId);
    if(product){
      restored.itemDefinitionId=product.itemId;
      if(Number.isSafeInteger(item.purchasePriceCredits)&&
        item.purchasePriceCredits>=0&&item.purchasePriceCredits<=1_000_000)
        restored.purchasePriceCredits=item.purchasePriceCredits;
    }
    instances.push(restored);
  }
  return {schema:FURNITURE_SCHEMA,
    revision:Number.isSafeInteger(raw.revision)&&raw.revision>=0&&raw.revision<=1e9
      ?raw.revision:0,instances};
}
export function rotateLocal(x,z,yaw){
  switch(yaw){
    case 90:return {x:-z,z:x};
    case 180:return {x:-x,z:-z};
    case 270:return {x:z,z:-x};
    default:return {x,z};
  }
}
export function instanceRect(item,local){
  const corners=[[local.minX,local.minZ],[local.maxX,local.minZ],
    [local.minX,local.maxZ],[local.maxX,local.maxZ]]
    .map(([x,z])=>rotateLocal(x,z,item.yaw));
  return {minX:item.x+Math.min(...corners.map(v=>v.x)),
    maxX:item.x+Math.max(...corners.map(v=>v.x)),
    minZ:item.z+Math.min(...corners.map(v=>v.z)),
    maxZ:item.z+Math.max(...corners.map(v=>v.z))};
}
export function furnitureObstacles(world){
  const data=world?.furniture?.instances?world.furniture:world;
  if(!Array.isArray(data?.instances))return [];
  const result=[];
  for(const item of data.instances){
    if(item.location!=='home')continue;
    const definition=FURNITURE_CATALOG[item.prefabId];
    if(!definition)continue;
    result.push({id:item.prefabId,instanceId:item.instanceId,
      ...instanceRect(item,definition.footprint)});
    for(const extra of definition.extras)
      result.push({id:extra.name,instanceId:item.instanceId,...instanceRect(item,extra.footprint)});
  }
  return result;
}
/** Explicit instance must match the desired capability. Never redirect a stale command. */
export function resolveActionFurniture(world,actionId,targetInstanceId=null){
  const data=world?.furniture?.instances?world.furniture:world;
  if(!Array.isArray(data?.instances))return null;
  const target=targetInstanceId===null||targetInstanceId===undefined
    ?data.instances.find(item=>item.location==='home'&&
      FURNITURE_CATALOG[item.prefabId]?.actionId===actionId)
    :data.instances.find(item=>item.instanceId===targetInstanceId&&item.location==='home'&&
      FURNITURE_CATALOG[item.prefabId]?.actionId===actionId);
  return target||null;
}
export function furnitureActionApproach(world,actionId,targetInstanceId=null){
  const instance=resolveActionFurniture(world,actionId,targetInstanceId);
  if(!instance)return null;
  const anchor=FURNITURE_CATALOG[instance.prefabId].approach;
  if(!anchor)return null; // bed still has independently reserved two physical slots
  const pt=rotateLocal(anchor.x,anchor.z,instance.yaw);
  return {x:instance.x+pt.x,z:instance.z+pt.z};
}
