/**
 * LifeSim 0.5b.3 — transient procedural pose and face animation.
 * No engine import, simulation state mutation, saved fields or browser APIs.
 * Every angle eases toward a target instead of snapping on state transitions.
 */
import {SOFA_HIP_PITCH,SOFA_KNEE_PITCH} from './pose-config.js';

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const blend=(a,b,rate,dt)=>a+(b-a)*(1-Math.exp(-rate*dt));
const safe=(n,fallback)=>Number.isFinite(n)?n:fallback;

export function createAnimationState() {
  return { legs:[0,0],knees:[0,0],arms:[0,0],torso:0,
    mouthWidth:.095,mouthHeight:.017,brow:-0.5,eyeOpen:1,time:0 };
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
  const wave=Math.sin(gait);
  const side=signals?.id==='mira'?-1:1;
  const energy=clamp(safe(signals?.energy,70),0,100);
  let legTarget=[0,0],kneeTarget=[0,0],armTarget=[0,0];
  if(action==='sofa'){
    // Legs project FORWARD into the room; shins bend DOWN at the knees.
    legTarget=[SOFA_HIP_PITCH,SOFA_HIP_PITCH];
    kneeTarget=[SOFA_KNEE_PITCH,SOFA_KNEE_PITCH];
    armTarget=[26,35];
  }else if(action==='shower'){
    armTarget=[36+Math.sin(t*5)*12,34-Math.sin(t*4.5)*12];
  }else if(action==='fridge'){
    armTarget=[8,-50+Math.sin(t*4)*9];
  }else if(social){
    const angry=social==='argue';
    armTarget=angry
      ?[38+Math.sin(t*6.3)*15*side,40-Math.sin(t*5.5)*16*side]
      :[21+Math.sin(t*3.8)*12*side,24-Math.sin(t*3.4)*11*side];
  }else if(moving){
    legTarget=[wave*27,-wave*27];
    kneeTarget=[Math.max(0,-wave)*21,Math.max(0,wave)*21];
    armTarget=[-wave*17,wave*17];
  }else if(action!=='bed'){
    armTarget=[Math.sin(t*1.5)*1.4,Math.sin(t*1.5+1.1)*1.4];
  }
  const speed=social?7:action?5.5:moving?9:5;
  const legs=previous.legs.map((v,i)=>blend(v,legTarget[i],speed,step));
  const knees=(previous.knees||[0,0]).map((v,i)=>blend(v,kneeTarget[i],speed,step));
  const arms=previous.arms.map((v,i)=>blend(v,armTarget[i],speed,step));
  // Light breathing and conversational emphasis, independent of gameplay logic.
  const torsoTarget=action==='bed'?0:social
    ?Math.sin(t*(social==='argue'?4:2.5))*2.1
    :moving?Math.sin(gait*2)*1.2:Math.sin(t*1.4)*.9;
  const torso=blend(previous.torso,torsoTarget,4.5,step);

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
    legs,knees,arms,torso,time:t,
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
    rig.armPivot[i].setLocalEulerAngles(state.arms[i],0,0);
  }
  rig.torso.setLocalEulerAngles(0,0,state.torso);
  rig.leftEye.setLocalScale(1,state.eyeOpen,1);
  rig.rightEye.setLocalScale(1,state.eyeOpen,1);
  // Dynamic width/height never push facial details away from the head.
  rig.mouth.setLocalScale(state.mouthWidth,state.mouthHeight,.018);
  for(let i=0;i<2;i++){
    rig.brows[i].setLocalEulerAngles(0,0,(i===0?1:-1)*state.brow);
  }
}
