/** F4D — reusable physical seating contract for purchased chairs and armchairs.
 * Scene meshes, SKU and household v1 stay independent. No PlayCanvas dependency.
 * Front of the chair is local -Z, like the original sofa. Both mesh and
 * procedural animation share one route, seat pose and occupied instance ID.
 */
import {SOFA_APPROACH,SOFA_POSE} from './pose-config.js';
import {furniturePose,furniturePoint,furnitureInstance} from './furniture-transform.js';
import {rotateLocal} from './furniture-catalog.js';
import {diningChairPullOffset} from './dining.js';
import {createSeatSurface,seatSlot} from './interaction-anchors.js';

export const PURCHASED_SEAT_PROFILES=Object.freeze({
  chair:Object.freeze({approachZ:-1.03,seatZ:-.04,seatHeight:.615,
    rootLift:.265,width:.76,depth:.73}),
  armchair:Object.freeze({approachZ:-1.22,seatZ:-.08,seatHeight:.63,
    rootLift:.28,width:.96,depth:.95})
});
const clamp01=n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0));
export function purchasedSeatPrefab(world,instanceId){
  const list=world?.furniture?.instances||world?.instances||[];
  const item=list.find(x=>x.instanceId===instanceId&&x.location==='home');
  return item&&Object.hasOwn(PURCHASED_SEAT_PROFILES,item.prefabId)
    ?item.prefabId:null;
}
export function purchasedSeatPose(world,instanceId,sofaMotion){
  const prefabId=purchasedSeatPrefab(world,instanceId);
  const profile=PURCHASED_SEAT_PROFILES[prefabId];
  if(!profile||!sofaMotion||!Number.isFinite(sofaMotion.z))return null;
  // Reuse the tested reversible sit/stand time curve. Only the furniture
  // contact markers change — no additional hardcoded character animation.
  const t=clamp01((sofaMotion.z-SOFA_APPROACH.z)/(SOFA_POSE.z-SOFA_APPROACH.z));
  return furniturePose(world,prefabId,{
    ...sofaMotion,x:0,
    z:profile.approachZ+(profile.seatZ-profile.approachZ)*t,
    y:sofaMotion.y+profile.rootLift*t
  },instanceId);
}
export function purchasedSeatSurface(world,instanceId){
  const prefabId=purchasedSeatPrefab(world,instanceId);
  const profile=PURCHASED_SEAT_PROFILES[prefabId];
  if(!profile)return null;
  const center=furniturePoint(world,prefabId,{x:0,z:profile.seatZ},instanceId);
  const item=furnitureInstance(world,prefabId,instanceId);
  if(!center||!item)return null;
  return seatSlot(createSeatSurface({
    id:instanceId,origin:{x:center.x,y:0,z:center.z},
    yaw:180-item.yaw,width:profile.width,depth:profile.depth,
    seatHeight:profile.seatHeight,floorY:0,
    slots:1,sideMargin:.17,backClearance:.12,approachGap:.45
  }),0);
}

/** F4F.1: a diner passes around the side of a tucked chair, draws it back,
 * sits and pushes in. No imported clip or saved furniture translation.
 * Other ordinary seat actions retain their original pose and contact.
 */
export function purchasedDiningSeatPose(world,instanceId,sofaMotion,
  progress,side=0,maxPull=0){
  if(!purchasedSeatPrefab(world,instanceId)||!sofaMotion)return null;
  const profile=PURCHASED_SEAT_PROFILES.chair;
  const p=clamp01(progress);
  const shift=diningChairPullOffset(p,maxPull);
  if(!side){
    const base=purchasedSeatPose(world,instanceId,sofaMotion);
    const item=furnitureInstance(world,'chair',instanceId);
    const delta=rotateLocal(0,shift,item.yaw);
    return base&&{...base,x:base.x+delta.x,z:base.z+delta.z};
  }
  const ease=v=>{const q=clamp01(v);return q*q*(3-2*q);};
  const slide=ease((p-.18)/.77);
  const yawTurn=ease((p-.20)/.60);
  const startYaw=-90*side;
  return furniturePose(world,'chair',{
    x:side*.99*(1-slide),
    z:.49+(profile.seatZ-.49)*slide+shift,
    y:sofaMotion.y+profile.rootLift*slide,
    pitch:0,yaw:startYaw+(180-startYaw)*yawTurn,
    sofaWeight:sofaMotion.sofaWeight
  },instanceId);
}
/** Meshy skinned butt contact follows the same transient chair translation. */
export function purchasedDiningSeatSurface(world,instanceId,shift){
  const seat=purchasedSeatSurface(world,instanceId);
  const item=furnitureInstance(world,'chair',instanceId);
  if(!seat||!item)return seat;
  const delta=rotateLocal(0,shift,item.yaw);
  const move=v=>Object.freeze({...v,x:v.x+delta.x,z:v.z+delta.z});
  return Object.freeze({...seat,contact:move(seat.contact),
    front:move(seat.front),approach:move(seat.approach)});
}
