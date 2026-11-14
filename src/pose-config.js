/** Shared dimensions for two-piece legs and the sofa; all dimensions are full sizes. */
export const LEG_GEOMETRY=Object.freeze({
  hipHeight:.72,thighCenterY:-.168,thighHeight:.385,
  kneeOffsetY:-.36,shinCenterY:-.135,shinHeight:.32,
  shoeCenterY:-.29,shoeHeight:.15
});
export const SOFA_LAYOUT=Object.freeze({
  x:1.35,z:1.54,seatCenterY:.21,seatHeight:.28,seatWidth:2.53,seatDepth:1.05,
  backCenterY:.57,backHeight:.81,backZ:2.10,
  armCenterY:.44,armHeight:.67,
  pillowCenterY:.47,pillowHeight:.23,pillowZ:1.80
});
export const SOFA_POSE=Object.freeze({x:1.35,y:-.26,z:1.44,pitch:0,yaw:180});
/* Negative X pitch moves thighs to the avatar's front (+Z).
   The opposite knee pitch keeps the shin pointing downward. */
export const SOFA_HIP_PITCH=-79;
export const SOFA_KNEE_PITCH=79;
