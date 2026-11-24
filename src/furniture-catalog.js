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
// Sanitize saved object centers across the doubled eastward room without changing v1.
// F5-D.2: the build lot is larger than the original double-width starter home.
// Keep the original coordinates unchanged, but allow purchased furniture on
// constructed room floors; placement and collision rules remain authoritative.
const limits=Object.freeze({minX:-8.99,maxX:22.99,minZ:-11.99,maxZ:11.99});
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
  // F4C: independent procedural 3D types. None spawn in old homes; every
  // instance is bought and saved with stable SKU identity.
  {prefabId:'armchair',instanceId:'template-armchair-1',name:'Кресло',
    category:'Гостиная',actionId:'seat',capabilities:['seat'],templateOnly:true,
    x:0,z:0,rect:[-.62,.62,-.65,.65],approach:[0,-1.22]},
  {prefabId:'chair',instanceId:'template-chair-1',name:'Стул',
    category:'Столовая',actionId:'seat',capabilities:['seat'],templateOnly:true,
    x:0,z:0,rect:[-.46,.46,-.48,.48],approach:[0,-1.03]},
  {prefabId:'diningtable',instanceId:'template-diningtable-1',name:'Обеденный стол',
    category:'Столовая',actionId:'dining',capabilities:['surface','food.dine'],templateOnly:true,
    x:0,z:0,rect:[-1.13,1.13,-.72,.72]},
  {prefabId:'floorlamp',instanceId:'template-floorlamp-1',name:'Торшер',
    category:'Гостиная',actionId:'lamp',capabilities:['light.switch'],templateOnly:true,
    x:0,z:0,rect:[-.36,.36,-.36,.36],approach:[0,-.90]},
  {prefabId:'walllight',instanceId:'template-walllight-1',name:'Настенный светильник',
    category:'Освещение',capabilities:['light.automatic'],templateOnly:true,walkThrough:true,
    x:0,z:0,rect:[-.20,.20,-.12,.12]},
  {prefabId:'ceilinglight',instanceId:'template-ceilinglight-1',name:'Потолочный светильник',
    category:'Освещение',capabilities:['light.automatic'],templateOnly:true,walkThrough:true,
    x:0,z:0,rect:[-.22,.22,-.22,.22]},
  {prefabId:'rug',instanceId:'template-rug-1',name:'Ковёр',
    category:'Декор',capabilities:['decor'],templateOnly:true,walkThrough:true,
    x:0,z:0,rect:[-1.22,1.22,-.90,.90]},
  {prefabId:'dresser',instanceId:'template-dresser-1',name:'Комод',
    category:'Спальня',actionId:'dresser',capabilities:['storage.inspect'],templateOnly:true,
    x:0,z:0,rect:[-.94,.94,-.43,.43],approach:[0,-1.06]},
  {prefabId:'mirror',instanceId:'template-mirror-1',name:'Зеркало',
    category:'Спальня',actionId:'mirror',capabilities:['appearance.groom'],templateOnly:true,
    x:0,z:0,rect:[-.48,.48,-.31,.31],approach:[0,-.88]},
  {prefabId:'sculpture',instanceId:'template-sculpture-1',name:'Скульптура',
    category:'Декор',capabilities:['decor'],templateOnly:true,
    x:0,z:0,rect:[-.46,.46,-.46,.46]},
  {prefabId:'wardrobe',instanceId:'template-wardrobe-1',name:'Гардероб',
    category:'Спальня',actionId:'wardrobe',capabilities:['clothing.organize'],templateOnly:true,
    x:0,z:0,rect:[-.91,.91,-.51,.51],approach:[0,-1.20]},
  // FANDOM-R2: two purchased floor props with their own original geometry.
  {prefabId:'fanflag',instanceId:'template-fanflag-1',name:'Клубный вымпел',
    category:'Декор',capabilities:['decor'],templateOnly:true,
    x:0,z:0,rect:[-.29,.29,-.29,.29]},
  {prefabId:'fanstand',instanceId:'template-fanstand-1',name:'Фанатский стенд',
    category:'Декор',capabilities:['decor'],templateOnly:true,
    x:0,z:0,rect:[-.50,.50,-.34,.34]},
  // Batch 02 inert decorations: no free instances or invented interactions.
  {prefabId:'meshsmall',instanceId:'template-meshsmall-1',name:'Мелкий декор',
    category:'Декор',capabilities:['decor'],templateOnly:true,x:0,z:0,rect:[-.30,.30,-.30,.30]},
  {prefabId:'meshmedium',instanceId:'template-meshmedium-1',name:'Декоративный предмет',
    category:'Декор',capabilities:['decor'],templateOnly:true,x:0,z:0,rect:[-.55,.55,-.48,.48]},
  {prefabId:'meshlarge',instanceId:'template-meshlarge-1',name:'Декоративный комплект',
    category:'Декор',capabilities:['decor'],templateOnly:true,x:0,z:0,rect:[-1.24,1.24,-.83,.83]},
  {prefabId:'meshtall',instanceId:'template-meshtall-1',name:'Высокий декор',
    category:'Декор',capabilities:['decor'],templateOnly:true,x:0,z:0,rect:[-.53,.53,-.51,.51]},
  {prefabId:'meshwall',instanceId:'template-meshwall-1',name:'Настенная панель',
    category:'Декор',capabilities:['decor'],templateOnly:true,walkThrough:true,
    x:0,z:0,rect:[-.74,.74,-.14,.14]},
  // Template-only procedural 3D model: not gifted to existing saves and
  // never in initial world. Purchased copies have real individual instance IDs.
  {prefabId:'bookcase',instanceId:'template-bookcase-1',name:'Книжный шкаф',
    category:'Гостиная',actionId:'hobby',capabilities:['books.borrow'],
    templateOnly:true,x:0,z:0,rect:[-.53,.53,-.27,.27],approach:[0,.92]},
  // F4G kitchen appliances are independent purchased items with real A* contact slots.
  {prefabId:'stove',instanceId:'template-stove-1',name:'Плита',
    category:'Кухня',actionId:'cook',capabilities:['food.cook'],templateOnly:true,
    x:0,z:0,rect:[-.59,.59,-.44,.44],approach:[0,-1.08]},
  {prefabId:'prep',instanceId:'template-prep-1',name:'Рабочая поверхность',
    category:'Кухня',actionId:'prep',capabilities:['food.prepare'],templateOnly:true,
    x:0,z:0,rect:[-.65,.65,-.43,.43],approach:[0,-1.04]},
  {prefabId:'sink',instanceId:'template-sink-1',name:'Кухонная мойка',
    category:'Кухня',actionId:'wash',capabilities:['food.clean'],templateOnly:true,
    x:0,z:0,rect:[-.60,.60,-.44,.44],approach:[0,-1.05]},
  {prefabId:'easel',instanceId:'template-easel-1',name:'Мольберт',
    category:'Гостиная',actionId:'paint',capabilities:['art.paint'],templateOnly:true,
    x:0,z:0,rect:[-.60,.60,-.43,.43],approach:[0,-1.00]},
  {prefabId:'music',instanceId:'template-music-1',name:'Музыкальный центр',
    category:'Гостиная',actionId:'music',capabilities:['music.playback'],
    templateOnly:true,x:0,z:0,rect:[-.46,.46,-.26,.26],approach:[0,.84]}
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
    // Physical interaction affordances are NOT shopper function facets.
    // Later chairs can opt in without exposing fabricated retail categories.
    seating:Object.freeze(['sofa','chair','armchair'].includes(item.prefabId)
      ?(item.prefabId==='sofa'?['reading','sitting']:['sitting']):[]),
    footprint,extras,approach,rendererKey:item.prefabId,version:1,
    templateOnly:item.templateOnly===true,
    walkThrough:item.walkThrough===true,
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
export const ORIGINAL_FURNITURE=Object.freeze(original.filter(item=>!item.templateOnly).map(item=>Object.freeze({
  instanceId:item.instanceId,prefabId:item.prefabId,x:item.x,z:item.z,yaw:0,location:'home'
})));
// Q2: provenance is determined from the stable authored identity. Old v1
// saves retain their byte shape; storage/sale cannot rewrite ownership.
const starterIdentities=new Map(ORIGINAL_FURNITURE.map(item=>[item.instanceId,item.prefabId]));
export function furnitureProvenance(item){
  if(!item||typeof item.instanceId!=='string')return 'unknown';
  if(starterIdentities.get(item.instanceId)===item.prefabId)return 'starter';
  return /^shop-[a-z0-9-]+-[1-9][0-9]*$/.test(item.instanceId)?'purchased':'unknown';
}
/** Renderer origin for installed authored fixtures OR a hidden, unowned prefab.
 * Template-only products are intentionally absent from saved/new worlds. */
export function furnitureRenderOrigin(prefabId){
  const installed=ORIGINAL_FURNITURE.find(item=>item.prefabId===prefabId);
  if(installed)return installed;
  if(!FURNITURE_CATALOG[prefabId]?.templateOnly)return null;
  return {instanceId:LEGACY_FURNITURE_IDS[prefabId],prefabId,
    x:0,z:0,yaw:0,location:'template'};
}
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
    // F4E: validated optional lamp state; the v1 schema stays unchanged.
    if(item.prefabId==='floorlamp'&&typeof item.lampOn==='boolean')
      restored.lampOn=item.lampOn;
    if(['walllight','ceilinglight'].includes(item.prefabId)){
      const m=item.mount;
      if(m&&typeof m==='object'&&!Array.isArray(m)){
        if(item.prefabId==='walllight'&&typeof m.edgeId==='string'&&
          /^[a-z0-9:,.-]{1,80}$/.test(m.edgeId)&&[-1,1].includes(m.side)&&
          finite(m.t)&&m.t>=.15&&m.t<=.85)
          restored.mount={edgeId:m.edgeId,side:m.side,t:m.t};
        if(item.prefabId==='ceilinglight'&&finite(m.x)&&finite(m.z))
          restored.mount={x:m.x,z:m.z};
      }
      restored.lightMode=['auto','on','off'].includes(item.lightMode)?item.lightMode:'auto';
    }
    if(item.prefabId==='meshwall'&&item.mount&&typeof item.mount.edgeId==='string'&&
      /^[a-z0-9:,.-]{1,80}$/.test(item.mount.edgeId)&&[-1,1].includes(item.mount.side)&&item.mount.t===.5)
      restored.mount={edgeId:item.mount.edgeId,side:item.mount.side,t:.5};
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
    if(definition.walkThrough)continue;
    if(!definition||definition.walkThrough)continue;
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
