/**
 * CAS-02.1-E: source-faithful, visually distinguishable footwear for REAL Alex and Mira.
 *
 * Every shoe style retains each resident's own Mixamo joints, original skin
 * weights, UVs, animation tracks, and face/body. No cross-rig retargeting.
 * Three interchangeable variants; experimental source-derived geometry ONLY.
 */
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseLegacyGlb,sourceAccessor,readSourceAsset,auditSourceGlb} from './cas-source-asset-audit.mjs';

export const SOURCE_SHA256=Object.freeze({
 alex:'7014401e6819b8b047fe384cfce4a62549711aa711d26a6894571800a40eb5f4',
 mira:'40a2d1e0dcde53f7c2f53c6bd220f39ba440bbf4d42dfbad949ca82146594d0a'
});
export const STYLES=Object.freeze(['original','graphite','terracotta']);
export const STYLE_LABELS=Object.freeze({
 original:'Оригинальная обувь',
 graphite:'Графитовые кроссовки',
 terracotta:'Терракотовые кроссовки'
});
const CUT_Y=.18,MIN_FOOT_WEIGHT=.55;
const palette={
 graphite:{upper:[.19,.27,.34,1],sole:[.82,.85,.82,1],width:.27,length:.18,soleDrop:.012},
 terracotta:{upper:[.78,.23,.15,1],sole:[.94,.72,.52,1],width:.17,length:.33,soleDrop:.016}
};
function addBinary(g,initial){
 let bytes=initial.length;
 const chunks=[initial];
 function put(data,target,componentType,type,count,min,max){
  if(!Buffer.isBuffer(data))throw new Error('Binary accessor input must be Buffer');
  const padding=(4-bytes%4)%4;
  if(padding){chunks.push(Buffer.alloc(padding));bytes+=padding;}
  const viewIndex=g.bufferViews.length;
  g.bufferViews.push({buffer:0,byteOffset:bytes,byteLength:data.length,target});
  const accessorIndex=g.accessors.length;
  g.accessors.push({bufferView:viewIndex,componentType,type,count,
   ...(min?{min}:{}),...(max?{max}:{})});
  chunks.push(data);bytes+=data.length;
  return accessorIndex;
 }
 function finish(){
  const padding=(4-bytes%4)%4;
  if(padding){chunks.push(Buffer.alloc(padding));bytes+=padding;}
  g.buffers[0].byteLength=bytes;
  return Buffer.concat(chunks,bytes);
 }
 return {put,finish};
}
function packIndices(indices,componentType){
 const bytes=componentType===5123?2:componentType===5125?4:0;
 if(!bytes)throw new Error('Unsupported source index format '+componentType);
 const b=Buffer.alloc(indices.length*bytes);
 for(let i=0;i<indices.length;i++){
  if(bytes===2)b.writeUInt16LE(indices[i],i*bytes);
  else b.writeUInt32LE(indices[i],i*bytes);
 }
 return b;
}
function packFloat(values){
 const b=Buffer.alloc(values.length*4);
 for(let i=0;i<values.length;i++)b.writeFloatLE(values[i],i*4);
 return b;
}
function emitGlb(g,bin){
 const j=Buffer.from(JSON.stringify(g));
 const a=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]);
 const b=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
 const result=Buffer.alloc(12+8+a.length+8+b.length);
 result.writeUInt32LE(0x46546c67,0);
 result.writeUInt32LE(2,4);
 result.writeUInt32LE(result.length,8);
 result.writeUInt32LE(a.length,12);
 result.writeUInt32LE(0x4e4f534a,16);
 a.copy(result,20);
 const binStart=20+a.length;
 result.writeUInt32LE(b.length,binStart);
 result.writeUInt32LE(0x004e4942,binStart+4);
 b.copy(result,binStart+8);
 return result;
}
export function buildResidentFootwear(kind,buffer=readSourceAsset(kind)){
 if(!(kind in SOURCE_SHA256))throw new Error('Unknown footwear resident '+kind);
 const parsed=parseLegacyGlb(buffer);
 if(parsed.sourceSha256!==SOURCE_SHA256[kind])
  throw new Error('Source '+kind+' asset SHA-256 changed; fail closed until full re-audit');
 const report=auditSourceGlb(buffer,kind);
 if(report.meshCount!==1||report.skinCount!==1||report.skinnedMeshNodes.length!==1||
    report.joints!==66||report.primitives.length!==1||report.footJointIndices.length!==2||
    !report.bindSha256)throw new Error('Unrecognized source '+kind+' skin topology');
 const g=structuredClone(parsed.gltf);
 if(g.buffers?.length!==1||g.meshes[0].primitives.length!==1)
  throw new Error('Unexpected source GLB buffers or meshes');
 const sourcePrimitive=structuredClone(g.meshes[0].primitives[0]);
 const index=sourceAccessor(parsed,sourcePrimitive.indices);
 const position=sourceAccessor(parsed,sourcePrimitive.attributes.POSITION);
 const joints=sourceAccessor(parsed,sourcePrimitive.attributes.JOINTS_0);
 const weights=sourceAccessor(parsed,sourcePrimitive.attributes.WEIGHTS_0);
 if(![5123,5125].includes(index.acc.componentType)||position.acc.componentType!==5126||
    position.componentCount!==3||joints.componentCount!==4||weights.componentCount!==4)
  throw new Error('Unsupported source vertex attributes');
 const vertexY=v=>position.values[v*3+1],vertexX=v=>position.values[v*3];
 const vertices=new Set(),shoel=[],body=[],sides=[0,0],xs=[[],[]],zs=[[],[]];
 const strength=v=>{
  let w=0;
  for(let i=0;i<4;i++)if(report.footJointIndices.includes(joints.values[v*4+i]))
    w+=weights.values[v*4+i];
  return w;
 };
 for(let i=0;i<index.values.length;i+=3){
  const ids=index.values.slice(i,i+3);
  const y=ids.reduce((n,v)=>n+vertexY(v),0)/3;
  const foot=ids.reduce((n,v)=>n+strength(v),0)/3;
  if(y<=CUT_Y&&foot>=MIN_FOOT_WEIGHT){
   shoel.push(...ids);
   const side=ids.reduce((n,v)=>n+vertexX(v),0)<0?0:1;
   sides[side]++;
   for(const v of ids){
    vertices.add(v);
    xs[side].push(vertexX(v));
    zs[side].push(position.values[v*3+2]);
   }
  }else body.push(...ids);
 }
 if(sides.some(n=>n<550)||shoel.length<4500||body.length<10000||
    shoel.length+body.length!==index.values.length)
  throw new Error('Unsafe footwear cut on '+kind+': '+JSON.stringify(sides));
 const center=xs.map((arr,i)=>({
  x:arr.reduce((sum,n)=>sum+n,0)/arr.length,
  z:zs[i].reduce((sum,n)=>sum+n,0)/zs[i].length
 }));
 const put=addBinary(g,parsed.bin);
 const indexType=index.acc.componentType;
 const addIndices=arr=>put.put(packIndices(arr,indexType),34963,indexType,'SCALAR',
  arr.length,[0],[position.acc.count-1]);
 g.meshes[0].primitives[0].indices=addIndices(body);
 const sourceShoeIndices=addIndices(shoel);
 const originalSkinNode=report.skinnedMeshNodes[0],sourceNode=g.nodes[originalSkinNode.i];
 const local={};
 for(const key of ['matrix','translation','rotation','scale'])
  if(sourceNode[key])local[key]=structuredClone(sourceNode[key]);
 const shoeMeshes=[],styleNodes=[],styleStats={};
 const sourceMaterial=g.materials?.[sourcePrimitive.material];
 if(!sourceMaterial)throw Error('Original '+kind+' shoe texture material missing');
 const baseShoes=g.meshes.length;
 g.meshes.push({name:'CAS '+kind+' original shoes source',primitives:[{
  ...structuredClone(sourcePrimitive),indices:sourceShoeIndices
 }]});
 shoeMeshes.push(baseShoes);
 styleStats.original={triangles:shoel.length/3,modifiedVertices:0,
  provenance:'original vertex positions/material/UV/skin'};
 for(const style of STYLES.filter(s=>s!=='original')){
  const p=palette[style],positions=position.values.slice();
  let modified=0;
  for(const v of vertices){
   const x=position.values[v*3],y=vertexY(v),z=position.values[v*3+2];
   const side=x<0?0:1;
   // The ankle seam stays unchanged. Increasing width/length and a lower
   // sole creates a measurably different silhouette on the real shoe source.
   const fade=Math.max(0,Math.min(1,(CUT_Y-y)/.105));
   if(fade<.00001)continue;
   positions[v*3]=x+(x-center[side].x)*p.width*fade;
   positions[v*3+1]=y-p.soleDrop*fade;
   positions[v*3+2]=z+(z-center[side].z)*p.length*fade;
   modified++;
  }
  if(modified<700)throw Error('Too few source shoe vertices modified for '+kind+'/'+style);
  const lower=[0,1,2].map(k=>Math.min(...positions.filter((_,i)=>i%3===k)));
  const upper=[0,1,2].map(k=>Math.max(...positions.filter((_,i)=>i%3===k)));
  const positionAccessor=put.put(packFloat(positions),34962,5126,'VEC3',
   position.acc.count,lower,upper);
  const upperIndices=[],soleIndices=[];
  for(let i=0;i<shoel.length;i+=3){
   const ids=shoel.slice(i,i+3);
   const avg=ids.reduce((n,v)=>n+vertexY(v),0)/3;
   (avg<=.055?soleIndices:upperIndices).push(...ids);
  }
  if(upperIndices.length<100||soleIndices.length<100)
   throw new Error('Footwear color/material split has no sole or upper for '+kind+'/'+style);
  const upperMaterial=g.materials.length;
  g.materials.push({...structuredClone(sourceMaterial),
   name:'CAS '+kind+' '+style+' upper',pbrMetallicRoughness:{
    ...structuredClone(sourceMaterial.pbrMetallicRoughness||{}),
    baseColorFactor:p.upper
   }});
  const soleMaterial=g.materials.length;
  g.materials.push({...structuredClone(sourceMaterial),
   name:'CAS '+kind+' '+style+' contrast sole',pbrMetallicRoughness:{
    ...structuredClone(sourceMaterial.pbrMetallicRoughness||{}),
    baseColorFactor:p.sole
   }});
  const meshIndex=g.meshes.length;
  const attrs={...structuredClone(sourcePrimitive.attributes),POSITION:positionAccessor};
  g.meshes.push({name:'CAS '+kind+' '+style+' source-derived skinned shoes',primitives:[
   {...structuredClone(sourcePrimitive),attributes:attrs,indices:addIndices(upperIndices),material:upperMaterial},
   {...structuredClone(sourcePrimitive),attributes:attrs,indices:addIndices(soleIndices),material:soleMaterial}
  ]});
  shoeMeshes.push(meshIndex);
  styleStats[style]={triangles:shoel.length/3,modifiedVertices:modified,
   upperTriangles:upperIndices.length/3,soleTriangles:soleIndices.length/3,
   tintUpper:p.upper,tintSole:p.sole};
 }
 const parent=originalSkinNode.parent;
 for(let i=0;i<STYLES.length;i++){
  const style=STYLES[i],nodeId=g.nodes.length;
  g.nodes.push({name:'CAS '+kind+' shoes '+style,mesh:shoeMeshes[i],
    skin:sourceNode.skin,...structuredClone(local)});
  styleNodes.push(nodeId);
  if(parent>=0){g.nodes[parent].children??=[];g.nodes[parent].children.push(nodeId);}
  else g.scenes?.[g.scene??0]?.nodes?.push(nodeId);
 }
 g.asset.generator='LifeSim source-derived '+kind+' footwear styles CAS-02.1-E';
 const meta={
  stage:'CAS-02.1-E',resident:kind,sourceSha256:parsed.sourceSha256,
  sourceBindSha256:report.bindSha256,sourceTriangles:report.triangles,
  bodyTriangles:body.length/3,shoeTriangles:shoel.length/3,bySide:sides,
  sourceAnimations:[...report.clipNames],sourceSkinJoints:report.joints,
  sourceTextureCount:report.textures,styleNodes,styleStats,styleNames:STYLES,
  originalGameModelsUnchanged:true,productionReady:false,visualApproval:false,
  contactAnimationsApproved:false,
  method:'faithful source triangle partition, independent same-skin meshes and tinted/shaped shoe vertices'
 };
 g.extras={...(g.extras||{}),casSourceFootwearStyles:meta};
 const binary=put.finish();
 const glb=emitGlb(g,binary);
 return {buffer:glb,json:g,metadata:{...meta,bytes:glb.length,
  sha256:createHash('sha256').update(glb).digest('hex')}};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 mkdirSync('assets/characters',{recursive:true});
 for(const kind of ['alex','mira']){
  const {buffer,metadata}=buildResidentFootwear(kind);
  const stem='assets/characters/cas-'+kind+'-footwear-v2';
  writeFileSync(stem+'.glb',buffer);
  writeFileSync(stem+'.json',JSON.stringify({...metadata,
   asset:stem+'.glb',sourceAsset:'assets/characters/'+(kind==='alex'?'meshy-casual-v1.glb':'meshy-mira-mobile-v1.glb'),
   sourceBuilder:'scripts/build-cas-resident-footwear-v2.mjs',
   rights:'source-derived from already shipped resident Meshy GLB; no new third-party content',
   persistToGame:false,physicalSafariTested:false
  },null,2)+'\n');
  console.log('CAS-02.1-E SOURCE FOOTWEAR '+JSON.stringify(metadata));
 }
}