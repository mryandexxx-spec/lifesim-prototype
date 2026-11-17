/** H5a: world-facing/brush timings and stable artwork positions, without PlayCanvas. */
import {furnitureActionApproach} from './furniture-catalog.js';
export function easelPaintingPose(world,instanceId,actorPosition=null){
  const item=world?.furniture?.instances?.find(v=>
    v.instanceId===instanceId&&v.prefabId==='easel'&&v.location==='home');
  const point=item&&furnitureActionApproach(world,'paint',instanceId);
  if(!item||!point)return null;
  const pos=actorPosition&&Number.isFinite(actorPosition.x)&&
    Number.isFinite(actorPosition.z)?actorPosition:point;
  const dx=item.x-pos.x,dz=item.z-pos.z;
  const heading=Math.hypot(dx,dz)>.01?Math.atan2(dx,dz)*180/Math.PI:-item.yaw;
  // All six components are required by the game frame's easing/transform.
  // Missing y/pitch produced NaN and corrupted the Safari scene transform.
  return {x:point.x,y:0,z:point.z,pitch:0,roll:0,yaw:heading};
}
export function paintingStrokeFrame(frame){
  if(!frame||frame.phase!=='using'||!Number.isFinite(frame.elapsed)||frame.elapsed<0)
    return null;
  const cycle=frame.elapsed*3.15;
  return {strokeX:Math.sin(cycle)*.115,
    strokeY:Math.sin(cycle*1.25)*.085,
    wrist:Math.sin(cycle*2.2)*12,
    weight:Math.min(1,Math.max(.18,frame.elapsed/.8))};
}
/** Independent finished object persists at a saved source pose after the
 * easel is moved, sold or placed in storage. Deterministic slot stacking. */
export function studioArtworkPose(work,index=0){
  if(!work||work.kind!=='artwork'||work.location!=='studio')return null;
  const p=work.origin;
  if(!p||![p.x,p.z,p.yaw].every(Number.isFinite)||![0,90,180,270].includes(p.yaw))
    return null;
  const step=Math.max(0,Math.min(23,Number.isInteger(index)?index:0));
  const angle=p.yaw*Math.PI/180;
  // A small framed board just to the side of the easel, outside its center.
  // Place finished objects on the ACTOR side of the easel rather than
  // behind the canvas toward a wall. Keep a gap from the easel footprint.
  const x=1.10+.04*Math.min(step,7),z=-.85-.015*step;
  return {x:p.x+x*Math.cos(angle)-z*Math.sin(angle),
    z:p.z+x*Math.sin(angle)+z*Math.cos(angle),
    yaw:p.yaw,slot:step};
}
