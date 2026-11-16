/** F4b2 — canonical, UI/renderer-agnostic purchasable product data.
 * Product/SKU ID remains stable even when several products share one prefab.
 * New content lives here rather than in financial transactions or PlayCanvas.
 */
const offered=[
  {itemId:'legacy.plant',prefabId:'plant',price:130},
  {itemId:'legacy.table',prefabId:'table',price:250},
  {itemId:'legacy.nightstand',prefabId:'nightstand',price:170},
  {itemId:'legacy.tv',prefabId:'tv',price:650},
  {itemId:'legacy.sofa',prefabId:'sofa',price:550},
  {itemId:'legacy.bed',prefabId:'bed',price:850},
  // H1: first functional leisure station. Pilot price only; economy TBD.
  {itemId:'bookcase.starter',prefabId:'bookcase',price:320,
    name:'Шкаф с историями',description:'Чтение повышает досуг и литературную эрудицию'},
  // Pilot of physical appearance only. No quality/buff, price differential or XP.
  {itemId:'plant.amber',prefabId:'plant',price:130,
    name:'Растение «Янтарные листья»',appearanceId:'foliage.amber',
    description:'Янтарная листва · украшение без дополнительного бонуса'}
];
export const FURNITURE_PRODUCTS=Object.freeze(offered.map(x=>Object.freeze({...x})));
export const FURNITURE_PRODUCT_BY_ID=Object.freeze(
  Object.fromEntries(FURNITURE_PRODUCTS.map(x=>[x.itemId,x])));
if(Object.keys(FURNITURE_PRODUCT_BY_ID).length!==FURNITURE_PRODUCTS.length)
  throw new Error('Duplicate authored furniture product IDs');
export const FURNITURE_LEGACY_OFFERS=Object.freeze(FURNITURE_PRODUCTS.filter(x=>
  x.itemId==='legacy.'+x.prefabId));
/** Renderer only: optional per-part material overrides for a known appearance.
 * New colorways reference a named palette; unknown style is no-op.
 */
export const FURNITURE_APPEARANCES=Object.freeze({
  'foliage.amber':Object.freeze({
    'leaf crown':'#bd8940',
    'plant leaf':'#d6a45d'
  })
});
export function furnitureProduct(itemDefinitionId){
  return typeof itemDefinitionId==='string'&&
    Object.hasOwn(FURNITURE_PRODUCT_BY_ID,itemDefinitionId)
    ?FURNITURE_PRODUCT_BY_ID[itemDefinitionId]:null;
}
/** Missing v1 SKU resolves to a known legacy shape; mismatch never crosses
 * prefab types. Old saves omit the field and remain byte-shape compatible.
 */
export function compatibleFurnitureProduct(prefabId,itemDefinitionId){
  const product=furnitureProduct(itemDefinitionId);
  return product?.prefabId===prefabId?product:null;
}
export function legacyProductId(prefabId){return 'legacy.'+prefabId;}
