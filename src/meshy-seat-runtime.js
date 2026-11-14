import {
  solveSeatRoot,blendSeatRoot,seatFootTargets,solveTwoBoneTargets,
  smoothContactWeight,solveSeatHeightCorrection
} from './interaction-anchors.js';

/**
 * A reusable PlayCanvas bridge for ANY humanoid skinned mesh and SeatSurface.
 * Only the rig profile knows bone aliases and contact markers; only furniture
 * provides its world seat anchor. No custom offset per actor+sofa pair.
 *
 * Runs from the application's 'update' handler, after the AnimComponent
 * systems have evaluated the imported skin pose (PlayCanvas 2.24).
 */
export function createSkinnedSeatController({
  pc,model,avatar,profile,footIK=true
}) {
  if(!model?.findByName || !avatar || !profile)throw new TypeError('Seat rig required');
  const pelvis=model.findByName(profile.pelvisBone);
  if(!pelvis)throw Error('Missing seat contact bone: '+profile.pelvisBone);
  const contactMarker=new pc.Vec3(
    profile.contact.x,profile.contact.y,profile.contact.z
  );
  const contactWorld=new pc.Vec3();
  const contactModel=new pc.Vec3();
  const inverseModel=new pc.Mat4();
  const feet=[];
  if(footIK)for(const leg of profile.legs||[]){
    const thigh=model.findByName(leg.thigh),shin=model.findByName(leg.shin),
      ankle=model.findByName(leg.ankle);
    if(thigh&&shin&&ankle)feet.push({thigh,shin,ankle});
  }
  const from=new pc.Vec3(),to=new pc.Vec3(),swing=new pc.Quat(),goal=new pc.Quat(),
    blended=new pc.Quat();
  function rotateTowards(node,at,desired,weight){
    const pivot=node.getPosition();
    from.set(at.x-pivot.x,at.y-pivot.y,at.z-pivot.z);
    to.set(desired.x-pivot.x,desired.y-pivot.y,desired.z-pivot.z);
    if(from.length()<1e-5||to.length()<1e-5)return;
    from.normalize();to.normalize();
    const cosine=Math.max(-1,Math.min(1,from.dot(to)));
    if(cosine>.99999)return;
    // Prevent a malformed clip / furniture surface from twisting a leg
    // through an arbitrarily large angle in a single render frame.
    const capped=Math.min(1,(55*Math.PI/180)/Math.acos(cosine));
    swing.setFromDirections(from,to);
    const current=node.getRotation();
    goal.mul2(swing,current);
    blended.slerp(current,goal,Math.min(1,weight*capped));
    node.setRotation(blended);
  }

  /**
   * Production-safe contact: the sofa action controller owns world X/Z.
   * Source clip hip root-motion X/Z is extracted by the visual adapter, once.
   * This computes only a bounded Y correction using the actual animated pelvis.
   *
   * The previous full 3D solve was mathematically valid for an independent
   * avatar root, but relocating the GLB child of an already positioned game
   * avatar shifted Alex off the couch (owner's 0.7c Safari screenshot).
   */
  function placeVertical({seat,weight=0,scale,base,horizontalOffset}={}){
    if(!seat?.contact)throw new TypeError('Seat contact required');
    if(!horizontalOffset||!Number.isFinite(horizontalOffset.x)||
      !Number.isFinite(horizontalOffset.z))
      throw new TypeError('Horizontal root-motion extraction required');
    const x=base.x+horizontalOffset.x,z=base.z+horizontalOffset.z;
    model.setLocalPosition(x,base.y,z);
    if(weight<=.55){
      return {offset:{x:horizontalOffset.x,y:0,z:horizontalOffset.z},
        footChains:0};
    }
    pelvis.getWorldTransform().transformPoint(contactMarker,contactWorld);
    const correction=solveSeatHeightCorrection({
      seat,contactWorldY:contactWorld.y,
      weight:(weight-.55)/.45,clearance:profile.clearance,
      maxCorrection:.55
    });
    // The rig is parented to the game avatar, whose Y axis stays upright
    // during sitting. Keep the local X/Z fixed and adjust the visual Y.
    model.setLocalPosition(x,base.y+correction,z);
    return {offset:{x:horizontalOffset.x,y:correction,z:horizontalOffset.z},
      footChains:0};
  }

  function place({seat,weight=0,scale,base,ik=true}){
    const w=smoothContactWeight(weight);
    // Important: reset *only the Meshy visual's local position*. This removes
    // the previous seat correction before observing the current skinned pose,
    // so the solve never adds its own root transform twice.
    model.setLocalPosition(base.x,base.y,base.z);
    // This marker is attached to the animated pelvis, unlike the old static
    // y-only lift which assumed all sit clips have the same posture.
    pelvis.getWorldTransform().transformPoint(contactMarker,contactWorld);
    inverseModel.copy(model.getWorldTransform()).invert();
    inverseModel.transformPoint(contactWorld,contactModel);
    const yaw=avatar.getEulerAngles().y;
    const targetRoot=solveSeatRoot({
      seat,contactLocal:contactModel,scale,yaw,clearance:profile.clearance
    });
    const rawPosition=model.getPosition();
    const freeRoot={x:rawPosition.x,y:rawPosition.y,z:rawPosition.z};
    const worldRoot=blendSeatRoot({
      freeRoot,seatedRoot:targetRoot,weight
    });
    model.setPosition(worldRoot.x,worldRoot.y,worldRoot.z);

    let activeIK=0;
    if(ik && feet.length===2 && weight>.62){
      const ikWeight=smoothContactWeight((weight-.62)/.38)*.82;
      const goals=seatFootTargets({
        seat,halfStance:profile.halfStance,forward:profile.footForward,
        sideSigns:profile.footSideSigns
      });
      for(let i=0;i<2;i++){
        const leg=feet[i];
        const h=leg.thigh.getPosition(),k=leg.shin.getPosition(),a=leg.ankle.getPosition();
        const foot={x:goals[i].x,
          y:goals[i].y+profile.ankleHeight*scale,
          z:goals[i].z};
        const solution=solveTwoBoneTargets({
          hip:h,knee:k,ankle:a,target:foot
        });
        rotateTowards(leg.thigh,k,solution.knee,ikWeight);
        // Upper-leg rotation has repositioned the knee and ankle.
        const movedAnkle=leg.ankle.getPosition();
        rotateTowards(leg.shin,movedAnkle,solution.ankle,ikWeight);
        activeIK++;
      }
    }
    const local=model.getLocalPosition();
    return {
      offset:{x:local.x-base.x,y:local.y-base.y,z:local.z-base.z},
      footChains:activeIK
    };
  }

  return {place,placeVertical,get validFootChains(){return feet.length;}};
}
