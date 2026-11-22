import {solveTwoBoneTargets} from './interaction-anchors.js';
import {FRIDGE_LAYOUT} from './fridge-interaction.js';

const clamp=n=>Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
const ease=(a,b,p)=>{const t=clamp((p-a)/(b-a));return t*t*(3-2*t);};

/** An engine-independent, reconstructable arm/hand intent from fridgeSequence. */
export function meshyFridgePose(frame){
  if(!frame||!Number.isFinite(frame.progress))return null;
  const p=clamp(frame.progress);
  const handle=ease(.035,.13,p)*(1-ease(.24,.32,p));
  const transfer=frame.mode==='take'||frame.mode==='store';
  const carry=transfer?frame.carry:0;
  const shelf=transfer?ease(.20,.42,p)*(1-ease(.50,.69,p)):ease(.25,.35,p)*(1-ease(.41,.53,p));
  const mouth=transfer?0:ease(.46,.65,p)*(1-ease(.94,.995,p));
  return {handle,shelf,mouth,carry,weight:Math.max(handle,shelf,mouth,carry),
    food:clamp(frame.handFood),progress:p};
}

/**
 * Post-animation bone overlay. The authoritative avatar/game root is never
 * repositioned. The base Mixamo Idle animation resets bones every frame;
 * this controller must be called from Script.postUpdate, AFTER Anim update.
 */
export function createMeshyFridgeController({
  pc,model,avatar,layout=FRIDGE_LAYOUT,resident='Alex'
}={}){
  const unavailable={ready:false,setFrame(){},apply(){return false;}};
  if(!model?.findByName||!avatar||!pc?.Vec3||!pc?.Quat)return unavailable;
  const upper=model.findByName('mixamorig:RightArm');
  const forearm=model.findByName('mixamorig:RightForeArm');
  const hand=model.findByName('mixamorig:RightHand');
  const head=model.findByName('mixamorig:Head');
  const layoutNow=()=>typeof layout==='function'?layout():layout;
  const first=layoutNow();
  if(!upper||!forearm||!hand||!head||!first?.handle||
    !first?.shelfTarget||!Number.isFinite(first.handleY))return unavailable;

  // One small snack mesh per imported model, parented to the REAL hand bone.
  const food=new pc.Entity('Meshy '+resident+' hand snack');
  const material=new pc.StandardMaterial();
  material.diffuse=new pc.Color(1,.70,.28);
  material.update();
  food.addComponent('render',{type:'sphere',material});
  hand.addChild(food);
  food.setLocalPosition(0,0,.055);
  food.enabled=false;

  const from=new pc.Vec3(),to=new pc.Vec3(),swing=new pc.Quat();
  const destinationQ=new pc.Quat(),blendedQ=new pc.Quat();
  const front=new pc.Vec3(0,0,.135),poleDirection=new pc.Vec3(-.36,-.15,.22);
  const frontWorld=new pc.Vec3(),poleWorld=new pc.Vec3();
  const xyz=v=>({x:v.x,y:v.y,z:v.z});
  let frame=null,paused=false;

  function rotateToward(bone,oldEnd,newEnd,weight,maxAngle){
    const origin=bone.getPosition();
    from.set(oldEnd.x-origin.x,oldEnd.y-origin.y,oldEnd.z-origin.z);
    to.set(newEnd.x-origin.x,newEnd.y-origin.y,newEnd.z-origin.z);
    if(from.length()<1e-5||to.length()<1e-5)return;
    from.normalize();to.normalize();
    const cos=Math.max(-1,Math.min(1,from.dot(to)));
    if(cos>.99999)return;
    const limit=Math.min(1,(maxAngle*Math.PI/180)/Math.acos(cos));
    swing.setFromDirections(from,to);
    const rotation=bone.getRotation();
    destinationQ.mul2(swing,rotation);
    blendedQ.slerp(rotation,destinationQ,Math.min(1,weight*limit));
    bone.setRotation(blendedQ);
  }

  function apply(){
    if(paused)return false;
    const pose=meshyFridgePose(frame);
    food.enabled=Boolean(pose?.food>.012);
    if(food.enabled){
      const f=pose.food;
      food.setLocalScale(.16*f,.14*f,.16*f);
    }
    if(!pose||pose.weight<.005)return false;

    const shoulder=xyz(upper.getPosition()),elbow=xyz(forearm.getPosition());
    const wrist=xyz(hand.getPosition()),headPos=xyz(head.getPosition());
    const transform=avatar.getWorldTransform();
    transform.transformVector(front,frontWorld);
    transform.transformVector(poleDirection,poleWorld);
    // Between bites the wrist drops below the chin rather than staying in the face.
    const rest=frame.mode?0:Math.sin(Math.PI*clamp((pose.progress-.68)/.24)*2)**2;
    const mouth={x:headPos.x+frontWorld.x,y:headPos.y-.135-.16*rest,
      z:headPos.z+frontWorld.z};
    const current=layoutNow();
    if(!current?.handle||!current?.shelfTarget)return false;
    const handle={x:current.handle.x,y:current.handleY,z:current.handle.z};
    if(current.hinge&&frame.doorOpen){
      const angle=current.doorAngle*frame.doorOpen*Math.PI/180;
      const dx=handle.x-current.hinge.x,dz=handle.z-current.hinge.z;
      handle.x=current.hinge.x+dx*Math.cos(angle)+dz*Math.sin(angle);
      handle.z=current.hinge.z-dx*Math.sin(angle)+dz*Math.cos(angle);
    }
    const shelf=current.shelfTarget;
    const carry={x:shoulder.x+frontWorld.x*2.4,y:shoulder.y-.36,
      z:shoulder.z+frontWorld.z*2.4};
    const total=pose.handle+pose.shelf+pose.mouth+pose.carry;
    const target={x:0,y:0,z:0};
    for(const [point,weight] of [
      [handle,pose.handle],[shelf,pose.shelf],[mouth,pose.mouth],[carry,pose.carry]
    ]){
      target.x+=point.x*weight/total;
      target.y+=point.y*weight/total;
      target.z+=point.z*weight/total;
    }

    const a=Math.hypot(elbow.x-shoulder.x,elbow.y-shoulder.y,elbow.z-shoulder.z);
    const b=Math.hypot(wrist.x-elbow.x,wrist.y-elbow.y,wrist.z-elbow.z);
    const distance=Math.hypot(target.x-shoulder.x,
      target.y-shoulder.y,target.z-shoulder.z);
    // Reject a mismatched skeleton or item instead of deforming the whole rig.
    if(a<.06||b<.06||!Number.isFinite(distance))return false;
    const pole={x:shoulder.x+poleWorld.x,
      y:shoulder.y+poleWorld.y,z:shoulder.z+poleWorld.z};
    let solved;
    try{
      solved=solveTwoBoneTargets({
        hip:shoulder,knee:elbow,ankle:wrist,target,pole,maxStretch:.985
      });
    }catch{return false;}
    const strength=Math.min(.96,pose.weight*.96);
    rotateToward(upper,elbow,solved.knee,strength,110);
    rotateToward(forearm,xyz(hand.getPosition()),solved.ankle,strength,115);
    return true;
  }
  return {ready:true,food,setFrame(value,freeze=false){frame=value;paused=freeze;if(!frame)food.enabled=false;},apply};
}
