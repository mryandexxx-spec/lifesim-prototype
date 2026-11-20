import {BED_SLOTS} from './bed-layout.js';

const clamp=n=>Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;

// Measured against the supplied skinned clips and the platform bed triangles.
// Alex reclines from Idle_3; Mira's authored sleep clip already rotates her hips.
// Offsets are in mattress coordinates, relative to the shared animation root.
const sleepingSkinFit=Object.freeze({
  alex:{pitch:-8,lift:.16,along:.29},
  mira:{pitch:4,lift:.08,along:-.17}
});

export function bedSkinSupport(resident,frame){
  const weight=clamp(frame?.bedReclineWeight);
  const fit=sleepingSkinFit[resident];
  if(!weight||!fit||!Number.isFinite(frame.pitch))return null;
  // The visual is a child of the reclining avatar. Invert the parent's pitch
  // so "lift" remains vertical at every stage and for every furniture yaw.
  const angle=frame.pitch*Math.PI/180;
  const c=Math.cos(angle),s=Math.sin(angle);
  return {pitch:fit.pitch*weight,y:(c*fit.lift+s*fit.along)*weight,
    z:(-s*fit.lift+c*fit.along)*weight};
}

export function placeBedSkin(root,support){
  root.setLocalPosition(0,support?.y??0,support?.z??0);
  root.setLocalEulerAngles(support?.pitch??0,0,0);
}

/**
 * Converts the existing mirrored side-entry timeline into conservative
 * local Mixamo joint offsets. The authoritative game bed transition ALREADY
 * controls pelvis x/y/z, head direction, mattress slots and avatar pitch.
 * Never introduce another root movement controller in this layer.
 */
export function meshyBedPose(frame){
  if(!frame||!BED_SLOTS[frame.bedSide]||
    !Number.isFinite(frame.bedSitWeight)||
    !Number.isFinite(frame.bedReclineWeight))return null;
  const sit=clamp(frame.bedSitWeight);
  // The source transition uses sin(PI * phase), whose endpoint can be a
  // tiny nonzero floating-point residue. Snap those to exact rest values.
  const step=clamp(frame.bedStepWeight)<1e-7?0:clamp(frame.bedStepWeight);
  const swing=clamp(frame.bedSwingWeight)<1e-7?0:clamp(frame.bedSwingWeight);
  const recline=clamp(frame.bedReclineWeight);
  const side=frame.bedSide==='left'?1:-1;
  // Keep hips in the source standing pose while prone. The game rotates
  // the ENTIRE body onto the mattress; knees bend only on the rail.
  const hips=[
    -69*sit-16*side*step+8*side*swing,
    -69*sit+16*side*step-8*side*swing
  ];
  const knees=[78*sit+14*step,78*sit+9*step];
  const shoulders=[
    -18*sit-15*side*swing-9*recline,
    -19*sit+15*side*swing-9*recline
  ];
  const elbows=[34*sit+17*swing+13*recline,30*sit+13*swing+13*recline];
  return {side:frame.bedSide,step,sit,swing,recline,
    hips,knees,shoulders,elbows};
}

export const MESHY_BED_BONES=Object.freeze([
  'mixamorig:LeftUpLeg','mixamorig:RightUpLeg',
  'mixamorig:LeftLeg','mixamorig:RightLeg',
  'mixamorig:LeftArm','mixamorig:RightArm',
  'mixamorig:LeftForeArm','mixamorig:RightForeArm'
]);

/**
 * Visual-only post-Anim overlay. GLB uses an authored Idle base and the
 * original bedTransitionPose drives the root: this only bends 8 joints.
 * The AnimComponent re-evaluates the base pose before every postUpdate.
 * During pause we MUST NOT apply twice to frozen quaternions.
 */
export function createMeshyBedController({pc,model}={}){
  const unavailable={ready:false,setFrame(){},apply(){return false;}};
  if(!pc?.Quat||!pc?.Vec3||!model?.findByName)return unavailable;
  const bones=MESHY_BED_BONES.map(name=>model.findByName(name));
  if(bones.some(bone=>!bone||typeof bone.getLocalRotation!=='function'||
    typeof bone.setLocalRotation!=='function'))return unavailable;
  const axis=new pc.Vec3(1,0,0);
  const delta=new pc.Quat(),target=new pc.Quat();
  let frame=null,paused=false;
  const values=pose=>[
    ...pose.hips,...pose.knees,...pose.shoulders,...pose.elbows
  ];
  function apply(){
    if(paused)return false; // prevent cumulative rotation on frozen Anim.
    const pose=meshyBedPose(frame);
    if(!pose)return false;
    let moved=0;
    for(const [i,angle] of values(pose).entries()){
      if(Math.abs(angle)<.001)continue;
      const node=bones[i];
      delta.setFromAxisAngle(axis,angle);
      target.mul2(node.getLocalRotation(),delta);
      node.setLocalRotation(target);
      moved++;
    }
    return moved>0;
  }
  return {ready:true,setFrame(next,freeze=false){frame=next;paused=freeze;},apply};
}
