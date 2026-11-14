/** Shared two-sleeper bed geometry, independent of PlayCanvas and the sim core. */
export const BED_SLOTS=Object.freeze({
  left:Object.freeze({
    id:'left',x:-3.18,approach:Object.freeze({x:-4.30,z:-.40}),
    edgeX:-3.97,edgeZ:-.47,approachYaw:90,
    pose:Object.freeze({x:-3.18,y:.74,z:-.64,pitch:-85,yaw:0})
  }),
  right:Object.freeze({
    id:'right',x:-2.06,approach:Object.freeze({x:-.93,z:-.40}),
    edgeX:-1.28,edgeZ:-.47,approachYaw:-90,
    pose:Object.freeze({x:-2.06,y:.74,z:-.64,pitch:-85,yaw:0})
  })
});
export const BED_SLOT_IDS=Object.freeze(['left','right']);
export const BED_CAPACITY=2;
export const BED_DEFAULT_SLOT=Object.freeze({alex:'left',mira:'right'});
export function validBedSlot(slot){return slot==='left'||slot==='right';}
/** Deterministic allocation; a third claimant (when both taken) receives null. */
export function availableBedSlot(occupied=[],preferred='left'){
  const used=new Set(occupied.filter(validBedSlot));
  const first=validBedSlot(preferred)?preferred:'left';
  return [first,...BED_SLOT_IDS].find(id=>!used.has(id))||null;
}
export function bedApproach(slot){
  return BED_SLOTS[validBedSlot(slot)?slot:'right'].approach;
}
