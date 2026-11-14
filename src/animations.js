/**
 * LifeSim 0.6b — transient procedural pose, ground-contact gait and face animation.
 * No engine import, simulation state mutation, saved fields or browser APIs.
 * Every angle eases toward a target instead of snapping on state transitions.
 */
import {SOFA_HIP_PITCH,SOFA_KNEE_PITCH} from './pose-config.js';
import {gaitTargets,gaitGroundOffset} from './locomotion.js';

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const blend=(a,b,rate,dt)=>a+(b-a)*(1-Math.exp(-rate*dt));
const safe=(n,fallback)=>Number.isFinite(n)?n:fallback;

export function createAnimationState() {
  return {legs:[0,0],knees:[0,0],feet:[0,0],arms:[0,0],
    torso:0,pelvisRoll:0,walkWeight:0,walkBob:0,
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
  const social=signals?.social==='talk'?'talk':signals?.social==='argue'?'argue':null;
  const gait=safe(signals?.gait,0);
  const side=signals?.id==='mira'?-1:1;
  const energy=clamp(safe(signals?.energy,70),0,100);
  // Acceleration and deceleration are in active real time. Phase comes from
  // ACTUAL travelled metres in game.js, so 1×/3× keep stride in sync.
  const walkWeight=blend(safe(previous.walkWeight,0),
    moving?1:0,moving?8:10,step);
  const walkPose=gaitTargets(gait,walkWeight,energy);
  // Progress lets the figure bend AFTER approaching and turning; the headless
  // animator remains backward compatible when no progress signal is supplied.
  const sofaWeight=clamp(safe(signals?.sofaWeight,action==='sofa'?1:0),0,1);
  let legTarget=[0,0],kneeTarget=[0,0],footTarget=[0,0],armTarget=[0,0];
  if(sofaWeight>0){
    legTarget=[SOFA_HIP_PITCH*sofaWeight,SOFA_HIP_PITCH*sofaWeight];
    kneeTarget=[SOFA_KNEE_PITCH*sofaWeight,SOFA_KNEE_PITCH*sofaWeight];
    armTarget=[26*sofaWeight,35*sofaWeight];
  }else if(action==='shower'){
    armTarget=[36+Math.sin(t*5)*12,34-Math.sin(t*4.5)*12];
  }else if(action==='fridge'){
    armTarget=[8,-50+Math.sin(t*4)*9];
  }else if(social){
    const angry=social==='argue';
    armTarget=angry
      ?[38+Math.sin(t*6.3)*15*side,40-Math.sin(t*5.5)*16*side]
      :[21+Math.sin(t*3.8)*12*side,24-Math.sin(t*3.4)*11*side];
  }else if(moving||walkWeight>.003){
    legTarget=walkPose.hips;
    kneeTarget=walkPose.knees;
    footTarget=walkPose.feet;
    armTarget=walkPose.arms;
  }else if(action!=='bed'){
    armTarget=[Math.sin(t*1.5)*1.4,Math.sin(t*1.5+1.1)*1.4];
  }
  const speed=social?7:action?5.5:moving?9:5;
  const legs=previous.legs.map((v,i)=>blend(v,legTarget[i],speed,step));
  const knees=(previous.knees||[0,0]).map((v,i)=>blend(v,kneeTarget[i],speed,step));
  const feet=(previous.feet||[0,0]).map((v,i)=>blend(v,footTarget[i],speed,step));
  const arms=previous.arms.map((v,i)=>blend(v,armTarget[i],speed,step));
  // Light breathing and conversational emphasis, independent of gameplay logic.
  const inGait=(moving||walkWeight>.003)&&!sofaWeight;
  const torsoTarget=action==='bed'?0:social
    ?Math.sin(t*(social==='argue'?4:2.5))*2.1
    :inGait?walkPose.torsoRoll:Math.sin(t*1.4)*.9;
  const torso=blend(previous.torso,torsoTarget,4.5,step);
  // Opposite weight transfer through pelvis + chest; sole remains close to
  // floor at stance without moving any collision or gameplay position.
  const pelvisRoll=blend(safe(previous.pelvisRoll,0),
    inGait?walkPose.pelvisRoll:0,7,step);
  const ground=inGait?gaitGroundOffset(legs,knees):0;
  const walkBob=blend(safe(previous.walkBob,0),ground,13,step);

  // Mood is a precomputed simulation snapshot. Animation does not decide mood.
  const upset=social==='argue'||mood<42;
  const happy=social==='talk'||mood>=74;
  const mouthWidthTarget=upset?.061:happy?.109:.088;
  const mouthHeightTarget=upset?.022:happy?.025:.014;
  const browTarget=upset?13:happy?-5:0;
  const sleeping=action==='bed';
  const blink=t%4.1<.11;
  const eyeTarget=sleeping?.04:blink?.16:1;
  return {
    legs,knees,feet,arms,torso,pelvisRoll,walkWeight,walkBob,time:t,
    mouthWidth:blend(previous.mouthWidth,mouthWidthTarget,5,step),
    mouthHeight:blend(previous.mouthHeight,mouthHeightTarget,5,step),
    brow:blend(previous.brow,browTarget,5,step),
    eyeOpen:blend(previous.eyeOpen,eyeTarget,sleeping?12:18,step)
  };
}

/** Writes only lightweight transforms into an already built PlayCanvas rig. */
export function applyCharacterAnimation(rig,state) {
  for(let i=0;i<2;i++){
    rig.legPivot[i].setLocalEulerAngles(state.legs[i],0,0);
    rig.kneePivot[i].setLocalEulerAngles(state.knees[i],0,0);
    rig.shoes[i].setLocalEulerAngles(state.feet[i],0,0);
    rig.armPivot[i].setLocalEulerAngles(state.arms[i],0,0);
  }
  rig.torso.setLocalEulerAngles(0,0,state.torso);
  rig.pelvis.setLocalEulerAngles(0,0,state.pelvisRoll);
  rig.leftEye.setLocalScale(1,state.eyeOpen,1);
  rig.rightEye.setLocalScale(1,state.eyeOpen,1);
  // Dynamic width/height never push facial details away from the head.
  rig.mouth.setLocalScale(state.mouthWidth,state.mouthHeight,.018);
  for(let i=0;i<2;i++){
    rig.brows[i].setLocalEulerAngles(0,0,(i===0?1:-1)*state.brow);
  }
}
