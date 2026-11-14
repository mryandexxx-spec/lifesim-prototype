/** Exact hips x/z samples of the user's 2.28 MB Mixamo GLB sit-to-stand clip.
 * Samples were audited from its glTF translation accessor, not guessed.
 * Only horizontal movement is cancelled: its *vertical* sit-down motion is
 * intentionally preserved on top of the original sofa cushion-root lift.
 * When the asset is replaced, the regression test must validate this curve.
 */
export const MESHY_SOFA_CLIP='Sit_to_Stand_Transition_M';
export const MESHY_SOFA_SECONDS=6.16667;
export const MESHY_IDLE_HIP=Object.freeze({x:.001,z:-.027});
const HIPS_XZ=Object.freeze([
[0,-.0166,-.7381],[.333,-.0159,-.7404],[.567,-.0151,-.7407],
[.833,-.0146,-.7400],[1.067,-.0142,-.7371],[1.167,-.0148,-.7342],
[1.267,-.0161,-.7289],[1.400,-.0170,-.7186],[1.467,-.0179,-.7112],
[1.500,-.0183,-.7068],[1.567,-.0194,-.6970],[1.633,-.0209,-.6859],
[1.700,-.0223,-.6741],[1.800,-.0248,-.6509],[1.900,-.0296,-.6289],
[1.933,-.0313,-.6216],[2.000,-.0348,-.6059],[2.133,-.0415,-.5801],
[2.167,-.0430,-.5722],[2.200,-.0441,-.5657],[2.267,-.0463,-.5485],
[2.333,-.0473,-.5308],[2.433,-.0448,-.5037],[2.500,-.0394,-.4859],
[2.567,-.0320,-.4697],[2.633,-.0233,-.4543],[2.700,-.0145,-.4396],
[2.733,-.0081,-.4317],[2.767,-.0002,-.4234],[2.833,.0194,-.4075],
[2.867,.0316,-.3990],[2.933,.0558,-.3848],[3.000,.0776,-.3733],
[3.067,.0950,-.3635],[3.133,.1079,-.3554],[3.200,.1167,-.3472],
[3.300,.1269,-.3402],[3.333,.1286,-.3386],[3.367,.1306,-.3349],
[3.467,.1312,-.3286],[3.500,.1304,-.3258],[3.567,.1264,-.3197],
[3.667,.1164,-.3095],[3.767,.1018,-.3001],[3.833,.0927,-.2954],
[3.933,.0804,-.2908],[4.033,.0711,-.2871],[4.167,.0636,-.2862],
[4.233,.0625,-.2866],[4.333,.0624,-.2879],[4.467,.0648,-.2907],
[4.633,.0709,-.2956],[4.833,.0801,-.3026],[4.967,.0851,-.3058],
[5.133,.0919,-.3074],[5.467,.0986,-.3106],[5.733,.0988,-.3147],
[6.167,.0916,-.3235]
]);

const clamp01=n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0));
/** Scrub backwards: sofaWeight=0 standing, sofaWeight=1 sitting. */
export function meshySitClipTime(sofaWeight) {
  return (1-clamp01(sofaWeight))*MESHY_SOFA_SECONDS;
}
export function meshyHipAtTime(seconds) {
  const t=Math.max(0,Math.min(MESHY_SOFA_SECONDS,Number.isFinite(seconds)?seconds:0));
  let lo=0,hi=HIPS_XZ.length-1;
  while(lo<hi){
    const mid=(lo+hi)>>1;
    if(HIPS_XZ[mid][0]<t)lo=mid+1;
    else hi=mid;
  }
  const b=HIPS_XZ[lo],a=HIPS_XZ[Math.max(0,lo-1)];
  const k=a===b?0:clamp01((t-a[0])/(b[0]-a[0]));
  return {x:a[1]+(b[1]-a[1])*k,z:a[2]+(b[2]-a[2])*k};
}
/** Cancels exported root-motion X/Z so the pre-existing sofa anchor is the
 * single authoritative placement source; we keep hips Y for sitting.
 */
export function meshySofaOffset(sofaWeight,scale) {
  if(!Number.isFinite(scale)||scale<=0)throw new RangeError('Invalid Meshy scale');
  const hips=meshyHipAtTime(meshySitClipTime(sofaWeight));
  return {x:(MESHY_IDLE_HIP.x-hips.x)*scale,
    z:(MESHY_IDLE_HIP.z-hips.z)*scale};
}
