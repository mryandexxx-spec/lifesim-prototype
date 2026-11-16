/** R1b optional post-Anim head tilt on existing Meshy neck. Cosmetic only. */
export function createMeshyKissController({pc,model}={}){
  const absent={ready:false,setFrame(){},apply(){return false;}};
  if(!pc?.Quat||!model?.findByName)return absent;
  const neck=model.findByName('mixamorig:Neck');
  if(!neck?.getLocalRotation||!neck?.setLocalRotation)return absent;
  const tilt=new pc.Quat(),posed=new pc.Quat();
  let frame=null,paused=false;
  return {
    ready:true,
    setFrame(next,freeze=false){frame=next;paused=Boolean(freeze);},
    apply(){
      if(paused||!frame?.active||!Number.isFinite(frame.weight)||
        frame.weight<=.002)return false;
      const w=Math.max(0,Math.min(1,frame.weight));
      // Add to the base Mixamo pose after animation each unpaused frame.
      // Paused postUpdate must not accumulate repeated local rotations.
      tilt.setFromEulerAngles(6*w,0,(frame.initiator?9:-9)*w);
      posed.mul2(neck.getLocalRotation(),tilt);
      neck.setLocalRotation(posed);
      return true;
    }
  };
}
