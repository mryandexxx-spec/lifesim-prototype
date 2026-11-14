/** Original female GLB's Look_Back_and_Sit pelvis translation samples (seconds, x, z).
 * Audited directly from animation sampler's glTF Float32 VEC3 output.
 * Furniture/game root is authoritative; don't double-apply source hip drift.
 */
export const MIRA_SOFA_CLIP='Look_Back_and_Sit';
export const MIRA_SOFA_DURATION=2.26666665;
export const MIRA_IDLE_HIP=Object.freeze({x:-.005975,z:-.008519});
export const MIRA_SOFA_HIPS=Object.freeze([
[0,.00492,-.01003],[.1333,-.00057,-.01045],[.2333,-.00552,-.01438],
[.3,-.01056,-.01996],[.4333,-.02091,-.03467],[.5,-.02425,-.04218],
[.5667,-.02589,-.05149],[.6,-.02498,-.05819],[.6333,-.02258,-.06677],
[.6667,-.01939,-.07698],[.7333,-.01164,-.09936],[.8,-.00396,-.12476],
[.8667,.00231,-.15394],[.9,.00459,-.16936],[.9333,.00629,-.18524],
[.9667,.00738,-.20144],[1,.00790,-.21734],[1.0333,.00811,-.23280],
[1.0667,.00810,-.24798],[1.1,.00785,-.26306],[1.2,.00539,-.30862],
[1.2667,.00353,-.33903],[1.3,.00268,-.35379],[1.3333,.00195,-.36756],
[1.3667,.00131,-.38005],[1.4,.00082,-.39099],[1.4333,.00042,-.40001],
[1.4667,.00017,-.40628],[1.5,.00015,-.41005],[1.5333,.00023,-.41281],
[1.5667,.00029,-.41463],[1.6,.00028,-.41570],[1.7,.00014,-.41822],
[1.8,.00013,-.41923],[2.2667,.00013,-.41930]
]);
const clamp01=x=>Number.isFinite(x)?Math.max(0,Math.min(1,x)):0;
export const miraSofaClipTime=weight=>clamp01(weight)*MIRA_SOFA_DURATION;
export function miraSofaHipAt(seconds){
  const t=Math.max(0,Math.min(MIRA_SOFA_DURATION,Number.isFinite(seconds)?seconds:0));
  let lo=0,hi=MIRA_SOFA_HIPS.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(MIRA_SOFA_HIPS[mid][0]<t)lo=mid+1;else hi=mid;}
  const b=MIRA_SOFA_HIPS[lo],a=MIRA_SOFA_HIPS[Math.max(lo-1,0)];
  const factor=a===b?0:clamp01((t-a[0])/(b[0]-a[0]));
  return {x:a[1]+(b[1]-a[1])*factor,z:a[2]+(b[2]-a[2])*factor};
}
/** X/Z only. Leave original authored knee bend and vertical hip descent intact. */
export function miraSofaOffset(weight,scale){
  if(!Number.isFinite(scale)||scale<=0)throw new RangeError('Mira sofa scale must be positive');
  const hip=miraSofaHipAt(miraSofaClipTime(weight));
  return {x:(MIRA_IDLE_HIP.x-hip.x)*scale,
    z:(MIRA_IDLE_HIP.z-hip.z)*scale};
}
