/** CAS-02.1-F2-C: split three SHA-pinned actual vendor GLBs, quarantine unsupported shape.
 * Uses the downloaded source geometry and original materials/textures.
 * Never builds or changes a human body, skeleton, or game save.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseLegacyGlb,sourceAccessor} from './cas-source-asset-audit.mjs';
import {ASSET_SHA256,CC0_SHOE_CANDIDATES} from './cas-02-1-f0-download-assets.mjs';

const FROM='assets/characters/cas-cc0-f0';
export const F2_DIR='assets/characters/cas-cc0-f2';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const vec=(values,i)=>values.slice(3*i,3*i+3);
function indices(glb,p){
 if(p.indices!==undefined)return sourceAccessor(glb,p.indices).values;
 const count=sourceAccessor(glb,p.attributes.POSITION).acc.count;
 return Array.from({length:count},(_,i)=>i);
}
export function splitF2ShoePair(source,entry){
 if(!entry||!CC0_SHOE_CANDIDATES.some(v=>v.id===entry.id))throw Error('Unknown CC0 source');
 if(digest(source)!==ASSET_SHA256[entry.id])throw Error('F2 must use exact audited CC0 source');
 const parsed=parseLegacyGlb(source),g=parsed.gltf;
 if(g.meshes?.length!==1||g.skins?.length||g.animations?.length||
   g.buffers?.length!==1||g.meshes[0].primitives?.length<1)
   throw Error('F2 only supports a verified static one-mesh unskinned source');
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
   const z=tri.reduce((sum,v)=>sum+pos[v*3+2],0)/3;
   triangles.push({pIndex,tri,x,z});
  }
 }
 if(triangles.length!==entry.expectedTriangles)throw Error('CC0 source triangle count drift: '+triangles.length);

 // Try source-X first (the dress and sneaker sources), then source-Z for
 // unusual publisher layouts such as one hiking boot lying on its side.
 // Never infer true physical LEFT/RIGHT handedness from the split axis.
 function clusterByAxis(axis){
  const sorted=triangles.map(t=>t[axis]).sort((a,b)=>a-b);
  let centers=[sorted[Math.floor(sorted.length*.17)],sorted[Math.floor(sorted.length*.83)]];
  for(let iteration=0;iteration<50;iteration++){
   const groups=[[],[]];
   for(const t of triangles)
    groups[Math.abs(t[axis]-centers[0])<=Math.abs(t[axis]-centers[1])?0:1].push(t[axis]);
   if(groups.some(g=>g.length<3000))return null;
   const next=groups.map(g=>g.reduce((a,b)=>a+b,0)/g.length);
   if(next.some(v=>!Number.isFinite(v)))return null;
   if(Math.max(...next.map((v,i)=>Math.abs(v-centers[i])))<1e-9){centers=next;break;}
   centers=next;
  }
  if(centers[1]-centers[0]<.045)return null;
  const split=(centers[0]+centers[1])/2;
  const buckets={left:[],right:[]};
  for(const t of triangles)buckets[t[axis]<split?'left':'right'].push(t);
  if(Math.min(buckets.left.length,buckets.right.length)<6000||
     Math.max(buckets.left.length,buckets.right.length)>14000)return null;
  return {axis,split,buckets,centers};
 }
 const chosen=clusterByAxis('x')||clusterByAxis('z');
 if(!chosen)throw Error('No balanced 2-shoe partition on either source X or Z; quarantine');
 const {axis:splitAxis,split:splitX,buckets,centers}=chosen;
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
  outG.meshes[0].name='CAS F2 CC0 '+entry.id+' '+side;
  outG.asset={...outG.asset,generator:'LifeSim CC0 footwear audited split F2'};
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
  if(count!==buckets[side].length)throw Error('F2 rebuilt mesh lost source faces');
  outputs[side]={glb:result,triangles:count,sourceBounds:jointBounds,
    outputSha256:digest(result),sourceCenterOnSplitAxis:centers[side==='left'?0:1]};
 }
 return {outputs,splitX,splitAxis,sourceSha256:digest(source),sourceTriangles:triangles.length};
}

/** QA does not mistake a side-lying, reversed or unidentified source for a
 * wearable boot. Physical orientation/contact/UV confirmation remains required.
 */
function assessPart(part){
 const b=part.sourceBounds;
 const width=b.max[0]-b.min[0],height=b.max[1]-b.min[1],depth=b.max[2]-b.min[2];
 const long=Math.max(width,depth),short=Math.min(width,depth);
 return {width,height,depth,longitudinalAxis:depth>=width?'z':'x',
  standingCandidate:long>height*1.2&&short>.016&&long>.08,
  sourceTriangles:part.triangles,sourceHash:part.outputSha256,
  rawBounds:b};
}
export function buildF2Candidates(){
 mkdirSync(F2_DIR,{recursive:true});
 const report={standard:'CAS-02.1-F2-C',stage:'asset-normalization-gate',
  physicallyApproved:false,productionReady:false,sources:[]};
 for(const entry of CC0_SHOE_CANDIDATES){
  const audit={id:entry.id,cut:entry.id==='boots'?'boot':'low-top',
   sourceSha256:ASSET_SHA256[entry.id],sourceTriangles:entry.expectedTriangles,
   sourceUrl:entry.page,license:'CC0-1.0',sourceParts:[],
   sourceOrientationVerified:false,handednessVerified:false,contactApproved:false,
   normalisedFitApproved:false,status:'quarantined'};
  try{
   const raw=readFileSync(FROM+'/'+entry.id+'.glb');
   const license=readFileSync(FROM+'/'+entry.id+'.license.txt','utf8');
   const origin=readFileSync(FROM+'/'+entry.id+'.origin.json','utf8');
   if(!/CC0|public domain/i.test(license)||
      !/CC0|public.domain/i.test(origin))throw Error('Missing vendor-declared CC0 chain');
   const split=splitF2ShoePair(raw,entry);
   audit.splitAxis='source-'+split.splitAxis.toUpperCase();audit.sourceSplitAt=split.splitX;
   for(const side of ['left','right']){
    const part=split.outputs[side],filename=entry.id+'-'+side+'.glb';
    writeFileSync(F2_DIR+'/'+filename,part.glb);
    audit.sourceParts.push({side,file:filename,sha256:part.outputSha256,
     ...assessPart(part)});
   }
   if(audit.sourceParts.reduce((n,p)=>n+p.sourceTriangles,0)!==entry.expectedTriangles)
    throw Error('Pair triangles changed during split');
   // Front/back and physical left/right still require verification from actual
   // authored geometry, not guessed from AABB or a title.
   if(!audit.sourceParts.every(p=>p.standingCandidate))
    throw Error('Source contains side-lying/non-standing half or ambiguous orientation');
   audit.status='geometry-split-review-required';
   audit.reason='Original publisher mesh split intact; toe, sole, handedness and motion contact still unverified';
  }catch(error){audit.reason=error.message;}
  writeFileSync(F2_DIR+'/'+entry.id+'.assessment.json',JSON.stringify(audit,null,2)+'\n');
  report.sources.push(audit);
  console.log('CAS F2 real source',entry.id,audit.status,audit.reason);
 }
 writeFileSync(F2_DIR+'/assessment.json',JSON.stringify(report,null,2)+'\n');
 return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url))buildF2Candidates();
