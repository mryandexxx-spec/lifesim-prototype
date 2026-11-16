/** F4b0 compatibility adapter. Current world / shop / actions remain authoritative.
 * This read-only projection deliberately makes no changes to saved instances.
 * Future itemId variants can share an existing prefabId and rendererKey.
 */
import {FURNITURE_CATALOG} from './furniture-catalog.js';
import {SHOP_ITEMS} from './furniture-shop.js';
import {FURNITURE_PRODUCTS} from './furniture-products.js';
import {NEEDS} from './simulation.js';
import {createObjectRegistry} from './object-definition-registry.js';

/** Historical room labels only; all NEW categories are data in registries. */
const historicalRooms=Object.freeze({
  'Спальня':'room.bedroom','Гостиная':'room.living',
  'Кухня':'room.kitchen','Ванная':'room.bathroom','Декор':'room.decor'
});
const shop=new Map(SHOP_ITEMS.map(({prefabId,price})=>[prefabId,price]));
const defs=Object.values(FURNITURE_CATALOG);
const caps=[...new Set(defs.flatMap(d=>d.capabilities))];
// Labels are presentation data, not an item-type condition in gameplay.
const capabilityLabels=Object.freeze({
  sleep:'Сон',relax:'Отдых',decor:'Украшения',surface:'Поверхности',
  'tv.watch':'Телевизоры','food.take':'Приём пищи',
  'hygiene.shower':'Гигиена','bladder.toilet':'Туалет',
  'books.borrow':'Книги и чтение'
});
const categories=[
  ...Object.entries(historicalRooms).map(([label,id])=>({id,label,facet:'room'})),
  ...caps.map(id=>({id:'function.'+id,
    label:capabilityLabels[id]||id,facet:'function'}))
];
const statLabels=Object.freeze({energy:'Энергия',fun:'Досуг',hunger:'Сытость',
  hygiene:'Гигиена',social:'Общение',bladder:'Туалет'});
const stats=[...NEEDS.map(n=>({id:'needs.'+n,min:0,max:100,label:statLabels[n]||n})),
  {id:'mood.environment',min:-5,max:5,label:'Окружение'}];
const triggers=['item.use.tick','item.use.complete','item.presence.tick',
  'item.placed','item.repaired'].map(id=>({id}));
const items=defs.map(d=>({
  id:'legacy.'+d.prefabId,prefabId:d.prefabId,rendererKey:d.rendererKey,
  name:d.name,categoryIds:[historicalRooms[d.category],...d.capabilities.map(c=>'function.'+c)],
  capabilities:[...d.capabilities],price:shop.get(d.prefabId)??null,
  ratings:{},effects:[] // Existing gameplay already owns rewards; no duplicates.
}));
// Multiple distinct SKU identities can share one authored 3D prefab and action.
// The trial colorway is display/appearance only, no invented rewards.
for(const offer of FURNITURE_PRODUCTS){
  if(offer.itemId==='legacy.'+offer.prefabId)continue;
  const prefab=FURNITURE_CATALOG[offer.prefabId];
  if(!prefab)throw new Error('Unknown prefab in furniture SKU '+offer.itemId);
  items.push({
    id:offer.itemId,prefabId:offer.prefabId,rendererKey:prefab.rendererKey,
    name:offer.name||prefab.name,
    categoryIds:[historicalRooms[prefab.category],
      ...prefab.capabilities.map(x=>'function.'+x)],
    capabilities:[...prefab.capabilities],price:offer.price,
    appearanceId:offer.appearanceId||null,ratings:{},effects:offer.effects||[]
  });
}
const registry=createObjectRegistry({categories,stats,attributes:[],triggers,items});
export function legacyObjectRegistry(){return registry;}
export function legacyItemIdForPrefab(prefabId){
  const id='legacy.'+prefabId;
  return Object.hasOwn(registry.items,id)?id:null;
}
