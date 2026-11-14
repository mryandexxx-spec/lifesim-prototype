/**
 * LifeSim 0.6c.3 — TRUE mattress-long-side entry, never the foot of the bed.
 *
 * Left/right: stand OUTSIDE the long rails (world X), face out of the mattress
 * to sit backwards onto its edge, then swing the legs in and rotate toward
 * the pillows (world -Z). All positions are sampled from ONE progress.
 * This controller remains visual-only and preserves action.bedSlot in v1 saves.
 */
import {BED_SLOTS,validBedSlot} from './bed-layout.js';
export const BED_ENTER_SECONDS=4.3;
export const BED_EXIT_SECONDS=3.8;
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
  const sign=slot.id==='left'?1:-1;
  // Approach along the LEFT/RIGHT RAIL at the mattress's middle (z=-1.42).
  // Take one small sideways step, then sit on its LONG edge, feet outside.
  const step=stage(p,0,.22);
  const sit=stage(p,.23,.51);
  // Only AFTER sitting: rotate the hips and lift the dangling legs onto the
  // mattress. The yaw must remain outward (+/-90) for the entire seated phase.
  const swing=stage(p,.53,.95);
  const turn=stage(p,.54,.97);
  const recline=stage(p,.57,.99);
  const slide=stage(p,.53,.99);
  const bodyRoll=sign*11*Math.sin(Math.PI*swing);
  const pitch=mix(0,slot.pose.pitch,recline);
  const yaw=mix(slot.approachYaw,slot.pose.yaw,turn);
  // Hip moves horizontally across mattress width X, NOT along its foot Z.
  const hipX=mix(mix(slot.approach.x,slot.edgeX,step),slot.pose.x,slide);
  // Pelvis stays at the same depth as the side entry. z movement at the root
  // exactly compensates for tilting the body backward toward the pillows.
  const hipZ=mix(slot.approach.z,-1.36,step);
  const hipY=mix(HIP,HIP_WORLD_Y,sit);
  // Full waist-axis compensation through yaw, pitch and roll:
  // R_y(yaw) * R_x(pitch) * R_z(roll) applied to local (0,HIP,0).
  // This keeps the real hip at (hipX,hipY,hipZ) as the body turns sideways.
  const cy=Math.cos(deg(yaw)),sy=Math.sin(deg(yaw));
  const cp=Math.cos(deg(pitch)),sp=Math.sin(deg(pitch));
  const cr=Math.cos(deg(bodyRoll)),sr=Math.sin(deg(bodyRoll));
  const hipOffsetX=HIP*(-cy*sr+sy*cr*sp);
  const hipOffsetY=HIP*cr*cp;
  const hipOffsetZ=HIP*(sy*sr+cy*cr*sp);
  const x=hipX-hipOffsetX;
  const y=hipY-hipOffsetY;
  const z=hipZ-hipOffsetZ;
  return {
    x,y,z,yaw,pitch,roll:bodyRoll,
    bedSide:slot.id,
    bedStepWeight:Math.sin(Math.PI*step),
    bedSitWeight:sit*(1-recline),
    bedReclineWeight:recline,
    bedSwingWeight:Math.sin(Math.PI*swing),
    bedWeight:recline
  };
}

/** The shared spring prevents position and rotation from getting out of phase.
 * The visual torso is articulated separately by stepAnimation().
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
