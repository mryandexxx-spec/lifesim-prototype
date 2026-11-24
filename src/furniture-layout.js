/** F0 headless placement transaction; F1 UI will call this after safe preview. */
import {FURNITURE_CATALOG,instanceRect,restoreFurnitureWorld,
  furnitureObstacles,furnitureActionApproach} from './furniture-catalog.js';
import {ROOM,isWalkable,findPath} from './navigation.js';
import {constructionContains} from './construction.js';
import {BED_SLOTS} from './bed-layout.js';
import {furniturePoint} from './furniture-transform.js';
import {musicListeningSpots,chooseMusicListeningSpot} from './music-listening.js';
import {diningSeatMatches,diningSeatApproach,isPermittedDiningTuck} from './dining.js';
import {MOUNTED_LIGHTS,mountedAnchorAt,lightingMountPose} from './mounted-lighting.js';

import {isWindowPanel,quoteWindowMount} from './window-mount.js';

const validPose=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&[0,90,180,270].includes(p.yaw);
const overlap=(a,b)=>Math.max(0,Math.min(a.maxX,b.maxX)-Math.max(a.minX,b.minX))*
  Math.max(0,Math.min(a.maxZ,b.maxZ)-Math.max(a.minZ,b.minZ));
/** Atomic and nonmutating. Busy/queued resources are supplied by the caller. */
export function proposeFurnitureMove(world,instanceId,pose,{lockedInstanceIds=[],residents=[],construction=null,outdoors=null}={}){
  const source=world?.furniture?.instances?world.furniture:world;
  if(!source||!Array.isArray(source.instances)||!validPose(pose))
    return {ok:false,reason:'invalid-pose'};
  const index=source.instances.findIndex(i=>i.instanceId===instanceId&&i.location==='home');
  if(index<0)return {ok:false,reason:'missing-instance'};
  if(lockedInstanceIds.includes(instanceId))return {ok:false,reason:'reserved'};
  const original=source.instances[index];
  if(isWindowPanel(original.itemDefinitionId)){
    const q=quoteWindowMount(construction,source,original.itemDefinitionId,pose,instanceId);
    if(!q.ok)return q;
    return {ok:true,world:restoreFurnitureWorld({...source,revision:source.revision+1,
      instances:source.instances.map((x,i)=>i===index?{...x,mount:q.mount,
        x:q.pose.x,z:q.pose.z,yaw:q.pose.yaw}:x)})};
  }
  if(MOUNTED_LIGHTS[original.itemDefinitionId]){
    const mount=mountedAnchorAt(construction,original.itemDefinitionId,pose.x,pose.z);
    const lightPose=mount&&lightingMountPose(construction,original.itemDefinitionId,mount);
    if(!lightPose)return {ok:false,reason:'missing-light-mount'};
    if(source.instances.some(x=>x.instanceId!==instanceId&&x.location==='home'&&
      MOUNTED_LIGHTS[x.itemDefinitionId]&&
      Math.hypot(x.x-lightPose.x,x.z-lightPose.z)<.55))
      return {ok:false,reason:'light-mount-occupied'};
    return {ok:true,world:restoreFurnitureWorld({...source,revision:source.revision+1,
      instances:source.instances.map((x,i)=>i===index?{...x,mount,
        x:lightPose.x,z:lightPose.z,yaw:lightPose.yaw}:x)})};
  }
  const candidate=restoreFurnitureWorld({...source,revision:source.revision+1,
    instances:source.instances.map((item,i)=>i===index
      ?{...item,x:pose.x,z:pose.z,yaw:pose.yaw}:item)});
  if(candidate.instances[index]?.x!==pose.x||
    candidate.instances[index]?.z!==pose.z||
    candidate.instances[index]?.yaw!==pose.yaw)return {ok:false,reason:'invalid-pose'};
  const target=candidate.instances[index];
  const nav=construction?{furniture:candidate,construction,...(outdoors?{outdoors}:{})}:candidate;
  const boxes=furnitureObstacles(candidate);
  const mine=boxes.filter(box=>box.instanceId===instanceId);
  // Existing original shower/tables can have tiny legacy wall/footprint overlaps.
  for(const b of mine){
    if(construction?.legacy===false
      ?![[b.minX+.06,b.minZ+.06],[b.maxX-.06,b.minZ+.06],
          [b.minX+.06,b.maxZ-.06],[b.maxX-.06,b.maxZ-.06]].every(([x,z])=>constructionContains(construction,x,z))
      :(b.minX<ROOM.minX-.05||b.maxX>ROOM.maxX+.05||
      b.minZ<ROOM.minZ-.05||b.maxZ>ROOM.maxZ+.05))
      return {ok:false,reason:'room-bounds'};
    if(boxes.some(other=>other.instanceId!==instanceId&&overlap(b,other)>.025&&
      !isPermittedDiningTuck(candidate,b.instanceId,other.instanceId)))
      return {ok:false,reason:'collision'};
  }
  // Unlike H2 1.2u, a green shop preview cannot knowingly place a music
  // station against every wall/obstacle with no walkable listening side.
  if(target.prefabId==='music'&&!musicListeningSpots(candidate,instanceId).length)
    return {ok:false,reason:'unreachable-music'};
  // A chair tucked into a dining table is reached from its walkable side.
  // Other seating and all utility furniture preserve their ordinary front slot.
  const diningTables=target.prefabId==='chair'
    ?candidate.instances.filter(table=>table.prefabId==='diningtable'&&
      table.location==='home'&&diningSeatMatches(candidate,table.instanceId,instanceId))
    :[];
  const diningPoint=diningTables.length
    ?diningTables.map(t=>diningSeatApproach(nav,t.instanceId,instanceId))
      .find(Boolean)||null:null;
  const targetApproach=diningTables.length?diningPoint:
    furnitureActionApproach(candidate,FURNITURE_CATALOG[target.prefabId].actionId,instanceId);
  // Moving a table must not create an overlapping dining pair with no side access.
  // Standalone tables and non-overlapping chairs retain their existing placement rules.
  const tuckedSeats=target.prefabId==='diningtable'
    ?candidate.instances.filter(chair=>chair.location==='home'&&chair.prefabId==='chair'&&
      isPermittedDiningTuck(candidate,instanceId,chair.instanceId))
      .map(chair=>diningSeatApproach(nav,instanceId,chair.instanceId))
    :[];
  if(tuckedSeats.some(point=>!point))return {ok:false,reason:'unreachable-seat'};
  // Sitting needs a real clear interaction slot, not just a renderable mesh.
  if(['chair','armchair','floorlamp','mirror','dresser','wardrobe'].includes(target.prefabId)){
    const approach=targetApproach;
    if(!approach||!isWalkable(approach.x,approach.z,nav))
      return {ok:false,reason:'unreachable-seat'};
  }
  for(const person of residents){
    if(!person||!Number.isFinite(person.x)||!Number.isFinite(person.z))continue;
    if(!isWalkable(person.x,person.z,nav))return {ok:false,reason:'resident-blocked'};
    // A purchased hobby station must keep a reachable real interaction slot.
    if(target.prefabId==='bookcase'){
      const reading=furnitureActionApproach(candidate,'hobby',instanceId);
      if(!reading||!findPath(person,reading,nav))
        return {ok:false,reason:'unreachable-bookcase'};
    }
    if(target.prefabId==='music'&&!chooseMusicListeningSpot(candidate,person,instanceId))
      return {ok:false,reason:'unreachable-music'};
    if(['chair','armchair','floorlamp','mirror','dresser','wardrobe'].includes(target.prefabId)){
      const sitting=targetApproach;
      if(!sitting||!findPath(person,sitting,nav))
        return {ok:false,reason:'unreachable-seat'};
    }
    if(tuckedSeats.some(point=>!findPath(person,point,nav)))
      return {ok:false,reason:'unreachable-seat'};
    // A moved television must retain a real approach to its own screen.
    if(target.prefabId==='tv'){
      const watching=furnitureActionApproach(candidate,'tv',instanceId);
      if(!watching||!findPath(person,watching,nav))
        return {ok:false,reason:'unreachable-tv'};
    }
    // Either sleeping side must remain reachable for essential self-care.
    if(!Object.values(BED_SLOTS).some(slot=>construction
      ?findPath(person,furniturePoint(candidate,'bed',slot.approach),nav)
      :findPath(person,furniturePoint(candidate,'bed',slot.approach),candidate)))
      return {ok:false,reason:'unreachable-bed'};
    for(const action of ['fridge','shower','toilet','sofa']){
      const goal=furnitureActionApproach(candidate,action);
      if(goal&&!findPath(person,goal,nav))
        return {ok:false,reason:'unreachable-'+action};
    }
  }
  return {ok:true,world:candidate};
}
