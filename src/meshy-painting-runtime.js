import {paintingStrokeFrame} from './painting-visual.js';
import {solveTwoBoneTargets} from './interaction-anchors.js';
/** H5a visual-only Mixamo overlay: true post-Anim reaching and a held brush.
 * No sim/root transforms, no activity mutation, one controller per resident.
 */
export function createMeshyPaintingController({pc,model,avatar}={}){
  const fallback={ready:false,setFrame(){},apply(){return false;}};
  if(!pc?.Quat||!pc?.Vec3||!pc?.Entity||!pc?.StandardMaterial||
    !pc?.Color||!model?.findByName||!avatar?.getWorldTransform)return fallback;
  const upper=model.findByName('mixamorig:RightArm');
  const fore=model.findByName('mixamorig:RightForeArm');
  const hand=model.findByName('mixamorig:RightHand');
  const neck=model.findByName('mixamorig:Neck');
  if(![upper,fore,hand].every(b=>b?.getPosition&&b?.getRotation&&
     b?.setRotation)||!hand.addChild)return fallback;
  const mat=new pc.StandardMaterial();
  mat.diffuse=new pc.Color(.64,.43,.24);mat.update();
  const tipMat=new pc.StandardMaterial();
  tipMat.diffuse=new pc.Color(.19,.40,.42);tipMat.update();
  const brush=new pc.Entity('H5a hand-held wooden brush');
  brush.addComponent('render',{type:'cylinder',material:mat});
  brush.setLocalPosition(0,.08,.06);brush.setLocalEulerAngles(83,0,0);
  brush.setLocalScale(.023,.24,.023);hand.addChild(brush);
  const tip=new pc.Entity('H5a paint tip');
  tip.addComponent('render',{type:'sphere',material:tipMat});
  tip.setLocalPosition(0,.11,0);tip.setLocalScale(.037,.05,.037);
  brush.addChild(tip);brush.enabled=false;
  const from=new pc.Vec3(),to=new pc.Vec3(),point=new pc.Vec3(),
    pole=new pc.Vec3(),worldPole=new pc.Vec3(),swing=new pc.Quat(),
    next=new pc.Quat(),mix=new pc.Quat(),neckDelta=new pc.Quat();
  let current=null,paused=false,healthy=true;
  const xyz=v=>({x:v.x,y:v.y,z:v.z});
  const finite=v=>v&&[v.x,v.y,v.z].every(Number.isFinite);
  function swingBone(bone,oldEnd,target,weight,maxDegrees){
    const start=bone.getPosition();
    from.set(oldEnd.x-start.x,oldEnd.y-start.y,oldEnd.z-start.z);
    to.set(target.x-start.x,target.y-start.y,target.z-start.z);
    if(from.length()<1e-5||to.length()<1e-5)return;
    from.normalize();to.normalize();
    const theta=Math.acos(Math.max(-1,Math.min(1,from.dot(to))));
    if(theta<1e-5)return;
    swing.setFromDirections(from,to);
    next.mul2(swing,bone.getRotation());
    mix.slerp(bone.getRotation(),next,Math.min(.92,weight,Math.PI*maxDegrees/180/theta));
    bone.setRotation(mix);
  }
  return {get ready(){return healthy;},
    setFrame(frame,freeze=false){
      current=healthy?paintingStrokeFrame(frame):null;
      paused=Boolean(freeze);
      brush.enabled=Boolean(current);
    },
    apply(){
      if(!healthy||!current||paused)return false;
      try{
      // +Z is the easel-facing direction of the existing character rig.
      avatar.getWorldTransform().transformPoint(
        new pc.Vec3(.11+current.strokeX,1.36+current.strokeY,.72),point);
      const shoulder=xyz(upper.getPosition()),elbow=xyz(fore.getPosition()),
        wrist=xyz(hand.getPosition());
      if(![shoulder,elbow,wrist,xyz(point)].every(finite))return false;
      const upperLength=Math.hypot(elbow.x-shoulder.x,elbow.y-shoulder.y,elbow.z-shoulder.z),
        lowerLength=Math.hypot(wrist.x-elbow.x,wrist.y-elbow.y,wrist.z-elbow.z);
      if(upperLength<.06||lowerLength<.06)return false;
      pole.set(-.48,-.12,.16);
      avatar.getWorldTransform().transformVector(pole,worldPole);
      const solved=solveTwoBoneTargets({
        hip:shoulder,knee:elbow,ankle:wrist,target:xyz(point),
        pole:{x:shoulder.x+worldPole.x,y:shoulder.y+worldPole.y,
          z:shoulder.z+worldPole.z},maxStretch:.96
      });
      if(!solved||![solved.knee,solved.ankle].every(finite))return false;
      swingBone(upper,elbow,solved.knee,current.weight*.93,75);
      swingBone(fore,xyz(hand.getPosition()),solved.ankle,current.weight*.93,105);
      if(neck?.getLocalRotation&&neck.setLocalRotation){
        neckDelta.setFromEulerAngles(7,0,0);
        mix.mul2(neck.getLocalRotation(),neckDelta);neck.setLocalRotation(mix);
      }
      return true;
      }catch(error){
        // A bad bone or browser-specific quaternion MUST NOT poison the
        // PlayCanvas frame. The next frame switches to procedural fallback.
        healthy=false;current=null;brush.enabled=false;
        console.warn('H5a brush controller disabled safely',error);
        return false;
      }
    }
  };
}
