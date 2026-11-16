/** F4b0 — immutable, data-driven item registry (no DOM, PlayCanvas or saves).
 * Definition IDs identify PRODUCTS. prefabId identifies geometry/legacy actions.
 * The browser/game adapters consume a registry; rules never import scene code.
 */
const ID=/^[a-z][a-z0-9._-]{1,79}$/;
const isRecord=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const nonempty=(id,label)=>{if(typeof id!=='string'||!ID.test(id))throw new TypeError(label+' must be a stable dotted ID');return id;};
const fail=message=>{throw new TypeError(message);};
const uniqueArray=(xs,label,max=512)=>{
  if(!Array.isArray(xs)||xs.length>max)fail(label+' must be a bounded array');
  return xs;
};
const unique=(xs,key,label)=>{
  const out=new Map();
  for(const entry of xs){
    if(!isRecord(entry))fail(label+' entry must be an object');
    const id=nonempty(entry[key],label+' '+key);
    if(out.has(id))fail('duplicate '+label+': '+id);
    out.set(id,entry);
  }
  return out;
};
const freezeMap=map=>Object.freeze(Object.fromEntries(map));
const numeric=(n,label,min,max)=>Number.isFinite(n)&&n>=min&&n<=max?n:fail('invalid '+label);
const normalizeFacet=v=>nonempty(v,'category facet');
function freezeCategory(input){
  return Object.freeze({id:nonempty(input.id,'category id'),
    label:typeof input.label==='string'&&input.label.trim()?input.label:fail('category label'),
    facet:normalizeFacet(input.facet),
    parentId:input.parentId===undefined?null:nonempty(input.parentId,'parentId')});
}
function freezeBounds(input,label){
  if(!Number.isFinite(input.min)||!Number.isFinite(input.max)||input.min>=input.max)
    fail('invalid '+label+' bounds');
  return Object.freeze({id:nonempty(input.id,label),min:input.min,max:input.max,
    label:typeof input.label==='string'?input.label:input.id});
}
function normalizedEffect(raw,stats,triggers){
  const id=nonempty(raw.id,'effect id');
  const trigger=nonempty(raw.trigger,'effect trigger');
  const statId=nonempty(raw.statId,'effect target stat');
  if(!triggers.has(trigger))fail('unknown trigger: '+trigger);
  if(!stats.has(statId))fail('unknown stat: '+statId);
  const mode=raw.mode||'once';
  if(!['once','perMinute'].includes(mode))fail('unknown effect mode: '+mode);
  if(mode==='perMinute'&&!trigger.endsWith('.tick'))fail('rate must use tick trigger');
  const amount=numeric(raw.amount,'effect amount',-1000,1000);
  const stacking=raw.stacking||'sum';
  if(!['sum','highest','unique'].includes(stacking))fail('invalid stacking policy');
  const actionId=raw.actionId===undefined?null:nonempty(raw.actionId,'action ID');
  const group=raw.group===undefined?id:nonempty(raw.group,'stack group');
  return Object.freeze({id,trigger,statId,mode,amount,stacking,group,actionId});
}
/** Throws on bad authoring data, rather than publishing half-working furniture.
 * Category facet, stat and trigger namespaces are data, not closed enum switches.
 */
export function createObjectRegistry({categories=[],stats=[],attributes=[],triggers=[],items=[]}={}){
  const catMap=new Map([...unique(uniqueArray(categories,'categories'), 'id','category')]
    .map(([id,c])=>[id,freezeCategory(c)]));
  for(const c of catMap.values())if(c.parentId&&!catMap.has(c.parentId))
    fail('missing parent category '+c.parentId);
  for(const c of catMap.values()){
    const seen=new Set();let at=c;
    while(at?.parentId){
      if(seen.has(at.id))fail('cyclic category '+c.id);
      seen.add(at.id);at=catMap.get(at.parentId);
    }
  }
  const statMap=new Map([...unique(uniqueArray(stats,'stats'), 'id','stat')]
    .map(([id,v])=>[id,freezeBounds(v,'stat')]));
  const attrMap=new Map([...unique(uniqueArray(attributes,'attributes'),'id','attribute')]
    .map(([id,v])=>[id,freezeBounds(v,'attribute')]));
  const triggerMap=unique(uniqueArray(triggers,'triggers'),'id','trigger');
  const defs=unique(uniqueArray(items,'items',1024),'id','item');
  const itemMap=new Map();
  for(const [id,item] of defs){
    const categoryIds=uniqueArray(item.categoryIds||[],'item categories',32)
      .map(x=>nonempty(x,'category link'));
    if(new Set(categoryIds).size!==categoryIds.length)fail('duplicate category link '+id);
    for(const key of categoryIds)if(!catMap.has(key))fail('unknown category '+key);
    const capabilities=uniqueArray(item.capabilities||[],'capabilities',64)
      .map(x=>nonempty(x,'capability'));
    if(new Set(capabilities).size!==capabilities.length)fail('duplicate capability '+id);
    const rawRatings=item.ratings??{};
    if(!isRecord(rawRatings))fail('item ratings must be a map');
    const ratings=Object.create(null);
    for(const [key,value] of Object.entries(rawRatings)){
      const scale=attrMap.get(key);
      if(!scale)fail('unknown rating '+key);
      ratings[key]=numeric(value,'rating '+key,scale.min,scale.max);
    }
    const effects=uniqueArray(item.effects||[],'item effects',64);
    const uniqueEffects=unique(effects,'id','effect');
    const normalized=[...uniqueEffects.values()].map(x=>normalizedEffect(x,statMap,triggerMap));
    const rendererKey=nonempty(item.rendererKey??item.prefabId,'renderer key');
    const prefabId=nonempty(item.prefabId,'prefab id');
    const price=item.price===null||item.price===undefined?null:numeric(item.price,'item price',0,1000000);
    if(price!==null&&!Number.isSafeInteger(price))fail('price must be integer credits');
    itemMap.set(id,Object.freeze({id,prefabId,rendererKey,
      name:typeof item.name==='string'&&item.name.trim()?item.name:fail('item name'),
      categoryIds:Object.freeze(categoryIds),
      capabilities:Object.freeze(capabilities),
      ratings:Object.freeze(ratings),
      effects:Object.freeze(normalized),price}));
  }
  return Object.freeze({schema:1,categories:freezeMap(catMap),
    stats:freezeMap(statMap),attributes:freezeMap(attrMap),
    triggers:Object.freeze([...triggerMap.keys()]),
    items:freezeMap(itemMap)});
}
export function getObjectItem(registry,id){
  return registry?.schema===1&&typeof id==='string'&&
    Object.hasOwn(registry.items||{},id)?registry.items[id]:null;
}
export function filterObjectItems(registry,{categoryId=null,capability=null}={}){
  if(categoryId&&!Object.hasOwn(registry?.categories||{},categoryId))return [];
  const inside=(id)=>{
    if(!categoryId)return true;
    let category=registry.categories[id];
    while(category){
      if(category.id===categoryId)return true;
      category=category.parentId?registry.categories[category.parentId]:null;
    }
    return false;
  };
  return Object.values(registry?.items||{}).filter(item=>
    (!categoryId||item.categoryIds.some(inside))&&
    (!capability||item.capabilities.includes(capability)));
}
