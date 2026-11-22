/** LOT-B0 pure outdoor edit proposals; UI/3D are NOT authoritative.
 * Prices are provisional approved playtest amounts. Scene, money and ledger
 * must commit together or not at all in the single root-v1 save.
 */
import {OUTDOOR_CATALOG,OUTDOOR_FEATURE_LIMIT,outdoorFeatureRect,
  outdoorRectsOverlap} from './outdoor-catalog.js';
import {outdoorCellAt,outdoorCellCenter,outdoorFeatureFits,restoreOutdoorsWorld,
  OUTDOOR_GRID_WIDTH,OUTDOOR_GROUND_LIMIT,OUTDOOR_GROUND_PRICE} from './lot-surface.js';
import {furnitureObstacles,furnitureActionApproach} from './furniture-catalog.js';
import {furniturePoint} from './furniture-transform.js';
import {BED_SLOTS} from './bed-layout.js';
import {findPath,isWalkable,ACTOR_RADIUS} from './navigation.js';
import {recordFinanceChange} from './finance-ledger.js';
import {poolWaterNear} from './pool-topology.js';
import {protectPoolFromWorldEdit} from './pool-cross-editor.js';
import {outdoorBenchApproach,outdoorBenchBusy} from './outdoor-interactions.js';
import {grillApproach,grillBusy} from './grill-r1.js';
import {GARDEN_LIMIT,isGardenItem,newGardenRecord,gardenApproach,gardenBusy} from './gardening.js';

const fail=reason=>({ok:false,reason});
/** Canonical saves are JSON-safe, but restored optional extensions can have
 * different object key insertion order (garden records precede pool fields).
 * Comparing serialized text rejects otherwise identical valid transactions.
 * Arrays retain exact order; records compare keys by identity and value.
 */
function sameJson(a,b){
  if(Object.is(a,b))return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
  if(Array.isArray(a)||Array.isArray(b))
    return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&
      a.every((value,i)=>sameJson(value,b[i]));
  const keys=Object.keys(a);
  return keys.length===Object.keys(b).length&&keys.every(key=>
    Object.hasOwn(b,key)&&sameJson(a[key],b[key]));
}
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const participantPositions=root=>[root?.position,root?.otherSim?.position].filter(
  p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z));
function context(root){
  if(root?.version!==1||root?.world?.construction?.schema!==1||
     !integer(root?.shop?.credits)||root?.shop?.schema!==1||
     !root?.world?.furniture)return null;
  return restoreOutdoorsWorld(root.world.outdoors,root.world.construction);
}
function preview(root,nextOutdoors,cost,sourceId){
  const old=context(root);
  if(!old)return fail('invalid-state');
  if(!integer(cost)||cost>root.shop.credits)return fail('insufficient-credits');
  if(old.revision===100000000)return fail('revision-limit');
  return {ok:true,sourceId,cost,
    fromRevision:old.revision,fromBalance:root.shop.credits,
    outdoors:{...nextOutdoors,revision:old.revision+1}};
}
/** Paint an inclusive rectangle of half-meter cells, leaving all indoor floor
 * and porches strictly construction-owned. A skipped house cell costs nothing.
 */
export function previewOutdoorPaint(root,{from,to,kind}={}){
  const current=context(root);
  if(!current)return fail('invalid-state');
  if(!Object.hasOwn(OUTDOOR_GROUND_PRICE,kind))return fail('unknown-ground');
  const a=outdoorCellAt(from?.x,from?.z),b=outdoorCellAt(to?.x,to?.z);
  if(a===null||b===null)return fail('outside-lot');
  const ax=a%OUTDOOR_GRID_WIDTH,bx=b%OUTDOOR_GRID_WIDTH,
    az=Math.floor(a/OUTDOOR_GRID_WIDTH),bz=Math.floor(b/OUTDOOR_GRID_WIDTH);
  const cells=new Map(current.ground.map(e=>[e.cell,e.kind]));
  let changed=0;
  for(let j=Math.min(az,bz);j<=Math.max(az,bz);j++)
    for(let i=Math.min(ax,bx);i<=Math.max(ax,bx);i++){
      const cell=j*OUTDOOR_GRID_WIDTH+i;
      const p=outdoorCellCenter(cell);
      // A painted yard cannot silently become a room floor or a roof.
      if((root.world.construction&&awaitingFloor(root.world.construction,p))||
         poolWaterNear(current,p.x,p.z))continue;
      const was=cells.get(cell)||'lawn';
      if(was===kind)continue;
      changed++;
      if(kind==='lawn')cells.delete(cell);else cells.set(cell,kind);
    }
  if(changed===0)return fail('unchanged');
  if(cells.size>OUTDOOR_GROUND_LIMIT)return fail('ground-limit');
  const ground=[...cells].sort(([a],[b])=>a-b).map(([cell,kind])=>({cell,kind}));
  const result=preview(root,{...current,ground},
    changed*OUTDOOR_GROUND_PRICE[kind],'outdoors-ground-'+(current.revision+1));
  return result.ok?{...result,changedCells:changed}:result;
}
// Keep the existing construction model authoritative. Imported lazily only by
// this pure module to avoid confusing ground paint with room floor finishing.
import {constructionContains} from './construction.js';
function awaitingFloor(construction,p){return constructionContains(construction,p.x,p.z);}

function essentialGoals(root){
  const goals=[{x:-.65,z:3.45}]; // existing W1/W3 career door portal, not a new exit
  const f=root.world.furniture;
  for(const action of ['fridge','toilet','shower']){
    const p=furnitureActionApproach(f,action);
    if(p)goals.push(p);
  }
  for(const slot of Object.values(BED_SLOTS)){
    const p=furniturePoint(f,'bed',slot.approach);
    if(p)goals.push(p);
  }
  for(const resident of [root,root.otherSim]){
    if(resident?.action?.id==='move'&&resident.action.goal)
      goals.push(resident.action.goal);
    if(resident?.action?.id==='bench'){
      const p=outdoorBenchApproach(root.world,resident.action.targetInstanceId);
      if(p)goals.push(p);
    }
  }
  for(const key of ['alex','mira']){
    for(const command of (root.actionQueues?.byResident?.[key]||[])){
      if(command.type==='move')goals.push({x:command.x,z:command.z});
      if(command.type==='outdoor'){
        const p=outdoorBenchApproach(root.world,command.instanceId);
        if(p)goals.push(p);
      }
    }
  }
  return goals.filter(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z));
}
/** Never revoke an existing essential route, including queued player moves.
 * Existing broken legacy layouts are tolerated, not rewritten or teleported.
 */
export function keepsExistingRoutes(root,nextOutdoors,{poolEditor=false}={}){
  // Dedicated pool-editor owns water/fixtures and validates its own topology.
  // Ordinary yard edits must never use this escape hatch.
  if(!poolEditor&&!protectPoolFromWorldEdit(root,{outdoors:nextOutdoors}).ok)return false;
  const after={...root.world,outdoors:nextOutdoors};
  const before=root.world;
  const goals=essentialGoals(root);
  for(const actor of participantPositions(root)){
    if(!isWalkable(actor.x,actor.z,after))return false;
    for(const goal of goals){
      if(findPath(actor,goal,before)&&!findPath(actor,goal,after))
        return false;
    }
    // At least one genuine exterior zone must remain reachable if it was
    // reachable before. Avoid trapping the household inside a new fence ring.
    const yard=[{x:18,z:8},{x:18,z:-8},{x:0,z:8},{x:0,z:-8}];
    if(yard.some(p=>findPath(actor,p,before))&&
       !yard.some(p=>findPath(actor,p,after)))return false;
  }
  return true;
}
export function previewOutdoorFeature(root,itemId,{x,z,yaw=0}={}){
  const current=context(root),def=OUTDOOR_CATALOG[itemId];
  if(!current)return fail('invalid-state');
  if(!def)return fail('unknown-item');
  if(current.features.length>=OUTDOOR_FEATURE_LIMIT)return fail('feature-limit');
  if(isGardenItem(itemId)&&current.features.filter(f=>isGardenItem(f.itemId)).length>=GARDEN_LIMIT)
    return fail('garden-limit');
  if(current.nextId>9999999)return fail('id-limit');
  if(def.light&&current.features.filter(f=>OUTDOOR_CATALOG[f.itemId]?.light).length>=8)
    return fail('light-limit');
  const item={instanceId:'out-'+current.nextId,itemId,x,z,yaw,
    purchasePriceCredits:def.price};
  const rect=outdoorFeatureRect(item);
  if(!outdoorFeatureFits(item,root.world.construction,current))return fail('blocked-or-outside');
  if(current.features.some(f=>outdoorRectsOverlap(rect,outdoorFeatureRect(f))))
    return fail('overlap-outdoor');
  if(furnitureObstacles(root.world.furniture).some(f=>outdoorRectsOverlap(rect,f)))
    return fail('overlap-furniture');
  if(participantPositions(root).some(p=>
     p.x>=rect.minX-ACTOR_RADIUS&&p.x<=rect.maxX+ACTOR_RADIUS&&
     p.z>=rect.minZ-ACTOR_RADIUS&&p.z<=rect.maxZ+ACTOR_RADIUS))
    return fail('resident-blocked');
  // Topology cache is keyed by the same outdoor revision as production A*.
  // Preview must use its *future* revision, never reuse an old walkability grid.
  if(current.revision>=100000000)return fail('revision-limit');
  const next={...current,revision:current.revision+1,nextId:current.nextId+1,
    features:[...current.features,item],
    ...(isGardenItem(itemId)?{gardens:{...(current.gardens||{}),
      [item.instanceId]:newGardenRecord(root.minutes)}}:{})};
  if(!keepsExistingRoutes(root,next))return fail('would-block-route');
  if(isGardenItem(itemId)){
    const after={...root.world,outdoors:next};
    if(!participantPositions(root).every(p=>Boolean(gardenApproach(after,item.instanceId,p))))
      return fail('unreachable-garden');
  }
  if(itemId==='garden.grill'){
    const after={...root.world,outdoors:next};
    const approach=grillApproach(after,item.instanceId);
    if(!approach||!participantPositions(root).every(p=>Boolean(findPath(p,approach,after))))
      return fail('unreachable-grill');
  }
  if(itemId==='garden.bench'){
    const approach=outdoorBenchApproach({...root.world,outdoors:next},item.instanceId);
    if(!approach||!isWalkable(approach.x,approach.z,{...root.world,outdoors:next})||
      !participantPositions(root).every(p=>Boolean(findPath(p,approach,{...root.world,outdoors:next}))))
      return fail('unreachable-bench');
  }
  const result=preview(root,next,def.price,item.instanceId);
  return result.ok?{...result,instanceId:item.instanceId}:result;
}
/** Immutable, one-shot household transaction. No double charge on stale UI
 * confirmation; no new wallet and no direct caller mutation.
 */
export function commitOutdoorPreview(root,proposal){
  if(!proposal?.ok||!proposal.outdoors||!Number.isSafeInteger(proposal.cost)||
     proposal.cost<0||!proposal.sourceId)return fail('invalid-preview');
  const current=context(root);
  if(!current||current.revision!==proposal.fromRevision||
     root.shop.credits!==proposal.fromBalance)return fail('stale-preview');
  if(proposal.outdoors.revision!==current.revision+1)return fail('invalid-revision');
  // Exact projection cannot introduce unwhitelisted entries even when a
  // caller sends a damaged draft. The editor should still re-preview at apply.
  const verified=restoreOutdoorsWorld(proposal.outdoors,root.world.construction);
  if(!sameJson(verified,proposal.outdoors))
    return fail('invalid-projection');
  // Never allow a forged or stale cross-mode draft to occlude a pool landing.
  const poolGuard=protectPoolFromWorldEdit(root,{outdoors:verified});
  if(!poolGuard.ok)return poolGuard;
  if(root.shop.credits<proposal.cost)return fail('insufficient-credits');
  const nextShop={...root.shop,credits:root.shop.credits-proposal.cost};
  const transaction=recordFinanceChange(root,nextShop,{
    kind:'purchase',sourceId:proposal.sourceId,
    atGameMinute:Math.floor(root.minutes||0)});
  if(!transaction.ok)return fail(transaction.reason);
  return {ok:true,root:{...root,world:{...root.world,outdoors:verified},
    shop:transaction.shop,financialHistory:transaction.financialHistory},
    cost:proposal.cost,recorded:transaction.recorded};
}


/** LOT-B2: edits are rebuilt from the current canonical root at confirmation.
 * A stale preview cannot mint money or bypass topology/overlap checks.
 * Decor and boundaries never grant passive XP/need bonuses.
 */
const b2Category=id=>['tree','shrub','flower','fence','furniture','light','garden']
  .includes(OUTDOOR_CATALOG[id]?.category);
export function previewOutdoorFeatureEdit(root,{operation,itemId,instanceId,pose}={}){
  if(operation==='place'){
    if(!b2Category(itemId))return fail('unavailable-item');
    const p=previewOutdoorFeature(root,itemId,pose);
    return p.ok?{...p,operation,itemId,pose,instanceId:p.instanceId}:p;
  }
  const current=context(root);
  if(!current)return fail('invalid-state');
  if(operation!=='move'&&operation!=='sell')return fail('unknown-operation');
  const original=current.features.find(x=>x.instanceId===instanceId);
  if(!original||!b2Category(original.itemId))return fail('missing-instance');
  if(['garden.table','garden.bench'].includes(original.itemId)&&
    [root,root?.otherSim].some(a=>a?.action?.id==='dining'&&
      [a.action.targetInstanceId,a.action.diningSeatInstanceId].includes(instanceId)))
    return fail('reserved-dining');
  if(original.itemId==='garden.grill'&&grillBusy(root,instanceId))
    return fail('reserved-grill');
  if(original.itemId==='garden.bench'&&outdoorBenchBusy(root,instanceId))
    return fail('reserved-bench');
  if(isGardenItem(original.itemId)&&gardenBusy(root,instanceId))return fail('reserved-garden');
  if(current.revision>=100000000)return fail('revision-limit');
  let features;
  if(operation==='sell')features=current.features.filter(f=>f.instanceId!==instanceId);
  else {
    if(!pose||![0,90,180,270].includes(pose.yaw))return fail('invalid-pose');
    if(pose.x===original.x&&pose.z===original.z&&pose.yaw===original.yaw)
      return fail('unchanged');
    const moved={...original,x:pose.x,z:pose.z,yaw:pose.yaw};
    const rect=outdoorFeatureRect(moved);
    if(!outdoorFeatureFits(moved,root.world.construction,current))
      return fail('blocked-or-outside');
    if(current.features.some(f=>f.instanceId!==instanceId&&
      outdoorRectsOverlap(rect,outdoorFeatureRect(f))))return fail('overlap-outdoor');
    if(furnitureObstacles(root.world.furniture).some(f=>outdoorRectsOverlap(rect,f)))
      return fail('overlap-furniture');
    if(participantPositions(root).some(p=>
      p.x>=rect.minX-ACTOR_RADIUS&&p.x<=rect.maxX+ACTOR_RADIUS&&
      p.z>=rect.minZ-ACTOR_RADIUS&&p.z<=rect.maxZ+ACTOR_RADIUS))
      return fail('resident-blocked');
    features=current.features.map(f=>f.instanceId===instanceId?moved:f);
  }
  const next={...current,revision:current.revision+1,features,
    ...(operation==='sell'&&isGardenItem(original.itemId)
      ?{gardens:Object.fromEntries(Object.entries(current.gardens||{})
        .filter(([id])=>id!==instanceId))}:{})};
  if(operation==='move'&&!keepsExistingRoutes(root,next))
    return fail('would-block-route');
  if(operation==='move'&&isGardenItem(original.itemId)){
    const after={...root.world,outdoors:next};
    if(!participantPositions(root).every(p=>Boolean(gardenApproach(after,instanceId,p))))
      return fail('unreachable-garden');
  }
  if(operation==='move'&&original.itemId==='garden.grill'){
    const after={...root.world,outdoors:next};
    const approach=grillApproach(after,instanceId);
    if(!approach||!participantPositions(root).every(p=>Boolean(findPath(p,approach,after))))
      return fail('unreachable-grill');
  }
  if(operation==='move'&&original.itemId==='garden.bench'){
    const after={...root.world,outdoors:next};
    const approach=outdoorBenchApproach(after,instanceId);
    if(!approach||!isWalkable(approach.x,approach.z,after)||
      !participantPositions(root).every(p=>Boolean(findPath(p,approach,after))))
      return fail('unreachable-bench');
  }
  const refund=operation==='sell'?Math.floor(original.purchasePriceCredits*0.7):0;
  const balance=root.shop.credits+refund;
  if(!Number.isSafeInteger(balance)||balance>1000000000)return fail('wallet-limit');
  return {ok:true,operation,itemId:original.itemId,instanceId,
    pose:operation==='move'?{x:pose.x,z:pose.z,yaw:pose.yaw}:null,
    cost:operation==='sell'?-refund:0,sourceId:'outdoors-'+operation+'-'+instanceId+'-'+next.revision,
    fromRevision:current.revision,fromBalance:root.shop.credits,outdoors:next};
}
export function commitOutdoorFeatureEdit(root,draft){
  if(!draft?.ok||!['place','move','sell'].includes(draft.operation))
    return fail('invalid-preview');
  const current=context(root);
  if(!current||current.revision!==draft.fromRevision||
    root.shop.credits!==draft.fromBalance)return fail('stale-preview');
  const verified=previewOutdoorFeatureEdit(root,{
    operation:draft.operation,itemId:draft.itemId,
    instanceId:draft.operation==='place'?undefined:draft.instanceId,pose:draft.pose});
  if(!verified.ok)return verified;
  if(verified.sourceId!==draft.sourceId||verified.cost!==draft.cost||
    JSON.stringify(verified.outdoors)!==JSON.stringify(draft.outdoors))
    return fail('stale-preview');
  if(draft.operation==='place')return commitOutdoorPreview(root,verified);
  const nextCredits=root.shop.credits-verified.cost;
  const nextShop={...root.shop,credits:nextCredits};
  const receipt=recordFinanceChange(root,nextShop,{
    kind:draft.operation==='sell'?'sale':'purchase',
    sourceId:verified.sourceId,atGameMinute:Math.floor(root.minutes||0)});
  if(!receipt.ok)return fail(receipt.reason);
  return {ok:true,root:{...root,world:{...root.world,outdoors:verified.outdoors},
    shop:receipt.shop,financialHistory:receipt.financialHistory},
    cost:verified.cost,instanceId:verified.instanceId,recorded:receipt.recorded};
}
