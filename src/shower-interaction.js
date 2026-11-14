/**
 * LifeSim 0.6e: shower entrance, privacy, washing and exit in a pure timeline.
 * Privacy is intentionally a binary opaque enclosure; NO nude rig exists.
 * Clothing swaps are allowed only while the full enclosure is present.
 * Existing v1 action.elapsed is sufficient to reconstruct an active shower.
 */
const clamp01 = n => Number.isFinite(n) ? Math.max(0,Math.min(1,n)) : 0;
const smooth = (a,b,p) => {
  const v=clamp01((p-a)/(b-a));
  return v*v*(3-2*v);
};
const lerp=(a,b,t)=>a+(b-a)*t;
const ACTIVE_EXIT_SECONDS=.98;
export const SHOWER_LAYOUT=Object.freeze({
  approach:Object.freeze({x:-2.18,z:2.10}),
  interior:Object.freeze({x:-3.64,y:.22,z:2.44}),
  entryYaw:-90,
  privacyWidth:1.54,
  privacyDepth:1.55,
  privacyHeight:2.22,
  exitSeconds:ACTIVE_EXIT_SECONDS
});
/** Hygiene is restored only once washing begins and while water is flowing. */
export const SHOWER_WASH_START=.36;
export const SHOWER_WASH_END=.81;

export function showerSequence(elapsed,duration=32,entryYaw=SHOWER_LAYOUT.entryYaw){
  const p=clamp01(Number.isFinite(duration)&&duration>0?elapsed/duration:0);
  const walk=smooth(.05,.22,p);
  const yaw=lerp(Number.isFinite(entryYaw)?entryYaw:SHOWER_LAYOUT.entryYaw,
    SHOWER_LAYOUT.entryYaw,smooth(0,.09,p));
  const privacy=p>=.23&&p<.94;
  const bathing=privacy&&p>=.32&&p<.84;
  const water=p>=SHOWER_WASH_START&&p<SHOWER_WASH_END;
  const stepWeight=(p>=.05&&p<.22) ? Math.sin(Math.PI*clamp01((p-.05)/.17)) : 0;
  return {
    progress:p,privacy,bathing,water,stepWeight,
    gaitMeters:Math.hypot(SHOWER_LAYOUT.interior.x-SHOWER_LAYOUT.approach.x,
      SHOWER_LAYOUT.interior.z-SHOWER_LAYOUT.approach.z)*walk,
    pose:{x:lerp(SHOWER_LAYOUT.approach.x,SHOWER_LAYOUT.interior.x,walk),
      y:SHOWER_LAYOUT.interior.y*walk,z:lerp(SHOWER_LAYOUT.approach.z,SHOWER_LAYOUT.interior.z,walk),
      pitch:0,yaw,roll:0}
  };
}
export function createShowerTransition(){
  return {active:false,enterYaw:SHOWER_LAYOUT.entryYaw,frame:null,exit:null};
}
function exitFrame(from,elapsed){
  const p=clamp01(elapsed/ACTIVE_EXIT_SECONDS);
  // While the mask is closing we restore the intact everyday outfit FIRST.
  // Only after the full restoration does the opaque enclosure disappear.
  const privacy=from.privacy&&p<.62;
  const walk=smooth(.65,1,p);
  const pose={
    x:lerp(from.pose.x,SHOWER_LAYOUT.approach.x,walk),
    y:lerp(from.pose.y,0,walk),z:lerp(from.pose.z,SHOWER_LAYOUT.approach.z,walk),
    pitch:0,yaw:lerp(from.pose.yaw,90,smooth(.60,.95,p)),roll:0
  };
  return {
    progress:p,privacy,bathing:false,water:false,
    stepWeight:p>=.65&&p<1?Math.sin(Math.PI*clamp01((p-.65)/.35)):0,
    gaitMeters:Math.hypot(from.pose.x-pose.x,from.pose.z-pose.z),
    pose
  };
}
/**
 * dt is real active time, zero when paused.
 * Caller blocks walking to a new destination until .frame becomes null.
 * A cancelled or completed shower always restores clothing before revealing
 * the resident and walks back to the original safe approach point.
 */
export function advanceShowerTransition(previous,using,elapsed,duration,dt,displayYaw=SHOWER_LAYOUT.entryYaw){
  const old=previous||createShowerTransition();
  if(using){
    const enterYaw=old.active&&!old.exit?old.enterYaw:displayYaw;
    return {active:true,enterYaw,frame:showerSequence(elapsed,duration,enterYaw),exit:null};
  }
  if(!old.active||!old.frame)return createShowerTransition();
  const exit=old.exit||{from:old.frame,elapsed:0};
  const nextElapsed=exit.elapsed+(Number.isFinite(dt)&&dt>0?Math.min(dt,.06):0);
  if(nextElapsed>=ACTIVE_EXIT_SECONDS)return createShowerTransition();
  const nextExit={from:exit.from,elapsed:nextElapsed};
  return {active:true,enterYaw:old.enterYaw,frame:exitFrame(exit.from,nextElapsed),exit:nextExit};
}
/** A conservative invariant, testable without any 3D renderer. */
export function showerPrivacyInvariant(frame){
  return !frame || (!frame.bathing||frame.privacy) &&
    (!frame.water||frame.privacy) &&
    (frame.privacy||!frame.bathing);
}
