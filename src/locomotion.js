/**
 * LifeSim 0.6b — gait driven by TRAVEL DISTANCE, not renderer frame count.
 * Pure functions: no PlayCanvas, DOM, simulation state or mesh allocations.
 */
import {LEG_GEOMETRY} from './pose-config.js';

/** One stride cycle per ~0.87 world units travelled (both feet). */
export const WALK_PHASE_PER_METER=7.2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,fallback)=>Number.isFinite(v)?v:fallback;
const rad=deg=>deg*Math.PI/180;

/** Opposing hip/arm swing, knee flex mainly on the forward (swing) leg,
 * toe lift and subtle counter-rotation of torso/pelvis. Weight fades in/out.
 * Hip pitch is positive when the leg trails behind the avatar.
 */
export function gaitTargets(phase,weight=1,energy=70){
  const t=finite(phase,0);
  const w=clamp(finite(weight,0),0,1);
  // Canonical neutral pose avoids -0 outputs and unnecessary oscillation.
  if(w===0)return {
    hips:[0,0],knees:[0,0],feet:[0,0],arms:[0,0],
    pelvisRoll:0,torsoRoll:0
  };
  const vigor=.9+.1*clamp(finite(energy,70),0,100)/100;
  const cycle=[Math.sin(t),-Math.sin(t)];
  const hips=[],knees=[],feet=[];
  for(const side of cycle){
    const swing=Math.max(0,-side),stance=Math.max(0,side);
    hips.push(27*side*w*vigor);
    knees.push((2+33*Math.pow(swing,1.55))*w);
    // At swing lift toes; on stance let toes roll down only a few degrees.
    feet.push((-11*swing+3*stance)*w);
  }
  return {
    hips,knees,feet,
    arms:[-cycle[0]*18*w,cycle[0]*18*w],
    pelvisRoll:cycle[0]*2.2*w,
    torsoRoll:-cycle[0]*2.3*w
  };
}

/** A simple, bounded ground support correction computed from ACTUAL current
 * smoothed hip/knee angles. Keeps a supporting sole near y=0 as legs swing.
 * The two-piece procedural rig is not IK: this is a light ground-contact hint.
 */
export function gaitGroundOffset(hips,knees){
  if(!Array.isArray(hips)||!Array.isArray(knees)||hips.length<2||knees.length<2)
    return 0;
  let lowest=Infinity;
  for(let i=0;i<2;i++){
    if(!Number.isFinite(hips[i])||!Number.isFinite(knees[i]))return 0;
    const y=LEG_GEOMETRY.hipHeight+
      LEG_GEOMETRY.kneeOffsetY*Math.cos(rad(hips[i]))+
      LEG_GEOMETRY.shoeCenterY*Math.cos(rad(hips[i]+knees[i]))-
      LEG_GEOMETRY.shoeHeight/2;
    lowest=Math.min(lowest,y);
  }
  // At rest the rig's sole is ~0.005 below floor. Use that as baseline.
  return clamp(-Math.max(0,lowest+.005),-.07,0);
}
