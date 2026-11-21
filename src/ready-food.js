/** FOOD-R1: immutable meal purchase projection, single wallet/ledger, delayed receipt.
 * No DOM, no rendering, no second balance. Persist kitchen/shop/history atomically.
 */
import {readyMeal} from './ready-meal-catalog.js';
import {KITCHEN_SCHEMA,KITCHEN_PREPARED_LIMIT} from './kitchen.js';
import {furnitureActionApproach} from './furniture-catalog.js';
import {recordFinanceChange} from './finance-ledger.js';
import {SHOP_SCHEMA,SHOP_MAX_CREDITS} from './furniture-shop.js';

export const DELIVERY_GAME_MINUTES=18;
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const portions=k=>Array.isArray(k?.prepared)?k.prepared.reduce((n,x)=>
  n+(safe(x.portions)?x.portions:0),0):Infinity;
const pending=k=>Array.isArray(k?.deliveries)?k.deliveries.length:Infinity;
export function quoteReadyMeal(root,recipeId,channel){
  const meal=readyMeal(recipeId);
  if(!meal||!['fridge','phone'].includes(channel))
    return {ok:false,reason:'unknown-meal'};
  if(root?.kitchen?.schema!==KITCHEN_SCHEMA||
     !Array.isArray(root.kitchen.prepared)||
     !Array.isArray(root.kitchen.deliveries)||
     !root.kitchen.prepared.every(x=>safe(x.portions)&&x.portions<=KITCHEN_PREPARED_LIMIT)||
     !root.kitchen.deliveries.every(x=>readyMeal(x.recipeId)&&safe(x.dueAt)))
    return {ok:false,reason:'invalid-kitchen'};
  if(!root.world||!furnitureActionApproach(root.world,'fridge'))
    return {ok:false,reason:'missing-fridge'};
  const current=portions(root.kitchen),reserved=pending(root.kitchen);
  if(current+reserved>=KITCHEN_PREPARED_LIMIT)
    return {ok:false,reason:'storage-full',current,reserved};
  const price=channel==='fridge'?meal.fridgePrice:meal.deliveryPrice;
  if(root?.shop?.schema!==SHOP_SCHEMA||!safe(root.shop.credits)||
     root.shop.credits>SHOP_MAX_CREDITS)
    return {ok:false,reason:'invalid-wallet'};
  if(root.shop.credits<price)return {ok:false,reason:'insufficient-credits',price};
  if(!Number.isFinite(root.minutes)||root.minutes<0||
     root.minutes>2_000_000_000)
    return {ok:false,reason:'invalid-clock'};
  return {ok:true,recipeId,channel,meal,price,current,reserved,
    creditsAfter:root.shop.credits-price,
    dueAt:channel==='phone'?Math.floor(root.minutes)+DELIVERY_GAME_MINUTES:null};
}
export function proposeReadyMealPurchase(root,recipeId,channel,actorId=null){
  const quote=quoteReadyMeal(root,recipeId,channel);
  if(!quote.ok)return quote;
  const history=root.financialHistory;
  const seq=history?.nextId;
  if(!safe(seq)||seq<1)return {ok:false,reason:'invalid-finance'};
  const orderId='ready-order-'+seq;
  const shop={...root.shop,credits:quote.creditsAfter};
  const finance=recordFinanceChange(root,shop,{
    kind:'purchase',actorId,atGameMinute:Math.floor(root.minutes),
    sourceId:'ready-food.'+channel+'.'+recipeId,
    receiptId:'ready-food-purchase-'+seq
  });
  if(!finance.ok||!finance.recorded)return {ok:false,reason:finance.reason||'invalid-finance'};
  const kitchen={...root.kitchen,
    prepared:root.kitchen.prepared.map(x=>({...x})),
    deliveries:root.kitchen.deliveries.map(x=>({...x}))};
  if(channel==='fridge'){
    const entry=kitchen.prepared.find(x=>x.recipeId===recipeId);
    if(entry)entry.portions++;
    else kitchen.prepared.push({recipeId,portions:1});
  }else kitchen.deliveries.push({id:orderId,recipeId,
    orderedAt:Math.floor(root.minutes),dueAt:quote.dueAt});
  return {...quote,orderId,kitchen,shop:finance.shop,
    financialHistory:finance.financialHistory,entry:finance.entry};
}
/** Called once per actual simulation tick, after time advances. Idempotent on replay.
 * Keep pending if the fridge is temporarily unavailable; never lose paid food.
 */
export function settleReadyMealDeliveries(root){
  const kitchen=root?.kitchen;
  if(!Array.isArray(kitchen?.deliveries)||!Array.isArray(kitchen?.prepared)||
     !Number.isFinite(root?.minutes)||
     !furnitureActionApproach(root.world,'fridge'))return [];
  const delivered=[],remaining=[];
  let stored=portions(kitchen);
  for(const order of kitchen.deliveries){
    if(!readyMeal(order?.recipeId)||!safe(order.dueAt)){
      remaining.push(order);continue;
    }
    if(order.dueAt>root.minutes||stored>=KITCHEN_PREPARED_LIMIT){
      remaining.push(order);continue;
    }
    const row=kitchen.prepared.find(x=>x.recipeId===order.recipeId);
    if(row)row.portions++;
    else kitchen.prepared.push({recipeId:order.recipeId,portions:1});
    stored++;
    delivered.push(order);
  }
  if(delivered.length)kitchen.deliveries=remaining;
  return delivered;
}
