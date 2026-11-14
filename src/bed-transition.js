/**
 * LifeSim 0.6c.2 — mirrored, hip-anchored bed animation.
 * Turn BEFORE sitting, settle on the outer edge, then swing legs toward the
 * occupied half and recline. Left/right use mirrored world travel and gestures.
 * Every channel is sampled from ONE progress value (not separate animation clocks).
 * No renderer/simulation dependency and no new save fields.
 */
import {BED_SLOTS,validBedSlot} from './bed-layout.js';
export const BED_ENTER_SECONDS=4.2;
export const BED_EXIT_SECONDS=3.65;
const HIP=.72;
const HIP_WORLD_Y=.814;
const deg=x=>x*Math.PI/180;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>{const t=clamp(v,0,1);return t*t*(3-2*t);};
const stage=(p,a,b)=>smooth((p-a)/(b-a));
const mix=(a,b,t)=>a+(b-a)*t;
export const createBedTransition=()=>({progress:0,slot:null});
export function advanceBedTransition(previous,engaged,slot,dt){
  const last=previous||createBedTransition();
  if(!Number.isFinite(dt)||dt<=0)return last;
  const selected=last.progress>0&&validBedSlot(last.slot)
    ?last.slot:(validBedSlot(slot)?slot:last.slot);
  if(!selected)return createBedTransition();
  const delta=clamp(dt,0,.06)/(engaged?BED_ENTER_SECONDS:BED_EXIT_SECONDS);
  const progress=clamp(last.progress+(engaged?delta:-delta),0,1);
  return {progress,slot:progress>0?selected:null};
}
export function bedTransitionPose(state){
  const slot=BED_SLOTS[state?.slot];
  if(!slot)return null;
  const p=clamp(state.progress,0,1);
  const side=slot.id==='left'?1:-1;
  // Walk inward along *this* edge, then rotate toward the FOOT of the bed.
  // +90 -> 0 at the left edge; -90 -> 0 at the right edge.
  const step=stage(p,0,.22);
  const turn=stage(p,.18,.42);
  // Stabilise on the side edge before moving the legs onto the mattress.
  const sit=stage(p,.28,.52);
  const swing=stage(p,.50,.96);
  const recline=stage(p,.58,.98);
  const slide=stage(p,.52,.98);
  // Side-dependent leg sweep and body roll peak mid-transfer, then disappear.
  const sideSweep=Math.sin(Math.PI*swing);
  const pitch=mix(0,slot.pose.pitch,recline);
  const roll=side*11*sideSweep;
  const yaw=mix(slot.approachYaw,slot.pose.yaw,turn);
  // Position the pelvis in WORLD space. Compensate for avatar rotation around
  // its root so the hip does not jump vertically or drift across the mattress.
  const hipX=mix(mix(slot.approach.x,slot.edgeX,step),slot.pose.x,slide);
  const finalHipZ=slot.pose.z+HIP*Math.sin(deg(slot.pose.pitch));
  const hipZ=mix(mix(slot.approach.z,slot.edgeZ,step),finalHipZ,slide);
  const hipY=mix(HIP,HIP_WORLD_Y,sit);
  const x=hipX+HIP*Math.sin(deg(roll));
  const y=hipY-HIP*Math.cos(deg(pitch))*Math.cos(deg(roll));
  const z=hipZ-HIP*Math.sin(deg(pitch));
  return {
    x,y,z,pitch,yaw,roll,
    bedSide:slot.id,
    bedSitWeight:sit*(1-recline),
    bedReclineWeight:recline,
    bedSwingWeight:sideSweep,
    bedWeight:recline
  };
}

/** Apply the same spring factor to every transform channel. Unlike independent
 * fast position/slow pitch smoothing, the body stays in phase while reclining.
 * Also gently catches up with the final walking render position on entry.
 */
export function blendBedDisplay(previous,target,dt){
  if(!target||!Number.isFinite(dt)||dt<=0)return {...previous};
  const a=1-Math.exp(-26*clamp(dt,0,.06));
  const shortest=(from,to)=>{
    const delta=((to-from+540)%360)-180;
    return from+delta*a;
  };
  return {
    x:mix(previous.x,target.x,a),
    y:mix(previous.y,target.y,a),
    z:mix(previous.z,target.z,a),
    pitch:shortest(previous.pitch,target.pitch),
    yaw:shortest(previous.yaw,target.yaw),
    roll:shortest(previous.roll||0,target.roll||0)
  };
}
