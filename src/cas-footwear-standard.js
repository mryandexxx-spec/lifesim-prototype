/**
 * CAS-02.1-F2-A: renderer-independent, source-audited footwear fit contract.
 * Units are metres, Y up. A shoe's collar is NOT stretched to the ankle.
 * These objects are transient: never mutate a resident or root-v1 save.
 */
export const FOOTWEAR_STANDARD_VERSION=1;
export const FOOTWEAR_CUTS=Object.freeze(['low-top','high-top','boot','heel']);
const sides=['left','right'];
const hex=/^[0-9a-f]{64}$/;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function check(ok,msg){if(!ok)throw new Error('CAS F2 quarantine: '+msg);}
function number(v,name,{min=-Infinity,max=Infinity}={}){
 check(typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max,name+' invalid metres');
 return v;
}
function point(v,name){
 check(v&&typeof v==='object'&&['x','y','z'].every(k=>own(v,k)),name+' missing XYZ');
 return Object.freeze({x:number(v.x,name+'.x'),y:number(v.y,name+'.y'),z:number(v.z,name+'.z')});
}
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const mul=(a,s)=>({x:a.x*s,y:a.y*s,z:a.z*s});
const length=v=>Math.hypot(v.x,v.y,v.z);
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const normalize=(v,name)=>{const l=length(v);check(l>1e-5,name+' degenerate');return mul(v,1/l)};
function bounds(value,name){
 check(value&&typeof value==='object',name+' missing bounds');
 const min=point(value.min,name+'.min'),max=point(value.max,name+'.max');
 for(const ax of ['x','y','z'])check(min[ax]<max[ax],name+' inverted '+ax);
 const diagonal=length(sub(max,min));
 check(diagonal>=.04&&diagonal<=2,name+' implausible bounds');
 return Object.freeze({min,max});
}
function footFrame(heel,toe,name){
 const flat=sub(toe,heel);flat.y=0;
 check(length(flat)>.05&&length(flat)<.5,name+' heel-to-toe length');
 return Object.freeze({forward:normalize(flat,name+'.forward'),
  lateral:normalize(cross({x:0,y:1,z:0},flat),name+'.lateral'),
  length:length(flat)});
}
function landmarks(raw,name){
 check(raw&&typeof raw==='object',name+' missing landmarks');
 return Object.freeze(Object.fromEntries(
  ['ankle','heel','ball','toe','instep'].map(k=>[k,point(raw[k],name+'.'+k)])));
}
function measuredFoot({residentId,rigId,side,sourceSkinSha256,landmarks:lm,ballWidth,soleY}){
 check(typeof residentId==='string'&&residentId.length>0,'missing resident identity');
 check(typeof rigId==='string'&&rigId.length>0,'missing separate rig identity');
 check(sides.includes(side),'invalid foot side');
 check(hex.test(sourceSkinSha256||''),'missing immutable resident skin SHA');
 const marks=landmarks(lm,'foot.'+side),frame=footFrame(marks.heel,marks.toe,'foot.'+side);
 const width=number(ballWidth,'foot.ballWidth',{min:.035,max:.18});
 const sole=number(soleY,'foot.soleY',{min:-1,max:3});
 check(marks.ankle.y>sole+.025,'ankle below sole');
 check(marks.instep.y>sole+.003,'instep below sole');
 const projection=dot(sub(marks.ball,marks.heel),frame.forward);
 check(projection>frame.length*.35&&projection<frame.length*.95,'ball not inside foot');
 return Object.freeze({version:FOOTWEAR_STANDARD_VERSION,residentId,rigId,side,
  sourceSkinSha256,landmarks:marks,ballWidth:width,soleY:sole,frame});
}
/** One profile per person AND side; never transplant Alex/Mira bind-pose data. */
export function createFootFitProfile(input){return measuredFoot(input);}
function part(raw,side){
 check(raw&&typeof raw==='object','missing '+side+' shoe');
 check(raw.side===side,'wrong handedness '+side);
 check(hex.test(raw.meshSha256||''),side+' mesh hash missing');
 const b=bounds(raw.bounds,side);
 const marks=landmarks(raw.landmarks,side+'.last');
 const frame=footFrame(marks.heel,marks.toe,side+'.last');
 const width=number(raw.ballWidth,side+'.ballWidth',{min:.025,max:.18});
 const sole=point(raw.solePlanePoint,side+'.solePlanePoint');
 check(Math.abs(sole.y-b.min.y)<.05,side+' sole point outside bottom bounds');
 check(marks.heel.y>=b.min.y-.005&&marks.toe.y>=b.min.y-.005,
  side+' landmarks below geometry');
 check(marks.toe.y<=b.max.y+.005&&marks.heel.y<=b.max.y+.005,
  side+' landmarks above geometry');
 check(marks.instep.y>=sole.y,side+' instep inside floor');
 const collar=point(raw.collarOpening,side+'.collarOpening');
 check(collar.y>=sole.y+.025&&collar.y<=b.max.y+.005,
  side+' impossible collar');
 return Object.freeze({side,meshSha256:raw.meshSha256,bounds:b,
  landmarks:marks,ballWidth:width,solePlanePoint:sole,collarOpening:collar,
  frame,triangles:number(raw.triangles,side+'.triangles',{min:1,max:1000000})});
}
/** Source/licence/sha and non-mirrored independently identified halves mandatory. */
export function createShoeFitManifest(raw){
 check(raw&&typeof raw==='object','missing shoe manifest');
 check(raw.version===FOOTWEAR_STANDARD_VERSION,'unsupported manifest version');
 check(typeof raw.id==='string'&&/^[a-z0-9-]+$/.test(raw.id),'bad shoe ID');
 check(FOOTWEAR_CUTS.includes(raw.cut),'unknown collar cut');
 const src=raw.source;
 check(src&&src.license==='CC0-1.0','license not audited as CC0');
 check(hex.test(src.sha256||''),'missing pinned original source SHA');
 check(typeof src.url==='string'&&/^https:\/\//.test(src.url),'missing source URL');
 const left=part(raw.parts?.left,'left'),right=part(raw.parts?.right,'right');
 check(left.meshSha256!==right.meshSha256,'both shoes refer to one indistinguishable mesh');
 const ratio=left.frame.length/right.frame.length;
 check(ratio>.82&&ratio<1.22,'left/right last length mismatch');
 check(left.triangles+right.triangles<=100000,'shoe pair exceeds first-stage triangle budget');
 return Object.freeze({version:FOOTWEAR_STANDARD_VERSION,id:raw.id,cut:raw.cut,
  source:Object.freeze({license:src.license,sha256:src.sha256,url:src.url}),
  parts:Object.freeze({left,right}),contactApproved:false,productionReady:false});
}
/**
 * Single uniform scale + rigid yaw/heel translation. No upper stretch, no
 * per-resident shoe-ID branches, no pixel coordinates, no mutate/side effects.
 */
export function planShoeLastFit(foot,manifest){
 check(foot?.version===FOOTWEAR_STANDARD_VERSION,'invalid foot profile');
 check(manifest?.version===FOOTWEAR_STANDARD_VERSION,'invalid shoe manifest');
 const shoe=manifest.parts[foot.side],last=shoe.frame;
 check(shoe.side===foot.side,'missing requested handed shoe');
 const scale=foot.frame.length/last.length;
 check(scale>=.68&&scale<=1.46,'shoe size incompatible with foot length');
 const fitWidth=shoe.ballWidth*scale/foot.ballWidth;
 check(fitWidth>=.80&&fitWidth<=1.30,'shoe last too narrow/wide');
 const fromYaw=Math.atan2(last.forward.x,last.forward.z);
 const toYaw=Math.atan2(foot.frame.forward.x,foot.frame.forward.z);
 const yaw=toYaw-fromYaw;
 const rotate=v=>({x:v.x*Math.cos(yaw)+v.z*Math.sin(yaw),
   y:v.y,z:-v.x*Math.sin(yaw)+v.z*Math.cos(yaw)});
 const heelWorld={...foot.landmarks.heel,y:foot.soleY+
   (foot.landmarks.heel.y-foot.soleY)};
 const translation=sub(heelWorld,rotate(mul(shoe.landmarks.heel,scale)));
 // translate vertically by the actual sole plane, never by collar/ankle
 translation.y=foot.soleY-shoe.solePlanePoint.y*scale;
 const transformedSole=add(rotate(mul(shoe.solePlanePoint,scale)),translation);
 check(Math.abs(transformedSole.y-foot.soleY)<1e-6,'sole must remain grounded');
 const cover=manifest.cut==='low-top'?'foot-with-sock-visible':
   manifest.cut==='heel'?'foot-with-sock-visible':'foot-under-upper';
 return Object.freeze({residentId:foot.residentId,rigId:foot.rigId,
  shoeId:manifest.id,side:foot.side,scale,yawRadians:yaw,translation,
  soleWorldY:transformedSole.y,ankleWorldY:foot.landmarks.ankle.y,
  collarWorldY:rotate(mul(shoe.collarOpening,scale)).y+translation.y,
  exposedAnkle:manifest.cut==='low-top'||manifest.cut==='heel',
  hideRegion:cover,skinned:false,contactApproved:false});
}
