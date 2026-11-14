/**
 * LifeSim 0.6d. Shared fridge geometry and deterministic choreography.
 * No engine/DOM dependency and no additional saved fields: all phases derive
 * from existing action.elapsed (v1 save schema).
 */
const clamp01=n=>Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
const ease=(a,b,p)=>{
  const x=clamp01((p-a)/(b-a));
  return x*x*(3-2*x);
};

export const FRIDGE_LAYOUT=Object.freeze({
  approach:Object.freeze({x:2.54,z:-1.74}),
  handle:Object.freeze({x:3.04,z:-2.145}),
  hinge:Object.freeze({x:3.98,y:1.44,z:-2.205}),
  doorWidth:1.08,doorAngle:68,
  sweep:Object.freeze({minX:2.89,maxX:4.04,minZ:-2.26,maxZ:-1.20})
});
export const FRIDGE_EAT_START=.66;
export const FRIDGE_FACING_YAW=Math.atan2(
  FRIDGE_LAYOUT.handle.x-FRIDGE_LAYOUT.approach.x,
  FRIDGE_LAYOUT.handle.z-FRIDGE_LAYOUT.approach.z)*180/Math.PI;

/** Reconstructable after pause, 3× speed and reload. */
export function fridgeSequence(elapsed,duration=26){
  const p=clamp01(Number.isFinite(duration)&&duration>0?elapsed/duration:0);
  const doorOpen=ease(.09,.25,p)*(1-ease(.52,.66,p));
  const reach=ease(.27,.36,p)*(1-ease(.44,.54,p));
  const eat=ease(.66,.72,p)*(1-ease(.95,.99,p));
  // Food appears on the refrigerated shelf, then transfers to the hand.
  const shelfFood=ease(.20,.28,p)*(1-ease(.40,.48,p));
  const handFood=ease(.42,.49,p)*(1-ease(.74,.97,p));
  const chew=eat*(.5+.5*Math.sin(p*24*Math.PI));
  return {progress:p,doorOpen,reach,eat,chew,shelfFood,handFood};
}

/** Door segment in room X/Z; hinge is on right and swings away from approach. */
export function fridgeDoorSegment(open){
  const angle=FRIDGE_LAYOUT.doorAngle*Math.PI/180*clamp01(open);
  const {x,z}=FRIDGE_LAYOUT.hinge;
  return {hinge:{x,z},tip:{
    x:x-FRIDGE_LAYOUT.doorWidth*Math.cos(angle),
    z:z+FRIDGE_LAYOUT.doorWidth*Math.sin(angle)
  }};
}
export function fridgeDoorClearance(point,open,radius=.26){
  const {hinge,tip}=fridgeDoorSegment(open);
  const dx=tip.x-hinge.x,dz=tip.z-hinge.z;
  const t=clamp01(((point.x-hinge.x)*dx+(point.z-hinge.z)*dz)/(dx*dx+dz*dz));
  return Math.hypot(point.x-hinge.x-t*dx,point.z-hinge.z-t*dz)
    -radius-.055;
}
/** Close on cancellation in active real time; dt=0 strictly freezes the door. */
export function closeFridgeDoor(open,dt){
  if(!Number.isFinite(dt)||dt<=0)return clamp01(open);
  return Math.max(0,clamp01(open)-Math.min(dt,.06)/.33);
}
