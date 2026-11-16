import {solveTwoBoneTargets} from './interaction-anchors.js';
/** Post-Anim arm/contact overlay. Never changes saved positions or consent. */
export function createMeshyHugController({pc,model,avatar,partnerAvatar}={}){
  const absent={ready:false,setFrame(){},apply(){return false;}};
  if(!pc?.Vec3||!pc?.Quat||!model?.findByName||
    !avatar?.getWorldTransform||!partnerAvatar?.getWorldTransform)return absent;
  const arms=['Left','Right'].map(side=>({
    sign:side==='Left'?1:-1,
    upper:model.findByName('mixamorig:'+side+'Arm'),
    fore:model.findByName('mixamorig:'+side+'ForeArm'),
    hand:model.findByName('mixamorig:'+side+'Hand')
  }));
  if(arms.some(a=>!a.upper||!a.fore||!a.hand))return absent;
  const from=new pc.Vec3(),to=new pc.Vec3(),swing=new pc.Quat(),
    destinationQ=new pc.Quat(),blendedQ=new pc.Quat(),
    target=new pc.Vec3(),poleWorld=new pc.Vec3();
  const targets=arms.map(a=>new pc.Vec3(-a.sign*.21,1.13,-.10));
  const poles=arms.map(a=>new pc.Vec3(a.sign*.48,.05,.12));
  const xyz=v=>({x:v.x,y:v.y,z:v.z});
  let frame=null;
  function rotateToward(bone,oldEnd,newEnd,weight){
    const origin=bone.getPosition();
    from.set(oldEnd.x-origin.x,oldEnd.y-origin.y,oldEnd.z-origin.z);
    to.set(newEnd.x-origin.x,newEnd.y-origin.y,newEnd.z-origin.z);
    if(from.length()<1e-5||to.length()<1e-5)return;
    from.normalize();to.normalize();
    const cosine=Math.max(-1,Math.min(1,from.dot(to)));
    if(cosine>.99999)return;
    swing.setFromDirections(from,to);
    const current=bone.getRotation();
    destinationQ.mul2(swing,current);
    blendedQ.slerp(current,destinationQ,Math.min(.92,weight));
    bone.setRotation(blendedQ);
  }
  function apply(){
    const weight=Number.isFinite(frame?.weight)
      ?Math.max(0,Math.min(1,frame.weight)):0;
    if(weight<.005)return false;
    let applied=false;
    for(let i=0;i<arms.length;i++){
      const a=arms[i];
      const shoulder=xyz(a.upper.getPosition()),
        elbow=xyz(a.fore.getPosition()),wrist=xyz(a.hand.getPosition());
      partnerAvatar.getWorldTransform().transformPoint(targets[i],target);
      avatar.getWorldTransform().transformVector(poles[i],poleWorld);
      const upperLength=Math.hypot(elbow.x-shoulder.x,
        elbow.y-shoulder.y,elbow.z-shoulder.z);
      const lowerLength=Math.hypot(wrist.x-elbow.x,
        wrist.y-elbow.y,wrist.z-elbow.z);
      const distance=Math.hypot(target.x-shoulder.x,
        target.y-shoulder.y,target.z-shoulder.z);
      if(upperLength<.06||lowerLength<.06||
        distance>(upperLength+lowerLength)*1.45)continue;
      let solved;
      try{
        solved=solveTwoBoneTargets({
          hip:shoulder,knee:elbow,ankle:wrist,target:xyz(target),
          pole:{x:shoulder.x+poleWorld.x,y:shoulder.y+poleWorld.y,
            z:shoulder.z+poleWorld.z},maxStretch:.985
        });
      }catch{continue;}
      rotateToward(a.upper,elbow,solved.knee,weight*.94);
      rotateToward(a.fore,xyz(a.hand.getPosition()),solved.ankle,weight*.91);
      applied=true;
    }
    return applied;
  }
  return {ready:true,setFrame(value){frame=value;},apply};
}
