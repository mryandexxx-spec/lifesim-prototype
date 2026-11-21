/** One-finger pan by default; two-finger orbit/tilt and pinch zoom.
 * Side button enables one-finger orbit. Pure and independent of game saves.
 */
import {orbitCamera,panCamera,pinchCamera} from './camera-controls.js';

export const TAP_SLOP_PX=10;
export const TAP_MAX_MS=360;
const finite=n=>Number.isFinite(n);
const point=e=>e&&finite(e.x)&&finite(e.y)&&finite(e.id)
  ?{x:e.x,y:e.y,id:e.id}:null;
// The part of the displacement both contacts share drives drag-orbit.
const sharedTravel=(a,b)=>Math.sign(a)===Math.sign(b)
  ?Math.sign(a)*Math.min(Math.abs(a),Math.abs(b)):0;
const metrics=values=>{
  if(values.length!==2)return null;
  const [a,b]=values;
  return {x:sharedTravel(a.x-a.pairX,b.x-b.pairX),
    y:sharedTravel(a.y-a.pairY,b.y-b.pairY),
    distance:Math.hypot(a.x-b.x,a.y-b.y),
    // Keeping the pointer ordering stable makes twist sign deterministic.
    angle:Math.atan2(b.y-a.y,b.x-a.x)};
};

/** begin/move/end/cancel accept numeric pointer IDs, CSS px, monotonic ms.
 * Any second pointer permanently disqualifies the existing tap until every
 * finger is released; never promote a leftover finger to a new gesture.
 */
export function createCameraGestureSession(){
  const pointers=new Map();
  let candidate=null,previousPair=null,multiUsed=false;
  let pendingTwist=0,twisting=false;
  function begin(e,time=0){
    const p=point(e);
    if(!p||pointers.has(p.id)||pointers.size>=2)return false;
    pointers.set(p.id,{...p,originX:p.x,originY:p.y,travel:0});
    if(pointers.size===1){
      candidate={id:p.id,time:finite(time)?time:0};
      previousPair=null;multiUsed=false;
    }else{
      candidate=null;multiUsed=true;
      for(const contact of pointers.values()){
        contact.pairX=contact.x;
        contact.pairY=contact.y;
      }
      pendingTwist=0;twisting=false;
      previousPair=metrics([...pointers.values()]);
    }
    return true;
  }
  function move(e,view,height,{oneFinger='pan'}={}){
    const p=point(e),old=p&&pointers.get(p.id);
    if(!old)return {view,changed:false};
    // Touch slop is the farthest displacement from contact origin, not
    // the sum of tiny back-and-forth tremors (which made taps unselectable).
    const travel=Math.max(old.travel,Math.hypot(p.x-old.originX,p.y-old.originY));
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
      const last=previousPair;
      previousPair=nextPair;
      let twist=0;
      if(last.distance>=20&&nextPair.distance>=20){
        const angle=nextPair.angle-last.angle;
        pendingTwist+=Math.atan2(Math.sin(angle),Math.cos(angle))*180/Math.PI;
        // Ignore initial jitter once, independent of pointer sampling frequency.
        if(twisting||Math.abs(pendingTwist)>=.35){
          twisting=true;
          twist=pendingTwist;
          pendingTwist=0;
        }
      }else{
        pendingTwist=0;twisting=false;
      }
      const orbited=orbitCamera(view,dx*1.3,dy*1.15,2);
      // Screen Y grows down. Positive camera yaw turns the visible lot clockwise.
      orbited.yaw=((orbited.yaw+twist)%360+360)%360;
      const next=pinchCamera(orbited,last.distance,nextPair.distance);
      return {view:next,changed:dx!==0||dy!==0||last.distance!==nextPair.distance||twist!==0};
    }
    return {view,changed:false};
  }
  function end(e,time=0,{cancel=false}={}){
    const p=point(e),old=p&&pointers.get(p.id);
    if(!old)return null;
    pointers.delete(p.id);
    const isTap=!cancel&&!multiUsed&&candidate?.id===p.id&&
      Math.max(old.travel,Math.hypot(p.x-old.originX,p.y-old.originY))<TAP_SLOP_PX&&
      finite(time)&&time>=candidate.time&&
      time-candidate.time<TAP_MAX_MS;
    if(pointers.size<2)previousPair=null;
    if(pointers.size===0){candidate=null;multiUsed=false;}
    return isTap?{x:p.x,y:p.y}:null;
  }
  function clear(){pointers.clear();candidate=null;previousPair=null;multiUsed=false;}
  return {begin,move,end,clear,count:()=>pointers.size};
}
