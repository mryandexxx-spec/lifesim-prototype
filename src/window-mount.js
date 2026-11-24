/** PF-07: decorative window panels must have a continuous, real wall mount.
 * No money, renderer or save dependency. Anchor is a half-meter wall segment
 * center and room-facing side; its three consecutive sections cover 1.5 m.
 */
import {BUILD_STEP,constructionWallSegments,constructionOpeningEdgeIds,constructionContains} from './construction.js';
import {BUILD_WALL_HEIGHTS} from './exterior-construction.js';
const ids=new Set(['mesh.green_curtains','mesh.wooden_blinds']);
export const isWindowPanel=id=>ids.has(id);
const finite=Number.isFinite;
const along=w=>w.axis==='h'?w.i:w.j;
const line=w=>w.axis==='h'?w.j:w.i;
const key=(axis,i,j)=>axis+':'+i+','+j;
const physical=w=>key(w.axis,w.i,w.j);
const offsets={north:.16,west:.03,south:-.16,east:.25};
const center=(w)=>(along(w)+.5)*BUILD_STEP;
function wallIndex(world){
  const opened=constructionOpeningEdgeIds(world);
  const walls=constructionWallSegments(world);
  const byId=new Map(walls.map(w=>[w.id,w]));
  const byCell=new Map();
  const unavailable=new Set(walls.filter(w=>opened.has(w.id)).map(physical));
  for(const w of walls)if(!unavailable.has(physical(w))) {
    const k=physical(w);
    if(!byCell.has(k)||w.starterSide)byCell.set(k,w);
  }
  return {byId,byCell};
}
const cache=new WeakMap();
function index(world){
  if(!cache.has(world))cache.set(world,wallIndex(world));
  return cache.get(world);
}
function mountPose(world,id,mount){
  if(!isWindowPanel(id)||!world||!mount||mount.t!==.5||![-1,1].includes(mount.side))return null;
  const {byId,byCell}=index(world),w=byId.get(mount.edgeId);
  if(!w)return null;
  // Reject gaps, wall ends, corners and every structural opening, including
  // a door/window on an adjacent section of the panel's full width.
  for(const d of [-1,0,1]){
    const k=key(w.axis,w.i+(w.axis==='h'?d:0),w.j+(w.axis==='v'?d:0));
    const part=byCell.get(k);
    if(!part||part.starterSide!==w.starterSide)return null;
    const a=(along(w)+d+.5)*BUILD_STEP,normal=line(w)*BUILD_STEP+mount.side*.26;
    if(!constructionContains(world,w.axis==='h'?a:normal,w.axis==='h'?normal:a))return null;
  }
  // Legacy north wall has an authored, non-opening window. Do not cover it.
  if(w.starterSide==='north'&&center(w)+.75>-3.22&&center(w)-.75<-1.14)return null;
  const normal=line(w)*BUILD_STEP+(offsets[w.starterSide]??0)+mount.side*(w.starterSide ? .212 : .202);
  const a=center(w),height=BUILD_WALL_HEIGHTS[world.wallHeightClass]?.value??2.9;
  return {x:w.axis==='v'?normal:a,z:w.axis==='h'?normal:a,
    y:height/2+.20-1.65,yaw:w.axis==='v'?(mount.side>0?90:270):(mount.side>0?180:0),
    axis:w.axis,wallLine:line(w),along:a,starterSide:w.starterSide};
}
export const windowMountPose=mountPose;
function occupied(world,furniture,id,mount,excludeId){
  const pose=mountPose(world,id,mount);
  if(!pose)return false;
  return (furniture?.instances||[]).some(item=>{
    if(item.location!=='home'||item.instanceId===excludeId)return false;
    if(isWindowPanel(item.itemDefinitionId)){
      const other=mountPose(world,item.itemDefinitionId,item.mount);
      return !!other&&other.axis===pose.axis&&other.wallLine===pose.wallLine&&Math.abs(other.along-pose.along)<1.49;
    }
    if(item.prefabId==='walllight'||item.prefabId==='meshwall'){
      const across=pose.axis==='h'?Math.abs(item.z-pose.z):Math.abs(item.x-pose.x);
      const delta=pose.axis==='h'?Math.abs(item.x-pose.x):Math.abs(item.z-pose.z);
      return across<.45&&delta<(item.prefabId==='meshwall'?1.49:1);
    }
    return false;
  });
}
export function quoteWindowMount(world,furniture,id,point,excludeId=null){
  if(!world||!isWindowPanel(id)||!finite(point?.x)||!finite(point?.z))return {ok:false,reason:'missing-window-mount'};
  const candidates=[];
  for(const w of index(world).byCell.values()){
    const a=w.axis==='h'?point.x:point.z,n=w.axis==='h'?point.z:point.x;
    const normal=line(w)*BUILD_STEP+(offsets[w.starterSide]??0);
    if(Math.abs(a-center(w))>.39||Math.abs(n-normal)>.9)continue;
    for(const side of [1,-1]){
      const mount={edgeId:w.id,side,t:.5},pose=mountPose(world,id,mount);
      if(!pose)continue;
      candidates.push({mount,pose,distance:Math.hypot(point.x-pose.x,point.z-pose.z)});
    }
  }
  candidates.sort((a,b)=>a.distance-b.distance||a.mount.edgeId.localeCompare(b.mount.edgeId)||a.mount.side-b.mount.side);
  const best=candidates[0];
  if(!best)return {ok:false,reason:'missing-window-mount'};
  if(occupied(world,furniture,id,best.mount,excludeId))return {ok:false,reason:'window-mount-occupied'};
  return {ok:true,mount:best.mount,pose:best.pose};
}
export function windowPlacementCandidates(world,id){
  if(!world||!isWindowPanel(id))return [];
  const poses=[];
  for(const w of index(world).byCell.values())for(const side of [1,-1]){
    const p=mountPose(world,id,{edgeId:w.id,side,t:.5});
    if(p)poses.push({x:p.x,z:p.z,yaw:p.yaw});
  }
  return poses;
}
export function validateWindowMounts(world,furniture){
  for(const item of furniture?.instances||[]){
    if(item.location!=='home'||!isWindowPanel(item.itemDefinitionId))continue;
    const p=mountPose(world,item.itemDefinitionId,item.mount);
    if(!p||Math.hypot(p.x-item.x,p.z-item.z)>.001||p.yaw!==item.yaw||
      occupied(world,furniture,item.itemDefinitionId,item.mount,item.instanceId))
      return {ok:false,reason:'window-mount-blocks-construction',instanceId:item.instanceId};
  }
  return {ok:true};
}
/** Old purchased panels: nearby valid wall or warehouse, never destroy,
 * refund, charge or allocate a new instance. Stable input order wins ties.
 */
export function migrateWindowMounts(world,furniture){
  const instances=furniture.instances.filter(item=>item.location!=='home'||!isWindowPanel(item.itemDefinitionId));
  const mapped=new Map();
  for(const item of furniture.instances){
    if(item.location!=='home'||!isWindowPanel(item.itemDefinitionId))continue;
    const current=mountPose(world,item.itemDefinitionId,item.mount);
    const context={instances};
    const q=current&&!occupied(world,context,item.itemDefinitionId,item.mount,item.instanceId)
      ?{ok:true,mount:item.mount,pose:current}
      :quoteWindowMount(world,context,item.itemDefinitionId,item,item.instanceId);
    const next=q.ok?{...item,mount:q.mount,x:q.pose.x,z:q.pose.z,yaw:q.pose.yaw}:{...item,location:'storage'};
    instances.push(next);mapped.set(item.instanceId,next);
  }
  return {...furniture,instances:furniture.instances.map(item=>mapped.get(item.instanceId)||item)};
}
export function windowMountVisible(p,mode){
  if(!p||mode==='down')return false;
  if(mode==='up')return true;
  if(p.starterSide)return !['south','east'].includes(p.starterSide);
  return p.axis==='h'?p.wallLine*BUILD_STEP<=0:p.wallLine*BUILD_STEP<=14;
}
