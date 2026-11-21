/** F2/Q2: pure furniture transactions. Starter origin is canonical and
 * essential household resources require a usable physical replacement. */
import {FURNITURE_CATALOG,restoreFurnitureWorld,furnitureActionApproach,
  furnitureProvenance} from './furniture-catalog.js';
import {findPath} from './navigation.js';
import {BED_SLOTS} from './bed-layout.js';
import {furniturePoint} from './furniture-transform.js';
import {proposeFurnitureMove} from './furniture-layout.js';
import {describeFurnitureValue} from './furniture-value.js';
import {MOUNTED_LIGHTS,mountedAnchorAt,lightingMountPose} from './mounted-lighting.js';
import {FURNITURE_PRODUCTS,FURNITURE_LEGACY_OFFERS,
  compatibleFurnitureProduct,legacyProductId} from './furniture-products.js';

export const SHOP_SCHEMA=1;
export const SHOP_START_CREDITS=5000; // Provisional, NOT a signed-off economy.
export const SHOP_SELL_PERCENT=70;
export const STARTER_SELL_PERCENT=30;
// Provisional reference appraisals for three starter-only fixtures; these are
// not sale listings and do not change the approved catalog or household funds.
export const STARTER_APPLIANCE_APPRAISAL=Object.freeze({
  fridge:900,shower:700,toilet:450
});
const ESSENTIAL_PREFABS=new Set(['bed','fridge','shower','toilet']);
// Old six-item API remains byte-shape compatible for existing tests/saves.
export const SHOP_ITEMS=Object.freeze(FURNITURE_LEGACY_OFFERS.map(({prefabId,price})=>
  Object.freeze({prefabId,price})));
export const MARKET_OFFERS=FURNITURE_PRODUCTS;
const stock=new Map(MARKET_OFFERS.map(item=>[item.itemId,item]));
const shopPrefabs=new Set(MARKET_OFFERS.map(x=>x.prefabId));
/** F2 callers may still pass prefabId; F4b2 UI passes the stable SKU id. */
const offerFor=id=>stock.get(id)||stock.get(legacyProductId(id));
const safeInt=n=>Number.isSafeInteger(n)&&n>=0;
export const SHOP_MAX_CREDITS=1_000_000_000; // Saved wages must not reset a long-running home.
const cap=SHOP_MAX_CREDITS;
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
function context({lockedInstanceIds=[],residents=[],construction=null,outdoors=null}={}){
  return {lockedInstanceIds,residents,construction,outdoors};
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
  const sku=MOUNTED_LIGHTS[item.itemId];
  const mount=sku?mountedAnchorAt(opts.construction,item.itemId,pose.x,pose.z):null;
  if(sku&&!mount)return reject('missing-light-mount');
  const mountedPose=sku?lightingMountPose(opts.construction,item.itemId,mount):null;
  if(sku&&!mountedPose)return reject('missing-light-mount');
  if(sku&&current.world.instances.some(x=>x.location==='home'&&
    MOUNTED_LIGHTS[x.itemDefinitionId]&&
    Math.hypot(x.x-mountedPose.x,x.z-mountedPose.z)<.55))
    return reject('light-mount-occupied');
  const added={instanceId:id,prefabId:productPrefabId,
    x:mountedPose?.x??pose.x,z:mountedPose?.z??pose.z,
    yaw:mountedPose?.yaw??pose.yaw,location:'home',
    itemDefinitionId:item.itemId,purchasePriceCredits:item.price,
    ...(sku?{mount,lightMode:'auto'}:{})};
  const candidate={...current.world,instances:[...current.world.instances,added]};
  const valid=sku?{ok:true,world:restoreFurnitureWorld({...candidate,revision:candidate.revision+1})}
    :placement(candidate,id,pose,opts);
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
/** The kitchen counter is an authored architectural assembly, not a
 * detachable prefab. Other starter fixtures may trade after safety guards.
 */
export function canTradeMarketInstance(item){
  if(!item)return false;
  if(furnitureProvenance(item)==='starter')
    return item.prefabId!=='counter';
  return shopPrefabs.has(item.prefabId)&&
    furnitureProvenance(item)==='purchased';
}
export function starterAppraisal(item){
  if(furnitureProvenance(item)!=='starter')return null;
  return stock.get(legacyProductId(item.prefabId))?.price??
    STARTER_APPLIANCE_APPRAISAL[item.prefabId]??null;
}
/** A replacement is present AND navigable for both residents, not merely
 * present as a stored item or a visually inaccessible prop.
 */
function essentialRemovalGuard(world,item,opts={}){
  if(!ESSENTIAL_PREFABS.has(item.prefabId))return null;
  const alternatives=world.instances.filter(candidate=>
    candidate.instanceId!==item.instanceId&&candidate.location==='home'&&
    candidate.prefabId===item.prefabId);
  if(!alternatives.length)return 'last-essential';
  const residents=(opts.residents||[]).filter(p=>
    Number.isFinite(p?.x)&&Number.isFinite(p?.z));
  const nav=opts.construction?{furniture:world,construction:opts.construction}:world;
  const reachable=alternatives.some(candidate=>{
    const goals=candidate.prefabId==='bed'
      ?Object.values(BED_SLOTS).map(slot=>furniturePoint(world,'bed',
        slot.approach,candidate.instanceId))
      :[furnitureActionApproach(world,candidate.prefabId,candidate.instanceId)];
    return goals.every(Boolean)&&residents.every(pos=>
      goals.every(goal=>Boolean(findPath(pos,goal,nav))));
  });
  return reachable?null:'missing-working-replacement';
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
  const necessity=essentialRemovalGuard(current.world,item,opts);
  if(necessity)return reject(necessity);
  return {ok:true,world:{...current.world,revision:current.world.revision+1,
    instances:current.world.instances.map(x=>x.instanceId===instanceId
      ?{...x,location:'storage'}:x)},shop:current.shop,instanceId,amount:0};
}
export function restoreMarketItem(world,shop,instanceId,pose,opts={}){
  const current=normalized(world,shop),item=tradeable(current.world,instanceId);
  if(!item)return reject('protected-item');
  if(item.location!=='storage')return reject('not-stored');
  if(!validPosition(pose))return reject('invalid-pose');
  const sku=MOUNTED_LIGHTS[item.itemDefinitionId];
  const mount=sku?mountedAnchorAt(opts.construction,item.itemDefinitionId,pose.x,pose.z):null;
  if(sku&&!mount)return reject('missing-light-mount');
  const mountedPose=sku?lightingMountPose(opts.construction,item.itemDefinitionId,mount):null;
  if(sku&&current.world.instances.some(x=>x.location==='home'&&x.instanceId!==instanceId&&
    MOUNTED_LIGHTS[x.itemDefinitionId]&&
    Math.hypot(x.x-mountedPose.x,x.z-mountedPose.z)<.55))
    return reject('light-mount-occupied');
  const candidate={...current.world,
    instances:current.world.instances.map(x=>x.instanceId===instanceId
      ?{...x,location:'home',...(sku?{
        x:mountedPose.x,z:mountedPose.z,yaw:mountedPose.yaw,mount}:{} )}:x)};
  const valid=sku?{ok:true,world:restoreFurnitureWorld({...candidate,revision:candidate.revision+1})}
    :placement(candidate,instanceId,pose,opts);
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
  if((opts.lockedInstanceIds||[]).includes(instanceId))
    return reject('reserved');
  const necessity=essentialRemovalGuard(current.world,item,opts);
  if(necessity)return reject(necessity);
  const product=compatibleFurnitureProduct(item.prefabId,item.itemDefinitionId)||
    stock.get(legacyProductId(item.prefabId));
  const starter=furnitureProvenance(item)==='starter';
  if(!product&&!starter)return reject('protected-item');
  // Starter 30% appraisal never trusts a forged paid price.
  // Bought goods retain 70% of their own historical paid price.
  const value=starter?starterAppraisal(item):(
    Number.isSafeInteger(item.purchasePriceCredits)&&
    item.purchasePriceCredits>=0&&item.purchasePriceCredits<=cap
      ?item.purchasePriceCredits:product.price);
  if(!Number.isSafeInteger(value)||value<0)return reject('missing-appraisal');
  const amount=Math.floor(value*(starter?STARTER_SELL_PERCENT:SHOP_SELL_PERCENT)/100);
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
/** Pure restore preview. Never charges money; caller explicitly confirms. */
export function findStoredPlacement(world,shop,instanceId,opts={}){
  const stored=world?.instances?.find(x=>x.instanceId===instanceId&&x.location==='storage');
  if(!stored)return null;
  const poses=[{x:stored.x,z:stored.z,yaw:stored.yaw},
    ...CANDIDATES.map(([x,z])=>({x,z,yaw:stored.yaw}))];
  for(const pose of poses)if(restoreMarketItem(world,shop,instanceId,pose,opts).ok)
    return pose;
  return null;
}
export function findMarketPlacement(world,shop,prefabId,opts={}){
  for(const [x,z] of CANDIDATES){
    const pose={x,z,yaw:0};
    const result=buyMarketItem(world,shop,prefabId,pose,opts);
    if(result.ok)return pose;
  }
  return null;
}
