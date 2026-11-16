/** F2.1a: provisional furniture shop domain, no PlayCanvas/DOM dependencies.
 * Prices are deliberately labelled playtest-only until owner approves balance.
 * Only independent decor is tradeable; physical action fixtures remain protected.
 */
import {FURNITURE_CATALOG,restoreFurnitureWorld} from './furniture-catalog.js';
import {proposeFurnitureMove} from './furniture-layout.js';

export const SHOP_SCHEMA=1;
export const SHOP_START_CREDITS=5000; // Provisional, NOT a signed-off economy.
export const SHOP_SELL_PERCENT=70;
export const SHOP_ITEMS=Object.freeze([
  Object.freeze({prefabId:'plant',price:130}),
  Object.freeze({prefabId:'table',price:250}),
  Object.freeze({prefabId:'nightstand',price:170}),
  Object.freeze({prefabId:'tv',price:650})
]);
const stock=new Map(SHOP_ITEMS.map(item=>[item.prefabId,item]));
const safeInt=n=>Number.isSafeInteger(n)&&n>=0;
const cap=1_000_000;
export function newFurnitureShop(){return {schema:SHOP_SCHEMA,credits:SHOP_START_CREDITS,nextId:1};}
export function restoreFurnitureShop(raw){
  if(raw?.schema!==SHOP_SCHEMA||!safeInt(raw.credits)||raw.credits>cap||
    !safeInt(raw.nextId)||raw.nextId<1||raw.nextId>1e7)return newFurnitureShop();
  return {schema:SHOP_SCHEMA,credits:raw.credits,nextId:raw.nextId};
}
export function marketListing(){
  return SHOP_ITEMS.map(item=>({...item,...{
    name:FURNITURE_CATALOG[item.prefabId].name,
    category:FURNITURE_CATALOG[item.prefabId].category
  }}));
}
function reject(reason){return {ok:false,reason};}
function context({lockedInstanceIds=[],residents=[]}={}){
  return {lockedInstanceIds, residents};
}
function normalized(world,shop){
  return {world:restoreFurnitureWorld(world),shop:restoreFurnitureShop(shop)};
}
function validPosition(p){return p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&
  [0,90,180,270].includes(p.yaw);}
function placement(world,instanceId,pose,opts){
  const result=proposeFurnitureMove(world,instanceId,pose,context(opts));
  return result.ok?{ok:true,world:result.world}:reject(result.reason);
}
export function buyMarketItem(world,shop,prefabId,pose,opts={}){
  const item=stock.get(prefabId);
  if(!item)return reject('not-in-shop');
  if(!validPosition(pose))return reject('invalid-pose');
  const current=normalized(world,shop);
  if(current.shop.credits<item.price)return reject('insufficient-credits');
  if(current.world.instances.length>=128)return reject('full-household');
  const id='shop-'+prefabId+'-'+current.shop.nextId;
  if(current.world.instances.some(x=>x.instanceId===id))return reject('duplicate-id');
  const added={instanceId:id,prefabId,x:pose.x,z:pose.z,yaw:pose.yaw,location:'home'};
  const candidate={...current.world,instances:[...current.world.instances,added]};
  const valid=placement(candidate,id,pose,opts);
  if(!valid.ok)return valid;
  return {ok:true,world:valid.world,
    shop:{...current.shop,credits:current.shop.credits-item.price,nextId:current.shop.nextId+1},
    instanceId:id,amount:-item.price};
}
function tradeable(world,instanceId){
  const item=world.instances.find(x=>x.instanceId===instanceId);
  return item&&stock.has(item.prefabId)?item:null;
}
export function storeMarketItem(world,shop,instanceId,opts={}){
  const current=normalized(world,shop),item=tradeable(current.world,instanceId);
  if(!item)return reject('protected-item');
  if(item.location!=='home')return reject('already-stored');
  if((opts.lockedInstanceIds||[]).includes(instanceId))return reject('reserved');
  return {ok:true,world:{...current.world,revision:current.world.revision+1,
    instances:current.world.instances.map(x=>x.instanceId===instanceId
      ?{...x,location:'storage'}:x)},shop:current.shop,instanceId,amount:0};
}
export function restoreMarketItem(world,shop,instanceId,pose,opts={}){
  const current=normalized(world,shop),item=tradeable(current.world,instanceId);
  if(!item)return reject('protected-item');
  if(item.location!=='storage')return reject('not-stored');
  if(!validPosition(pose))return reject('invalid-pose');
  const candidate={...current.world,
    instances:current.world.instances.map(x=>x.instanceId===instanceId
      ?{...x,location:'home'}:x)};
  const valid=placement(candidate,instanceId,pose,opts);
  if(!valid.ok)return valid;
  return {...valid,shop:current.shop,instanceId,amount:0};
}
export function sellMarketItem(world,shop,instanceId,opts={}){
  const current=normalized(world,shop),item=tradeable(current.world,instanceId);
  if(!item)return reject('protected-item');
  if(item.location==='home'&&(opts.lockedInstanceIds||[]).includes(instanceId))
    return reject('reserved');
  const amount=Math.floor(stock.get(item.prefabId).price*SHOP_SELL_PERCENT/100);
  if(current.shop.credits+amount>cap)return reject('wallet-limit');
  return {ok:true,world:{...current.world,revision:current.world.revision+1,
    instances:current.world.instances.filter(x=>x.instanceId!==instanceId)},
    shop:{...current.shop,credits:current.shop.credits+amount},
    instanceId,amount};
}
const CANDIDATES=Object.freeze([
  [0,-2.1],[-.7,-2.0],[.1,-1.45],[-1.0,-.8],[3.2,2.95],
  [-.8,3.65],[.3,3.5],[3.4,-1.4],[.5,2.6],[-1.5,1.1],
  [2.8,-1.5],[0,1.5],[-2.0,.2],[2.5,3.5]
]);
export function findMarketPlacement(world,shop,prefabId,opts={}){
  for(const [x,z] of CANDIDATES){
    const pose={x,z,yaw:0};
    const result=buyMarketItem(world,shop,prefabId,pose,opts);
    if(result.ok)return pose;
  }
  return null;
}
