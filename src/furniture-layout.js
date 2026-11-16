/** F0 headless placement transaction; F1 UI will call this after safe preview. */
import {FURNITURE_CATALOG,instanceRect,restoreFurnitureWorld,
  furnitureObstacles,furnitureActionApproach} from './furniture-catalog.js';
import {ROOM,isWalkable,findPath} from './navigation.js';
import {BED_SLOTS} from './bed-layout.js';
import {furniturePoint} from './furniture-transform.js';

const validPose=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&[0,90,180,270].includes(p.yaw);
const overlap=(a,b)=>Math.max(0,Math.min(a.maxX,b.maxX)-Math.max(a.minX,b.minX))*
  Math.max(0,Math.min(a.maxZ,b.maxZ)-Math.max(a.minZ,b.minZ));
/** Atomic and nonmutating. Busy/queued resources are supplied by the caller. */
export function proposeFurnitureMove(world,instanceId,pose,{lockedInstanceIds=[],residents=[]}={}){
  const source=world?.furniture?.instances?world.furniture:world;
  if(!source||!Array.isArray(source.instances)||!validPose(pose))
    return {ok:false,reason:'invalid-pose'};
  const index=source.instances.findIndex(i=>i.instanceId===instanceId&&i.location==='home');
  if(index<0)return {ok:false,reason:'missing-instance'};
  if(lockedInstanceIds.includes(instanceId))return {ok:false,reason:'reserved'};
  const candidate=restoreFurnitureWorld({...source,revision:source.revision+1,
    instances:source.instances.map((item,i)=>i===index
      ?{...item,x:pose.x,z:pose.z,yaw:pose.yaw}:item)});
  if(candidate.instances[index]?.x!==pose.x||
    candidate.instances[index]?.z!==pose.z||
    candidate.instances[index]?.yaw!==pose.yaw)return {ok:false,reason:'invalid-pose'};
  const target=candidate.instances[index];
  const boxes=furnitureObstacles(candidate);
  const mine=boxes.filter(box=>box.instanceId===instanceId);
  // Existing original shower/tables can have tiny legacy wall/footprint overlaps.
  for(const b of mine){
    if(b.minX<ROOM.minX-.05||b.maxX>ROOM.maxX+.05||
      b.minZ<ROOM.minZ-.05||b.maxZ>ROOM.maxZ+.05)
      return {ok:false,reason:'room-bounds'};
    if(boxes.some(other=>other.instanceId!==instanceId&&overlap(b,other)>.025))
      return {ok:false,reason:'collision'};
  }
  for(const person of residents){
    if(!person||!Number.isFinite(person.x)||!Number.isFinite(person.z))continue;
    if(!isWalkable(person.x,person.z,candidate))return {ok:false,reason:'resident-blocked'};
    // A purchased hobby station must keep a reachable real interaction slot.
    if(target.prefabId==='bookcase'){
      const reading=furnitureActionApproach(candidate,'hobby',instanceId);
      if(!reading||!findPath(person,reading,candidate))
        return {ok:false,reason:'unreachable-bookcase'};
    }
    // A moved television must retain a real approach to its own screen.
    if(target.prefabId==='tv'){
      const watching=furnitureActionApproach(candidate,'tv',instanceId);
      if(!watching||!findPath(person,watching,candidate))
        return {ok:false,reason:'unreachable-tv'};
    }
    // Either sleeping side must remain reachable for essential self-care.
    if(!Object.values(BED_SLOTS).some(slot=>
      findPath(person,furniturePoint(candidate,'bed',slot.approach),candidate)))
      return {ok:false,reason:'unreachable-bed'};
    for(const action of ['fridge','shower','toilet','sofa']){
      const goal=furnitureActionApproach(candidate,action);
      if(goal&&!findPath(person,goal,candidate))
        return {ok:false,reason:'unreachable-'+action};
    }
  }
  return {ok:true,world:candidate};
}
