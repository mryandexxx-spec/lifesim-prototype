/** F1b: single source of world-space transforms for an authored furnishing.
 * Authoring constants, animation timelines and Meshy rigs remain pure "base
 * pose" data. This adapter applies instance translation/quarter-turn exactly
 * once at the boundary shared by renderer, nav, contact targets and picking.
 */
import {ORIGINAL_FURNITURE,FURNITURE_TEMPLATES,rotateLocal} from './furniture-catalog.js';
const origins=new Map([...ORIGINAL_FURNITURE,...FURNITURE_TEMPLATES]
  .map(i=>[i.prefabId,i]));
function data(world){return world?.furniture?.instances?world.furniture:world;}
export function furnitureInstance(world,prefabId,instanceId=null){
  const origin=origins.get(prefabId);
  if(!origin)return null;
  const all=data(world)?.instances;
  if(!Array.isArray(all))return origin;
  return all.find(i=>i.location==='home'&&i.prefabId===prefabId&&
    (instanceId===null||instanceId===i.instanceId))||null;
}
export function fixtureOrigin(prefabId){return origins.get(prefabId)||null;}
export function furniturePoint(world,prefabId,point,instanceId=null){
  if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.z))return null;
  const origin=origins.get(prefabId),item=furnitureInstance(world,prefabId,instanceId);
  if(!origin||!item)return null;
  // Exact legacy identity avoids a one-ulp drift in old v1 bed approach points.
  if(item.x===origin.x&&item.z===origin.z&&item.yaw===0)return {...point};
  const delta=rotateLocal(point.x-origin.x,point.z-origin.z,item.yaw);
  return {...point,x:item.x+delta.x,z:item.z+delta.z};
}
export function furniturePose(world,prefabId,pose,instanceId=null){
  const position=furniturePoint(world,prefabId,pose,instanceId);
  if(!position)return null;
  const item=furnitureInstance(world,prefabId,instanceId);
  const result={...position};
  // PlayCanvas positive Y yaw is opposite world.rotateLocal quarter-turn.
  if(Number.isFinite(pose.yaw))result.yaw=pose.yaw-item.yaw;
  if(Number.isFinite(pose.bedFootYaw))result.bedFootYaw=pose.bedFootYaw-item.yaw;
  if(Array.isArray(pose.bedAnkles))
    result.bedAnkles=pose.bedAnkles.map(p=>furniturePoint(world,prefabId,p,instanceId));
  return result;
}
export function inverseFurniturePose(world,prefabId,pose,instanceId=null){
  if(!pose||!Number.isFinite(pose.x)||!Number.isFinite(pose.z))return null;
  const origin=origins.get(prefabId),item=furnitureInstance(world,prefabId,instanceId);
  if(!origin||!item)return null;
  const delta=rotateLocal(pose.x-item.x,pose.z-item.z,(360-item.yaw)%360);
  const result={...pose,x:origin.x+delta.x,z:origin.z+delta.z};
  if(Number.isFinite(pose.yaw))result.yaw=pose.yaw+item.yaw;
  return result;
}
/** Authoring AABB after grouping and instance quarter-turn, including 3D picking. */
export function furnitureBounds(world,prefabId,original,instanceId=null){
  const cx=(original.min.x+original.max.x)/2;
  const cz=(original.min.z+original.max.z)/2;
  const midpoint=furniturePoint(world,prefabId,{x:cx,z:cz},instanceId);
  const item=furnitureInstance(world,prefabId,instanceId);
  if(!midpoint||!item)return null;
  const hx=(original.max.x-original.min.x)/2;
  const hz=(original.max.z-original.min.z)/2;
  const turns=item.yaw===90||item.yaw===270;
  return {min:{x:midpoint.x-(turns?hz:hx),y:original.min.y,z:midpoint.z-(turns?hx:hz)},
    max:{x:midpoint.x+(turns?hz:hx),y:original.max.y,z:midpoint.z+(turns?hx:hz)}};
}
// A right-hand Meshy reach must follow the actual transformed door/shelf.
export function fixtureContactLayout(world,kind,template){
  const handle=furniturePoint(world,kind,template.handle);
  const shelfTarget=furniturePoint(world,kind,template.shelfTarget);
  return {...template,handle,shelfTarget};
}
