/** C3b: immutable, explicit grocery purchase, one family ledger and wallet. */
import {PANTRY_START,KITCHEN_SCHEMA} from './kitchen.js';
import {furnitureActionApproach} from './furniture-catalog.js';
import {recordFinanceChange} from './finance-ledger.js';
export const KITCHEN_RESTOCK_UNITS=5;
export const KITCHEN_RESTOCK_PRICE=15;
export const KITCHEN_RESTOCK_MAX=30;
export const KITCHEN_RESTOCK_LABELS=Object.freeze({
  vegetables:'Овощи',grains:'Крупы',dairy:'Молочные продукты'
});
const quantity=n=>Number.isSafeInteger(n)&&n>=0&&n<=KITCHEN_RESTOCK_MAX;
export function quoteKitchenRestock(root,ingredientId){
  if(!Object.hasOwn(PANTRY_START,ingredientId))
    return {ok:false,reason:'unsupported-ingredient'};
  if(root?.kitchen?.schema!==KITCHEN_SCHEMA||!quantity(root.kitchen?.pantry?.[ingredientId]))
    return {ok:false,reason:'invalid-pantry'};
  if(!root.world||!furnitureActionApproach(root.world,'fridge'))
    return {ok:false,reason:'missing-fridge'};
  const current=root.kitchen.pantry[ingredientId];
  if(current+KITCHEN_RESTOCK_UNITS>KITCHEN_RESTOCK_MAX)
    return {ok:false,reason:'pantry-full',current};
  if(!Number.isSafeInteger(root?.shop?.credits)||root.shop.credits<KITCHEN_RESTOCK_PRICE)
    return {ok:false,reason:'insufficient-credits',current};
  return {ok:true,ingredientId,label:KITCHEN_RESTOCK_LABELS[ingredientId],
    current,after:current+KITCHEN_RESTOCK_UNITS,units:KITCHEN_RESTOCK_UNITS,
    price:KITCHEN_RESTOCK_PRICE,creditsAfter:root.shop.credits-KITCHEN_RESTOCK_PRICE};
}
export function proposeKitchenRestock(root,ingredientId,actorId=null){
  const quote=quoteKitchenRestock(root,ingredientId);
  if(!quote.ok)return quote;
  const kitchen={...root.kitchen,
    pantry:{...root.kitchen.pantry,[ingredientId]:quote.after}};
  const shop={...root.shop,credits:quote.creditsAfter};
  const finance=recordFinanceChange(root,shop,{
    kind:'purchase',sourceId:'kitchen.staples.'+ingredientId,
    actorId,atGameMinute:Math.floor(root.minutes)
  });
  if(!finance.ok||!finance.recorded)
    return {ok:false,reason:finance.reason||'invalid-finance'};
  return {...quote,kitchen,shop:finance.shop,
    financialHistory:finance.financialHistory,entry:finance.entry};
}
