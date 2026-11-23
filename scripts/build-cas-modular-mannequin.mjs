/** CAS-02.1-B: deterministic, original procedural rigged GLB proof; NOT production character art. */
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export const RIG_SOURCE='LifeSim original source-authored mannequin generator v1';
export const SLOTS=['body','hair','top','trousers','shoes'];
const defs=[
 ['Hips',-1,[0,1.02,0]],['Spine',0,[0,.22,0]],['Neck',1,[0,.40,0]],['Head',2,[0,.20,0]],
 ['LeftShoulder',1,[-.18,.32,0]],['LeftArm',4,[-.22,-.10,0]],['LeftForeArm',5,[-.23,-.25,0]],['LeftHand',6,[-.17,-.23,0]],
 ['RightShoulder',1,[.18,.32,0]],['RightArm',8,[.22,-.10,0]],['RightForeArm',9,[.23,-.25,0]],['RightHand',10,[.17,-.23,0]],
 ['LeftUpLeg',0,[-.11,-.12,0]],['LeftLeg',12,[0,-.43,0]],['LeftFoot',13,[0,-.34,.05]],
 ['RightUpLeg',0,[.11,-.12,0]],['RightLeg',15,[0,-.43,0]],['RightFoot',16,[0,-.34,.05]]
];
const joints=defs.map(d=>'mixamorig:'+d[0]);
const world=[];for(const d of defs)world.push(d[1]<0?[...d[2]]:d[2].map((v,j)=>v+world[d[1]][j]));
const vertex=(x,y,z,ji,jj,t=0)=>({p:[x,y,z],j:[ji,jj,0,0],w:[1-t,t,0,0]});
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
   out.v.push(vertex(...q,ja,jb,t));
  }
 }
 for(let ri=0;ri<rings;ri++)for(let s=0;s<sides;s++){
  const a=ri*sides+s,b=ri*sides+(s+1)%sides,c=(ri+1)*sides+s,d=(ri+1)*sides+(s+1)%sides;
  out.idx.push(a,c,b,b,c,d);
 }
 return out;
}
function ellipsoid(center,radius,bone,lat=10,lon=14,start=0,end=Math.PI){
 const out={v:[],idx:[]};
 for(let i=0;i<=lat;i++){
  const phi=start+(end-start)*i/lat;
  for(let j=0;j<lon;j++){
   const th=2*Math.PI*j/lon;
   out.v.push(vertex(center[0]+radius[0]*Math.sin(phi)*Math.cos(th),center[1]+radius[1]*Math.cos(phi),center[2]+radius[2]*Math.sin(phi)*Math.sin(th),bone,bone));
  }
 }
 for(let i=0;i<lat;i++)for(let j=0;j<lon;j++){
  const a=i*lon+j,b=i*lon+(j+1)%lon,c=(i+1)*lon+j,d=(i+1)*lon+(j+1)%lon;
  out.idx.push(a,c,b,b,c,d);
 }
 return out;
}
const parts=Object.fromEntries(SLOTS.map(s=>[s,{v:[],idx:[]}]));
function add(slot,shape){const p=parts[slot],off=p.v.length;p.v.push(...shape.v);p.idx.push(...shape.idx.map(i=>i+off));}
// Metres, +Y world, named detachable weighted meshes. Original geometric prototype.
add('body',segment([0,1.06,0],[0,1.48,0],.16,.13,0,1));
add('body',ellipsoid([0,1.67,0],[.125,.16,.105],3));
for(const side of [-1,1]){
 const left=side<0,arm=left?5:9,fore=left?6:10,hand=left?7:11,
   thigh=left?12:15,knee=left?13:16,foot=left?14:17;
 add('body',segment(world[arm],world[fore],.065,.046,arm,fore));
 add('body',segment(world[fore],world[hand],.046,.035,fore,hand));
 add('body',ellipsoid(world[hand],[.045,.055,.038],hand,7,9));
 add('body',segment(world[thigh],world[knee],.086,.058,thigh,knee));
 add('body',segment(world[knee],world[foot],.058,.045,knee,foot));
 add('top',segment([side*.075,1.10,0],[side*.09,1.43,0],.115,.105,0,1));
 add('top',segment(world[arm],world[fore],.076,.061,arm,fore,4));
 add('trousers',segment(world[thigh],world[knee],.094,.072,thigh,knee));
 add('trousers',segment(world[knee],world[foot],.072,.059,knee,foot));
 add('shoes',ellipsoid([world[foot][0],world[foot][1]-.015,world[foot][2]+.045],[.068,.047,.128],foot,7,10));
}
add('top',segment([0,1.12,0],[0,1.48,0],.174,.145,0,1));
add('trousers',segment([0,.90,0],[0,1.11,0],.185,.185,0,0,4));
add('hair',ellipsoid([0,1.70,0],[.137,.165,.115],3,7,14,0,Math.PI*.57));

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
 for(const slot of SLOTS){
  const {v,idx}=parts[slot];
  const pos=new Float32Array(v.flatMap(x=>x.p));
  const normal=new Float32Array(v.flatMap(x=>{const p=x.p;const c=[0,(slot==='hair'?1.70:1.05),0];const a=p.map((z,k)=>z-c[k]);const l=Math.hypot(...a)||1;return a.map(z=>z/l)}));
  const j=new Uint16Array(v.flatMap(x=>x.j));
  const w=new Float32Array(v.flatMap(x=>x.w));
  const index=new Uint16Array(idx);
  const min=[0,1,2].map(i=>Math.min(...v.map(x=>x.p[i])));
  const max=[0,1,2].map(i=>Math.max(...v.map(x=>x.p[i])));
  meshDefs.push({name:'CAS prototype '+slot,primitives:[{attributes:{
   POSITION:push(pos,5126,'VEC3',v.length,34962,min,max),
   NORMAL:push(normal,5126,'VEC3',v.length,34962),
   JOINTS_0:push(j,5123,'VEC4',v.length,34962),
   WEIGHTS_0:push(w,5126,'VEC4',v.length,34962)
  },indices:push(index,5123,'SCALAR',idx.length,34963),material:SLOTS.indexOf(slot)}]});
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
 for(let i=0;i<SLOTS.length;i++){
  nodes.push({name:'CAS slot '+SLOTS[i],mesh:i,skin:0});
  nodes[0].children.push(nodes.length-1);
 }
 const colors=[[.83,.61,.43,1],[.17,.12,.11,1],[.13,.46,.69,1],[.16,.25,.37,1],[.18,.17,.2,1]];
 const json={asset:{version:'2.0',generator:RIG_SOURCE},scene:0,scenes:[{nodes:[0]}],nodes,
  skins:[{name:'CAS original canonical rig',joints:defs.map((_,i)=>i+1),skeleton:1,inverseBindMatrices:bindAccess}],
  meshes:meshDefs,materials:colors.map((c,i)=>({name:SLOTS[i],doubleSided:true,pbrMetallicRoughness:{baseColorFactor:c,metallicFactor:0,roughnessFactor:.86}})),
  animations,accessors,bufferViews:views,buffers:[{byteLength:offset}],
  extras:{casProto:1,slots:SLOTS,bindSha256:bindDigest,source:RIG_SOURCE,license:'original authored code; no third-party data',productionReady:false}};
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
 const manifest={stage:'CAS-02.1-B',asset:path,kind:'original procedural skinned modular proof',
  author:'LifeSim project original code',license:'original project-authored source; no third-party data',
  source:'scripts/build-cas-modular-mannequin.mjs',productionReady:false,
  sha256:createHash('sha256').update(buffer).digest('hex'),bytes:buffer.length,
  bindSha256:bindDigest,slots:SLOTS,triangles:json.meshes.reduce((sum,m)=>sum+json.accessors[m.primitives[0].indices].count/3,0),
  joints:defs.length,animations:json.animations.map(x=>x.name),rootSaveChanged:false};
 writeFileSync('assets/characters/cas-modular-mannequin-v1.json',JSON.stringify(manifest,null,2)+'\n');
 console.log('CAS-02.1-B generated',JSON.stringify(manifest));
}