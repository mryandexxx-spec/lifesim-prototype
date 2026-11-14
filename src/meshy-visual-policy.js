/** Pure, engine-independent Meshy appearance policy. Never mutates simulation/save. */
export const MESHY_ASSET_URL = './assets/characters/meshy-casual-v1.glb';
export const MESHY_DISPLAY_HEIGHT = 1.78;
export const MESHY_VISUAL_KEY = 'lifesim.meshyVisual.v1';
export const REQUIRED_MESHY_CLIPS = Object.freeze([
  'Idle_3','Walking','Listening_Gesture','Stand_Talking_Angry'
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

/** Any furniture/exit transition must retain the established procedural pose. */
export function canShowMeshy({
  preferred = false, ready = false, actionId = null,
  sofaBusy = false, bedBusy = false, showerBusy = false,
  fridgeBusy = false
} = {}) {
  return Boolean(preferred && ready && !actionId &&
    !sofaBusy && !bedBusy && !showerBusy && !fridgeBusy);
}

export function availableMeshClips(names) {
  const found = new Set(names);
  return REQUIRED_MESHY_CLIPS.every(name => found.has(name));
}
