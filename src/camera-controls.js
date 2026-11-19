/**
 * LifeSim 0.6a — headless camera math.
 * One finger pans (grabs) the room. Two fingers orbit/tilt and pinch.
 * Independent from PlayCanvas and saves.
 */
export const CAMERA_INITIAL=Object.freeze({
  yaw:42,pitch:47,distance:16.9,
  centerX:0,centerY:.62,centerZ:0
});
export const CAMERA_BOUNDS=Object.freeze({
  minPitch:24,maxPitch:68,minDistance:11,maxDistance:32,
  minX:-3.4,maxX:12.6,minZ:-2.9,maxZ:2.9
});
export const CAMERA_LOT_BOUNDS=Object.freeze({
  minX:-8,maxX:22,minZ:-11,maxZ:11,minDistance:11,maxDistance:50
});
const valid=Number.isFinite;
const panBounds={...CAMERA_BOUNDS};
/** Expand only presentation camera for F5 build lots; reset when leaving build. */
export function setCameraBuildBounds(bounds=null){
  Object.assign(panBounds,bounds||CAMERA_BOUNDS);
}
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));

/** Convert finger movement in CSS pixels into camera-oriented ground movement.
 * Ordinary camera panning uses the negative of this vector.
 */
export function screenFloorDragDelta(view,dx,dy,height,fov=41){
  if(!valid(dx)||!valid(dy)||!valid(height)||height<=0||
    !valid(view?.yaw)||!valid(view?.pitch)||!valid(view?.distance))
    return {x:0,z:0};
  const yaw=view.yaw*Math.PI/180,pitch=view.pitch*Math.PI/180;
  const scale=2*view.distance*Math.tan(fov*Math.PI/360)/height;
  const h=scale*.92,v=scale*.75/Math.max(.55,Math.sin(pitch));
  return {x:dx*h*Math.cos(yaw)+dy*v*Math.sin(yaw),
    z:-dx*h*Math.sin(yaw)+dy*v*Math.cos(yaw)};
}
/** Dragging screen-right/down moves the scene right/down.
 * Camera target moves opposite the finger in the world XZ plane.
 */
export function panCamera(view,dx,dy,height,fov=41){
  if(!valid(dx)||!valid(dy)||!valid(height)||height<=0)return {...view};
  const delta=screenFloorDragDelta(view,dx,dy,height,fov);
  return {...view,centerX:clamp(view.centerX-delta.x,panBounds.minX,panBounds.maxX),
    centerZ:clamp(view.centerZ-delta.z,panBounds.minZ,panBounds.maxZ)};
}
export function orbitCamera(view,dx,dy,gain=1){
  if(!valid(dx)||!valid(dy)||!valid(gain)||gain<=0)return {...view};
  const s=clamp(gain,.25,3);
  return {...view,yaw:((view.yaw-dx*.26*s)%360+360)%360,
    pitch:clamp(view.pitch+dy*.19*s,CAMERA_BOUNDS.minPitch,CAMERA_BOUNDS.maxPitch)};
}

/** One-finger camera mode: default pan preserved, explicit rotate is easier
 * to control on a phone than dragging two fingertips across the whole screen.
 */
export function dragCamera(view,mode,dx,dy,height){
  return mode==='orbit'?orbitCamera(view,dx,dy,2.0):panCamera(view,dx,dy,height);
}
export function pinchCamera(view,previousDistance,nextDistance){
  if(!valid(previousDistance)||!valid(nextDistance)||
     previousDistance<=0||nextDistance<=0)return {...view};
  return {...view,distance:clamp(view.distance*previousDistance/nextDistance,
    panBounds.minDistance,panBounds.maxDistance)};
}
export function wheelCamera(view,dy){
  if(!valid(dy))return {...view};
  return {...view,distance:clamp(view.distance+dy*.012,
    panBounds.minDistance,panBounds.maxDistance)};
}
