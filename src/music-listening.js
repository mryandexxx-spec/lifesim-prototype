/** H2 hotfix: find a real, reachable listening position around a purchased
 * music centre. Renderer independent; never fabricate arrival by teleporting.
 * A blocked front is allowed when another side can be reached.
 */
import {resolveActionFurniture,rotateLocal} from './furniture-catalog.js';
import {findPath,isWalkable} from './navigation.js';

// A music console is 0.92 x 0.52m. Leave > actor radius 0.26m
// between each candidate and its cabinet wall.
export const MUSIC_LOCAL_SPOTS=Object.freeze([
  Object.freeze({x:0,z:.84}),
  Object.freeze({x:0,z:-.84}),
  Object.freeze({x:.88,z:0}),
  Object.freeze({x:-.88,z:0})
]);
export function musicListeningSpots(world,instanceId){
  const station=resolveActionFurniture(world,'music',instanceId);
  if(!station)return [];
  return MUSIC_LOCAL_SPOTS.map(local=>{
    const offset=rotateLocal(local.x,local.z,station.yaw);
    return {x:station.x+offset.x,z:station.z+offset.z};
  }).filter(spot=>isWalkable(spot.x,spot.z,world));
}
export function validMusicListeningSpot(world,instanceId,point){
  if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.z))return false;
  return musicListeningSpots(world,instanceId).some(spot=>
    Math.hypot(spot.x-point.x,spot.z-point.z)<.025);
}
/** Try nearest first; only a real A* path authorizes a planned listening spot.
 * Returns path to reuse at dispatch, eliminating a second route computation.
 */
export function chooseMusicListeningSpot(world,from,instanceId){
  if(!from||!Number.isFinite(from.x)||!Number.isFinite(from.z))return null;
  const spots=musicListeningSpots(world,instanceId)
    .map((point,index)=>({point,index,
      distance:Math.hypot(point.x-from.x,point.z-from.z)}))
    .sort((a,b)=>a.distance-b.distance||a.index-b.index);
  for(const {point} of spots){
    const path=findPath(from,point,world);
    if(path!==null)return {point,path};
  }
  return null;
}
