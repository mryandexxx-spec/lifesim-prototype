/**
 * LifeSim 0.6c.4 — TRUE mattress-long-side entry, never the foot of the bed.
 *
 * Left/right: stand OUTSIDE the long rails (world X), face out of the mattress
 * to sit backwards onto its edge, then swing the legs in and rotate toward
 * the pillows (world -Z). All positions are sampled from ONE progress.
 * This controller remains visual-only and preserves action.bedSlot in v1 saves.
 */
import {BED_SLOTS,BED_LAYOUT,validBedSlot} from './bed-layout.js';
export const BED_ENTER_SECONDS=5.2;
export const BED_EXIT_SECONDS=4.6;
const HIP=.72;
export const BED_HIP_HEIGHT=BED_LAYOUT.hipY;
const HIP_WORLD_Y=BED_HIP_HEIGHT;
const deg=x=>x*Math.PI/180;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>{const t=clamp(v,0,1);return t*t*(3-2*t);};
const stage=(p,a,b)=>smooth((p-a)/(b-a));
const mix=(a,b,t)=>a+(b-a)*t;
export const createBedTransition=()=>({progress:0,slot:null});
export function advanceBedTransition(previous,engaged,slot,dt,origin=null){
  const last=previous||createBedTransition();
  if(!Number.isFinite(dt)||dt<=0)return last;
  const selected=last.progress>0&&validBedSlot(last.slot)
    ?last.slot:(validBedSlot(slot)?slot:last.slot);
  if(!selected)return createBedTransition();
  const delta=clamp(dt,0,.06)/(engaged?BED_ENTER_SECONDS:BED_EXIT_SECONDS);
  const progress=clamp(last.progress+(engaged?delta:-delta),0,1);
  return {progress,slot:progress>0?selected:null,origin:last.progress>0?last.origin:origin};
}

/** PlayCanvas Euler order: Rz * Ry * Rx, including combined rotations. */
export function rotateBedVector(v,p,inverse=false){
  const rx=deg(p.pitch),ry=deg(p.yaw),rz=deg(p.roll||0);
  const x=(v,a)=>({x:v.x,y:v.y*Math.cos(a)-v.z*Math.sin(a),z:v.y*Math.sin(a)+v.z*Math.cos(a)});
  const y=(v,a)=>({x:v.x*Math.cos(a)+v.z*Math.sin(a),y:v.y,z:-v.x*Math.sin(a)+v.z*Math.cos(a)});
  const z=(v,a)=>({x:v.x*Math.cos(a)-v.y*Math.sin(a),y:v.x*Math.sin(a)+v.y*Math.cos(a),z:v.z});
  return inverse?x(y(z(v,-rz),-ry),-rx):z(y(x(v,rx),ry),rz);
}
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const lerpPoint=(a,b,t)=>({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),z:mix(a.z,b.z,t)});
/** Solve the actual .36 thigh / .29 shin-to-ankle, not a decorative knee bend. */
export function bedLegIK(pose,ankle,index,lift=0){
  const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
  const mul=(v,k)=>({x:v.x*k,y:v.y*k,z:v.z*k});
  const norm=v=>mul(v,1/Math.max(1e-9,Math.hypot(v.x,v.y,v.z)));
  const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
  const hip=add(pose,rotateBedVector({x:index===0?-.15:.15,y:HIP,z:0},pose));
  const delta=sub(ankle,hip),axis=norm(delta),a=.36,b=.29;
  const d=clamp(Math.hypot(delta.x,delta.y,delta.z),.071,a+b-.00001);
  const along=(a*a+d*d-b*b)/(2*d),height=Math.sqrt(Math.max(0,a*a-along*along));
  // An explicit knee pole avoids atan2(0,0) flipping the entire thigh 180°
  // when a planted ankle passes directly below its hip.
  const forward=rotateBedVector({x:0,y:0,z:1},{pitch:0,yaw:pose.yaw,roll:0});
  const pole=lerpPoint(forward,{x:0,y:1,z:0},lift);
  const perpendicular=norm(sub(pole,mul(axis,dot(pole,axis))));
  const kneePoint=add(add(hip,mul(axis,along)),mul(perpendicular,height));
  const thigh=norm(sub(kneePoint,hip)),shin=norm(sub(ankle,kneePoint));
  const wx=norm(cross(thigh,shin)),wy=mul(thigh,-1),wz=cross(wx,wy);
  const x=rotateBedVector(wx,pose,true),y=rotateBedVector(wy,pose,true),z=rotateBedVector(wz,pose,true);
  const m00=x.x,m01=y.x,m02=z.x,m10=x.y,m11=y.y,m12=z.y,m20=x.z,m21=y.z,m22=z.z;
  let qx,qy,qz,qw;
  const tr=m00+m11+m22;
  if(tr>0){const s=Math.sqrt(tr+1)*2;qw=s/4;qx=(m21-m12)/s;qy=(m02-m20)/s;qz=(m10-m01)/s;}
  else if(m00>m11&&m00>m22){const s=Math.sqrt(1+m00-m11-m22)*2;qw=(m21-m12)/s;qx=s/4;qy=(m01+m10)/s;qz=(m02+m20)/s;}
  else if(m11>m22){const s=Math.sqrt(1+m11-m00-m22)*2;qw=(m02-m20)/s;qx=(m01+m10)/s;qy=s/4;qz=(m12+m21)/s;}
  else{const s=Math.sqrt(1+m22-m00-m11)*2;qw=(m10-m01)/s;qx=(m02+m20)/s;qy=(m12+m21)/s;qz=s/4;}
  return {pitch:Math.atan2(m21,m22)*180/Math.PI,yaw:Math.asin(clamp(-m20,-1,1))*180/Math.PI,
    knee:Math.acos(clamp(dot(thigh,shin),-1,1))*180/Math.PI,quaternion:[qx,qy,qz,qw]};
}
export function bedTransitionPose(state){
  const slot=BED_SLOTS[state?.slot];if(!slot)return null;
  const p=clamp(state.progress,0,1),sign=slot.id==='left'?1:-1;
  const step=stage(p,.08,.24),sit=stage(p,.25,.49);
  const transfer=stage(p,.51,.70),recline=stage(p,.71,.99);
  const yaw=mix(slot.approachYaw,0,transfer);
  const pitch=recline?slot.pose.pitch*recline:0,roll=0;
  const standX=slot.edgeX-sign*.28;
  const hip={x:mix(mix(slot.approach.x,standX,step),slot.edgeX,sit),
    y:mix(HIP,HIP_WORLD_Y,sit),z:slot.edgeZ};
  // A supported scoot happens while upright and lifting legs. Once reclining,
  // the pelvis is fixed: no simultaneous yaw/translation/recline drift.
  hip.x=mix(hip.x,slot.pose.x,transfer);
  const offset=rotateBedVector({x:0,y:HIP,z:0},{pitch,yaw,roll});
  const root={...sub(hip,offset),pitch,yaw,roll};
  if(state.origin&&p<.08){
    const t=stage(p,0,.08);
    for(const key of ['x','y','z','pitch','roll'])root[key]=mix(state.origin[key]||0,root[key],t);
    const delta=((yaw-state.origin.yaw+540)%360)-180;
    root.yaw=state.origin.yaw+delta*t;
  }
  const ankles=[0,1].map(i=>{
    const lateral=i===0?-.15:.15;
    const initial=add({x:slot.approach.x,y:0,z:slot.edgeZ},
      rotateBedVector({x:lateral,y:.087,z:0},{pitch:0,yaw:p<.08?root.yaw:slot.approachYaw,roll:0}));
    const planted={x:standX,y:.087,z:slot.edgeZ+sign*lateral};
    const stride=stage(p,i===0?.08:.14,i===0?.18:.24);
    const ground=lerpPoint(initial,planted,stride);
    ground.y+=.075*Math.sin(Math.PI*stride);
    // Lift feet ABOVE the mattress before swinging across the rail. Lower
    // only after they are inside; reverse path plants before standing.
    const lift=stage(p,.50,.56),swing=stage(p,.56,.70);
    const foot={x:mix(ground.x,slot.pose.x+lateral,swing),
      y:mix(ground.y,.74,lift),z:mix(ground.z,-.80,swing)};
    foot.y=mix(foot.y,.585,stage(p,.68,.74));
    foot.z=mix(foot.z,-.80,recline);
    return foot;
  });
  return {...root,bedSide:slot.id,bedJoints:ankles.map((a,i)=>bedLegIK(root,a,i,stage(p,.50,.56))),
    bedAnkles:ankles,bedFootYaw:root.yaw,bedStepWeight:Math.sin(Math.PI*step),
    bedSitWeight:sit*(1-recline),bedReclineWeight:recline,
    bedSwingWeight:Math.sin(Math.PI*transfer),bedWeight:recline};
}

/** Quilts are folded away for seating/standing, cover legs only once laid. */
export function bedBeddingPose(progress){
  const cover=stage(progress,.96,1);
  return {y:mix(.53,.65,cover),z:mix(-.49,-.95,cover),
    depth:mix(.45,1.45,cover),trimZ:mix(-.69,-1.58,cover)};
}
