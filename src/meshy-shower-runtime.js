/**
 * Original, engine-independent Meshy shower gesture layer. This is NEVER
 * responsible for privacy, clothing, simulated water, movement or saving.
 * The game hides the entire avatar during the opaque privacy enclosure.
 */
const clamp=n=>Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
const ease=(a,b,p)=>{const t=clamp((p-a)/(b-a));return t*t*(3-2*t);};
export const MESHY_SHOWER_BONES=Object.freeze([
  'mixamorig:LeftArm','mixamorig:RightArm',
  'mixamorig:LeftForeArm','mixamorig:RightForeArm'
]);
export const SHOWER_WALK_STRIDE_METERS=1.3;

/** Sync the actual imported Walking track with the existing route distance. */
export function showerWalkClipTime(metres,duration){
  if(!Number.isFinite(metres)||metres<0||
    !Number.isFinite(duration)||duration<=0)return null;
  return (metres/SHOWER_WALK_STRIDE_METERS%1)*duration;
}
/** Pure pose; only wash inside the masked/water-on window. */
export function meshyShowerPose(frame){
  if(!frame||!Number.isFinite(frame.progress)||
    !Number.isFinite(frame.gaitMeters)||frame.gaitMeters<0)return null;
  const p=clamp(frame.progress),step=clamp(frame.stepWeight);
  const masked=frame.privacy===true;
  const water=frame.water===true&&masked;
  const wash=water?ease(.36,.41,p)*(1-ease(.77,.81,p)):0;
  const t=p*38;
  return {walking:step>.025,step,gaitMeters:frame.gaitMeters,
    washing:wash,privacy:masked,
    // Gentle, alternating hand motions under the opaque privacy enclosure.
    angles:[
      (32+11*Math.sin(t))*wash,
      (31-10*Math.sin(t*.93))*wash,
      (51+13*Math.sin(t*1.15))*wash,
      (49-12*Math.sin(t*.85))*wash
    ]};
}
/** Post-Anim washing pose. No generated skin, and NO visible nude avatar. */
export function createMeshyShowerController({pc,model}={}){
  const unavailable={ready:false,setFrame(){},apply(){return false;}};
  if(!pc?.Quat||!pc?.Vec3||!model?.findByName)return unavailable;
  const bones=MESHY_SHOWER_BONES.map(name=>model.findByName(name));
  if(bones.some(bone=>!bone||typeof bone.getLocalRotation!=='function'||
    typeof bone.setLocalRotation!=='function'))return unavailable;
  const axis=new pc.Vec3(1,0,0),delta=new pc.Quat(),target=new pc.Quat();
  let frame=null,paused=false;
  function apply(){
    if(paused)return false;
    const pose=meshyShowerPose(frame);
    // Never pose a visible character as naked. The game, not this script,
    // keeps the entire rig disabled until the opaque enclosure disappears.
    if(!pose||!pose.privacy||pose.washing<=0)return false;
    let moved=false;
    for(let i=0;i<bones.length;i++){
      const angle=pose.angles[i];
      if(Math.abs(angle)<.001)continue;
      const node=bones[i];
      delta.setFromAxisAngle(axis,angle);
      target.mul2(node.getLocalRotation(),delta);
      node.setLocalRotation(target);
      moved=true;
    }
    return moved;
  }
  return {ready:true,setFrame(next,freeze=false){frame=next;paused=freeze;},apply};
}
