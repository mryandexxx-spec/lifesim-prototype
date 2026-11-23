/** CAS-02.1-F1: split verified CC0 dress-shoe pair into two immutable rigid props.
 * Uses the downloaded source geometry and original materials/textures.
 * Never builds or changes a human body, skeleton, or game save.
 */
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseLegacyGlb,sourceAccessor} from './cas-source-asset-audit.mjs';
import {ASSET_SHA256} from './cas-02-1-f0-download-assets.mjs';

const FROM='assets/characters/cas-cc0-f0';
export const F1_DIR='assets/characters/cas-cc0-f1';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const vec=(values,i)=>values.slice(3*i,3*i+3);
function indices(glb,p){
 if(p.indices!==undefined)return sourceAccessor(glb,p.indices).values;
 const count=sourceAccessor(glb,p.attributes.POSITION).acc.count;
 return Array.from({length:count},(_,i)=>i);
}
export function splitShoeSource(source){
 if(digest(source)!==ASSET_SHA256.dress)throw Error('F1 must use exact audited CC0 leather shoes');
 const parsed=parseLegacyGlb(source),g=parsed.gltf;
 if(g.meshes?.length!==1||g.skins?.length||g.animations?.length||
   g.buffers?.length!==1||g.meshes[0].primitives?.length<1)
   throw Error('F1 only supports the audited static one-mesh unskinned source');
 const triangles=[];
 for(let pIndex=0;pIndex<g.meshes[0].primitives.length;pIndex++){
  const primitive=g.meshes[0].primitives[pIndex];
  if((primitive.mode??4)!==4||primitive.attributes?.POSITION===undefined)
   throw Error('Unexpected CC0 source topology');
  const pos=sourceAccessor(parsed,primitive.attributes.POSITION).values;
  const ids=indices(parsed,primitive);
  if(ids.length%3)throw Error('Malformed triangle list');
  for(let i=0;i<ids.length;i+=3){
   const tri=ids.slice(i,i+3);
   if(tri.some(v=>!Number.isInteger(v)||v<0||v*3+2>=pos.length))
    throw Error('Out of range source shoe vertex');
   const x=tri.reduce((sum,v)=>sum+pos[v*3],0)/3;
   triangles.push({pIndex,tri,x});
  }
 }
 if(triangles.length!==19744)throw Error('CC0 source triangle count drift: '+triangles.length);
 const sorted=triangles.map(t=>t.x).sort((a,b)=>a-b);
 let centers=[sorted[Math.floor(sorted.length*.17)],sorted[Math.floor(sorted.length*.83)]];
 for(let iteration=0;iteration<50;iteration++){
  const clusters=[[],[]];
  for(const t of triangles)clusters[Math.abs(t.x-centers[0])<=Math.abs(t.x-centers[1])?0:1].push(t.x);
  if(clusters.some(c=>c.length<3000))throw Error('Cannot identify two separate physical shoes');
  const next=clusters.map(c=>c.reduce((a,b)=>a+b,0)/c.length);
  if(next.some(v=>!Number.isFinite(v)))throw Error('Bad shoe cluster');
  if(Math.max(...next.map((n,i)=>Math.abs(n-centers[i])))<1e-9){centers=next;break;}
  centers=next;
 }
 if(centers[1]-centers[0]<.065)throw Error('Source shoes have no safe left/right X separation');
 const splitX=(centers[0]+centers[1])/2;
 const buckets={left:[],right:[]};
 for(const t of triangles)buckets[t.x<splitX?'left':'right'].push(t);
 if(Math.min(buckets.left.length,buckets.right.length)<6000||
   Math.max(buckets.left.length,buckets.right.length)>14000)
   throw Error('Separated CC0 shoes have implausible face balance');
 const outputs={};
 for(const side of ['left','right']){
  const outG=structuredClone(g),buffers=[Buffer.from(parsed.bin)];
  const trianglesByPrimitive=outG.meshes[0].primitives.map(()=>[]);
  for(const t of buckets[side])trianglesByPrimitive[t.pIndex].push(...t.tri);
  let total=parsed.bin.length;
  const jointBounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(let pi=0;pi<outG.meshes[0].primitives.length;pi++){
   const primitive=outG.meshes[0].primitives[pi],ids=trianglesByPrimitive[pi];
   if(ids.length===0)continue;
   const position=sourceAccessor(parsed,primitive.attributes.POSITION);
   const bound={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
   for(const id of new Set(ids)){
    const xyz=vec(position.values,id);
    for(let ax=0;ax<3;ax++){
     bound.min[ax]=Math.min(bound.min[ax],xyz[ax]);
     bound.max[ax]=Math.max(bound.max[ax],xyz[ax]);
     jointBounds.min[ax]=Math.min(jointBounds.min[ax],xyz[ax]);
     jointBounds.max[ax]=Math.max(jointBounds.max[ax],xyz[ax]);
    }
   }
   // One source POSITION accessor per real shoe primitive. Bound must be
   // scoped to the selected half so PlayCanvas cannot cull by full-pair AABB.
   outG.accessors[primitive.attributes.POSITION].min=bound.min;
   outG.accessors[primitive.attributes.POSITION].max=bound.max;
   const componentType=Math.max(...ids)>65535?5125:5123;
   const indicesBytes=Buffer.alloc(ids.length*(componentType===5125?4:2));
   ids.forEach((id,i)=>componentType===5125?indicesBytes.writeUInt32LE(id,i*4):indicesBytes.writeUInt16LE(id,i*2));
   const pad=(4-total%4)%4;
   if(pad){buffers.push(Buffer.alloc(pad));total+=pad;}
   outG.bufferViews.push({buffer:0,byteOffset:total,byteLength:indicesBytes.length,
     target:34963});
   const indexView=outG.bufferViews.length-1;
   outG.accessors.push({bufferView:indexView,componentType,count:ids.length,
     type:'SCALAR',min:[Math.min(...ids)],max:[Math.max(...ids)]});
   primitive.indices=outG.accessors.length-1;
   buffers.push(indicesBytes);total+=indicesBytes.length;
  }
  outG.meshes[0].primitives=outG.meshes[0].primitives.filter(p=>
   outG.accessors[p.indices]?.count>0);
  if(!outG.meshes[0].primitives.length)throw Error('No triangles for '+side);
  outG.meshes[0].name='CAS F1 CC0 leather '+side;
  outG.asset={...outG.asset,generator:'LifeSim CC0 footwear rigid-split F1'};
  outG.buffers[0].byteLength=total;
  const jsonBytes=Buffer.from(JSON.stringify(outG));
  const jsonPad=(4-jsonBytes.length%4)%4;
  const bin=Buffer.concat(buffers),binPad=(4-bin.length%4)%4;
  const j=Buffer.concat([jsonBytes,Buffer.alloc(jsonPad,32)]);
  const b=Buffer.concat([bin,Buffer.alloc(binPad)]);
  const result=Buffer.alloc(12+8+j.length+8+b.length);
  result.writeUInt32LE(0x46546c67,0);
  result.writeUInt32LE(2,4);
  result.writeUInt32LE(result.length,8);
  result.writeUInt32LE(j.length,12);
  result.writeUInt32LE(0x4e4f534a,16);
  j.copy(result,20);
  const bi=20+j.length;
  result.writeUInt32LE(b.length,bi);
  result.writeUInt32LE(0x004e4942,bi+4);
  b.copy(result,bi+8);
  const verify=parseLegacyGlb(result);
  const count=verify.gltf.meshes[0].primitives.reduce((n,p)=>
    n+sourceAccessor(verify,p.indices).acc.count/3,0);
  if(count!==buckets[side].length)throw Error('F1 rebuilt mesh lost source faces');
  outputs[side]={glb:result,triangles:count,sourceBounds:jointBounds,
    outputSha256:digest(result),sourceCenterX:centers[side==='left'?0:1]};
 }
 return {outputs,splitX,sourceSha256:digest(source),sourceTriangles:triangles.length};
}
export function build(){
 const input=readFileSync(FROM+'/dress.glb');
 const result=splitShoeSource(input);
 mkdirSync(F1_DIR,{recursive:true});
 const manifest={id:'dress',sourceId:'dress',license:'CC0-1.0',
  sourcePage:'https://grab3d.com/models/props/shoe/',
  sourceSha256:result.sourceSha256,originalTriangles:result.sourceTriangles,
  splitAtX:result.splitX,parts:{},mount:'rigid-per-foot',clipsFromAlex:10,
  deformableToe:false,animationContactApproved:false,
  productionReady:false,physicalIphoneApproved:false};
 for(const side of ['left','right']){
  const item=result.outputs[side];
  const filename='dress-'+side+'.glb';
  writeFileSync(F1_DIR+'/'+filename,item.glb);
  manifest.parts[side]={file:filename,sha256:item.outputSha256,
    triangles:item.triangles,bounds:item.sourceBounds};
 }
 if(manifest.parts.left.triangles+manifest.parts.right.triangles!==19744)
  throw Error('Lost CC0 triangles');
 copyFileSync(FROM+'/dress.license.txt',F1_DIR+'/dress.license.txt');
 copyFileSync(FROM+'/dress.origin.json',F1_DIR+'/dress.origin.json');
 writeFileSync(F1_DIR+'/dress.manifest.json',JSON.stringify(manifest,null,2)+'\n');
 console.log('CAS-02.1-F1 REAL CC0 TWO-FOOT SPLIT '+JSON.stringify(manifest));
 return manifest;
}
if(process.argv[1]===fileURLToPath(import.meta.url))build();
