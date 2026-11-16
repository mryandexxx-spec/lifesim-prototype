/** F4F — physical dining plan, independent of PlayCanvas and UI.
 * A purchased table needs a purchased, front-facing chair and reachable
 * fridge -> chair path. The same chair is reserved while the meal runs.
 */
import {rotateLocal,resolveActionFurniture,furnitureActionApproach} from './furniture-catalog.js';
import {findPath,nearestWalkable} from './navigation.js';

const instances=world=>world?.furniture?.instances??world?.instances??[];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const worldPoint=(item,x,z)=>{
  const q=rotateLocal(x,z,item.yaw);
  return {x:item.x+q.x,z:item.z+q.z};
};
export function diningSeatMatches(world,tableId,seatId){
  const table=resolveActionFurniture(world,'dining',tableId);
  const seat=resolveActionFurniture(world,'seat',seatId);
  if(!table||!seat||seat.prefabId!=='chair')return false;
  // Front of all existing chairs is their local -Z. The diner must face
  // the tabletop, not sit on the other side of the backrest.
  const center=worldPoint(seat,0,0);
  const front=worldPoint(seat,0,-1);
  const to={x:table.x-center.x,z:table.z-center.z};
  const depth=Math.hypot(to.x,to.z);
  const facing=(to.x*(front.x-center.x)+to.z*(front.z-center.z))/Math.max(.01,depth);
  if(depth<1.35||depth>2.65||facing<.68)return false;
  const side=Math.abs(to.x*(front.z-center.z)-to.z*(front.x-center.x));
  return side<1.15;
}
export function chooseDiningSeat(world,from,tableId,excluded=[]){
  const fridge=furnitureActionApproach(world,'fridge');
  const origin=from&&nearestWalkable(from,world);
  if(!fridge||!origin||!findPath(origin,fridge,world))return null;
  const taken=new Set(excluded);
  let best=null;
  for(const seat of instances(world)){
    if(seat.prefabId!=='chair'||seat.location!=='home'||taken.has(seat.instanceId)||
       !diningSeatMatches(world,tableId,seat.instanceId))continue;
    const point=furnitureActionApproach(world,'seat',seat.instanceId);
    if(!point||!findPath(fridge,point,world))continue;
    const cost=distance(fridge,point)+distance(origin,fridge);
    if(!best||cost<best.cost)best={instanceId:seat.instanceId,point,cost};
  }
  return best;
}
export function diningSeatApproach(world,tableId,seatId){
  if(!diningSeatMatches(world,tableId,seatId))return null;
  const point=furnitureActionApproach(world,'seat',seatId);
  const fridge=furnitureActionApproach(world,'fridge');
  return point&&fridge&&findPath(fridge,point,world)?point:null;
}
export function diningPlatePosition(world,tableId,seatId){
  if(!diningSeatMatches(world,tableId,seatId))return null;
  const table=resolveActionFurniture(world,'dining',tableId);
  const chair=resolveActionFurniture(world,'seat',seatId);
  if(!table||!chair)return null;
  const dir={x:chair.x-table.x,z:chair.z-table.z};
  const d=Math.hypot(dir.x,dir.z)||1;
  return {x:table.x+dir.x/d*.49,y:.79,z:table.z+dir.z/d*.49};
}
export const DINING_TAKE_MINUTES=6;
export const DINING_EAT_MINUTES=31;
