/** C3b: immutable, explicit grocery purchase, one family ledger and wallet. */
import {PANTRY_START,KITCHEN_SCHEMA,KITCHEN_RECIPES,KITCHEN_PANTRY_DELIVERY_LIMIT} from './kitchen.js';
import {DELIVERY_GAME_MINUTES} from './ready-food.js';
import {furnitureActionApproach} from './furniture-catalog.js';
import {recordFinanceChange} from './finance-ledger.js';
export const KITCHEN_RESTOCK_UNITS=5;
export const KITCHEN_RESTOCK_PRICE=15;
export const KITCHEN_RESTOCK_MAX=30;
export const KITCHEN_RESTOCK_LABELS=Object.freeze({
  vegetables:'Овощи',grains:'Крупы',dairy:'Молочные продукты',
  meat:'Мясо',chicken:'Курица'
});
export const GRILL_INGREDIENT_PACKS=Object.freeze({
  meat:Object.freeze({units:3,price:36}),
  chicken:Object.freeze({units:3,price:30})
});
export const ingredientPack=id=>GRILL_INGREDIENT_PACKS[id]||
  {units:KITCHEN_RESTOCK_UNITS,price:KITCHEN_RESTOCK_PRICE};
const quantity=n=>Number.isSafeInteger(n)&&n>=0&&n<=KITCHEN_RESTOCK_MAX;
export function quoteKitchenRestock(root,ingredientId){
  if(!Object.hasOwn(KITCHEN_RESTOCK_LABELS,ingredientId))
    return {ok:false,reason:'unsupported-ingredient'};
  if(root?.kitchen?.schema!==KITCHEN_SCHEMA||!quantity(root.kitchen?.pantry?.[ingredientId]))
    return {ok:false,reason:'invalid-pantry'};
  if(!root.world||!furnitureActionApproach(root.world,'fridge'))
    return {ok:false,reason:'missing-fridge'};
  const current=root.kitchen.pantry[ingredientId];
  const pack=ingredientPack(ingredientId);
  if(current+pack.units>KITCHEN_RESTOCK_MAX)
    return {ok:false,reason:'pantry-full',current};
  if(!Number.isSafeInteger(root?.shop?.credits)||root.shop.credits<pack.price)
    return {ok:false,reason:'insufficient-credits',current};
  return {ok:true,ingredientId,label:KITCHEN_RESTOCK_LABELS[ingredientId],
    current,after:current+pack.units,units:pack.units,
    price:pack.price,creditsAfter:root.shop.credits-pack.price};
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

/** Marketplace grocery orders keep their own real game-time delivery queue,
 * reusing the exact existing pantry packs, wallet and family ledger.
 */
export function quotePantryDelivery(root,ingredientId){
  if(!Object.hasOwn(KITCHEN_RESTOCK_LABELS,ingredientId))return {ok:false,reason:'unsupported-ingredient'};
  if(root?.kitchen?.schema!==KITCHEN_SCHEMA||
     !quantity(root.kitchen.pantry?.[ingredientId])||
     !Array.isArray(root.kitchen.pantryDeliveries))
    return {ok:false,reason:'invalid-pantry'};
  if(!root.world||!furnitureActionApproach(root.world,'fridge'))
    return {ok:false,reason:'missing-fridge'};
  if(!Number.isFinite(root.minutes)||root.minutes<0||root.minutes>2_000_000_000)
    return {ok:false,reason:'invalid-clock'};
  const pending=root.kitchen.pantryDeliveries;
  if(pending.length>=KITCHEN_PANTRY_DELIVERY_LIMIT)return {ok:false,reason:'delivery-limit'};
  const pack=ingredientPack(ingredientId);
  const reserved=pending.filter(order=>order.ingredientId===ingredientId)
    .reduce((total,order)=>total+order.units,0);
  const current=root.kitchen.pantry[ingredientId];
  if(current+reserved+pack.units>KITCHEN_RESTOCK_MAX)
    return {ok:false,reason:'pantry-full',current,reserved};
  if(!Number.isSafeInteger(root?.shop?.credits)||root.shop.credits<pack.price)
    return {ok:false,reason:'insufficient-credits'};
  const seq=root.financialHistory?.nextId;
  if(!Number.isSafeInteger(seq)||seq<=0)return {ok:false,reason:'invalid-finance'};
  return {ok:true,ingredientId,label:KITCHEN_RESTOCK_LABELS[ingredientId],
    units:pack.units,price:pack.price,current,reserved,seq,
    dueAt:Math.floor(root.minutes)+DELIVERY_GAME_MINUTES};
}
export function proposePantryDelivery(root,ingredientId,actorId=null){
  const quote=quotePantryDelivery(root,ingredientId);
  if(!quote.ok)return quote;
  const proposedShop={...root.shop,credits:root.shop.credits-quote.price};
  const finance=recordFinanceChange(root,proposedShop,{
    kind:'purchase',sourceId:'pantry-delivery.'+ingredientId,
    actorId,atGameMinute:Math.floor(root.minutes),
    receiptId:'pantry-delivery-purchase-'+quote.seq
  });
  if(!finance.ok||!finance.recorded)
    return {ok:false,reason:finance.reason||'invalid-finance'};
  const order={id:'pantry-order-'+quote.seq,ingredientId,
    units:quote.units,orderedAt:Math.floor(root.minutes),dueAt:quote.dueAt};
  const kitchen={...root.kitchen,
    pantryDeliveries:[...root.kitchen.pantryDeliveries,order]};
  return {...quote,order,kitchen,shop:finance.shop,
    financialHistory:finance.financialHistory,entry:finance.entry};
}
/** Deliver only once after paid game time, in canonical kitchen stock.
 * If the fridge is removed or space is occupied, the paid order remains in
 * transit until storage is available. No second debit or reward on arrival.
 */
export function settlePantryDeliveries(root){
  const kitchen=root?.kitchen;
  if(!Array.isArray(kitchen?.pantryDeliveries)||
     !Number.isFinite(root?.minutes)||!root.world||
     !furnitureActionApproach(root.world,'fridge'))return [];
  const delivered=[],waiting=[];
  for(const order of kitchen.pantryDeliveries){
    if(!Object.hasOwn(KITCHEN_RESTOCK_LABELS,order.ingredientId)||
       !Number.isSafeInteger(order.units)||order.units<1||
       !Number.isFinite(order.dueAt)||order.dueAt>root.minutes||
       !quantity(kitchen.pantry[order.ingredientId])||
       kitchen.pantry[order.ingredientId]+order.units>KITCHEN_RESTOCK_MAX){
      waiting.push(order);continue;
    }
    kitchen.pantry[order.ingredientId]+=order.units;
    delivered.push(order);
  }
  if(delivered.length)kitchen.pantryDeliveries=waiting;
  return delivered;
}

/** Display-only equivalent cost, NEVER a second debit for cooking.
 * Staple purchases already charged 15 credits for 5 units; herbs are garden-grown.
 */
export function quoteCookingRecipe(recipeId){
  const recipe=Object.hasOwn(KITCHEN_RECIPES,recipeId)?KITCHEN_RECIPES[recipeId]:null;
  if(!recipe)return null;
  const items=Object.entries(recipe.requires).map(([id,quantity])=>({
    id,quantity,label:KITCHEN_RESTOCK_LABELS[id]||(id==='herbs'?'Садовые травы':id)
  }));
  const creditsEquivalent=items.reduce((sum,item)=>
    sum+(item.id==='herbs'?0:item.quantity*KITCHEN_RESTOCK_PRICE/KITCHEN_RESTOCK_UNITS),0);
  return {recipeId,items,creditsEquivalent,
    perServing:Math.round(creditsEquivalent/recipe.portions*100)/100};
}
