import {musicMovementFrame} from './music-movement.js';

/** H2b cosmetic overlay for both original Meshy/Mixamo skins. Underlying Idle
 * clip continues to animate normally. A post-Anim rotation of real skeleton
 * joints supplies separate listen/dance loops without needing copied clips.
 * No root translation: navigation, placements, reading and save stay owned by
 * the simulation and the existing avatar.
 */
export function createMeshyMusicController({pc,model}={}){
  const fallback={ready:false,setFrame(){},apply(){return false;}};
  if(!pc?.Quat||!model?.findByName)return fallback;
  const names={
    leftArm:'mixamorig:LeftArm',rightArm:'mixamorig:RightArm',
    leftForeArm:'mixamorig:LeftForeArm',rightForeArm:'mixamorig:RightForeArm',
    leftLeg:'mixamorig:LeftUpLeg',rightLeg:'mixamorig:RightUpLeg',
    leftKnee:'mixamorig:LeftLeg',rightKnee:'mixamorig:RightLeg',
    spine:'mixamorig:Spine',spine1:'mixamorig:Spine1',
    hips:'mixamorig:Hips',neck:'mixamorig:Neck'
  };
  const bones=Object.fromEntries(Object.entries(names).map(([key,name])=>[key,model.findByName(name)]));
  // Do not replace a valid skin on a GLB with a different hierarchy.
  if(!bones.leftArm?.getLocalRotation||!bones.rightArm?.getLocalRotation||
     !bones.spine?.getLocalRotation)return fallback;
  const delta=new pc.Quat(),composed=new pc.Quat();
  let current=null,paused=false;
  const angle=(value,scale=1)=>Number.isFinite(value)?value*scale:0;
  function offset(name,pitch=0,yaw=0,roll=0){
    const bone=bones[name];
    if(!bone?.getLocalRotation||!bone?.setLocalRotation)return false;
    delta.setFromEulerAngles(pitch,yaw,roll);
    // Evaluation runs AFTER PlayCanvas Anim has reset all local joints to the
    // original base clip, avoiding permanent changes to the imported skeleton.
    composed.mul2(bone.getLocalRotation(),delta);
    bone.setLocalRotation(composed);
    return true;
  }
  return Object.freeze({
    ready:true,
    get motion(){return current;},
    setFrame(frame,freeze=false){
      current=musicMovementFrame(frame);
      paused=Boolean(freeze);
    },
    apply(){
      if(!current||paused)return false;
      const m=current,weight=m.kind==='dance'?1:.74;
      offset('leftArm',angle(m.arms[0],weight),0,7*weight);
      offset('rightArm',angle(m.arms[1],weight),0,-7*weight);
      offset('leftForeArm',angle(m.elbows[0],weight));
      offset('rightForeArm',angle(m.elbows[1],weight));
      offset('leftLeg',angle(m.legs[0],.7),0,angle(m.stepOut?.[0]));
      offset('rightLeg',angle(m.legs[1],.7),0,angle(m.stepOut?.[1]));
      offset('leftKnee',angle(m.knees[0],.7));
      offset('rightKnee',angle(m.knees[1],.7));
      offset('hips',0,angle(m.spineTwist,.4),angle(m.pelvisRoll,.6));
      offset('spine',angle(m.spineLean,.4),angle(m.spineTwist,.5),angle(m.torsoRoll,.65));
      offset('spine1',angle(m.spineLean,.35),angle(m.spineTwist,.3),angle(m.spineRoll,.65));
      offset('neck',angle(m.headPitch,.65),0,angle(m.headRoll,.65));
      return true;
    }
  });
}
