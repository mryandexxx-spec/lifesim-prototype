/**
 * LifeSim 0.5b.4: reversible staged sit-down.
 * Pure visual state: no engine dependencies, no persisted simulation fields.
 */
import {SOFA_APPROACH,SOFA_POSE,SOFA_FRONT_EDGE} from './pose-config.js';
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const ease=x=>{const a=clamp(x,0,1);return a*a*(3-2*a);};
const range=(p,a,b)=>ease((p-a)/(b-a));
const mix=(a,b,w)=>a+(b-a)*w;
export const SOFA_ENTER_SECONDS=1.65;
export const SOFA_EXIT_SECONDS=1.30;
export function createSofaTransition(){return {progress:0};}
export function advanceSofaTransition(last,engaged,dt){
  if(!last)last=createSofaTransition();
  if(!Number.isFinite(dt)||dt<=0)return last;
  const delta=clamp(dt,0,.06)/(engaged?SOFA_ENTER_SECONDS:SOFA_EXIT_SECONDS);
  return {progress:clamp(last.progress+(engaged?delta:-delta),0,1)};
}
/** 1. step closer to the seat from the front; 2. turn around;
 * 3. bend knees while backing to the cushion; 4. gently lower hips.
 * Reversing progress is a stand-up sequence, not a sudden position reset.
 */
export function sofaTransitionPose(state){
  const p=clamp(state?.progress??0,0,1);
  const near=SOFA_FRONT_EDGE-.19;
  const front=mix(SOFA_APPROACH.z,near,range(p,0,.21));
  const turn=range(p,.21,.42);
  const bend=range(p,.42,.84);
  const back=range(p,.48,.96);
  const lower=range(p,.55,1);
  return {x:SOFA_POSE.x,y:mix(0,SOFA_POSE.y,lower),
    z:mix(front,SOFA_POSE.z,back),pitch:0,yaw:180*turn,
    sofaWeight:bend};
}
