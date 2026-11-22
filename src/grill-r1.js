/** GRILL-R1: pure outdoor cooking + verified outdoor table/bench pairing.
 * All food remains in the ONE existing kitchen pantry/prepared ledger.
 * No PlayCanvas, DOM, new clock, wallet or save key.
 */
import {GRILL_RECIPES,grillRecipe} from './grill-catalog.js';
import {KITCHEN_PREPARED_LIMIT,cookingQuality,kitchenQualityId} from './kitchen.js';
import {OUTDOOR_CATALOG} from './outdoor-catalog.js';
import {findPath,isWalkable} from './navigation.js';
import {furnitureActionApproach} from './furniture-catalog.js';
export {GRILL_RECIPES,grillRecipe};
export const GRILL_ITEM_ID='garden.grill';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const validStock=n=>Number.isSafeInteger(n)&&n>=0&&n<=30;
const parts=state=>state?.prepared?.reduce((n,x)=>n+(Number.isSafeInteger(x.portions)?x.portions:0),0)??Infinity;
const reserved=state=>Array.isArray(state?.deliveries)?state.deliveries.length:Infinity;
const round=n=>Math.round(n*1000)/1000;
export function outdoorGrill(world,id){
  return (world?.outdoors?.features||[]).find(x=>x.instanceId===id&&x.itemId===GRILL_ITEM_ID)||null;
}
export function grillApproach(world,id){
  const item=outdoorGrill(world,id);if(!item)return null;
  const a=item.yaw*Math.PI/180;
  // The human stands in front of the firebox, not inside the mesh.
  const p={x:round(item.x+Math.sin(a)*1.06),z:round(item.z-Math.cos(a)*1.06)};
  return isWalkable(p.x,p.z,world)?p:null;
}
export function grillAvailable(root,residentId,instanceId){
  if(!grillApproach(root?.world,instanceId))return false;
  const other=residentId==='alex'?root?.otherSim:root;
  return !(other?.action?.id==='grill'&&other.action.targetInstanceId===instanceId);
}
export function grillBusy(root,instanceId){
  return [root,root?.otherSim].some(actor=>actor?.action?.id==='grill'&&
    actor.action.targetInstanceId===instanceId)||
    Object.values(root?.actionQueues?.byResident||{}).some(list=>
      list?.some(task=>task.type==='grill'&&task.instanceId===instanceId));
}
export function canGrillRecipe(kitchen,recipeId,level=0){
  const recipe=grillRecipe(recipeId);
  return Boolean(recipe&&Number.isFinite(level)&&level>=recipe.minLevel&&
    kitchen?.schema===1&&Array.isArray(kitchen.prepared)&&
    Object.entries(recipe.requires).every(([id,n])=>
      validStock(kitchen.pantry?.[id])&&kitchen.pantry[id]>=n)&&
    parts(kitchen)+reserved(kitchen)+recipe.portions<=KITCHEN_PREPARED_LIMIT);
}
/** Commit once after the verified physical grill → fridge return finishes. */
export function finishGrillRecipe(kitchen,recipeId,level=0){
  if(!canGrillRecipe(kitchen,recipeId,level))return false;
  const recipe=grillRecipe(recipeId),quality=cookingQuality(level).id;
  for(const [id,n] of Object.entries(recipe.requires))kitchen.pantry[id]-=n;
  const prior=kitchen.prepared.find(x=>x.recipeId===recipeId&&
    kitchenQualityId(x.recipeId,x.quality)===quality);
  if(prior)prior.portions+=recipe.portions;
  else kitchen.prepared.push({recipeId,portions:recipe.portions,
    ...(quality==='normal'?{}:{quality})});
  return true;
}
function diningTable(world,id){
  return (world?.outdoors?.features||[]).find(x=>x.instanceId===id&&x.itemId==='garden.table')||null;
}
function diningBench(world,id){
  return (world?.outdoors?.features||[]).find(x=>x.instanceId===id&&x.itemId==='garden.bench')||null;
}
export function outdoorDiningApproach(world,tableId,seatId){
  const table=diningTable(world,tableId),seat=diningBench(world,seatId);
  if(!table||!seat)return null;
  const a=seat.yaw*Math.PI/180;
  const front={x:Math.sin(a),z:-Math.cos(a)};
  const toward={x:table.x-seat.x,z:table.z-seat.z},d=distance(table,seat);
  // A usable bench faces the table, with enough room for a standing person.
  if(d<1.9||d>2.9||toward.x*front.x+toward.z*front.z<d*.93)return null;
  const point={x:round(seat.x+front.x*.88),z:round(seat.z+front.z*.88)};
  return isWalkable(point.x,point.z,world)?point:null;
}
export function outdoorPlatePosition(world,tableId,seatId){
  const table=diningTable(world,tableId),seat=diningBench(world,seatId);
  if(!outdoorDiningApproach(world,tableId,seatId))return null;
  const dx=seat.x-table.x,dz=seat.z-table.z,d=Math.hypot(dx,dz)||1;
  return {x:table.x+dx/d*.32,y:.34,z:table.z+dz/d*.32};
}
export function chooseOutdoorDining(world,from,excluded=[],onlyTableId=null){
  const origin=from&&{x:from.x,z:from.z};
  const fridge=furnitureActionApproach(world,'fridge');
  if(!origin||!fridge||!findPath(origin,fridge,world))return null;
  const taken=new Set(excluded);
  let best=null;
  for(const table of world?.outdoors?.features||[]){
    if(table.itemId!=='garden.table'||(onlyTableId&&table.instanceId!==onlyTableId))continue;
    for(const bench of world?.outdoors?.features||[]){
      if(bench.itemId!=='garden.bench'||taken.has(bench.instanceId))continue;
      const point=outdoorDiningApproach(world,table.instanceId,bench.instanceId);
      if(!point||!findPath(fridge,point,world))continue;
      const cost=distance(fridge,point)+distance(origin,fridge);
      if(!best||cost<best.cost-1e-6)
        best={tableId:table.instanceId,instanceId:bench.instanceId,point,cost};
    }
  }
  return best;
}
