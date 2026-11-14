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
  minPitch:24,maxPitch:68,minDistance:11,maxDistance:24,
  minX:-3.4,maxX:3.4,minZ:-2.9,maxZ:2.9
});
const valid=Number.isFinite;
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));

/** Dragging screen-right/down moves the scene right/down.
 * Camera target moves opposite the finger in the world XZ plane.
 */
export function panCamera(view,dx,dy,height,fov=41){
  if(!valid(dx)||!valid(dy)||!valid(height)||height<=0)return {...view};
  const yaw=view.yaw*Math.PI/180,pitch=view.pitch*Math.PI/180;
  const scale=2*view.distance*Math.tan(fov*Math.PI/360)/height;
  const h=scale*.92,v=scale*.75/Math.max(.55,Math.sin(pitch));
  const x=view.centerX-dx*h*Math.cos(yaw)-dy*v*Math.sin(yaw);
  const z=view.centerZ+dx*h*Math.sin(yaw)-dy*v*Math.cos(yaw);
  return {...view,centerX:clamp(x,CAMERA_BOUNDS.minX,CAMERA_BOUNDS.maxX),
    centerZ:clamp(z,CAMERA_BOUNDS.minZ,CAMERA_BOUNDS.maxZ)};
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
    CAMERA_BOUNDS.minDistance,CAMERA_BOUNDS.maxDistance)};
}
export function wheelCamera(view,dy){
  if(!valid(dy))return {...view};
  return {...view,distance:clamp(view.distance+dy*.012,
    CAMERA_BOUNDS.minDistance,CAMERA_BOUNDS.maxDistance)};
}
