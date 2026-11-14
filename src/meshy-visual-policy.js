import {MESHY_SOFA_CLIP} from './meshy-sofa-pose.js';
/** Pure, engine-independent Meshy appearance policy. Never mutates simulation/save. */
export const MESHY_ASSET_URL = './assets/characters/meshy-casual-v1.glb';
// Audited from the GLB POSITION accessor, NOT the dynamically animated skinned AABB.
// The 0.7b runtime bound can vary with the loaded pose and shrink Alex on Safari.
export const MESHY_SOURCE_BOUNDS = Object.freeze({
  min:Object.freeze({x:-.4431179464,y:0,z:-.1300967932}),
  max:Object.freeze({x:.4431178868,y:1.7000000477,z:.1300968230})
});
export const MESHY_IDLE_FOOT_LOCAL_Y = -.02791073;
export const MESHY_DISPLAY_HEIGHT = 2.05;

/** Stable asset-specific fit. The idle skinned feet are grounded at world y=0.
 * This changes only Alex's visual mesh: navigation, collisions and saves are
 * still driven by the existing original avatar.
 */
export function meshPlacement(targetHeight=MESHY_DISPLAY_HEIGHT){
  if(!Number.isFinite(targetHeight)||targetHeight<=0)throw new RangeError('Invalid height');
  const {min,max}=MESHY_SOURCE_BOUNDS;
  const scale=targetHeight/(max.y-min.y);
  return {
    scale,
    x:-(min.x+max.x)*scale/2,
    y:-MESHY_IDLE_FOOT_LOCAL_Y*scale,
    z:-(min.z+max.z)*scale/2
  };
}

/** One contact profile per RIG, not per sofa. All positions in imported GLB units.
 * The pelvis point is below mixamorig:Hips and represents the lower rear cloth
 * surface in the seated pose; a small cushion clearance avoids mesh overlap.
 */
export const MESHY_SEAT_RIG_PROFILE=Object.freeze({
  pelvisBone:'mixamorig:Hips',
  contact:Object.freeze({x:0,y:-.20,z:0}),
  clearance:.020,
  halfStance:.16,
  footForward:.46,
  footSideSigns:Object.freeze([1,-1]), // Mixamo Left has local +X, Right has -X
  ankleHeight:.073, // retained for explicit experimental full-XYZ mode
  // Audited from skinned t=0 Sit_to_Stand_Transition_M GLB: sole minima lie
  // 0.1504/0.1467 model units below respective animated ankle origins.
  soleDrops:Object.freeze([.15041,.14668]),
  frontClearance:.09, // shoe anchor just beyond front edge of seat, not under cushion
  groundClearance:.010,
  kneePoleForward:.60,
  kneePoleDown:.30,
  legs:Object.freeze([
    Object.freeze({thigh:'mixamorig:LeftUpLeg',shin:'mixamorig:LeftLeg',
      ankle:'mixamorig:LeftFoot'}),
    Object.freeze({thigh:'mixamorig:RightUpLeg',shin:'mixamorig:RightLeg',
      ankle:'mixamorig:RightFoot'})
  ])
});

/** 0.7c Safari regression guard. Unsafe XYZ/IK remains explicit QA opt-in. */
export function meshSeatRuntimeSettings(seatParam=null,ikParam=null,legsParam=null){
  if(seatParam==='legacy')
    return {enabled:false,mode:'vertical',footIK:false,footPlant:false};
  if(seatParam==='full')
    return {enabled:true,mode:'full',footIK:ikParam==='on',footPlant:false};
  // This foot-plant modifies only the thighs/shins near FULL seating.
  // Unlike the unsafe experimental full XYZ IK, it never moves the avatar.
  return {enabled:true,mode:'vertical',footIK:false,footPlant:legsParam!=='off'};
}

export const MESHY_VISUAL_KEY = 'lifesim.meshyVisual.v1';
export const REQUIRED_MESHY_CLIPS = Object.freeze([
  'Idle_3','Walking','Listening_Gesture','Stand_Talking_Angry',MESHY_SOFA_CLIP
]);

/** Optional query override is useful if a device cannot render the new skin. */
export function meshVisualPreference(stored, query = '') {
  if (query === 'legacy') return false;
  if (query === 'meshy') return true;
  return stored !== 'legacy';
}

export function meshClipFor({walking = false, social = null} = {}) {
  if (walking) return 'Walking';
  if (social === 'argue') return 'Stand_Talking_Angry';
  if (social === 'talk') return 'Listening_Gesture';
  return 'Idle_3';
}

/** Sofa uses its audited Meshy sit clip; unretargeted bed/fridge/shower must retain legacy. */
export function canShowMeshy({
  preferred = false, ready = false, actionId = null,
  sofaBusy = false, bedBusy = false, showerBusy = false,
  fridgeBusy = false
} = {}) {
  return Boolean(preferred && ready && (actionId===null||actionId==='sofa') &&
    !bedBusy && !showerBusy && !fridgeBusy);
}

export function availableMeshClips(names) {
  const found = new Set(names);
  return REQUIRED_MESHY_CLIPS.every(name => found.has(name));
}
