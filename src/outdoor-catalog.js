/** LOT-B0: original, browser-independent outdoor product definitions.
 * itemId (catalog SKU) is distinct from instanceId (owned placement).
 * No passive need, XP or finance effect is granted by owning outdoor decoration.
 */
export const OUTDOOR_FEATURE_LIMIT = 96;
const products=[
  ['tree.round','Круглое дерево','tree',220,1.1,1.1,false],
  ['tree.tall','Высокое дерево','tree',280,1.2,1.2,false],
  ['tree.broad','Раскидистое дерево','tree',340,1.5,1.5,false],
  ['shrub.small','Низкий куст','shrub',75,.65,.65,false],
  ['shrub.flowering','Цветущий куст','shrub',95,.8,.8,false],
  ['shrub.broad','Пышный куст','shrub',120,1.0,1.0,false],
  ['flower.daisy','Ромашки','flower',40,.45,.45,true],
  ['flower.tulip','Тюльпаны','flower',60,.45,.45,true],
  ['flower.lavender','Лаванда','flower',80,.45,.45,true],
  ['garden.flower.calendula','Календула · грядка','garden',120,1,1,false],
  ['garden.flower.cornflower','Василёк · грядка','garden',120,1,1,false],
  ['garden.herb.mint','Мята · грядка','garden',110,1,1,false],
  ['garden.herb.melissa','Мелисса · грядка','garden',110,1,1,false],
  ['garden.bench','Садовая скамейка','furniture',240,1.5,.65,false],
  ['garden.table','Садовый стол','furniture',220,1.1,1.1,false],
  ['garden.grill','Гриль «Уголь»','furniture',560,1.25,.85,false],
  ['light.path','Садовый фонарь','light',120,.25,.25,false],
  ['light.standing','Высокий фонарь','light',180,.35,.35,false],
  ['fence.wood','Деревянная секция','fence',55,.5,.16,false],
  ['hedge.short','Живая изгородь','fence',55,.5,.34,false]
];
export const OUTDOOR_PRODUCTS=Object.freeze(products.map(
 ([itemId,name,category,price,width,depth,walkThrough])=>Object.freeze({
   itemId,name,category,price,width,depth,walkThrough,
   light:category==='light'
 })));
export const OUTDOOR_CATALOG=Object.freeze(Object.fromEntries(
 OUTDOOR_PRODUCTS.map(item=>[item.itemId,item])));
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export const validOutdoorId=id=>typeof id==='string'&&/^out-[1-9][0-9]{0,6}$/.test(id);
export function outdoorFeatureRect(instance){
  const def=OUTDOOR_CATALOG[instance?.itemId];
  if(!def||!finite(instance?.x)||!finite(instance?.z)||
     ![0,90,180,270].includes(instance.yaw))return null;
  const rotated=instance.yaw===90||instance.yaw===270;
  const w=rotated?def.depth:def.width,d=rotated?def.width:def.depth;
  return {minX:instance.x-w/2,maxX:instance.x+w/2,
    minZ:instance.z-d/2,maxZ:instance.z+d/2};
}
export function outdoorRectsOverlap(a,b,margin=0){
  return a.minX<b.maxX+margin&&a.maxX>b.minX-margin&&
    a.minZ<b.maxZ+margin&&a.maxZ>b.minZ-margin;
}
/** Stored worlds are immutable per revision. Never cache on construction/furniture. */
const obstacleCache=new WeakMap();
export function outdoorFeatureObstacles(world){
  const outdoors=world?.outdoors||world;
  if(!outdoors||typeof outdoors!=='object')return [];
  const cached=obstacleCache.get(outdoors);
  if(cached&&cached.revision===outdoors.revision&&cached.items===outdoors.features)return cached.rects;
  const rects=[];
  for(const f of Array.isArray(outdoors.features)?outdoors.features.slice(0,OUTDOOR_FEATURE_LIMIT):[]){
    if(OUTDOOR_CATALOG[f?.itemId]?.walkThrough)continue;
    const rect=outdoorFeatureRect(f);
    if(rect)rects.push({...rect,id:f.instanceId});
  }
  obstacleCache.set(outdoors,{revision:outdoors.revision,items:outdoors.features,rects});
  return rects;
}
