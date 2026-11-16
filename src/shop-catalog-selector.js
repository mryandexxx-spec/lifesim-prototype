/** F4b1: pure market-facing selector over item definitions.
 * No DOM, PlayCanvas or purchases. Shop transactions stay prefab-based in F4b1;
 * the selector exposes stable SKU IDs so F4b2 can migrate ownership later.
 */
import {marketListing} from './furniture-shop.js';
import {legacyObjectRegistry,legacyItemIdForPrefab} from './object-legacy-adapter.js';
import {filterObjectItems,getObjectItem} from './object-definition-registry.js';

/** Project only products offered by the existing transaction domain.
 * A registry definition is not necessarily a sellable product (e.g. fridge).
 * An unregistered/invalid SKU is excluded rather than enabled for purchase.
 */
export function selectShopCatalog({
  registry=legacyObjectRegistry(),offers=marketListing(),
  roomCategoryId=null,functionCategoryId=null,typeCategoryId=null,
  searchText=''
}={}){
  const byRoom=roomCategoryId
    ?new Set(filterObjectItems(registry,{categoryId:roomCategoryId}).map(item=>item.id))
    :null;
  const byFunction=functionCategoryId
    ?new Set(filterObjectItems(registry,{categoryId:functionCategoryId}).map(item=>item.id))
    :null;
  const byType=typeCategoryId
    ?new Set(filterObjectItems(registry,{categoryId:typeCategoryId}).map(item=>item.id))
    :null;
  const query=typeof searchText==='string'
    ?searchText.trim().slice(0,80).toLocaleLowerCase('ru'):'';
  const result=[];
  for(const offer of offers){
    const itemId=offer.itemId||legacyItemIdForPrefab(offer.prefabId);
    const definition=getObjectItem(registry,itemId);
    if(!definition||definition.prefabId!==offer.prefabId||
      !Number.isSafeInteger(definition.price)||definition.price<0||
      (byRoom&&!byRoom.has(itemId))||
      (byFunction&&!byFunction.has(itemId))||
      (byType&&!byType.has(itemId)))continue;
    const label=definition.name;
    if(query){
      const haystack=[label,offer.description,offer.effectText,
        ...definition.categoryIds.map(id=>registry.categories[id]?.label)]
        .filter(x=>typeof x==='string').join(' ').toLocaleLowerCase('ru');
      if(!haystack.includes(query))continue;
    }
    result.push({...offer,itemId,name:definition.name,price:definition.price,
      categoryIds:definition.categoryIds,capabilities:definition.capabilities});
  }
  return result;
}
/** The UI never hardcodes its room/function choices; only categories containing
 * at least one currently sold SKU are shown, including ancestor categories.
 */
export function shopCategoryOptions(facet,{registry=legacyObjectRegistry(),
  offers=marketListing()}={}){
  if(typeof facet!=='string'||!facet)return [];
  const offered=selectShopCatalog({registry,offers});
  const sold=new Set(offered.map(item=>item.itemId));
  return Object.values(registry.categories)
    .filter(category=>category.facet===facet&&
      filterObjectItems(registry,{categoryId:category.id})
        .some(item=>sold.has(item.id)))
    .map(({id,label})=>({id,label}));
}
