/** H2b: shared, deterministic visual performance for passive listening and dancing.
 * Pure pose data: no PlayCanvas, save writes, clocks, side effects or licensed clips.
 * Elapsed is the existing simulated activity clock, frozen by pause and restored from v1.
 */
export const MUSIC_LISTEN_ACTIVITY_ID='hobby.listen.music';
export const MUSIC_DANCE_ACTIVITY_ID='hobby.dance.music';
export const MUSIC_ACTION_IDS=Object.freeze([MUSIC_LISTEN_ACTIVITY_ID,MUSIC_DANCE_ACTIVITY_ID]);
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export function musicMovementFrame(frame=null){
  if(!frame||frame.phase!=='using'||!finite(frame.elapsed)||frame.elapsed<0||
    !(MUSIC_ACTION_IDS.includes(frame.activityId)||frame.activityId==='dining.meal'))return null;
  if(frame.activityId==='dining.meal'){
    // F4F: skinned bite-to-mouth motion over the existing real sofa/chair sit.
    const phase=frame.elapsed*2*Math.PI/3.1;
    const bite=(1+Math.sin(phase))*.5;
    return {kind:'meal',arms:[-18-35*bite,7],elbows:[-25-39*bite,5],
      legs:[0,0],knees:[0,0],torsoRoll:1.2*Math.sin(phase),pelvisRoll:0,
      spineLean:2,spineTwist:0,spineRoll:0,headPitch:4+3*bite,headRoll:0};
  }
  const dance=frame.activityId===MUSIC_DANCE_ACTIVITY_ID;
  const style=frame.contentId;
  const tempo=style==='music.rhythmic'?1.23:style==='music.dreamy'?.91:1;
  // Do not modulo before applying the style tempo: an off-beat style would
  // otherwise snap its joints every base-cycle boundary.
  const phase=2*Math.PI*frame.elapsed/(dance?4.2:10)*tempo;
  const sin=Math.sin(phase),cos=Math.cos(phase),counter=Math.sin(phase+Math.PI);
  // Subtle, relaxed nods and shoulders; standing feet stay close to planted.
  if(!dance)return {
    kind:'listen',arms:[8+5*sin,7+4*counter],
    elbows:[4+4*cos,5-4*cos],legs:[1.8*sin,-1.8*sin],knees:[1,1],
    torsoRoll:2.7*sin,pelvisRoll:1.6*sin,spineLean:2+1.8*cos,
    spineTwist:3.2*sin,spineRoll:2*sin,hipShift:0,bodyLift:0,
    headPitch:5+4*cos,headRoll:2.4*sin
  };
  // Distinct full-body loop: contra-lateral steps, elbows/raised hands,
  // weight transfer and visible chest twist. No displacement of A* root.
  return {
    kind:'dance',arms:[-31-23*sin,-31+23*sin],
    elbows:[-26-13*cos,-26+13*cos],
    legs:[16*sin,-16*sin],knees:[7+14*Math.max(0,cos),7+14*Math.max(0,-cos)],
    torsoRoll:8.5*sin,pelvisRoll:6*sin,
    spineLean:5+5*cos,spineTwist:13*sin,spineRoll:7.5*sin,
    hipShift:.038*sin,bodyLift:.018*Math.abs(sin),
    headPitch:5+7*cos,headRoll:5*sin
  };
}
