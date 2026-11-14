/**
 * LifeSim 0.6b.1 — readable two-bone stride, waist and elbow articulation.
 * Targets are functions of DISTANCE phase and gait intensity; graphics
 * remain procedural, state is transient and no renderer imports are used.
 */
import {LEG_GEOMETRY} from './pose-config.js';
export const WALK_PHASE_PER_METER=7.2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,f)=>Number.isFinite(v)?v:f;
const rad=deg=>deg*Math.PI/180;

export function gaitTargets(phase,weight=1,energy=70) {
  const t=finite(phase,0);
  const w=clamp(finite(weight,0),0,1);
  if(w===0)return {
    hips:[0,0],knees:[0,0],feet:[0,0],arms:[0,0],
    elbows:[0,0],pelvisRoll:0,torsoRoll:0,
    spineLean:0,spineTwist:0,spineRoll:0,hipShift:0,bodyLift:0
  };
  const vigor=.92+.08*clamp(finite(energy,70),0,100)/100;
  const wave=Math.sin(t);
  const cycle=[wave,-wave];
  const hips=[],knees=[],feet=[],elbows=[];
  for(let i=0;i<2;i++){
    const side=cycle[i];
    const swing=Math.max(0,-side),stance=Math.max(0,side);
    // Far more leg clearance than 0.6b: the advancing foot flexes at knee.
    hips.push(39*side*w*vigor);
    knees.push((3+53*Math.pow(swing,1.25))*w);
    feet.push((-19*swing+6*stance)*w);
    elbows.push((17+27*Math.max(0,side))*w);
  }
  return {
    hips,knees,feet,
    arms:[-wave*31*w,wave*31*w],
    elbows,
    pelvisRoll:wave*4*w,
    torsoRoll:-wave*4*w,
    // Spine twists and leans as one connected structure (head/arms follow).
    spineLean:5*w,
    spineTwist:wave*8*w,
    spineRoll:-wave*6*w,
    hipShift:wave*.065*w,
    bodyLift:(1-Math.cos(2*t))*.009*w
  };
}

/** Small stance-foot adjustment; not IK. Never creates position drift. */
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
  return clamp(-Math.max(0,lowest+.005),-.055,0);
}
