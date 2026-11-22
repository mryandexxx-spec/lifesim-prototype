// Visual frames come from the saved action clock. The route owns translation.
import {gardenFeature,GARDEN_DURATION} from './gardening.js';

export function wateringFrame(world,actor){
  const a=actor?.action;
  if(a?.phase!=='using'||a.id!=='garden'||a.gardenActionId!=='water')return null;
  const bed=gardenFeature(world,a.targetInstanceId);
  if(!bed||!Number.isFinite(a.elapsed))return null;
  const ramp=Math.max(0,Math.min(1,a.elapsed/2,(GARDEN_DURATION.water-a.elapsed)/2));
  return {kind:'water',weight:ramp*ramp*(3-2*ramp),phase:a.elapsed*1.8,
    yaw:Math.atan2(bed.x-actor.position.x,bed.z-actor.position.z)*180/Math.PI};
}

export function createOutdoorMotion({pc,model,avatar}){
  const joints=['Left','Right'].map(side=>['Arm','ForeArm','Hand','UpLeg','Leg','Foot']
    .map(part=>model.findByName('mixamorig:'+side+part)));
  if(!pc.Script||!pc.Vec3||!pc.Quat||joints.flat().some(b=>!b?.getRotation||!b.getPosition))
    return null;
  const can=new pc.Entity('Watering can');
  avatar.addChild(can);
  function piece(name,type,color,position,scale,pitch=0){
    const e=new pc.Entity(name),mat=new pc.StandardMaterial();
    mat.diffuse=new pc.Color(...color);mat.update();
    e.addComponent('render',{type,material:mat});can.addChild(e);
    e.setLocalPosition(...position);e.setLocalScale(...scale);e.setLocalEulerAngles(pitch,0,0);
    return e;
  }
  const enamel=[.18,.48,.43];
  piece('Reservoir','cylinder',enamel,[0,-.13,.02],[.23,.24,.27]);
  piece('Handle','box',enamel,[0,.01,-.05],[.16,.035,.045]);
  for(const x of [-.069,.069])piece('Grip support','box',enamel,[x,-.025,-.05],[.026,.08,.042]);
  piece('Spout','cylinder',enamel,[0,-.09,.23],[.046,.29,.046],55);
  const nozzle=piece('Rose','sphere',enamel,[0,-.008,.35],[.081,.048,.079],55);
  const stream=piece('Water stream','cylinder',[.48,.83,.90],[0,0,0],[.025,.50,.025]);
  can.enabled=false;
  const from=new pc.Vec3(),to=new pc.Vec3(),local=new pc.Vec3();
  const swing=new pc.Quat(),q=new pc.Quat(),tilt=new pc.Quat();
  let frame=null;
  function aim(bone,tip,x,y,z){
    from.sub2(tip.getPosition(),bone.getPosition()).normalize();
    avatar.getRotation().transformVector(local.set(x,y,z).normalize(),to);
    swing.setFromDirections(from,to);
    q.mul2(swing,bone.getRotation());bone.setRotation(q);
  }
  return {
    setFrame(value){frame=value;can.enabled=value?.kind==='water';},
    apply(){
      if(!frame)return;
      if(frame.kind==='water'){
        const w=frame.weight,sway=Math.sin(frame.phase)*w;
        const [arm,elbow,hand]=joints[1];
        aim(arm,elbow,-.23,-.85+.48*w,.32+.30*w);
        aim(elbow,hand,.05,-.35+.46*w,.68);
        can.setPosition(hand.getPosition());
        tilt.setFromEulerAngles(10+44*w+4*sway,6*sway,0);
        can.setRotation(q.mul2(avatar.getRotation(),tilt));
        stream.enabled=w>.36;
        if(stream.enabled){
          const tip=nozzle.getPosition();
          const length=Math.max(.01,tip.y-avatar.getPosition().y-.16);
          stream.setPosition(tip.x,tip.y-length/2,tip.z);
          stream.setEulerAngles(0,0,0);
          stream.setLocalScale(.018*w,length,.018*w);
        }
        return;
      }
      // After pitching the root into the lane, local +Y points forward.
      // Upper arm and forearm follow different arcs on catch and recovery.
      const wet=Math.min(1,Math.max(0,frame.pitch/70));
      for(let i=0;i<2;i++){
        const sign=i===0?1:-1,p=frame.stroke*2.9+i*Math.PI;
        const reach=Math.cos(p),pull=Math.sin(p);
        const [arm,elbow,hand,thigh,knee,foot]=joints[i];
        aim(arm,elbow,sign*(.36+.42*(1-reach*reach)),wet*reach-(1-wet)*.75,
          wet*.60*pull+.32*(1-wet));
        aim(elbow,hand,sign*(.12-.26*pull),wet*Math.cos(p-.45),
          .73*Math.sin(p-.45)+.49*(1-wet));
        aim(thigh,knee,sign*.10,-1,.30*Math.sin(2*p+i*Math.PI));
        aim(knee,foot,0,-1,-.18+.31*Math.sin(2*p+i*Math.PI-.55));
      }
    }
  };
}
