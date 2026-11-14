/** Double-bed geometry shared between renderer, AI and storage. */
export const BED_LAYOUT=Object.freeze({
  centerX:-2.62,centerZ:-1.42,width:2.23,depth:2.36,
  mattressY:.37,mattressHeight:.22,frameY:.205,frameHeight:.23,
  hipY:.65
});
export const BED_SLOTS=Object.freeze({
  left:Object.freeze({
    id:'left',x:-3.18,approach:Object.freeze({x:-4.35,z:-1.42}),
    edgeX:-3.74,edgeZ:-1.42,approachYaw:-90,
    pose:Object.freeze({x:-3.18,y:.65-.72*Math.cos(78*Math.PI/180),z:-1.42+.72*Math.sin(78*Math.PI/180),pitch:-78,yaw:0})
  }),
  right:Object.freeze({
    id:'right',x:-2.06,approach:Object.freeze({x:-.89,z:-1.42}),
    edgeX:-1.50,edgeZ:-1.42,approachYaw:90,
    pose:Object.freeze({x:-2.06,y:.65-.72*Math.cos(78*Math.PI/180),z:-1.42+.72*Math.sin(78*Math.PI/180),pitch:-78,yaw:0})
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
