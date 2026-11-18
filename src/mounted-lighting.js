/** Comfort C3: deterministic mounted lighting, independent of rendering and UI.
 * The visible game/shop adapter must only expose fixtures after the whole
 * wall/ceiling placement, refund and editing lifecycle is integrated.
 */
import {constructionRooms,constructionWallSegments,constructionOpeningEdgeIds,
  BUILD_STEP,constructionContains} from './construction.js';
import {sampleWorldLighting} from './day-night-cycle.js';
import {BUILD_WALL_HEIGHTS} from './exterior-construction.js';

export const MOUNTED_LIGHTS=Object.freeze({
  'sconce.halo':Object.freeze({itemId:'sconce.halo',prefabId:'walllight',modelKey:'walllight.halo',mount:'wall',price:185,radius:3,name:'Бра «Ореол»'}),
  'sconce.leaf':Object.freeze({itemId:'sconce.leaf',prefabId:'walllight',modelKey:'walllight.leaf',mount:'wall',price:215,radius:3,name:'Бра «Лист»'}),
  'ceiling.globe':Object.freeze({itemId:'ceiling.globe',prefabId:'ceilinglight',modelKey:'ceilinglight.globe',mount:'ceiling',price:340,radius:4,name:'Плафон «Сфера»'}),
  'ceiling.ring':Object.freeze({itemId:'ceiling.ring',prefabId:'ceilinglight',modelKey:'ceilinglight.ring',mount:'ceiling',price:430,radius:4,name:'Люстра «Кольцо»'})
});
export const LIGHT_MODES=Object.freeze(['auto','on','off']);
const valid=n=>typeof n==='number'&&Number.isFinite(n);
const cell=(x,z)=>Math.floor(x/BUILD_STEP)+','+Math.floor(z/BUILD_STEP);
const roomCache=new WeakMap();
function roomsFor(world){
  if(!roomCache.has(world))roomCache.set(world,constructionRooms(world));
  return roomCache.get(world);
}
/** Canonical topology membership: wall barriers, not Euclidean distance. */
export function lightingRoomAt(construction,x,z){
  if(!valid(x)||!valid(z)||!construction||!constructionContains(construction,x,z))return null;
  const key=cell(x,z);
  return roomsFor(construction).find(r=>r.cells.includes(key))?.id??null;
}
/** Position and identity derive from an actual saved structural segment.
 * side +/-1 disambiguates the two sides of a shared internal wall.
 */
export function lightingMountPose(construction,productId,anchor){
  const sku=MOUNTED_LIGHTS[productId];
  if(!sku||!construction||!anchor)return null;
  if(sku.mount==='ceiling'){
    if(!valid(anchor.x)||!valid(anchor.z)||!constructionContains(construction,anchor.x,anchor.z))return null;
    const room=lightingRoomAt(construction,anchor.x,anchor.z);
    if(room===null)return null;
    const height=BUILD_WALL_HEIGHTS[construction.wallHeightClass]?.value||2.9;
    return {x:anchor.x,y:height-.12,z:anchor.z,yaw:0,roomId:room};
  }
  if(typeof anchor.edgeId!=='string'||![1,-1].includes(anchor.side))return null;
  const w=constructionWallSegments(construction).find(w=>w.id===anchor.edgeId);
  if(!w)return null;
  if(constructionOpeningEdgeIds(construction).has(w.id))return null;
  const t=valid(anchor.t)?anchor.t:.5;
  if(t<.15||t>.85)return null;
  const shift=anchor.side*.16;
  const x=w.axis==='v'?w.i*BUILD_STEP+shift:(w.i+t)*BUILD_STEP;
  const z=w.axis==='h'?w.j*BUILD_STEP+shift:(w.j+t)*BUILD_STEP;
  const room=lightingRoomAt(construction,x,z);
  if(room===null)return null;
  const height=BUILD_WALL_HEIGHTS[construction.wallHeightClass]?.value||2.9;
  return {x,y:Math.max(1.5,height-.60),z,yaw:w.axis==='v'?(anchor.side>0?90:270):(anchor.side>0?180:0),roomId:room};
}
/** A touch on the room floor picks a real nearby wall segment or room ceiling.
 * Never create floating mounts where there is no physical supporting surface.
 */
export function mountedAnchorAt(construction,productId,x,z){
  const sku=MOUNTED_LIGHTS[productId];
  if(!sku||!valid(x)||!valid(z)||!constructionContains(construction,x,z))return null;
  if(sku.mount==='ceiling')return {x,z};
  const candidates=[];
  const openings=constructionOpeningEdgeIds(construction);
  for(const wall of constructionWallSegments(construction)){
    if(openings.has(wall.id))continue;
    const along=wall.axis==='v'?z:x;
    const base=(wall.axis==='v'?wall.j:wall.i)*BUILD_STEP;
    const t=(along-base)/BUILD_STEP;
    if(t<.15||t>.85)continue;
    const signed=wall.axis==='v'?x-wall.i*BUILD_STEP:z-wall.j*BUILD_STEP;
    if(Math.abs(signed)>.95||Math.abs(signed)<.10)continue;
    const side=signed>0?1:-1;
    const mount={edgeId:wall.id,side,t};
    const result=lightingMountPose(construction,productId,mount);
    if(result)candidates.push({mount,distance:Math.abs(signed)});
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  return candidates[0]?.mount||null;
}
export function validMountedFixture(construction,fixture){
  if(!fixture||!MOUNTED_LIGHTS[fixture.itemDefinitionId])return false;
  const pose=lightingMountPose(construction,fixture.itemDefinitionId,fixture.mount);
  return !!pose&&Math.hypot(pose.x-fixture.x,pose.z-fixture.z)<.21;
}
export function mountedLightIsOn({fixture,construction,calendar,minutes,residents=[],previous=false}){
  if(!fixture||fixture.location!=='home'||!MOUNTED_LIGHTS[fixture.itemDefinitionId])return false;
  const mode=LIGHT_MODES.includes(fixture.lightMode)?fixture.lightMode:'auto';
  if(mode==='off')return false;
  if(!validMountedFixture(construction,fixture))return false;
  if(mode==='on')return true;
  const day=sampleWorldLighting(calendar,minutes);
  // Simple hysteresis prevents strobing when the sampled time straddles dusk.
  if(day.normalizedDaylight>(previous?.29:.24))return false;
  const pose=lightingMountPose(construction,fixture.itemDefinitionId,fixture.mount);
  const max=MOUNTED_LIGHTS[fixture.itemDefinitionId].radius;
  return residents.some(person=>person&&person.home!==false&&!person.away&&
    valid(person.x)&&valid(person.z)&&
    lightingRoomAt(construction,person.x,person.z)===pose.roomId&&
    Math.hypot(person.x-pose.x,person.z-pose.z)<=max);
}
export function setMountedLightMode(world,id,mode){
  if(!LIGHT_MODES.includes(mode))return {ok:false,reason:'invalid-light-mode'};
  const item=world?.instances?.find(x=>x.instanceId===id&&MOUNTED_LIGHTS[x.itemDefinitionId]);
  if(!item)return {ok:false,reason:'missing-mounted-light'};
  return {ok:true,world:{...world,revision:(world.revision||0)+1,
    instances:world.instances.map(x=>x===item?{...x,lightMode:mode}:x)}};
}
/** Refuse destructive construction edits rather than erase paid fixtures. */
export function mountedFixturesSurviveEdit(before,after,furniture){
  for(const item of furniture?.instances||[]){
    if(item.location!=='home'||!MOUNTED_LIGHTS[item.itemDefinitionId])continue;
    const original=lightingMountPose(before,item.itemDefinitionId,item.mount);
    const next=lightingMountPose(after,item.itemDefinitionId,item.mount);
    if(!original||!next||Math.hypot(original.x-next.x,original.z-next.z)>.02||
      original.roomId!==next.roomId)
      return {ok:false,reason:'mounted-light-blocks-construction',instanceId:item.instanceId};
  }
  return {ok:true};
}

/** Shared shadow-free lighting budget. Closest occupied zones win; manual
 * switches remain saved and never mutate merely because GPU budget is full.
 */
export function prioritizeVisibleLights(lights,residents=[],limit=5){
  const present=residents.filter(r=>r&&!r.away&&r.home!==false&&
    valid(r.x)&&valid(r.z));
  return lights.filter(l=>l?.on&&typeof l.instanceId==='string'&&
      valid(l.x)&&valid(l.z))
    .map((l,i)=>({id:l.instanceId,i,d:present.length
      ?Math.min(...present.map(r=>Math.hypot(r.x-l.x,r.z-l.z))):Infinity}))
    .sort((a,b)=>a.d-b.d||a.i-b.i)
    .slice(0,Math.max(0,Math.min(5,Math.floor(limit))))
    .map(l=>l.id);
}
