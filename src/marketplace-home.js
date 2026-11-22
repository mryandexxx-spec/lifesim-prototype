/** STAVKA-R2: canonical furniture marketplace; paid orders reach the existing
 * furniture warehouse, NEVER spawn in-room. Independent of PlayCanvas and DOM.
 * Root-v1 optional field; wallet/shop/furniture state stay in their old schemas.
 */
import {marketListing,SHOP_SCHEMA,SHOP_MAX_CREDITS} from './furniture-shop.js';
import {validFurnitureInstanceId} from './furniture-catalog.js';
import {recordFinanceChange} from './finance-ledger.js';
import {DELIVERY_GAME_MINUTES} from './ready-food.js';

export const HOME_MARKET_SCHEMA=1;
export const HOME_MARKET_ORDER_LIMIT=24;
export const homeMarketListing=()=>marketListing();
export const newHomeMarket=()=>({schema:HOME_MARKET_SCHEMA,orders:[]});
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const listing=id=>typeof id==='string'?homeMarketListing().find(x=>x.itemId===id):null;
export function restoreHomeMarket(raw){
  const restored=newHomeMarket();
  if(raw?.schema!==HOME_MARKET_SCHEMA||!Array.isArray(raw.orders)||
     raw.orders.length>HOME_MARKET_ORDER_LIMIT)return restored;
  const seen=new Set(),instanceIds=new Set();
  for(const row of raw.orders){
    const offer=listing(row?.itemId);
    if(!offer||typeof row.id!=='string'||!/^home-order-[1-9][0-9]*$/.test(row.id)||
       !validFurnitureInstanceId(row.instanceId)||
       !row.instanceId.startsWith('shop-'+offer.prefabId+'-')||
       seen.has(row.id)||instanceIds.has(row.instanceId)||
       !integer(row.price)||row.price>1_000_000||
       !integer(row.orderedAt)||!integer(row.dueAt)||
       row.dueAt<row.orderedAt||row.dueAt>2_000_000_000)continue;
    seen.add(row.id);instanceIds.add(row.instanceId);
    restored.orders.push({id:row.id,itemId:row.itemId,
      instanceId:row.instanceId,price:row.price,
      orderedAt:row.orderedAt,dueAt:row.dueAt});
  }
  return restored;
}
export function quoteHomeDelivery(root,itemId){
  const offer=listing(itemId);
  if(!offer)return {ok:false,reason:'unknown-item'};
  const shop=root?.shop,world=root?.world?.furniture,market=root?.homeMarket;
  if(shop?.schema!==SHOP_SCHEMA||!integer(shop.credits)||
     shop.credits>SHOP_MAX_CREDITS||!integer(shop.nextId)||
     shop.nextId<1||shop.nextId>=10_000_000)
    return {ok:false,reason:'invalid-wallet'};
  if(!world||!Array.isArray(world.instances)||world.instances.length>128||
     !market||market.schema!==HOME_MARKET_SCHEMA||!Array.isArray(market.orders))
    return {ok:false,reason:'invalid-market'};
  if(!Number.isFinite(root.minutes)||root.minutes<0||root.minutes>2_000_000_000)
    return {ok:false,reason:'invalid-clock'};
  if(!integer(offer.price)||offer.price>1_000_000)
    return {ok:false,reason:'invalid-price'};
  if(market.orders.length>=HOME_MARKET_ORDER_LIMIT||
     world.instances.length+market.orders.length>=128)
    return {ok:false,reason:'storage-full'};
  if(shop.credits<offer.price)
    return {ok:false,reason:'insufficient-credits'};
  const seq=root.financialHistory?.nextId;
  if(!integer(seq)||seq<1)return {ok:false,reason:'invalid-finance'};
  const instanceId='shop-'+offer.prefabId+'-'+shop.nextId;
  if(!validFurnitureInstanceId(instanceId)||
     world.instances.some(x=>x.instanceId===instanceId)||
     market.orders.some(x=>x.instanceId===instanceId))
    return {ok:false,reason:'duplicate-instance'};
  return {ok:true,itemId,offer,price:offer.price,instanceId,
    seq,dueAt:Math.floor(root.minutes)+DELIVERY_GAME_MINUTES};
}
export function proposeHomeDelivery(root,itemId,actorId=null){
  const quote=quoteHomeDelivery(root,itemId);
  if(!quote.ok)return quote;
  const shop={...root.shop,credits:root.shop.credits-quote.price,
    nextId:root.shop.nextId+1};
  const finance=recordFinanceChange(root,shop,{
    kind:'purchase',sourceId:'home-delivery.'+itemId,
    actorId,atGameMinute:Math.floor(root.minutes),
    receiptId:'home-delivery-purchase-'+quote.seq
  });
  if(!finance.ok||!finance.recorded)
    return {ok:false,reason:finance.reason||'invalid-finance'};
  const order={id:'home-order-'+quote.seq,itemId,instanceId:quote.instanceId,
    price:quote.price,orderedAt:Math.floor(root.minutes),dueAt:quote.dueAt};
  return {...quote,order,shop:finance.shop,
    financialHistory:finance.financialHistory,
    homeMarket:{...root.homeMarket,orders:[...root.homeMarket.orders,order]},
    entry:finance.entry};
}
/** Arrival only creates existing canonical warehouse inventory after paid time.
 * Storage shortages defer paid orders; one-way dequeuing makes retries safe.
 */
export function settleHomeDeliveries(root){
  const market=root?.homeMarket,world=root?.world?.furniture;
  if(!Array.isArray(market?.orders)||!Array.isArray(world?.instances)||
     !Number.isFinite(root?.minutes))return [];
  const ready=[],waiting=[],instances=[...world.instances];
  for(const order of market.orders){
    const offer=listing(order.itemId);
    if(!offer||!integer(order.dueAt)||order.dueAt>root.minutes||
       instances.length>=128||
       instances.some(x=>x.instanceId===order.instanceId)){
      waiting.push(order);continue;
    }
    instances.push({instanceId:order.instanceId,prefabId:offer.prefabId,
      itemDefinitionId:offer.itemId,purchasePriceCredits:order.price,
      x:0,z:0,yaw:0,location:'storage'});
    ready.push(order);
  }
  if(ready.length){
    root.world.furniture={...world,instances,revision:world.revision+1};
    market.orders=waiting;
  }
  return ready;
}
