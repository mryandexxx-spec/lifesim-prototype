/**
 * CAS-02.1-F2-B: original neutral foot/ankle and optional knitted sock surfaces.
 * Source Meshy sneakers are never used as a bare foot. Output is independent of
 * PlayCanvas, bind-pose space, triangulated, 2-bone skin weighted, and reversible.
 * Renderer adapters consume it without changing the authored Meshy GLB.
 */
import {FOOTWEAR_STANDARD_VERSION,planShoeLastFit} from './cas-footwear-standard.js';
const PI2=2*Math.PI;
const SEGMENTS=12;
const yAxis={x:0,y:1,z:0};
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const diff=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const times=(v,s)=>({x:v.x*s,y:v.y*s,z:v.z*s});
const mag=v=>Math.hypot(v.x,v.y,v.z);
const unit=v=>{const n=mag(v);if(n<1e-6)throw Error('CAS F2 degenerate foot axis');return times(v,1/n)};
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
function checkedFoot(foot){
 if(foot?.version!==FOOTWEAR_STANDARD_VERSION||!foot.landmarks)
  throw Error('CAS F2 sock needs measured FootFitProfile');
}
function ringFrames(foot,skinOffset){
 const {ankle,heel,instep,ball,toe}=foot.landmarks;
 const forward=foot.frame.forward;
 const right=unit(cross(yAxis,forward));
 const width=foot.ballWidth;
 // Cut strictly at the character's own measured anatomical anchors. Sock
 // thickness is a garment policy (1.5 mm), never a per-shoe positional tweak.
 return {right,up:yAxis,rings:[
  {name:'ankle',center:ankle,rx:width*.48+skinOffset,
    ry:width*.51+skinOffset,weights:[1,0]},
  {name:'bridge',center:add(times(ankle,.53),times(instep,.47)),
    rx:width*.52+skinOffset,ry:width*.45+skinOffset,weights:[.93,.07]},
  {name:'instep',center:instep,rx:width*.58+skinOffset,
    ry:width*.40+skinOffset,weights:[.78,.22]},
  {name:'ball',center:ball,rx:width*.54+skinOffset,
    ry:width*.29+skinOffset,weights:[.34,.66]},
  {name:'toe',center:add(toe,times(forward,-width*.18)),
    rx:width*.40+skinOffset,ry:width*.24+skinOffset,weights:[.04,.96]}
 ]};
}
/** Bind positions in avatar model metres, {foot,toe} weights sum to exactly 1. */
export function buildFootSurface(foot,{kind='neutral',sockThickness=.0015}={}){
 checkedFoot(foot);
 if(!['neutral','sock'].includes(kind))throw Error('CAS F2 unknown foot layer');
 if(!Number.isFinite(sockThickness)||sockThickness<.0003||sockThickness>.004)
  throw Error('CAS F2 unsafe sock thickness');
 const offset=kind==='sock'?sockThickness:0;
 const {right,up,rings}=ringFrames(foot,offset);
 const vertices=[],triangles=[];
 for(const ring of rings)for(let n=0;n<SEGMENTS;n++){
  const a=PI2*n/SEGMENTS;
  const v=add(add(ring.center,times(right,Math.cos(a)*ring.rx)),
    times(up,Math.sin(a)*ring.ry));
  vertices.push(Object.freeze({bind:v,weights:{foot:ring.weights[0],
   toe:ring.weights[1]},region:ring.name}));
 }
 for(let r=0;r<rings.length-1;r++)for(let i=0;i<SEGMENTS;i++){
  const j=(i+1)%SEGMENTS,k=r*SEGMENTS;
  triangles.push([k+i,k+j,k+SEGMENTS+j],[k+i,k+SEGMENTS+j,k+SEGMENTS+i]);
 }
 return Object.freeze({version:FOOTWEAR_STANDARD_VERSION,
  residentId:foot.residentId,side:foot.side,skinId:foot.sourceSkinSha256,
  kind,segments:SEGMENTS,ringNames:Object.freeze(rings.map(r=>r.name)),
  bindBones:Object.freeze(['foot','toe']),vertices:Object.freeze(vertices),
  triangles:Object.freeze(triangles.map(t=>Object.freeze(t))),
  // No sprite, CSS clipping, license-dependent image, or source-Meshy mesh.
  originalGeometry:true,editableSource:false,productionApproved:false});
}
function matrix(value,name){
 if(!Array.isArray(value)||value.length!==16||value.some(x=>!Number.isFinite(x)))
  throw Error('CAS F2 invalid '+name+' bone delta transform');
}
const apply=(m,p)=>({x:m[0]*p.x+m[4]*p.y+m[8]*p.z+m[12],
 y:m[1]*p.x+m[5]*p.y+m[9]*p.z+m[13],
 z:m[2]*p.x+m[6]*p.y+m[10]*p.z+m[14]});
/**
 * CPU reference skin evaluator for independent original ankle and toe bones.
 * Real renderer may GPU-skin using the same two bindings/weights.
 * Matrices MUST be currentWorld * inverseBindWorld for THIS resident.
 */
export function skinFootSurface(surface,{footDelta,toeDelta}){
 if(surface?.version!==FOOTWEAR_STANDARD_VERSION||!Array.isArray(surface.vertices))
  throw Error('CAS F2 invalid skin surface');
 matrix(footDelta,'foot');matrix(toeDelta,'toe');
 return surface.vertices.map(v=>{
  const a=apply(footDelta,v.bind),b=apply(toeDelta,v.bind);
  return add(times(a,v.weights.foot),times(b,v.weights.toe));
 });
}
function insidePoint(p,limit){return p.y>=limit-1e-8}
function interpolate(a,b,limit){
 const t=(limit-a.y)/(b.y-a.y);
 return {x:a.x+(b.x-a.x)*t,y:limit,z:a.z+(b.z-a.z)*t};
}
/** Exact Y-plane clipping in CURRENT posed world space, no disappearing toes. */
export function clipSurfaceAbove(vertices,triangles,limit){
 if(!Number.isFinite(limit))throw Error('CAS F2 invalid mask plane');
 const output=[];
 for(const tri of triangles){
  let polygon=tri.map(i=>vertices[i]);
  if(polygon.some(p=>!p||Object.values(p).some(v=>!Number.isFinite(v))))
   throw Error('CAS F2 invalid skin vertex for mask');
  const clipped=[];
  for(let i=0;i<polygon.length;i++){
   const a=polygon[i],b=polygon[(i+1)%polygon.length];
   const insideA=insidePoint(a,limit),insideB=insidePoint(b,limit);
   if(insideA)clipped.push(a);
   if(insideA!==insideB)clipped.push(interpolate(a,b,limit));
  }
  for(let j=1;j+1<clipped.length;j++)output.push([
   clipped[0],clipped[j],clipped[j+1]]);
 }
 return output;
}
/**
 * Source shoe and source sneaker residue are always hidden when wearing CC0;
 * neutral foot or sock shows only outside the collar, with deliberate 4 mm
 * overlap into the upper for a watertight transition. The caller owns the
 * original visibility snapshot and can restore it byte-for-byte.
 */
export function resolveFootwearLayers(foot,shoeManifest,{socks=true}={}){
 checkedFoot(foot);
 const fit=planShoeLastFit(foot,shoeManifest);
 if(typeof socks!=='boolean')throw Error('CAS F2 socks must be optional boolean');
 const clipY=fit.collarWorldY-.004;
 const visibleAnkle=foot.landmarks.ankle.y>clipY;
 return Object.freeze({residentId:foot.residentId,side:foot.side,
  originalShoesVisible:false,originalSneakerResidueVisible:false,
  sourceBodyVisible:true,neutralFootVisible:!socks&&visibleAnkle,
  sockVisible:socks&&visibleAnkle,clipY,
  sleeveLayer:socks?'sock':'neutral',rigId:foot.rigId,fit,
  restorePolicy:'snapshot-original-render-states',
  // This is a topology/skin plan, not a claim of verified mesh contact.
  visualContactApproved:false});
}
