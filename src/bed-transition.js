/**
 * Pure, reversible, per-resident choreography for bed entry/exit.
 * Progress is transient; occupied bed slot is stored as optional v1 action.bedSlot.
 */
import {BED_SLOTS,validBedSlot} from './bed-layout.js';
export const BED_ENTER_SECONDS=2.15;
export const BED_EXIT_SECONDS=1.75;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const smooth=x=>{const t=clamp(x,0,1);return t*t*(3-2*t);};
const phase=(p,a,b)=>smooth((p-a)/(b-a));
const mix=(a,b,t)=>a+(b-a)*t;
export const createBedTransition=()=>({progress:0,slot:null});
export function advanceBedTransition(previous,engaged,slot,dt){
  const last=previous||createBedTransition();
  if(!Number.isFinite(dt)||dt<=0)return last;
  const choice=validBedSlot(slot)?slot:last.slot;
  // The occupied slot is locked for the entire exit transition.
  if(!choice)return createBedTransition();
  const delta=clamp(dt,0,.06)/(engaged?BED_ENTER_SECONDS:BED_EXIT_SECONDS);
  const progress=clamp(last.progress+(engaged?delta:-delta),0,1);
  return {progress,slot:progress>0?choice:null};
}
export function bedTransitionPose(state){
  const slot=BED_SLOTS[state?.slot];
  if(!slot)return null;
  const p=clamp(state.progress,0,1);
  // Front/side approach -> turn toward mattress -> perch on edge
  // -> rotate onto pillow and slide under two separate quilts.
  const approach=phase(p,0,.29);
  const recline=phase(p,.37,.97);
  const settle=phase(p,.43,1);
  return {
    x:mix(mix(slot.approach.x,slot.edgeX,approach),slot.pose.x,settle),
    y:mix(0,slot.pose.y,recline),
    z:mix(mix(slot.approach.z,slot.edgeZ,approach),slot.pose.z,settle),
    yaw:mix(slot.approachYaw,slot.pose.yaw,settle),
    pitch:mix(0,slot.pose.pitch,recline),
    bedWeight:recline
  };
}
