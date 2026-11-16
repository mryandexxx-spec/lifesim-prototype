/** One-finger pan by default; two-finger orbit/tilt and pinch zoom.
 * Side button enables one-finger orbit. Pure and independent of game saves.
 */
import {orbitCamera,panCamera,pinchCamera} from './camera-controls.js';

export const TAP_SLOP_PX=10;
export const TAP_MAX_MS=360;
const finite=n=>Number.isFinite(n);
const point=e=>e&&finite(e.x)&&finite(e.y)&&finite(e.id)
  ?{x:e.x,y:e.y,id:e.id}:null;
const metrics=values=>{
  if(values.length!==2)return null;
  const [a,b]=values;
  return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,
    distance:Math.hypot(a.x-b.x,a.y-b.y)};
};
const moved=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

/** begin/move/end/cancel accept numeric pointer IDs, CSS px, monotonic ms.
 * Any second pointer permanently disqualifies the existing tap until every
 * finger is released; never promote a leftover finger to a new gesture.
 */
export function createCameraGestureSession(){
  const pointers=new Map();
  let candidate=null,previousPair=null,multiUsed=false;
  function begin(e,time=0){
    const p=point(e);
    if(!p||pointers.has(p.id)||pointers.size>=2)return false;
    pointers.set(p.id,{...p,originX:p.x,originY:p.y,travel:0});
    if(pointers.size===1){
      candidate={id:p.id,time:finite(time)?time:0};
      previousPair=null;multiUsed=false;
    }else{
      candidate=null;multiUsed=true;
      previousPair=metrics([...pointers.values()]);
    }
    return true;
  }
  function move(e,view,height,{oneFinger='pan'}={}){
    const p=point(e),old=p&&pointers.get(p.id);
    if(!old)return {view,changed:false};
    const travel=old.travel+moved(old,p);
    pointers.set(p.id,{...old,x:p.x,y:p.y,travel});
    if(pointers.size===1&&!multiUsed){
      if(travel<TAP_SLOP_PX)return {view,changed:false};
      candidate=null;
      // Movement below the tap slop was intentionally ignored, so include it
      // once on the first actual gesture; after that use per-event deltas.
      const dx=old.travel<TAP_SLOP_PX?p.x-old.originX:p.x-old.x;
      const dy=old.travel<TAP_SLOP_PX?p.y-old.originY:p.y-old.y;
      // Shop placement owns the swipe. Do not pan the camera.
      if(oneFinger==='placement')
        return {view,changed:false,placementDelta:{dx,dy}};
      const next=oneFinger==='orbit'
        ?orbitCamera(view,dx,dy,2)
        :panCamera(view,dx,dy,height);
      return {view:next,changed:true};
    }
    if(pointers.size===2){
      const nextPair=metrics([...pointers.values()]);
      if(!nextPair||!previousPair)return {view,changed:false};
      const dx=nextPair.x-previousPair.x,dy=nextPair.y-previousPair.y;
      const zoom=nextPair.distance-previousPair.distance;
      previousPair=nextPair;
      const rotated=orbitCamera(view,dx,dy,2);
      const next=pinchCamera(rotated,
        nextPair.distance-zoom,nextPair.distance);
      return {view:next,changed:dx!==0||dy!==0||zoom!==0};
    }
    return {view,changed:false};
  }
  function end(e,time=0,{cancel=false}={}){
    const p=point(e),old=p&&pointers.get(p.id);
    if(!old)return null;
    pointers.delete(p.id);
    const isTap=!cancel&&!multiUsed&&candidate?.id===p.id&&
      old.travel+moved(old,p)<TAP_SLOP_PX&&
      finite(time)&&time>=candidate.time&&
      time-candidate.time<TAP_MAX_MS;
    if(pointers.size<2)previousPair=null;
    if(pointers.size===0){candidate=null;multiUsed=false;}
    return isTap?{x:p.x,y:p.y}:null;
  }
  function clear(){pointers.clear();candidate=null;previousPair=null;multiUsed=false;}
  return {begin,move,end,clear,count:()=>pointers.size};
}
