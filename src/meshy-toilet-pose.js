/**
 * Authored Meshy toilet sitting bridge. Pure visual math: no new asset, world
 * motion, animation clock, save schema or privacy policy.
 */
import {MESHY_SOFA_CLIP,MESHY_SOFA_SECONDS,meshySitClipTime,meshySofaOffset}
  from './meshy-sofa-pose.js';
import {MIRA_SOFA_CLIP,MIRA_SOFA_DURATION,miraSofaClipTime,miraSofaOffset}
  from './meshy-mira-sofa.js';
import {showerWalkClipTime} from './meshy-shower-runtime.js';
const clamp=n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0));

export function hasToiletSitClip(clips,resident){
  const expected=resident==='alex'
    ?{name:MESHY_SOFA_CLIP,duration:MESHY_SOFA_SECONDS}
    :resident==='mira'
      ?{name:MIRA_SOFA_CLIP,duration:MIRA_SOFA_DURATION}:null;
  if(!expected||!Array.isArray(clips))return false;
  const actual=clips.find(c=>c?.name===expected.name);
  return Number.isFinite(actual?.duration)&&
    Math.abs(actual.duration-expected.duration)<.04;
}
/** Timeline is the authoritative toiletSequence/exitFrame, also after reload.
 * X/Z hip drift is cancelled relative to the source clip's standing frame.
 * The existing game root keeps owning movement, yaw and vertical seat height.
 */
export function meshyToiletPose(frame,{resident,scale,walkDuration}={}){
  if(!frame||!['alex','mira'].includes(resident)||
    !Number.isFinite(scale)||scale<=0||
    !Number.isFinite(frame.seated)||!Number.isFinite(frame.walkWeight)||
    !Number.isFinite(frame.gaitMeters)||frame.gaitMeters<0||
    (frame.seated>.001&&frame.privacy!==true))return null;
  const sit=clamp(frame.seated);
  const walking=clamp(frame.walkWeight)>.025&&sit<.015;
  const idle=resident==='alex'?'Idle_3':'Idle_7';
  const walk=resident==='alex'?'Walking':'Walking_Woman';
  if(walking){
    const time=showerWalkClipTime(frame.gaitMeters,walkDuration);
    if(time===null)return null;
    return {clip:walk,time,walking:true,sitting:false,
      offset:{x:0,y:0,z:0}};
  }
  if(sit<.001)return {clip:idle,time:null,walking:false,sitting:false,
    offset:{x:0,y:0,z:0}};
  const male=resident==='alex';
  const offset=male?meshySofaOffset(sit,scale):miraSofaOffset(sit,scale);
  const standing=male?meshySofaOffset(0,scale):miraSofaOffset(0,scale);
  return {clip:male?MESHY_SOFA_CLIP:MIRA_SOFA_CLIP,
    time:male?meshySitClipTime(sit):miraSofaClipTime(sit),
    walking:false,sitting:true,
    offset:{x:offset.x-standing.x,y:0,z:offset.z-standing.z}};
}
