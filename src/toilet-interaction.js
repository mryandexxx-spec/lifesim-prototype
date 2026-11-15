/**
 * M4 — original, private and fully usable toilet.
 * Pure action geometry/timeline; no renderer, DOM, new save schema or RNG.
 * The existing resident action {id:'toilet',phase,elapsed} reconstructs the
 * pose after save/reload. Water/relief never occurs outside an opaque mask.
 */
const clamp01=n=>Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
const smooth=(a,b,p)=>{const x=clamp01((p-a)/(b-a));return x*x*(3-2*x);};
const lerp=(a,b,v)=>a+(b-a)*v;
export const TOILET_LAYOUT=Object.freeze({
  id:'toilet',
  approach:Object.freeze({x:-1.65,z:2.04}),
  interior:Object.freeze({x:-1.65,z:3.08}),
  // A free floor passage remains between the bathroom and the living room.
  bounds:Object.freeze({minX:-2.11,maxX:-1.19,minZ:2.63,maxZ:3.61}),
  yaw:180,
  seatHeight:.48,
  exitSeconds:1.65,
  privacyWidth:1.24,
  privacyDepth:1.28
});
export const TOILET_RELIEF_START=.38;
export const TOILET_RELIEF_END=.79;
export function toiletSequence(elapsed,duration=26,entryYaw=TOILET_LAYOUT.yaw){
  const progress=clamp01(Number.isFinite(duration)&&duration>0?elapsed/duration:0);
  const entry=smooth(.04,.28,progress);
  const exit=smooth(.86,1,progress);
  const occupied=entry*(1-exit);
  const seated=occupied*smooth(.25,.38,progress)*(1-smooth(.79,.90,progress));
  const privacy=progress>=.16&&progress<.96;
  const relief=privacy&&seated>.95&&progress>=TOILET_RELIEF_START&&
    progress<TOILET_RELIEF_END;
  const flush=privacy&&progress>=.84&&progress<.92;
  const walkWeight=(progress>=.04&&progress<.28)?
    Math.sin(Math.PI*clamp01((progress-.04)/.24)):
    (progress>=.86&&progress<1?
      Math.sin(Math.PI*clamp01((progress-.86)/.14)):0);
  const z=lerp(TOILET_LAYOUT.approach.z,TOILET_LAYOUT.interior.z,occupied);
  const yaw=lerp(Number.isFinite(entryYaw)?entryYaw:TOILET_LAYOUT.yaw,
    TOILET_LAYOUT.yaw,smooth(0,.23,progress));
  return {progress,privacy,relief,flush,seated,walkWeight,
    gaitMeters:Math.abs(z-TOILET_LAYOUT.approach.z),
    pose:{x:TOILET_LAYOUT.interior.x,y:seated?-.13*seated:0,z,pitch:0,yaw,roll:0}};
}
export function createToiletTransition(){
  return {active:false,enterYaw:TOILET_LAYOUT.yaw,frame:null,exit:null};
}
function exitFrame(from,elapsed){
  const progress=clamp01(elapsed/TOILET_LAYOUT.exitSeconds);
  const move=smooth(.28,1,progress);
  const z=lerp(from.pose.z,TOILET_LAYOUT.approach.z,move);
  const seated=(from.seated||0)*(1-smooth(.10,.40,progress));
  // Preserve the opaque mask until the character is upright and has almost
  // completed the exit. This also covers cancellations mid-use.
  const privacy=(from.privacy||from.seated>0)&&progress<.86;
  return {progress,privacy,relief:false,flush:false,seated,
    walkWeight:progress>=.30&&progress<1?
      Math.sin(Math.PI*clamp01((progress-.30)/.70)):0,
    gaitMeters:Math.abs(from.pose.z-z),
    pose:{x:TOILET_LAYOUT.interior.x,y:seated?-.13*seated:0,z,pitch:0,
      yaw:lerp(from.pose.yaw,TOILET_LAYOUT.yaw,smooth(.15,.86,progress)),roll:0}};
}
/** Start while action is using; after completion/cancellation keep a short
 * unsaved exit transition and reserve the toilet until the character leaves.
 */
export function advanceToiletTransition(previous,using,elapsed,duration,dt,
  displayYaw=TOILET_LAYOUT.yaw){
  const old=previous||createToiletTransition();
  if(using){
    const enterYaw=old.active&&!old.exit?old.enterYaw:displayYaw;
    return {active:true,enterYaw,frame:toiletSequence(elapsed,duration,enterYaw),exit:null};
  }
  if(!old.active||!old.frame)return createToiletTransition();
  const exit=old.exit||{from:old.frame,elapsed:0};
  const amount=Number.isFinite(dt)&&dt>0?Math.min(dt,.06):0;
  const next=exit.elapsed+amount;
  if(next>=TOILET_LAYOUT.exitSeconds)return createToiletTransition();
  return {active:true,enterYaw:old.enterYaw,frame:exitFrame(exit.from,next),
    exit:{from:exit.from,elapsed:next}};
}
export function toiletPrivacyInvariant(frame){
  return !frame||(!frame.relief||frame.privacy&&frame.seated>.95)&&
    (!frame.flush||frame.privacy)&&
    (frame.seated<=.001||frame.privacy);
}
