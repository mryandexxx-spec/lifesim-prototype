/**
 * LifeSim 0.6c.1: reversible bedtime choreography with physical body articulation.
 * Entry: short step -> bend knees/sit on edge -> lift legs/lean back -> lie on pillow.
 * World-space pelvis height is held stable during reclining to avoid root teleport.
 * Renderer-independent. The action's optional bedSlot is the only persisted field.
 */
import {BED_SLOTS,validBedSlot} from './bed-layout.js';
export const BED_ENTER_SECONDS=3.4;
export const BED_EXIT_SECONDS=2.8;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ease=v=>{const t=clamp(v,0,1);return t*t*(3-2*t);};
const stage=(v,a,b)=>ease((v-a)/(b-a));
const mix=(a,b,t)=>a+(b-a)*t;
const rad=d=>d*Math.PI/180;
// The physical hip stays just above the mattress during reclining.
// Avatar local hip center is at .72 above its root.
const HIP_HEIGHT=.72,SEATED_HIP_Y=.814;
export const createBedTransition=()=>({progress:0,slot:null});
export function advanceBedTransition(previous,engaged,slot,dt){
  const last=previous||createBedTransition();
  if(!Number.isFinite(dt)||dt<=0)return last;
  const chosen=validBedSlot(slot)?slot:last.slot;
  if(!chosen)return createBedTransition();
  const delta=clamp(dt,0,.06)/(engaged?BED_ENTER_SECONDS:BED_EXIT_SECONDS);
  const p=clamp(last.progress+(engaged?delta:-delta),0,1);
  return {progress:p,slot:p>0?chosen:null};
}
export function bedTransitionPose(state){
  const slot=BED_SLOTS[state?.slot];
  if(!slot)return null;
  const p=clamp(state.progress,0,1);
  const step=stage(p,0,.24);
  const sit=stage(p,.24,.52);
  const recline=stage(p,.53,.96);
  const slide=stage(p,.57,.98);
  // Stand on floor, then sit with pelvis resting just above mattress;
  // the body rotates around the *hip* instead of floating upward.
  const pitch=mix(0,slot.pose.pitch,recline);
  const hipAnchorY=SEATED_HIP_Y-HIP_HEIGHT*Math.cos(rad(pitch));
  const y=mix(0,hipAnchorY,sit);
  const x=mix(mix(slot.approach.x,slot.edgeX,step),slot.pose.x,slide);
  const z=mix(mix(slot.approach.z,slot.edgeZ,step),slot.pose.z,slide);
  const roll=(slot.id==='left'?1:-1)*12*Math.sin(Math.PI*recline);
  return {
    x,y,z,
    yaw:mix(slot.approachYaw,slot.pose.yaw,recline),
    pitch,roll,
    bedSitWeight:sit*(1-recline),
    bedReclineWeight:recline,
    bedWeight:recline
  };
}
