/**
 * CAS-02.2-B art experiment: geometrically different NEW residents from exact
 * shipped Alex/Mira skinned GLBs. No original assets or game runtime modified.
 * These are preview-only geometric facial proposals, NOT approved final art.
 */
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
const ROOT='https://mryandexxx-spec.github.io/lifesim-prototype/assets/characters/';
const SOURCE={
  alex:{file:'meshy-casual-v1.glb',sha:'7014401e6819b8b047fe384cfce4a62549711aa711d26a6894571800a40eb5f4'},
  mira:{file:'meshy-mira-mobile-v1.glb',sha:'40a2d1e0dcde53f7c2f53c6bd220f39ba440bbf4d42dfbad949ca82146594d0a'}
};
export const TARGETS=['eyes','nose','lips','chin','cheeks','body'];
const sha=buf=>createHash('sha256').update(buf).digest('hex');
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{const s=clamp(v);return s*s*(3-2*s);};
const ball=(x,y,z,cx,cy,cz,rx,ry,rz)=>{
 const d=((x-cx)/rx)**2+((y-cy)/ry)**2+((z-cz)/rz)**2;
 return d>=1?0:(1-d)*(1-d);
};
function parseGLB(buffer){
 if(buffer.readUInt32LE(0)!==0x46546c67||buffer.readUInt32LE(4)!==2||buffer.readUInt32LE(8)!==buffer.length)
   throw Error('Not a complete glTF 2.0 binary');
 const jsonLength=buffer.readUInt32LE(12),jsonType=buffer.readUInt32LE(16);
 const binHeader=20+jsonLength;
 if(jsonType!==0x4e4f534a||buffer.readUInt32LE(binHeader+4)!==0x004e4942)
   throw Error('Unexpected original GLB chunks');
 return {g:JSON.parse(buffer.toString('utf8',20,binHeader)),bin:buffer.subarray(binHeader+8,binHeader+8+buffer.readUInt32LE(binHeader))};
}
function access(g,bin,id){
 const a=g.accessors[id],view=g.bufferViews[a.bufferView];
 const comps={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
 const width={5121:1,5123:2,5126:4}[a.componentType],method={5121:'readUInt8',5123:'readUInt16LE',5126:'readFloatLE'}[a.componentType];
 if(!view||!width||!comps||a.sparse||a.count<1||a.count>100000)throw Error('Unsupported source accessor '+id);
 const offset=(view.byteOffset||0)+(a.byteOffset||0),stride=view.byteStride||comps*width;
 if(offset+stride*(a.count-1)+comps*width>bin.length)throw Error('Source accessor out of range');
 const result=new Array(a.count*comps);
 for(let i=0;i<a.count;i++)for(let k=0;k<comps;k++)
   result[i*comps+k]=bin[method](offset+i*stride+k*width);
 return result;
}
function encodeGLB(g,parts){
 const body=Buffer.concat(parts);
 g.buffers[0].byteLength=body.length;
 const text=Buffer.from(JSON.stringify(g)),json=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,32)]);
 const binary=Buffer.concat([body,Buffer.alloc((4-body.length%4)%4)]);
 const out=Buffer.alloc(12+8+json.length+8+binary.length);
 out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);
 out.writeUInt32LE(json.length,12);out.writeUInt32LE(0x4e4f534a,16);json.copy(out,20);
 const b=20+json.length;out.writeUInt32LE(binary.length,b);out.writeUInt32LE(0x004e4942,b+4);binary.copy(out,b+8);
 return out;
}
export function deriveSourceGLB(kind,source){
 if(!Object.hasOwn(SOURCE,kind))throw Error('Unknown source family');
 if(sha(source)!==SOURCE[kind].sha)throw Error('Source hash mismatch: never sculpt unverified original');
 const {g:original,bin}=parseGLB(source),g=structuredClone(original);
 if(g.meshes?.length!==1||g.meshes[0].primitives?.length!==1||g.skins?.length!==1||g.meshes[0].primitives[0].targets)
   throw Error('Unsupported source rig/mesh topology');
 const p=g.meshes[0].primitives[0],v=access(g,bin,p.attributes.POSITION),
   n=access(g,bin,p.attributes.NORMAL),j=access(g,bin,p.attributes.JOINTS_0),
   w=access(g,bin,p.attributes.WEIGHTS_0);
 const count=v.length/3;
 if(n.length!==v.length||j.length!==count*4||w.length!==count*4||count<15000)
   throw Error('Unexpected original skin data');
 const names=g.skins[0].joints.map(id=>g.nodes[id]?.name||'');
 const head=names.indexOf('mixamorig:Head');
 const torsoIds=new Set(names.map((s,i)=>/^mixamorig:Spine(?:1|2)?$/.test(s)?i:-1).filter(i=>i>=0));
 if(head<0||torsoIds.size<1||g.animations.length<(kind==='alex'?10:13)||g.skins[0].joints.length!==66)
   throw Error('Original bind/skeleton/animations mismatch');
 const headW=new Float32Array(count),torsoW=new Float32Array(count);
 let pts=[];
 for(let i=0;i<count;i++){
  for(let k=0;k<4;k++){
   if(j[i*4+k]===head)headW[i]+=w[i*4+k];
   if(torsoIds.has(j[i*4+k]))torsoW[i]+=w[i*4+k];
  }
  if(headW[i]>.75)pts.push({x:v[i*3],y:v[i*3+1],z:v[i*3+2]});
 }
 if(pts.length<5000||pts.length>12000)throw Error('Unable to segment actual source head');
 // Positions refer to the original mesh's measured bind pose, not a new
 // procedural head. Forward +Z and head Y~1.4-1.7m are verified per source.
 const xs=pts.map(x=>x.x).sort((a,b)=>a-b),ys=pts.map(x=>x.y).sort((a,b)=>a-b);
 const hx=(xs[Math.floor(xs.length/2)]),yBase=ys[Math.floor(ys.length*.02)];
 if(Math.abs(hx)>.02||yBase<1.35||yBase>1.54)throw Error('Face landmarks unsafe in source');
 const x0=hx;
 const out=TARGETS.map(()=>new Float32Array(count*3));
 const metrics=TARGETS.map(()=>({vertices:0,maxDelta:0}));
 for(let i=0;i<count;i++){
  const x=v[3*i]-x0,y=v[3*i+1],z=v[3*i+2],nz=n[3*i+2];
  const h=smooth((headW[i]-.60)/.32);
  // A front-surface-only mask protects back-of-head and most hairstyle vertices.
  const face=h*smooth((z-.018)/.055)*smooth((nz+.05)/.7);
  const a=ball(x,y,z,-.035,1.614,.074,.043,.028,.078);
  const b=ball(x,y,z,.035,1.614,.074,.043,.028,.078);
  // CAS-02.2-B corrective R2: disjoint facial vertical zones. The earlier
  // cheek ellipse reached the eye sockets: 116/358 actual eye vertices
  // were also moved by the "cheeks" target on original Alex.
  // These are still research morph masks, NOT artist-sculpted anatomy.
  const eyes=face*(a+b)*smooth((y-1.585)/.008);
  const nose=face*ball(x,y,z,0,1.558,.089,.034,.048,.078)*
    smooth((y-1.540)/.012)*(1-smooth((y-1.575)/.012));
  const lips=face*ball(x,y,z,0,1.523,.084,.050,.023,.074)*
    (1-smooth((y-1.528)/.012));
  const chin=face*ball(x,y,z,0,1.482,.076,.059,.038,.073)*
    (1-smooth((y-1.493)/.011));
  const cheeks=face*(ball(x,y,z,-.061,1.568,.068,.047,.066,.082)+
                     ball(x,y,z,.061,1.568,.068,.047,.066,.082))*
    (1-smooth((y-1.561)/.022))*smooth((Math.abs(x)-.038)/.014)*
    smooth((y-1.520)/.018);
  const body=smooth((torsoW[i]-.22)/.72);
  // True per-vertex XYZ deltas (no color-only shape faking).
  const deltas=[
    [(x<0?-1:1)*.006*eyes, .002*eyes,-.005*eyes],
    [0,0,.012*nose],
    [x*.08*lips,.001*lips,.010*lips],
    [x*.10*chin,-.004*chin,-.010*chin],
    [(x<0?-1:1)*.013*cheeks,0,.002*cheeks],
    [x*.19*body,0,0]
  ];
  deltas.forEach(([dx,dy,dz],t)=>{
   out[t][i*3]=dx;out[t][i*3+1]=dy;out[t][i*3+2]=dz;
   const d=Math.hypot(dx,dy,dz);
   if(d>1e-6){metrics[t].vertices++;metrics[t].maxDelta=Math.max(metrics[t].maxDelta,d);}
  });
 }
 // Explicit semantic audit gate on actual source vertex coordinates:
 // reject a target that moves vertices in the wrong facial feature zone.
 const zones={
  eyes:[1.584,1.65],nose:[1.538,1.59],lips:[1.499,1.542],
  chin:[1.443,1.508],cheeks:[1.519,1.586]
 };
 for(let t=0;t<TARGETS.length;t++){
  const name=TARGETS[t],m=metrics[t];
  if(m.vertices<(name==='body'?100:35)||m.maxDelta<.001||m.maxDelta>.025)
   throw Error('Unusable '+name+' localized morph '+JSON.stringify(m));
  if(!zones[name])continue;
  const [bottom,top]=zones[name];
  for(let i=0;i<count;i++){
   const delta=Math.hypot(out[t][3*i],out[t][3*i+1],out[t][3*i+2]);
   if(delta>.0001 && (v[3*i+1]<bottom||v[3*i+1]>top))
    throw Error(name+' moves vertex outside its anatomical height range');
  }
 }
 let eyeCheekOverlap=0,eyeNoseOverlap=0;
 for(let i=0;i<count;i++){
  const eye=Math.hypot(out[0][3*i],out[0][3*i+1],out[0][3*i+2]);
  const cheek=Math.hypot(out[4][3*i],out[4][3*i+1],out[4][3*i+2]);
  const nose=Math.hypot(out[1][3*i],out[1][3*i+1],out[1][3*i+2]);
  if(eye>1e-6 && cheek>1e-6)eyeCheekOverlap++;
  if(eye>1e-6 && nose>1e-6)eyeNoseOverlap++;
 }
 if(eyeCheekOverlap||eyeNoseOverlap)
  throw Error('Facial controls cross-talk into eye region: '+JSON.stringify({eyeCheekOverlap,eyeNoseOverlap}));
 const parts=[bin];let offset=bin.length;
 const ids=[];
 for(let t=0;t<out.length;t++){
  const pad=(4-offset%4)%4;if(pad){parts.push(Buffer.alloc(pad));offset+=pad;}
  const b=Buffer.alloc(out[t].length*4);
  for(let j=0;j<out[t].length;j++)b.writeFloatLE(out[t][j],j*4);
  const viewId=g.bufferViews.length;
  g.bufferViews.push({buffer:0,byteOffset:offset,byteLength:b.length,target:34962});
  const id=g.accessors.length;
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(let j=0;j<out[t].length;j++){const k=j%3;lo[k]=Math.min(lo[k],out[t][j]);hi[k]=Math.max(hi[k],out[t][j]);}
  g.accessors.push({bufferView:viewId,componentType:5126,count,type:'VEC3',min:lo,max:hi});
  ids.push(id);parts.push(b);offset+=b.length;
 }
 p.targets=ids.map(id=>({POSITION:id}));
 g.meshes[0].weights=TARGETS.map(()=>0);
 g.meshes[0].extras={...(g.meshes[0].extras||{}),targetNames:TARGETS};
 g.asset.generator='LifeSim CAS-02.2-B source-based prospective identities';
 g.extras={...(g.extras||{}),lifesimB:{kind,sourceSha256:SOURCE[kind].sha,
  targets:TARGETS,landmarkVersion:'anatomy-isolation-r2',productionReady:false,
  originalsImmutable:true,skinTonesApproved:false,bodyMeshModular:false}};
 const buffer=encodeGLB(g,parts);
 const decoded=parseGLB(buffer);
 if(decoded.g.meshes[0].primitives[0].targets.length!==6||
    JSON.stringify(decoded.g.skins)!==JSON.stringify(original.skins)||
    JSON.stringify(decoded.g.animations)!==JSON.stringify(original.animations)||
    JSON.stringify(decoded.g.images)!==JSON.stringify(original.images))
   throw Error('Source preservation failed');
 return {buffer,manifest:{kind,sourceSha256:SOURCE[kind].sha,generatedSha256:sha(buffer),bytes:buffer.length,
  sourceBytes:source.length,headVertices:pts.length,totalVertices:count,
  joints:66,animations:g.animations.length,targets:TARGETS,metrics,eyeCheekOverlap,eyeNoseOverlap,
  gameRuntimeChanged:false,originalsImmutable:true,skinTonesApproved:false,ownerArtApproved:false}};
}
if(process.argv[1]?.endsWith('/build-source-identities.mjs')){
 mkdirSync('source-variants',{recursive:true});
 for(const [kind,ref]of Object.entries(SOURCE)){
  const resp=await fetch(ROOT+ref.file);
  if(!resp.ok)throw Error('Cannot fetch original '+kind+' '+resp.status);
  const {buffer,manifest}=deriveSourceGLB(kind,Buffer.from(await resp.arrayBuffer()));
  writeFileSync('source-variants/'+kind+'.glb',buffer);
  writeFileSync('source-variants/'+kind+'.json',JSON.stringify(manifest,null,2));
  console.log('CAS_B_SOURCE_VARIANT '+JSON.stringify(manifest));
 }
}
