/**
 * LifeSim 0.6f.1 — grounded, distance-driven procedural walking.
 *
 * Each half-cycle plants one sole while the root travels exactly one
 * half-stride. The other sole swings forward on a smooth arc. A constrained
 * two-segment planar IK places ankles above the floor without foot skating
 * or the exaggerated flapping from 0.6b.1. No PlayCanvas or save dependency.
 */
import {LEG_GEOMETRY} from './pose-config.js';

export const WALK_PHASE_PER_METER=7.2;

/**
 * LifeSim 0.6f.2 — advance a stride from the DISPLAYED root displacement,
 * not the simulation's unsmoothed route follower. This keeps a planted sole
 * planted even when the rendered avatar trails the A* path at 1× / 3×.
 *
 * Return null heading if stationary, paused, finishing another interaction
 * or after a renderer reset/teleport. This is transient; nothing is saved.
 */
export function advanceVisualGait(phase,from,to,walking=true){
  const previous=Number.isFinite(phase)?phase:0;
  const frozen={phase:previous,heading:null,distance:0};
  if(!walking||!from||!to)return frozen;
  const dx=to.x-from.x,dz=to.z-from.z;
  if(!Number.isFinite(dx)||!Number.isFinite(dz))return frozen;
  const distance=Math.hypot(dx,dz);
  // A normal rendered update is << 0.4 m. Do not play many steps when
  // loading a save, resetting the scene, or teleporting across furniture.
  if(distance<1e-6||distance>.4)return frozen;
  return {
    phase:previous+distance*WALK_PHASE_PER_METER,
    heading:Math.atan2(dx,dz)*180/Math.PI,
    distance
  };
}
const TAU=Math.PI*2;
const THIGH=-LEG_GEOMETRY.kneeOffsetY;
const SHIN=-LEG_GEOMETRY.shoeCenterY;
// One foot stays planted while the root covers pi / phasePerMeter metres.
const HALF_STRIDE=Math.PI/WALK_PHASE_PER_METER;
const REACH=HALF_STRIDE/2;
const FOOT_Y=LEG_GEOMETRY.shoeHeight/2;
const ROOT_DIP=.045;
const SWING_LIFT=.085;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,f)=>Number.isFinite(v)?v:f;
const rad=deg=>deg*Math.PI/180;
const deg=v=>v*180/Math.PI;
const smooth01=t=>{const x=clamp(t,0,1);return x*x*(3-2*x);};
const wrap=t=>((t%TAU)+TAU)%TAU;

export function gaitRootOffset(phase){
  const c=Math.cos(finite(phase,0));
  return -ROOT_DIP*c*c;
}

/**
 * 0=left, 1=right. Stance lasts half a cycle, during which the foot
 * stays fixed in world Z because local Z moves at -1/PHASE_PER_METER.
 * The smooth lifted swing then returns the sole to the next touchdown.
 */
export function gaitFootTrajectory(phase,leg=0){
  const p=finite(phase,0);
  const t=wrap(p+(leg===0?Math.PI:0));
  const stance=t<Math.PI;
  const u=stance?t/Math.PI:(t-Math.PI)/Math.PI;
  return {
    stance,
    progress:u,
    z:stance?REACH-HALF_STRIDE*u:
      -REACH+HALF_STRIDE*smooth01(u),
    lift:stance?0:SWING_LIFT*Math.sin(Math.PI*u)**2
  };
}

/** Analytic planar 2-bone leg solve; the foot is flat on the floor in stance. */
function solveLeg(foot,rootY){
  const down=LEG_GEOMETRY.hipHeight+rootY-(FOOT_Y+foot.lift);
  const reach=Math.hypot(down,foot.z);
  const cosine=clamp((reach*reach-THIGH*THIGH-SHIN*SHIN)/(2*THIGH*SHIN),-1,1);
  const knee=Math.acos(cosine);
  const hip=Math.atan2(-foot.z,down)-
    Math.atan2(SHIN*Math.sin(knee),THIGH+SHIN*Math.cos(knee));
  // Cancel combined hip and knee pitch so the shoe stays horizontal.
  // Only the lifted swing foot rolls its toes by a tiny amount.
  const toe=foot.stance?0:4*Math.sin(Math.PI*foot.progress);
  return {hip:deg(hip),knee:deg(knee),foot:deg(-hip-knee)+toe};
}

/**
 * Deterministic targets are based on travelled metres, not render frames.
 * The weight handles easing in/out; support geometry stays coherent at 1×/3×.
 */
export function gaitTargets(phase,weight=1,energy=70){
  const t=finite(phase,0);
  const w=clamp(finite(weight,0),0,1);
  const zero={hips:[0,0],knees:[0,0],feet:[0,0],arms:[0,0],
    elbows:[0,0],pelvisRoll:0,torsoRoll:0,
    spineLean:0,spineTwist:0,spineRoll:0,hipShift:0,bodyLift:0,
    rootOffset:0};
  if(w===0)return zero;
  const rootOffset=gaitRootOffset(t);
  const solved=[0,1].map(i=>solveLeg(gaitFootTrajectory(t,i),rootOffset));
  const wave=Math.sin(t);
  const vigor=.9+.1*clamp(finite(energy,70),0,100)/100;
  const arms=[-wave*19*w*vigor,wave*19*w*vigor];
  return {
    hips:solved.map(s=>s.hip*w),
    knees:solved.map(s=>s.knee*w),
    feet:solved.map(s=>s.foot*w),
    arms,
    elbows:[(13+10*Math.max(0,wave))*w,(13+10*Math.max(0,-wave))*w],
    pelvisRoll:wave*1.8*w,
    torsoRoll:-wave*1.8*w,
    spineLean:2.2*w,
    spineTwist:wave*3*w,
    spineRoll:-wave*2.4*w,
    hipShift:wave*.024*w,
    bodyLift:0,
    rootOffset:rootOffset*w
  };
}

/** Legacy support estimator for older callers and compatibility tests.
 * Contact gait now uses gaitRootOffset so ankle targets stay synchronized.
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
  return clamp(-Math.max(0,lowest+.005),-.055,0);
}
