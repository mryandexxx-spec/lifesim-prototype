/** F2.1a: provisional furniture shop domain, no PlayCanvas/DOM dependencies.
 * Prices are deliberately labelled playtest-only until owner approves balance.
 * Decor and independently targetable purchased sofas/beds are tradeable; original
 * essential fixtures remain protected until visual/interaction adapters exist.
 */
import {FURNITURE_CATALOG,restoreFurnitureWorld,furnitureActionApproach} from './furniture-catalog.js';
import {findPath} from './navigation.js';
import {BED_SLOTS} from './bed-layout.js';
import {furniturePoint} from './furniture-transform.js';
import {proposeFurnitureMove} from './furniture-layout.js';
import {describeFurnitureValue} from './furniture-value.js';
import {FURNITURE_PRODUCTS,FURNITURE_LEGACY_OFFERS,
  compatibleFurnitureProduct,legacyProductId} from './furniture-products.js';

export const SHOP_SCHEMA=1;
export const SHOP_START_CREDITS=5000; // Provisional, NOT a signed-off economy.
export const SHOP_SELL_PERCENT=70;
// Old six-item API remains byte-shape compatible for existing tests/saves.
export const SHOP_ITEMS=Object.freeze(FURNITURE_LEGACY_OFFERS.map(({prefabId,price})=>
  Object.freeze({prefabId,price})));
export const MARKET_OFFERS=FURNITURE_PRODUCTS;
const stock=new Map(MARKET_OFFERS.map(item=>[item.itemId,item]));
const shopPrefabs=new Set(MARKET_OFFERS.map(x=>x.prefabId));
/** F2 callers may still pass prefabId; F4b2 UI passes the stable SKU id. */
const offerFor=id=>stock.get(id)||stock.get(legacyProductId(id));
const safeInt=n=>Number.isSafeInteger(n)&&n>=0;
const cap=1_000_000;
export function newFurnitureShop(){return {schema:SHOP_SCHEMA,credits:SHOP_START_CREDITS,nextId:1};}
export function restoreFurnitureShop(raw){
  if(raw?.schema!==SHOP_SCHEMA||!safeInt(raw.credits)||raw.credits>cap||
    !safeInt(raw.nextId)||raw.nextId<1||raw.nextId>1e7)return newFurnitureShop();
  return {schema:SHOP_SCHEMA,credits:raw.credits,nextId:raw.nextId};
}
export function marketListing(){
  return MARKET_OFFERS.map(item=>({
    ...item,
    name:item.name||FURNITURE_CATALOG[item.prefabId].name,
    category:FURNITURE_CATALOG[item.prefabId].category,
    ...describeFurnitureValue(item.prefabId),
    ...(item.description?{effectText:item.description}:{})
  }));
}
function reject(reason){return {ok:false,reason};}
function context({lockedInstanceIds=[],residents=[],construction=null}={}){
  return {lockedInstanceIds,residents,construction};
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
  const item=offerFor(prefabId);
  if(!item)return reject('not-in-shop');
  const productPrefabId=item.prefabId;
  if(!validPosition(pose))return reject('invalid-pose');
  const current=normalized(world,shop);
  if(current.shop.credits<item.price)return reject('insufficient-credits');
  if(current.world.instances.length>=128)return reject('full-household');
  const id='shop-'+productPrefabId+'-'+current.shop.nextId;
  if(current.world.instances.some(x=>x.instanceId===id))return reject('duplicate-id');
  const added={instanceId:id,prefabId:productPrefabId,x:pose.x,z:pose.z,yaw:pose.yaw,
    location:'home',itemDefinitionId:item.itemId,purchasePriceCredits:item.price};
  const candidate={...current.world,instances:[...current.world.instances,added]};
  const valid=placement(candidate,id,pose,opts);
  if(!valid.ok)return valid;
  if(productPrefabId==='sofa'&&!sofaReachable(valid.world,id,opts))
    return reject('unreachable-sofa');
  if(productPrefabId==='bed'&&!bedReachable(valid.world,id,opts))
    return reject('unreachable-bed');
  if(productPrefabId==='tv'&&!sofaReachable(valid.world,id,opts,'tv'))
    return reject('unreachable-tv');
  if(productPrefabId==='bookcase'&&!sofaReachable(valid.world,id,opts,'hobby'))
    return reject('unreachable-bookcase');
  if(['chair','armchair'].includes(productPrefabId)&&
    !sofaReachable(valid.world,id,opts,'seat'))
    return reject('unreachable-seat');
  const utilityActions={floorlamp:'lamp',mirror:'mirror',dresser:'dresser',wardrobe:'wardrobe'};
  if(utilityActions[productPrefabId]&&
    !sofaReachable(valid.world,id,opts,utilityActions[productPrefabId]))
    return reject('unreachable-utility');
  return {ok:true,world:valid.world,
    shop:{...current.shop,credits:current.shop.credits-item.price,nextId:current.shop.nextId+1},
    instanceId:id,amount:-item.price};
}
/** Protect original functional fixtures. Only shop-purchased beds and sofas may
 * enter storage or be sold; keep older decor trade rules intact.
 */
export function canTradeMarketInstance(item){
  return !!item&&shopPrefabs.has(item.prefabId)&&(
    !['sofa','bed'].includes(item.prefabId)||
    new RegExp('^shop-'+item.prefabId+'-[1-9][0-9]*$').test(item.instanceId));
}
function tradeable(world,instanceId){
  const item=world.instances.find(x=>x.instanceId===instanceId);
  return canTradeMarketInstance(item)?item:null;
}
/** A paid sofa must be reachable at its OWN rotated approach point.
 * Avoid green previews that would leave characters with an unusable couch.
 */
function sofaReachable(world,instanceId,opts={},actionId='sofa'){
  const at=furnitureActionApproach(world,actionId,instanceId);
  if(!at)return false;
  return (opts.residents||[]).every(pos=>!pos||
    !Number.isFinite(pos.x)||!Number.isFinite(pos.z)||
    Boolean(findPath(pos,at,opts.construction?{furniture:world,construction:opts.construction}:world)));
}
/** Both entry sides must be reachable to make a purchase useful. */
function bedReachable(world,instanceId,opts={}){
  const goals=Object.values(BED_SLOTS).map(slot=>
    furniturePoint(world,'bed',slot.approach,instanceId));
  if(goals.some(p=>!p))return false;
  return (opts.residents||[]).every(pos=>!pos||
    !Number.isFinite(pos.x)||!Number.isFinite(pos.z)||
    goals.every(goal=>Boolean(findPath(pos,goal,opts.construction?{furniture:world,construction:opts.construction}:world))));
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
  if(item.prefabId==='sofa'&&!sofaReachable(valid.world,instanceId,opts))
    return reject('unreachable-sofa');
  if(item.prefabId==='bed'&&!bedReachable(valid.world,instanceId,opts))
    return reject('unreachable-bed');
  if(item.prefabId==='tv'&&!sofaReachable(valid.world,instanceId,opts,'tv'))
    return reject('unreachable-tv');
  if(item.prefabId==='bookcase'&&!sofaReachable(valid.world,instanceId,opts,'hobby'))
    return reject('unreachable-bookcase');
  return {...valid,shop:current.shop,instanceId,amount:0};
}
export function sellMarketItem(world,shop,instanceId,opts={}){
  const current=normalized(world,shop),item=tradeable(current.world,instanceId);
  if(!item)return reject('protected-item');
  if(item.location==='home'&&(opts.lockedInstanceIds||[]).includes(instanceId))
    return reject('reserved');
  const product=compatibleFurnitureProduct(item.prefabId,item.itemDefinitionId)||
    stock.get(legacyProductId(item.prefabId));
  if(!product)return reject('protected-item');
  // The price paid belongs to the physical instance, not current catalog price.
  // Old v1 items without a snapshot preserve the original fallback sale value.
  const paid=Number.isSafeInteger(item.purchasePriceCredits)&&
    item.purchasePriceCredits>=0&&item.purchasePriceCredits<=cap
    ?item.purchasePriceCredits:product.price;
  const amount=Math.floor(paid*SHOP_SELL_PERCENT/100);
  if(current.shop.credits+amount>cap)return reject('wallet-limit');
  return {ok:true,world:{...current.world,revision:current.world.revision+1,
    instances:current.world.instances.filter(x=>x.instanceId!==instanceId)},
    shop:{...current.shop,credits:current.shop.credits+amount},
    instanceId,amount};
}
const CANDIDATES=Object.freeze([
  [0,-2.1],[-.7,-2.0],[.1,-1.45],[-1.0,-.8],[3.2,2.95],
  [-.8,3.65],[.3,3.5],[3.4,-1.4],[.5,2.6],[-1.5,1.1],
  [2.8,-1.5],[0,1.5],[-2.0,.2],[2.5,3.5],
  // F4D: when the starter wing is full, find real places in the new half.
  // Keep old preferences first so legacy previews remain familiar.
  [6.4,-2.3],[8.4,-2.3],[10.5,-2.3],[12.2,-2.3],
  [6.4,0],[8.4,0],[10.5,0],[12.2,0],
  [6.4,2.3],[8.4,2.3],[10.5,2.3],[12.2,2.3]
]);
export function findMarketPlacement(world,shop,prefabId,opts={}){
  for(const [x,z] of CANDIDATES){
    const pose={x,z,yaw:0};
    const result=buyMarketItem(world,shop,prefabId,pose,opts);
    if(result.ok)return pose;
  }
  return null;
}
