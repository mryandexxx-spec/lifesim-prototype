/** F4F — physical dining plan, independent of PlayCanvas and UI.
 * A purchased table needs a purchased, front-facing chair and reachable
 * fridge -> chair path. The same chair is reserved while the meal runs.
 */
import {rotateLocal,resolveActionFurniture,furnitureActionApproach,
  FURNITURE_CATALOG,instanceRect,furnitureObstacles} from './furniture-catalog.js';
import {findPath,nearestWalkable,isWalkable,ROOM} from './navigation.js';

const instances=world=>world?.furniture?.instances??world?.instances??[];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const clamp01=n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0));
const ease=t=>{const u=clamp01(t);return u*u*(3-2*u);};
const overlap=(a,b)=>Math.max(0,Math.min(a.maxX,b.maxX)-Math.max(a.minX,b.minX))*
  Math.max(0,Math.min(a.maxZ,b.maxZ)-Math.max(a.minZ,b.minZ));
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
  if(depth<1.05||depth>2.65||facing<.78)return false;
  const side=Math.abs(to.x*(front.z-center.z)-to.z*(front.x-center.x));
  return side<1.15;
}
/** The diner approaches a tucked chair from a free SIDE, not through the
 * tabletop. Far chairs may still use the old walkable frontal approach.
 * side is deterministic for an unchanged world and drives the matching pose.
 */
export function diningSeatApproach(world,tableId,seatId){
  if(!diningSeatMatches(world,tableId,seatId))return null;
  const table=resolveActionFurniture(world,'dining',tableId);
  const seat=resolveActionFurniture(world,'seat',seatId);
  const fridge=furnitureActionApproach(world,'fridge');
  if(!fridge)return null;
  const candidates=[];
  if(distance(table,seat)>1.75){
    const front=furnitureActionApproach(world,'seat',seatId);
    if(front)candidates.push({...front,side:0});
  }
  for(const side of [-1,1])
    candidates.push({...worldPoint(seat,side*.99,.49),side});
  let best=null;
  for(const point of candidates){
    if(!isWalkable(point.x,point.z,world))continue;
    const route=findPath(fridge,point,world);
    if(!route)continue;
    const cost=route.reduce((sum,p,i)=>
      sum+(i?distance(route[i-1],p):distance(fridge,p)),0);
    if(!best||cost<best.cost-1e-6)best={...point,cost};
  }
  return best&&{x:best.x,z:best.z,side:best.side};
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
    const point=diningSeatApproach(world,tableId,seat.instanceId);
    if(!point)continue;
    const cost=distance(fridge,point)+distance(origin,fridge);
    if(!best||cost<best.cost)best={instanceId:seat.instanceId,point,cost};
  }
  return best;
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
/** Allow <=18cm of tabletop/chair edging only for front-facing pairs.
 * All unrelated furniture collisions remain under the old strict rule.
 */
export function isPermittedDiningTuck(world,one,two){
  const a=instances(world).find(x=>x.instanceId===one);
  const b=instances(world).find(x=>x.instanceId===two);
  const chair=a?.prefabId==='chair'?a:b?.prefabId==='chair'?b:null;
  const table=a?.prefabId==='diningtable'?a:b?.prefabId==='diningtable'?b:null;
  if(!chair||!table||!diningSeatMatches(world,table.instanceId,chair.instanceId))return false;
  const x=instanceRect(chair,FURNITURE_CATALOG.chair.footprint);
  const z=instanceRect(table,FURNITURE_CATALOG.diningtable.footprint);
  const dx=Math.max(0,Math.min(x.maxX,z.maxX)-Math.max(x.minX,z.minX));
  const dz=Math.max(0,Math.min(x.maxZ,z.maxZ)-Math.max(x.minZ,z.minZ));
  return dx>0&&dz>0&&Math.min(dx,dz)<=.18+1e-6;
}
/** Per-session visual displacement can never slide through other objects.
 * Does not change the physical/nav footprint or v1 save coordinates.
 */
export function diningChairPullLimit(world,tableId,seatId){
  if(!diningSeatMatches(world,tableId,seatId))return 0;
  const seat=resolveActionFurniture(world,'seat',seatId);
  const others=furnitureObstacles(world).filter(x=>
    x.instanceId!==seatId&&x.instanceId!==tableId);
  let allowed=0;
  for(const shift of [.05,.10,.15,.20,.25,.30]){
    const d=rotateLocal(0,shift,seat.yaw);
    const moved=instanceRect({...seat,x:seat.x+d.x,z:seat.z+d.z},
      FURNITURE_CATALOG.chair.footprint);
    if(moved.minX<ROOM.minX||moved.maxX>ROOM.maxX||
       moved.minZ<ROOM.minZ||moved.maxZ>ROOM.maxZ||
       others.some(box=>overlap(moved,box)>.025))break;
    allowed=shift;
  }
  return allowed;
}
/** Pull back, sit, then glide back toward the table; reverse to stand. */
export function diningChairPullOffset(progress,maxPull=.30){
  const p=clamp01(progress),max=Math.max(0,Math.min(.30,Number(maxPull)||0));
  return p<=.45?max*ease(p/.45):
    max*(1-.72*ease((p-.45)/.55));
}
export const DINING_TAKE_MINUTES=6;
export const DINING_EAT_MINUTES=31;
