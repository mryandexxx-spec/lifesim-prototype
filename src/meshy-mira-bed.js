import {MIRA_SOFA_CLIP,MIRA_SOFA_DURATION,MIRA_IDLE_HIP,miraSofaOffset} from './meshy-mira-sofa.js';

/** Audited from the shipped female GLB 'sleep' clip, NOT guessed offsets.
 * Hips samples are local to the female Armature; original authored XZ
 * translation is cancelled so the old two-slot game root owns the mattress.
 * Native Hips tilt must not add to the game's own -78 degree root tilt.
 */
export const MIRA_SLEEP_CLIP='sleep';
export const MIRA_SLEEP_DURATION=5.70000029;
export const MIRA_SLEEP_HIPS_TRANSLATIONS=Object.freeze([[0,-0.00356,0.72702,0.00527],[0.266667,-0.003634,0.725088,0.00425],[0.433333,-0.003918,0.725171,0.003681],[0.566667,-0.003974,0.723284,0.002456],[0.733333,-0.004694,0.724239,0.000987],[0.866667,-0.004135,0.72148,-0.000429],[1,-0.006063,0.718298,-0.003691],[1.066667,-0.005751,0.716413,-0.0067],[1.133333,-0.004309,0.714861,-0.011717],[1.2,-0.002005,0.714011,-0.019765],[1.266667,0.001554,0.714254,-0.031856],[1.3,0.003254,0.714927,-0.039395],[1.366667,0.004844,0.717403,-0.057303],[1.433333,0.004209,0.720941,-0.078589],[1.533333,0.004015,0.727469,-0.114272],[1.566667,0.004277,0.729403,-0.125043],[1.633333,0.004509,0.732515,-0.143809],[1.7,0.004614,0.73473,-0.160882],[1.766667,0.005002,0.736447,-0.180637],[1.8,0.005583,0.737196,-0.192484],[1.833333,0.006664,0.737775,-0.205896],[1.866667,0.008537,0.737864,-0.221127],[1.933333,0.013947,0.735993,-0.25352],[1.966667,0.017226,0.734157,-0.268538],[2,0.020767,0.73188,-0.281269],[2.033333,0.024309,0.729366,-0.28971],[2.066667,0.027157,0.726857,-0.294032],[2.1,0.028953,0.724676,-0.295941],[2.133333,0.029622,0.723056,-0.296619],[2.333333,0.026224,0.71589,-0.301717],[2.466667,0.02794,0.709129,-0.305007],[2.566667,0.029628,0.703368,-0.305849],[2.7,0.030999,0.695053,-0.305369],[2.9,0.028489,0.682017,-0.30478],[2.966667,0.027521,0.680199,-0.30538],[3.033333,0.026936,0.679634,-0.307307],[3.1,0.027047,0.678157,-0.311981],[3.166667,0.027678,0.677872,-0.318287],[3.266667,0.028564,0.67995,-0.324301],[3.333333,0.026532,0.682091,-0.329457],[3.366667,0.024556,0.683534,-0.334353],[3.433333,0.020977,0.683839,-0.348844],[3.5,0.01972,0.679354,-0.363931],[3.533333,0.02009,0.676025,-0.369652],[3.6,0.021059,0.671377,-0.376572],[3.666667,0.020885,0.669482,-0.380657],[3.733333,0.020124,0.668966,-0.383897],[3.866667,0.02076,0.667963,-0.389012],[3.966667,0.021638,0.670696,-0.390955],[4.033333,0.021967,0.672553,-0.393431],[4.1,0.020578,0.674035,-0.396172],[4.2,0.016731,0.676232,-0.399498],[4.333333,0.013418,0.676104,-0.404713],[4.466667,0.010729,0.67531,-0.407375],[4.6,0.009084,0.67471,-0.40842],[4.966667,0.006379,0.67412,-0.412319],[5.066667,0.007949,0.674587,-0.412484],[5.266667,0.015977,0.673336,-0.411898],[5.333333,0.017562,0.673308,-0.411262],[5.433333,0.017207,0.673522,-0.410832],[5.6,0.013848,0.674771,-0.410758],[5.7,0.012954,0.675384,-0.410742]]);
export const MIRA_SLEEP_HIPS_ROTATIONS=Object.freeze([[0,-0.291942,-0.08427,0.021165,0.952481],[0.433333,-0.293706,-0.081905,0.021341,0.952141],[0.633333,-0.291688,-0.087371,0.021768,0.952266],[0.8,-0.296602,-0.092289,0.019807,0.950325],[0.9,-0.305778,-0.089943,0.020479,0.947624],[1,-0.321505,-0.087269,0.020241,0.942661],[1.1,-0.347338,-0.084862,0.018578,0.933708],[1.2,-0.382592,-0.078497,0.013889,0.920472],[1.333333,-0.439294,-0.071095,0.00691,0.895499],[1.366667,-0.449516,-0.070594,0.00556,0.890461],[1.4,-0.456065,-0.069213,0.003818,0.887243],[1.433333,-0.459177,-0.066463,0.001405,0.885854],[1.5,-0.455503,-0.058011,-0.005744,0.888323],[1.7,-0.414373,-0.046454,-0.038944,0.908086],[1.766667,-0.399671,-0.038108,-0.043923,0.914812],[1.9,-0.360536,-0.026519,-0.043583,0.931349],[1.933333,-0.35244,-0.022891,-0.04572,0.934437],[1.966667,-0.347323,-0.018908,-0.049889,0.936227],[2,-0.34603,-0.015287,-0.055769,0.93644],[2.033333,-0.349747,-0.013703,-0.062035,0.934688],[2.066667,-0.357501,-0.015271,-0.066925,0.931387],[2.1,-0.368598,-0.019189,-0.070127,0.926741],[2.166667,-0.400912,-0.030194,-0.072425,0.91275],[2.233333,-0.445988,-0.040132,-0.074206,0.891054],[2.4,-0.557329,-0.064769,-0.084448,0.823443],[2.5,-0.610914,-0.074464,-0.087658,0.783298],[2.533333,-0.625464,-0.075562,-0.087008,0.771696],[2.6,-0.649592,-0.075434,-0.084218,0.75183],[2.733333,-0.690728,-0.070501,-0.07513,0.715738],[2.833333,-0.719029,-0.068864,-0.062809,0.688701],[2.9,-0.734097,-0.067332,-0.052529,0.673654],[2.966667,-0.742685,-0.065717,-0.048949,0.664609],[3.033333,-0.747086,-0.0612,-0.05088,0.659946],[3.1,-0.754461,-0.048562,-0.047956,0.652787],[3.166667,-0.758909,-0.035624,-0.039261,0.649035],[3.233333,-0.75823,-0.028397,-0.031473,0.650608],[3.266667,-0.7595,-0.025905,-0.028366,0.649372],[3.333333,-0.766664,-0.020231,-0.021655,0.641364],[3.433333,-0.785278,-0.00415,-0.009431,0.619058],[3.5,-0.800975,0.0062,-0.001967,0.598662],[3.566667,-0.815094,0.012136,0.002474,0.579197],[3.633333,-0.822985,0.014435,0.003306,0.56787],[3.733333,-0.828599,0.019316,0.000734,0.559509],[3.833333,-0.8385,0.020149,-0.00681,0.544487],[3.9,-0.839553,0.021857,-0.009963,0.542747],[3.966667,-0.836702,0.023788,-0.008629,0.547074],[4.066667,-0.832635,0.021888,-0.000927,0.553389],[4.2,-0.828603,0.016128,0.01527,0.559396],[4.366667,-0.823155,0.008963,0.021608,0.567335],[4.5,-0.820654,-0.005155,0.026228,0.5708],[4.733334,-0.815404,-0.040449,0.027298,0.576832],[4.866667,-0.814008,-0.048584,0.027941,0.578144],[4.933333,-0.813419,-0.047914,0.027875,0.579031],[5,-0.813588,-0.043823,0.023979,0.579292],[5.066667,-0.814465,-0.035636,0.018256,0.578829],[5.233334,-0.81361,-0.009001,0.008286,0.581282],[5.333333,-0.812151,-0.000431,0.00404,0.583434],[5.466667,-0.810835,-0.000665,0.004973,0.585253],[5.7,-0.804449,-0.0085,0.0112,0.593855]]);
export const MIRA_BED_SEATED_HIP_Y=.61625; // Look_Back_and_Sit at t=2.2667
const clamp=n=>Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
function sample(keys,time){
  const t=Number.isFinite(time)?Math.max(0,Math.min(MIRA_SLEEP_DURATION,time)):0;
  let lo=0,hi=keys.length-1;
  while(lo<hi){const m=(lo+hi)>>1;if(keys[m][0]<t)lo=m+1;else hi=m;}
  const b=keys[lo],a=keys[Math.max(0,lo-1)],w=a===b?0:clamp((t-a[0])/(b[0]-a[0]));
  return {a,b,w};
}
export function miraSleepHipAt(time){
  const {a,b,w}=sample(MIRA_SLEEP_HIPS_TRANSLATIONS,time);
  return {x:a[1]+(b[1]-a[1])*w,y:a[2]+(b[2]-a[2])*w,
    z:a[3]+(b[3]-a[3])*w};
}
/** Stable quaternion slerp; never rotate an already corrected bone again. */
export function miraSleepHipsRotationAt(time){
  const {a,b,w}=sample(MIRA_SLEEP_HIPS_ROTATIONS,time);
  let dot=a[1]*b[1]+a[2]*b[2]+a[3]*b[3]+a[4]*b[4];
  const sign=dot<0?-1:1;dot=Math.min(1,Math.max(-1,Math.abs(dot)));
  const angle=Math.acos(dot),sine=Math.sin(angle);
  const left=sine>.00001?Math.sin((1-w)*angle)/sine:1-w;
  const right=sign*(sine>.00001?Math.sin(w*angle)/sine:w);
  const v=[0,1,2,3].map(i=>a[i+1]*left+b[i+1]*right);
  const length=Math.hypot(...v)||1;
  return v.map(x=>x/length);
}
/** Authoritative bedTransitionPose drives X/Y/Z/yaw and long-side slot.
 * The source sleep clip changes local Hips X-tilt by ~75 degrees; compensate
 * only the EXTRA root pitch using an absolute post-Anim Hips quaternion.
 */
export function miraBedPose(frame,progress,scale){
  if(!frame||!['left','right'].includes(frame.bedSide)||
    !Number.isFinite(progress)||progress<0||
    !Number.isFinite(scale)||scale<=0)return null;
  const p=clamp(progress);
  if(p<.25)return {clip:'Idle_7',time:null,
    offset:{x:0,y:0,z:0},hipRotation:null,pitch:0,side:frame.bedSide};
  if(p<.51){
    const time=miraSofaOffset(clamp((p-.25)/.24),scale);
    return {clip:MIRA_SOFA_CLIP,
      time:clamp((p-.25)/.24)*MIRA_SOFA_DURATION,
      offset:{x:time.x,y:0,z:time.z},hipRotation:null,pitch:0,
      side:frame.bedSide};
  }
  const t=clamp((p-.51)/.48)*MIRA_SLEEP_DURATION;
  const source=miraSleepHipAt(t);
  return {clip:MIRA_SLEEP_CLIP,time:t,side:frame.bedSide,
    offset:{x:(MIRA_IDLE_HIP.x-source.x)*scale,
      y:(MIRA_BED_SEATED_HIP_Y-source.y)*scale,
      z:(MIRA_IDLE_HIP.z-source.z)*scale},
    hipRotation:miraSleepHipsRotationAt(t),
    pitch:Number.isFinite(frame.pitch)?Math.max(-90,Math.min(90,frame.pitch)):0};
}
/** Absolute post-Anim quaternion, idempotent even while paused at fixed t. */
export function createMiraBedController({pc,model}={}){
  const disabled={ready:false,setFrame(){},apply(){return false;}};
  if(!pc?.Quat||!pc?.Vec3||!model?.findByName)return disabled;
  const hip=model.findByName('mixamorig:Hips');
  if(!hip||typeof hip.setLocalRotation!=='function')return disabled;
  const axis=new pc.Vec3(1,0,0);
  const authored=new pc.Quat(),counter=new pc.Quat(),target=new pc.Quat();
  if(typeof authored.set!=='function'||typeof counter.setFromAxisAngle!=='function'||
    typeof target.mul2!=='function')return disabled;
  let pose=null;
  return {ready:true,setFrame(next){pose=next;},apply(){
    if(!pose?.hipRotation||!Number.isFinite(pose.pitch))return false;
    authored.set(...pose.hipRotation);
    counter.setFromAxisAngle(axis,-pose.pitch);
    target.mul2(counter,authored);
    hip.setLocalRotation(target);
    return true;
  }};
}
