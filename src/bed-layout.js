/** Double-bed geometry shared between renderer, AI and storage. */
export const BED_SLOTS=Object.freeze({
  left:Object.freeze({
    id:'left',x:-3.18,approach:Object.freeze({x:-4.35,z:-1.42}),
    edgeX:-3.72,edgeZ:-1.42,approachYaw:-90,
    pose:Object.freeze({x:-3.18,y:.751,z:-.64,pitch:-85,yaw:0})
  }),
  right:Object.freeze({
    id:'right',x:-2.06,approach:Object.freeze({x:-.89,z:-1.42}),
    edgeX:-1.52,edgeZ:-1.42,approachYaw:90,
    pose:Object.freeze({x:-2.06,y:.751,z:-.64,pitch:-85,yaw:0})
  })
});
export const BED_SLOT_IDS=Object.freeze(['left','right']);
export const BED_CAPACITY=2;
export function validBedSlot(slot){return slot==='left'||slot==='right';}
/** Only occupancy matters. No resident has an assigned or preferred side. */
export function availableBedSlot(occupied=[],preferred='left'){
  const used=new Set(occupied.filter(validBedSlot));
  const first=validBedSlot(preferred)?preferred:'left';
  return [first,...BED_SLOT_IDS].find(id=>!used.has(id))||null;
}
export function bedApproach(slot){
  return BED_SLOTS[validBedSlot(slot)?slot:'right'].approach;
}
