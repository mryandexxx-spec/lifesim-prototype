/** CAS-02.1-B: deterministic, original procedural rigged GLB proof; NOT production character art. */
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export const RIG_SOURCE='LifeSim original source-authored mannequin generator v2';
export const SLOTS=['body','hair','top','trousers','shoes'];
export const VARIANT_SLOTS=['hair-alt','top-alt','trousers-alt','shoes-alt'];
export const ALL_SLOTS=[...SLOTS,...VARIANT_SLOTS];
const defs=[
 ['Hips',-1,[0,1.02,0]],['Spine',0,[0,.22,0]],['Neck',1,[0,.35,0]],['Head',2,[0,.09,0]],
 ['LeftShoulder',1,[-.19,.29,0]],['LeftArm',4,[-.085,-.055,0]],['LeftForeArm',5,[-.095,-.255,0]],['LeftHand',6,[-.045,-.23,0]],
 ['RightShoulder',1,[.19,.29,0]],['RightArm',8,[.085,-.055,0]],['RightForeArm',9,[.095,-.255,0]],['RightHand',10,[.045,-.23,0]],
 ['LeftUpLeg',0,[-.11,-.12,0]],['LeftLeg',12,[0,-.43,0]],['LeftFoot',13,[0,-.34,.05]],
 ['RightUpLeg',0,[.11,-.12,0]],['RightLeg',15,[0,-.43,0]],['RightFoot',16,[0,-.34,.05]]
];
const joints=defs.map(d=>'mixamorig:'+d[0]);
const world=[];for(const d of defs)world.push(d[1]<0?[...d[2]]:d[2].map((v,j)=>v+world[d[1]][j]));
const SKIN=[.79,.55,.39,1],WHITE=[.96,.94,.88,1],DARK=[.17,.13,.12,1];
const vertex=(x,y,z,ji,jj,t=0,n=null,c=null)=>({p:[x,y,z],j:[ji,jj,0,0],w:[1-t,t,0,0],n,c});
function segment(a,b,r0,r1,ja,jb,rings=5,sides=10){
 const out={v:[],idx:[]};
 const dir=b.map((x,i)=>x-a[i]),len=Math.hypot(...dir),n=dir.map(x=>x/len);
 const t0=Math.abs(n[1])<.9?[0,1,0]:[1,0,0];
 const cross=(u,v)=>[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
 let u=cross(n,t0),uLen=Math.hypot(...u);u=u.map(x=>x/uLen);const v=cross(n,u);
 for(let ri=0;ri<=rings;ri++){
  const t=ri/rings,r=r0+(r1-r0)*t;
  for(let s=0;s<sides;s++){
   const th=2*Math.PI*s/sides;
   const q=a.map((x,k)=>x+dir[k]*t+r*(Math.cos(th)*u[k]+Math.sin(th)*v[k]));
   out.v.push(vertex(...q,ja,jb,t,u.map((x,k)=>Math.cos(th)*x+Math.sin(th)*v[k])));
  }
 }
 for(let ri=0;ri<rings;ri++)for(let s=0;s<sides;s++){
  const a=ri*sides+s,b=ri*sides+(s+1)%sides,c=(ri+1)*sides+s,d=(ri+1)*sides+(s+1)%sides;
  out.idx.push(a,c,b,b,c,d);
 }
 return out;
}
function ellipsoid(center,radius,bone,lat=10,lon=14,start=0,end=Math.PI,color=null){
 const out={v:[],idx:[]};
 for(let i=0;i<=lat;i++){
  const phi=start+(end-start)*i/lat;
  for(let j=0;j<lon;j++){
   const th=2*Math.PI*j/lon;
   const direction=[Math.sin(phi)*Math.cos(th)/radius[0],Math.cos(phi)/radius[1],Math.sin(phi)*Math.sin(th)/radius[2]];
   const length=Math.hypot(...direction)||1;
   out.v.push(vertex(center[0]+radius[0]*Math.sin(phi)*Math.cos(th),
     center[1]+radius[1]*Math.cos(phi),
     center[2]+radius[2]*Math.sin(phi)*Math.sin(th),
     bone,bone,0,direction.map(z=>z/length),color));
  }
 }
 for(let i=0;i<lat;i++)for(let j=0;j<lon;j++){
  const a=i*lon+j,b=i*lon+(j+1)%lon,c=(i+1)*lon+j,d=(i+1)*lon+(j+1)%lon;
  out.idx.push(a,c,b,b,c,d);
 }
 return out;
}
/** Continuous torso rings, elliptical cross-section and blended spine/hips skin. */
function torsoLoft(rows,sides=16){
 const out={v:[],idx:[]};
 rows.forEach(row=>{
  const [y,rx,rz,a,b,t=0]=row;
  for(let side=0;side<sides;side++){
   const th=2*Math.PI*side/sides,c=Math.cos(th),z=Math.sin(th);
   const n=[c/rx,0,z/rz],len=Math.hypot(...n);
   out.v.push(vertex(rx*c,y,rz*z,a,b,t,n.map(x=>x/len)));
  }
 });
 for(let i=0;i<rows.length-1;i++)for(let side=0;side<sides;side++){
  const a=i*sides+side,b=i*sides+(side+1)%sides,c=(i+1)*sides+side,d=(i+1)*sides+(side+1)%sides;
  out.idx.push(a,c,b,b,c,d);
 }
 return out;
}
const parts=Object.fromEntries(ALL_SLOTS.map(s=>[s,{v:[],idx:[]}]));
function add(slot,shape){
 const p=parts[slot],off=p.v.length;
 if(slot==='body')for(const v of shape.v)if(!v.c)v.c=SKIN;
 p.v.push(...shape.v);p.idx.push(...shape.idx.map(i=>i+off));
}
// CAS-02.1-C: connected shoulders, fitted silhouette, real skinned wardrobe alternatives.
add('body',torsoLoft([
 [.91,.13,.08,0,0],[1.08,.152,.087,0,1,.22],[1.28,.178,.09,1,1],
 [1.44,.194,.10,1,1],[1.54,.105,.08,1,2,.3],[1.59,.078,.065,2,2]
]));
add('body',ellipsoid([0,1.69,0],[.125,.15,.104],3,16,22));
add('body',ellipsoid([0,1.626,.109],[.022,.027,.029],3,9,12,0,Math.PI,SKIN));
add('body',ellipsoid([0,1.590,.101],[.043,.009,.009],3,7,12,0,Math.PI,[.43,.24,.21,1]));
for(const side of [-1,1]){
 const left=side<0,shoulder=left?4:8,arm=left?5:9,fore=left?6:10,hand=left?7:11,
   thigh=left?12:15,knee=left?13:16,foot=left?14:17;
 // Shoulder-to-arm bridge closes the original floating forearm seam.
 add('body',segment(world[shoulder],world[arm],.105,.086,shoulder,arm,5,12));
 add('body',segment(world[arm],world[fore],.086,.060,arm,fore,7,12));
 add('body',segment(world[fore],world[hand],.061,.044,fore,hand,7,12));
 add('body',ellipsoid(world[hand],[.047,.065,.036],hand,10,12));
 add('body',segment(world[thigh],world[knee],.092,.064,thigh,knee,7,12));
 add('body',segment(world[knee],world[foot],.065,.046,knee,foot,7,12));
 add('body',ellipsoid([side*.127,1.69,0],[.020,.034,.027],3,9,12,0,Math.PI,SKIN));
 // Light sclera and small dark iris, physically in front of the face (+Z).
 add('body',ellipsoid([side*.050,1.715,.092],[.026,.019,.013],3,9,12,0,Math.PI,WHITE));
 add('body',ellipsoid([side*.050,1.715,.105],[.011,.014,.007],3,8,10,0,Math.PI,DARK));
 add('body',ellipsoid([side*.050,1.754,.090],[.034,.007,.009],3,6,12,0,Math.PI,DARK));
 add('top',segment(world[shoulder],world[arm],.113,.10,shoulder,arm,5,12));
 add('top',segment(world[arm],world[fore],.10,.070,arm,fore,6,12));
 add('trousers',segment(world[thigh],world[knee],.101,.077,thigh,knee,6,12));
 add('trousers',segment(world[knee],world[foot],.078,.063,knee,foot,6,12));
 add('shoes',ellipsoid([world[foot][0],world[foot][1]-.018,world[foot][2]+.050],[.073,.055,.134],foot,9,14));
 add('top-alt',segment(world[shoulder],world[arm],.125,.117,shoulder,arm,5,12));
 add('top-alt',segment(world[arm],world[fore],.117,.08,arm,fore,6,12));
 add('trousers-alt',segment(world[thigh],world[knee],.116,.091,thigh,knee,6,12));
 add('trousers-alt',segment(world[knee],world[foot],.092,.071,knee,foot,6,12));
 add('shoes-alt',ellipsoid([world[foot][0],world[foot][1]+.005,world[foot][2]+.060],[.083,.073,.152],foot,9,14));
}
add('top',torsoLoft([
 [1.10,.164,.105,0,1,.20],[1.28,.192,.111,1,1],[1.43,.209,.119,1,1],
 [1.52,.152,.096,1,2,.18],[1.56,.091,.076,2,2]
]));
add('top-alt',torsoLoft([
 [1.06,.18,.12,0,1,.20],[1.27,.21,.128,1,1],[1.43,.224,.13,1,1],
 [1.54,.164,.102,1,2,.18],[1.57,.096,.084,2,2]
]));
add('trousers',torsoLoft([[.91,.16,.092,0,0],[1.06,.179,.103,0,0],[1.15,.173,.10,0,1,.25]]));
add('trousers-alt',torsoLoft([[.91,.177,.106,0,0],[1.06,.194,.115,0,0],[1.15,.188,.112,0,1,.25]]));
add('hair',ellipsoid([0,1.747,-.008],[.135,.11,.113],3,10,18,0,Math.PI*.66));
add('hair-alt',ellipsoid([0,1.757,-.01],[.145,.13,.125],3,12,18,0,Math.PI*.74));
for(const side of [-1,1])
 add('hair-alt',ellipsoid([side*.115,1.63,-.017],[.033,.12,.044],3,10,12));

function binary(){
 const chunks=[],views=[],accessors=[];let offset=0;
 const pad=(n)=> (n+3)&~3;
 function push(data,componentType,type,count,target,min,max){
  const b=Buffer.from(data.buffer,data.byteOffset,data.byteLength);
  chunks.push(b);const view=views.length;
  views.push({buffer:0,byteOffset:offset,byteLength:b.length,...target?{target}:{}});
  offset+=pad(b.length);const accessor=accessors.length;
  accessors.push({bufferView:view,componentType,count,type,...min?{min}:{},...max?{max}:{}});
  return accessor;
 }
 const meshDefs=[];
 for(const slot of ALL_SLOTS){
  const {v,idx}=parts[slot];
  const pos=new Float32Array(v.flatMap(x=>x.p));
  const normal=new Float32Array(v.flatMap(x=>x.n||[0,1,0]));
  const color=new Float32Array(v.flatMap(x=>x.c||WHITE));
  const j=new Uint16Array(v.flatMap(x=>x.j));
  const w=new Float32Array(v.flatMap(x=>x.w));
  const index=new Uint16Array(idx);
  const min=[0,1,2].map(i=>Math.min(...v.map(x=>x.p[i])));
  const max=[0,1,2].map(i=>Math.max(...v.map(x=>x.p[i])));
  meshDefs.push({name:'CAS prototype '+slot,primitives:[{attributes:{
   POSITION:push(pos,5126,'VEC3',v.length,34962,min,max),
   NORMAL:push(normal,5126,'VEC3',v.length,34962),
   ...(slot==='body'?{COLOR_0:push(color,5126,'VEC4',v.length,34962)}:{}),
   JOINTS_0:push(j,5123,'VEC4',v.length,34962),
   WEIGHTS_0:push(w,5126,'VEC4',v.length,34962)
  },indices:push(index,5123,'SCALAR',idx.length,34963),material:ALL_SLOTS.indexOf(slot)}]});
 }
 const binds=new Float32Array(world.flatMap(p=>[1,0,0,0,0,1,0,0,0,0,1,0,-p[0],-p[1],-p[2],1]));
 const bindAccess=push(binds,5126,'MAT4',defs.length);
 const bindDigest=createHash('sha256').update(Buffer.from(binds.buffer)).digest('hex');
 const animations=[];
 const clips=[['idle',1,[[5,.05],[9,-.05]]],['walk',.8,[[12,.36],[15,-.36],[5,-.28],[9,.28]]],
  ['sit',1,[[12,-1.0],[15,-1.0],[13,1.1],[16,1.1]]],['bed',1,[[1,-.12],[12,-.15],[15,-.15]]]];
 for(const [name,duration,bones] of clips){
  const times=push(new Float32Array([0,duration/2,duration]),5126,'SCALAR',3,undefined,[0],[duration]);
  const samplers=[],channels=[];
  for(const [bone,angle] of bones){
   const q=(r)=>[Math.sin(r/2),0,0,Math.cos(r/2)];
   const values=push(new Float32Array([...q(0),...q(angle),...q(0)]),5126,'VEC4',3);
   samplers.push({input:times,output:values,interpolation:'LINEAR'});
   channels.push({sampler:samplers.length-1,target:{node:bone+1,path:'rotation'}});
  }
  animations.push({name,samplers,channels});
 }
 const nodes=[{name:'CAS mannequin',children:[]}];
 for(const [i,d] of defs.entries())nodes.push({name:joints[i],translation:d[2],children:[]});
 for(let i=0;i<defs.length;i++){
  const parent=defs[i][1];nodes[parent<0?0:parent+1].children.push(i+1);
 }
 for(let i=0;i<ALL_SLOTS.length;i++){
  nodes.push({name:'CAS slot '+ALL_SLOTS[i],mesh:i,skin:0});
  nodes[0].children.push(nodes.length-1);
 }
 const colors=[[1,1,1,1],[.17,.12,.11,1],[.13,.46,.69,1],[.16,.25,.37,1],[.18,.17,.2,1],[.43,.18,.14,1],[.68,.27,.33,1],[.24,.42,.34,1],[.44,.30,.2,1]];
 const json={asset:{version:'2.0',generator:RIG_SOURCE},scene:0,scenes:[{nodes:[0]}],nodes,
  skins:[{name:'CAS original canonical rig',joints:defs.map((_,i)=>i+1),skeleton:1,inverseBindMatrices:bindAccess}],
  meshes:meshDefs,materials:colors.map((c,i)=>({name:ALL_SLOTS[i],doubleSided:true,pbrMetallicRoughness:{baseColorFactor:c,metallicFactor:0,roughnessFactor:.86}})),
  animations,accessors,bufferViews:views,buffers:[{byteLength:offset}],
  extras:{casProto:1,slots:ALL_SLOTS,bindSha256:bindDigest,source:RIG_SOURCE,license:'original authored code; no third-party data',productionReady:false}};
 const blob=Buffer.alloc(offset);let at=0;for(const chunk of chunks){chunk.copy(blob,at);at+=pad(chunk.length)}
 return {json,blob,bindDigest};
}
export function buildCasMannequinGlb(){
 const {json,blob,bindDigest}=binary();const j=Buffer.from(JSON.stringify(json));
 const jsonPadding=(4-j.length%4)%4,binPadding=(4-blob.length%4)%4;
 const paddedJson=Buffer.concat([j,Buffer.alloc(jsonPadding,32)]),paddedBin=Buffer.concat([blob,Buffer.alloc(binPadding)]);
 const total=12+8+paddedJson.length+8+paddedBin.length;
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);
 header.writeUInt32LE(total,8);header.writeUInt32LE(paddedJson.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const bhead=Buffer.alloc(8);bhead.writeUInt32LE(paddedBin.length,0);bhead.writeUInt32LE(0x004e4942,4);
 return {buffer:Buffer.concat([header,paddedJson,bhead,paddedBin]),json,bindDigest};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const path='assets/characters/cas-modular-mannequin-v1.glb';mkdirSync('assets/characters',{recursive:true});
 const {buffer,json,bindDigest}=buildCasMannequinGlb();writeFileSync(path,buffer);
 const manifest={stage:'CAS-02.1-C',asset:path,kind:'original procedural improved skinned modular proof',
  author:'LifeSim project original code',license:'original project-authored source; no third-party data',
  source:'scripts/build-cas-modular-mannequin.mjs',productionReady:false,
  sha256:createHash('sha256').update(buffer).digest('hex'),bytes:buffer.length,
  bindSha256:bindDigest,slots:ALL_SLOTS,triangles:json.meshes.reduce((sum,m)=>sum+json.accessors[m.primitives[0].indices].count/3,0),
  joints:defs.length,animations:json.animations.map(x=>x.name),rootSaveChanged:false};
 writeFileSync('assets/characters/cas-modular-mannequin-v1.json',JSON.stringify(manifest,null,2)+'\n');
 console.log('CAS-02.1-C generated',JSON.stringify(manifest));
}