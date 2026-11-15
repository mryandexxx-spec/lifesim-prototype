/**
 * Female Meshy appearance policy. This is independent of Alex's sofa rig.
 * Game state, physics, action progress and save v1 are not changed.
 */
export const MIRA_MESHY_URL='./assets/characters/meshy-mira-mobile-v1.glb';
export const MIRA_DISPLAY_HEIGHT=2.05;
// Conservative initial shoe clearance. Verify against the actual idle pose in Safari.
export const MIRA_IDLE_GROUND_OFFSET=0.03;
export const MIRA_REQUIRED_CLIPS=Object.freeze([
  'Idle_7','Walking_Woman','Listening_Gesture','Hand_on_Hip_Gesture'
]);
export function miraHasClips(names){
  const found=new Set(names);
  return MIRA_REQUIRED_CLIPS.every(name=>found.has(name));
}
export function miraClipFor({walking=false,social=null}={}){
  if(walking)return 'Walking_Woman';
  if(social==='argue')return 'Hand_on_Hip_Gesture';
  if(social==='talk')return 'Listening_Gesture';
  return 'Idle_7';
}
/** Uses the original mesh's STATIC POSITION-space bounds, never the
 * animated skinned MeshInstance.aabb that shrunk Alex on iPhone.
 */
export function miraMeshPlacement(bounds,targetHeight=MIRA_DISPLAY_HEIGHT){
  const {min,max}=bounds||{};
  if(!min||!max||!Number.isFinite(targetHeight)||targetHeight<=0)
    throw new RangeError('Invalid Mira mesh placement');
  const numbers=[min.x,min.y,min.z,max.x,max.y,max.z];
  if(!numbers.every(Number.isFinite)||max.y-min.y<=0)
    throw new RangeError('Invalid original Mira mesh bounds');
  const scale=targetHeight/(max.y-min.y);
  return {scale,x:-(min.x+max.x)*.5*scale,
    y:-min.y*scale+MIRA_IDLE_GROUND_OFFSET,
    z:-(min.z+max.z)*.5*scale};
}
/** Guard each female furniture overlay independently. The canonical game
 * avatar/mosaic enforces shower privacy even when a Meshy overlay is enabled.
 */
export function canShowMiraMeshy({preferred=false,ready=false,actionId=null,
  sofaBusy=false,sofaReady=false,
  bedBusy=false,bedReady=false,showerBusy=false,showerReady=false,
  fridgeBusy=false,fridgeReady=false}={}){
  const eligible=actionId===null||(actionId==='sofa'&&sofaReady)||
    (actionId==='bed'&&bedReady)||(actionId==='fridge'&&fridgeReady)||
    (actionId==='shower'&&showerReady);
  return Boolean(preferred&&ready&&eligible&&(!sofaBusy||sofaReady)&&
    (!bedBusy||bedReady)&&(!showerBusy||showerReady)&&
    (!fridgeBusy||fridgeReady));
}
