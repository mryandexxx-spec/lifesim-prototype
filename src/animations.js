/**
 * LifeSim 0.6b.1 — visible upper-body, elbow and two-segment gait animation.
 * No engine import, simulation state mutation, saved fields or browser APIs.
 * Every angle eases toward a target instead of snapping on state transitions.
 */
import {SOFA_HIP_PITCH,SOFA_KNEE_PITCH} from './pose-config.js';
import {gaitTargets} from './locomotion.js';
import {musicMovementFrame} from './music-movement.js';

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const blend=(a,b,rate,dt)=>a+(b-a)*(1-Math.exp(-rate*dt));
const safe=(n,fallback)=>Number.isFinite(n)?n:fallback;

export function createAnimationState() {
  return {legs:[0,0],knees:[0,0],feet:[0,0],arms:[0,0],elbows:[0,0],
    torso:0,pelvisRoll:0,walkWeight:0,walkBob:0,walkPhase:0,
    spineLean:0,spineTwist:0,spineRoll:0,hipShift:0,bodyLift:0,
    bedHipYaw:[0,0],bedHipRoll:[0,0],
    mouthWidth:.095,mouthHeight:.017,brow:-0.5,eyeOpen:1,time:0};
}

/** Returns an independent animation state. The caller may keep it for its resident. */
export function stepAnimation(previous,signals,dt) {
  if(!previous)previous=createAnimationState();
  if(!Number.isFinite(dt)||dt<=0) return previous;
  const step=clamp(dt,0,.06);
  const t=previous.time+step;
  const mood=clamp(safe(signals?.mood,65),0,100);
  const moving=Boolean(signals?.walking);
  const action=signals?.using||null;
  const music=action==='music'?musicMovementFrame({
    activityId:signals?.musicActivityId,phase:'using',
    contentId:signals?.musicStyleId,elapsed:signals?.musicElapsed
  }):null;
  const social=signals?.social==='talk'?'talk':signals?.social==='argue'?'argue':null;
  const hugWeight=clamp(safe(signals?.hugWeight,0),0,1);
  const kissWeight=clamp(safe(signals?.kissWeight,0),0,1);
  const eveningWeight=clamp(safe(signals?.eveningWeight,0),0,1);
  // A stop command may send gait=0 even though the last planted foot is
  // still mid-stride. Freeze that stance phase during deceleration to avoid
  // an abrupt leg flip before the walk weight reaches zero.
  const requestedGait=safe(signals?.gait,0);
  const gait=moving?requestedGait:safe(previous.walkPhase,requestedGait);
  const side=signals?.id==='mira'?-1:1;
  const energy=clamp(safe(signals?.energy,70),0,100);
  // Acceleration and deceleration are in active real time. Phase comes from
  // ACTUAL travelled metres in game.js, so 1×/3× keep stride in sync.
  const walkWeight=blend(safe(previous.walkWeight,0),
    moving?1:0,moving?9:12,step);
  const walkPose=gaitTargets(gait,walkWeight,energy);
  // Progress lets the figure bend AFTER approaching and turning; the headless
  // animator remains backward compatible when no progress signal is supplied.
  const sofaWeight=clamp(safe(signals?.sofaWeight,action==='sofa'?1:0),0,1);
  // R5c: a small opposite-side glance, never a forced physical touch.
  const romanticSeatTurn=sofaWeight>.65
    ?clamp(safe(signals?.romanticSeatTurn,0),-15,15)*sofaWeight:0;
  const toiletWeight=clamp(safe(signals?.toiletSitWeight,0),0,1);
  const toiletStep=clamp(safe(signals?.toiletStep,0),0,1);
  const bedStepWeight=clamp(safe(signals?.bedStepWeight,0),0,1);
  const bedSitWeight=clamp(safe(signals?.bedSitWeight,0),0,1);
  const bedReclineWeight=clamp(safe(signals?.bedReclineWeight,action==='bed'?1:0),0,1);
  const bedSwing=clamp(safe(signals?.bedSwingWeight,0),0,1);
  const bedSign=signals?.bedSide==='left'?1:signals?.bedSide==='right'?-1:0;
  let legTarget=[0,0],kneeTarget=[0,0],footTarget=[0,0],armTarget=[0,0],
    elbowTarget=[0,0],bedYawTarget=[0,0],bedRollTarget=[0,0];
  if(sofaWeight>0){
    legTarget=[SOFA_HIP_PITCH*sofaWeight,SOFA_HIP_PITCH*sofaWeight];
    kneeTarget=[SOFA_KNEE_PITCH*sofaWeight,SOFA_KNEE_PITCH*sofaWeight];
    armTarget=[26*sofaWeight,35*sofaWeight];
    if(romanticSeatTurn!==0){
      const gesture=Math.sin(t*1.55)*eveningWeight;
      armTarget=[armTarget[0]+gesture*5,armTarget[1]-gesture*4];
    }
  }else if(bedStepWeight>0){
    // A short, mirrored step over the long rail. Previously the entire avatar
    // slid ~0.6 m without taking a visible step on entering the bed.
    const sideStep=bedSign*bedStepWeight;
    legTarget=[-17*sideStep,17*sideStep];
    kneeTarget=[21*bedStepWeight,6*bedStepWeight];
    armTarget=[-13*sideStep,13*sideStep];
    elbowTarget=[14*bedStepWeight,9*bedStepWeight];
    bedYawTarget=[9*sideStep,7*sideStep];
  }else if(bedSitWeight>0||bedReclineWeight>0){
    // Sitting on the side is a real knee/hip bend; straighten the shins as
    // the entire body reclines around the anchored pelvis.
    const hip=-73*bedSitWeight-3*bedReclineWeight;
    const knee=79*bedSitWeight+10*bedReclineWeight;
    legTarget=[hip,hip];kneeTarget=[knee,knee];
    // Rotate both thighs INWARD across the occupied mattress half.
    // The brace arm is the one nearest the OUTER edge; swap for right entry.
    bedYawTarget=[bedSign*28*bedSwing,bedSign*24*bedSwing];
    bedRollTarget=[-bedSign*8*bedSwing,bedSign*8*bedSwing];
    const outerLeft=bedSign>=0;
    armTarget=outerLeft
      ?[35*bedSitWeight+17*bedSwing+9*bedReclineWeight,
        19*bedSitWeight+11*bedReclineWeight]
      :[19*bedSitWeight+11*bedReclineWeight,
        35*bedSitWeight+17*bedSwing+9*bedReclineWeight];
    elbowTarget=outerLeft
      ?[41*bedSitWeight+18*bedSwing+14*bedReclineWeight,
        19*bedSitWeight+14*bedReclineWeight]
      :[19*bedSitWeight+14*bedReclineWeight,
        41*bedSitWeight+18*bedSwing+14*bedReclineWeight];
  }else if(toiletWeight>0||action==='toilet'){
    // Sitting is driven by the real toilet seat, never a generic standing idle
    // through the recovery window. All private poses remain behind the opaque
    // mosaic. Knees and thighs bend gradually before standing again.
    legTarget=[-67*toiletWeight,-67*toiletWeight];
    kneeTarget=[78*toiletWeight,78*toiletWeight];
    armTarget=[12*toiletWeight,12*toiletWeight];
    elbowTarget=[19*toiletWeight,19*toiletWeight];
    if(toiletStep>.015){
      legTarget=walkPose.hips.map((v,i)=>v*toiletStep+legTarget[i]*(1-toiletStep));
      kneeTarget=walkPose.knees.map((v,i)=>v*toiletStep+kneeTarget[i]*(1-toiletStep));
    }
  }else if(action==='shower' || signals?.showerExiting){
    const step=clamp(safe(signals?.showerStep,0),0,1);
    if(step>.015){
      legTarget=walkPose.hips.map(v=>v*step);
      kneeTarget=walkPose.knees.map(v=>v*step);
      footTarget=walkPose.feet.map(v=>v*step);
      armTarget=walkPose.arms.map(v=>v*step);
      elbowTarget=walkPose.elbows.map(v=>v*step);
    }else if(signals?.showerWater??action==='shower'){
      // Older animation callers supplied only using:'shower'. Keep that
      // legacy washing pose, but explicit false from 0.6e means dry/exit.
      armTarget=[36+Math.sin(t*5)*12,34-Math.sin(t*4.5)*12];
    }else{
      armTarget=[5,8];
    }
  }else if(music){
    // The procedural fallback must visibly match Meshy listen vs dance.
    // These motions never translate the simulation root or bypass A*.
    legTarget=[...music.legs];kneeTarget=[...music.knees];
    armTarget=[...music.arms];elbowTarget=[...music.elbows];
  }else if(['lamp','mirror','dresser','wardrobe'].includes(action)){
    // F4E: the authored procedural rig performs a physical hand gesture
    // toward the utility object while staying at the verified A* approach.
    // Meshy rigs use their existing Listening_Gesture clip instead.
    const wave=Math.sin(t*(action==='mirror'?3.2:2.1));
    if(action==='mirror'){
      armTarget=[-75+8*wave,-47-8*wave];
      elbowTarget=[-64,-42];
    }else if(action==='lamp'){
      armTarget=[-18,-72+8*wave];elbowTarget=[8,-44];
    }else{
      armTarget=[-26-8*wave,-53+8*wave];
      elbowTarget=[-18,-35];
    }
  }else if(action==='hobby'){
    // A readable open book in front of the body, both arms gently supporting it.
    armTarget=[-40,-47];elbowTarget=[-52,-47];
  }else if(action==='fridge'){
    const reach=clamp(safe(signals?.fridgeReach,1),0,1);
    const eat=clamp(safe(signals?.fridgeEat,0),0,1);
    // One hand reaches for the shelf, then the elbow brings a bite to the mouth.
    armTarget=[8*reach+12*eat,-57*reach-104*eat];
    elbowTarget=[5*reach,-18*reach-82*eat];
  }else if(hugWeight>.005){
    armTarget=[-62*hugWeight,-62*hugWeight];
    elbowTarget=[-43*hugWeight,-43*hugWeight];
  }else if(kissWeight>.005){
    armTarget=[-16*kissWeight,-16*kissWeight];
    elbowTarget=[-12*kissWeight,-12*kissWeight];
  }else if(social){
    const angry=social==='argue';
    armTarget=angry
      ?[38+Math.sin(t*6.3)*15*side,40-Math.sin(t*5.5)*16*side]
      :[21+Math.sin(t*3.8)*12*side,24-Math.sin(t*3.4)*11*side];
    if(!angry&&eveningWeight>.001){
      // Small, open-handed conversation gestures: no involuntary touch.
      const ask=Math.sin(t*1.65+side*.6);
      armTarget=[armTarget[0]+(18+8*ask)*eveningWeight,
        armTarget[1]+(10-7*ask)*eveningWeight];
      elbowTarget=[14*eveningWeight,11*eveningWeight];
    }
  }else if(moving||walkWeight>.003){
    legTarget=walkPose.hips;
    kneeTarget=walkPose.knees;
    footTarget=walkPose.feet;
    armTarget=walkPose.arms;
    elbowTarget=walkPose.elbows;
  }else if(action!=='bed'){
    armTarget=[Math.sin(t*1.5)*1.4,Math.sin(t*1.5+1.1)*1.4];
  }
  // Only free walking gets exact distance-phase contact poses. The previous
  // angle spring lagged several frames behind the moving root (much worse at
  // 3×), making the stance foot skate; the weight already smooths starts/stops.
  // Sofa/bed/shower/fridge/social poses keep their tested transition smoothing.
  const contactWalk=(moving||walkWeight>.003)&&!action&&!social&&
    !sofaWeight&&!bedStepWeight&&!bedSitWeight&&!bedReclineWeight;
  const speed=social?7:bedStepWeight>0||bedSitWeight>0||bedReclineWeight>0
    ?14:action==='fridge'?12:action?5.5:moving?18:8;
  const legs=contactWalk?walkPose.hips:
    previous.legs.map((v,i)=>blend(v,legTarget[i],speed,step));
  const knees=contactWalk?walkPose.knees:
    (previous.knees||[0,0]).map((v,i)=>blend(v,kneeTarget[i],speed,step));
  const feet=contactWalk?walkPose.feet:
    (previous.feet||[0,0]).map((v,i)=>blend(v,footTarget[i],speed,step));
  const arms=previous.arms.map((v,i)=>blend(v,armTarget[i],speed,step));
  const elbows=(previous.elbows||[0,0]).map((v,i)=>blend(v,elbowTarget[i],speed,step));
  const bedHipYaw=(previous.bedHipYaw||[0,0]).map((v,i)=>blend(v,bedYawTarget[i],12,step));
  const bedHipRoll=(previous.bedHipRoll||[0,0]).map((v,i)=>blend(v,bedRollTarget[i],12,step));
  // Light breathing and conversational emphasis, independent of gameplay logic.
  const inGait=(moving||walkWeight>.003)&&!sofaWeight&&!bedStepWeight&&!bedSitWeight&&!bedReclineWeight;
  const torsoTarget=music?music.torsoRoll:action==='bed'?0:hugWeight>.005?2.3*hugWeight:
    kissWeight>.005?2.6*kissWeight:social
    ?Math.sin(t*(social==='argue'?4:2.5))*2.1
    :inGait?walkPose.torsoRoll:Math.sin(t*1.4)*.9;
  const torso=blend(previous.torso,torsoTarget,4.5,step);
  // Opposite weight transfer through pelvis + chest; sole remains close to
  // floor at stance without moving any collision or gameplay position.
  const pelvisRoll=blend(safe(previous.pelvisRoll,0),
    music?music.pelvisRoll:inGait?walkPose.pelvisRoll:0,9,step);
  // Waist pivot brings head, shoulders, eyes and arms along as a coherent
  // upper-body volume. Head-to-hips lean is now visible from the isometric view.
  const spineLean=blend(safe(previous.spineLean,0),
    bedSitWeight>0?-11*bedSitWeight:hugWeight>.005?6*hugWeight:
      kissWeight>.005?8*kissWeight:
        social==='talk'&&eveningWeight>.001?5.5*eveningWeight:
        music?music.spineLean:inGait?walkPose.spineLean:0,12,step);
  // A seated viewer may glance toward an off-axis screen without turning
  // the whole avatar and sliding its hips away from the sofa cushion.
  const tvGaze=action==='tv'&&sofaWeight>.5
    ?clamp(safe(signals?.tvGazeYaw,0),-30,30)*sofaWeight:0;
  const spineTwist=blend(safe(previous.spineTwist,0),
    bedSign*16*bedSwing+(inGait?walkPose.spineTwist:0)+tvGaze+
      romanticSeatTurn+(music?music.spineTwist:0),14,step);
  const spineRoll=blend(safe(previous.spineRoll,0),
    bedSign*8*bedSwing+(music?music.spineRoll:inGait?walkPose.spineRoll:0),14,step);
  const hipShift=blend(safe(previous.hipShift,0),
    music?music.hipShift:inGait?walkPose.hipShift:0,14,step);
  const bodyLift=blend(safe(previous.bodyLift,0),
    music?music.bodyLift:inGait?walkPose.bodyLift:0,14,step);
  // The root dip and planted ankle geometry are analytically paired. Using
  // a second smoothing pass on one but not the other breaks ground contact.
  const walkBob=contactWalk?walkPose.rootOffset:
    blend(safe(previous.walkBob,0),0,13,step);

  // Mood is a precomputed simulation snapshot. Animation does not decide mood.
  const upset=social==='argue'||mood<42;
  const happy=social==='talk'||mood>=74;
  const mouthWidthTarget=upset?.061:happy?.109:.088;
  const fridgeChew=clamp(safe(signals?.fridgeChew,0),0,1);
  const mouthHeightTarget=fridgeChew>0?.014+.035*fridgeChew:upset?.022:happy?.025:.014;
  const browTarget=upset?13:happy?-5:0;
  const sleeping=bedReclineWeight>.65; // eyes stay closed while beginning to rise
  const blink=t%4.1<.11;
  const eyeTarget=sleeping?.04:blink?.16:1;
  const contact=signals?.bedJoints;
  if(contact){
    for(let i=0;i<2;i++){
      legs[i]=contact[i].pitch;knees[i]=contact[i].knee;
      bedHipYaw[i]=contact[i].yaw;bedHipRoll[i]=0;feet[i]=0;
    }
  }
  return {
    bedFootYaw:contact?signals.bedFootYaw:null,
    bedHipQuaternion:contact?contact.map(c=>c.quaternion):null,
    legs,knees,feet,arms,elbows,torso:contact?0:torso,pelvisRoll:contact?0:pelvisRoll,
    walkWeight,walkBob:contact?0:walkBob,walkPhase:gait,
    spineLean:contact?0:spineLean,spineTwist:contact?0:spineTwist,
    spineRoll:contact?0:spineRoll,hipShift:contact?0:hipShift,bodyLift:contact?0:bodyLift,
    bedHipYaw,bedHipRoll,time:t,
    mouthWidth:blend(previous.mouthWidth,mouthWidthTarget,5,step),
    mouthHeight:blend(previous.mouthHeight,mouthHeightTarget,5,step),
    brow:blend(previous.brow,browTarget,5,step),
    eyeOpen:blend(previous.eyeOpen,eyeTarget,sleeping?12:18,step)
  };
}

/** Writes only lightweight transforms into an already built PlayCanvas rig. */
export function applyCharacterAnimation(rig,state) {
  for(let i=0;i<2;i++){
    if(state.bedHipQuaternion)rig.legPivot[i].setLocalRotation(...state.bedHipQuaternion[i]);
    else rig.legPivot[i].setLocalEulerAngles(state.legs[i],
      state.bedHipYaw?.[i]||0,state.bedHipRoll?.[i]||0);
    rig.kneePivot[i].setLocalEulerAngles(state.knees[i],0,0);
    if(rig.anklePivot){
      if(state.bedFootYaw!=null)rig.anklePivot[i].setEulerAngles(0,state.bedFootYaw,0);
      else rig.anklePivot[i].setLocalEulerAngles(0,0,0);
    }
    rig.shoes[i].setLocalEulerAngles(state.feet[i],0,0);
    rig.armPivot[i].setLocalEulerAngles(state.arms[i],0,0);
    rig.elbowPivot[i].setLocalEulerAngles(state.elbows[i],0,0);
  }
  rig.torso.setLocalEulerAngles(0,0,state.torso);
  rig.pelvis.setLocalEulerAngles(0,0,state.pelvisRoll);
  rig.upperBody.setLocalEulerAngles(state.bedFootYaw!=null?0:state.spineLean,
    state.bedFootYaw!=null?0:state.spineTwist,state.bedFootYaw!=null?0:state.spineRoll);
  rig.upperBody.setLocalPosition(state.hipShift,.73+state.bodyLift,0);
  rig.leftEye.setLocalScale(1,state.eyeOpen,1);
  rig.rightEye.setLocalScale(1,state.eyeOpen,1);
  // Dynamic width/height never push facial details away from the head.
  rig.mouth.setLocalScale(state.mouthWidth,state.mouthHeight,.018);
  for(let i=0;i<2;i++){
    rig.brows[i].setLocalEulerAngles(0,0,(i===0?1:-1)*state.brow);
  }
}
