/**
 * CAS-02.1-D. The REAL shipped Alex mesh is the complete visual source.
 * Splits triangles weighted to the original foot joints into a detachable
 * SAME-SKIN pair; generates a slightly broader and tinted alternate pair.
 * Does NOT synthesize a humanoid, retarget Mira, or modify game/localStorage.
 */
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseLegacyGlb,sourceAccessor,readSourceAsset,auditSourceGlb} from './cas-source-asset-audit.mjs';

export const ALEX_SOURCE_SHA256='7014401e6819b8b047fe384cfce4a62549711aa711d26a6894571800a40eb5f4';
export const CAS_ALEX_WARDROBE_FILE='assets/characters/cas-alex-footwear-lab-v1.glb';
export const CAS_ALEX_WARDROBE_MANIFEST='assets/characters/cas-alex-footwear-lab-v1.json';
const CUT_Y=.18,MIN_FOOT_WEIGHT=.55;

function binaryExtension(glb) {
 const parts=[glb.bin],g=glb.gltf;
 if(g.buffers?.length!==1||!Array.isArray(g.bufferViews)||!Array.isArray(g.accessors))
   throw new Error('Unsupported Alex GLB buffer topology');
 let size=glb.bin.length;
 function append(buffer,target,componentType,type,count,min,max){
  if(!Buffer.isBuffer(buffer))throw new TypeError('Expected binary accessor buffer');
  const align=(4-size%4)%4;
  if(align){parts.push(Buffer.alloc(align));size+=align;}
  const index=g.bufferViews.length;
  g.bufferViews.push({buffer:0,byteOffset:size,byteLength:buffer.length,target});
  parts.push(buffer);size+=buffer.length;
  const a=g.accessors.length;
  g.accessors.push({bufferView:index,componentType,type,count,
   ...(min?{min}:{}),...(max?{max}:{})});
  return a;
 }
 return {append,finish(){
  const tail=(4-size%4)%4;if(tail){parts.push(Buffer.alloc(tail));size+=tail;}
  g.buffers[0].byteLength=size;
  return Buffer.concat(parts,size);
 }};
}
function packed(indices,componentType){
 const width=componentType===5123?2:componentType===5125?4:0;
 if(!width)throw new Error('Unsupported source triangle index component');
 const data=Buffer.alloc(indices.length*width);
 for(let i=0;i<indices.length;i++)
  if(width===2)data.writeUInt16LE(indices[i],i*width);
  else data.writeUInt32LE(indices[i],i*width);
 return data;
}
function floatBuffer(numbers){
 const b=Buffer.alloc(numbers.length*4);
 for(let i=0;i<numbers.length;i++)b.writeFloatLE(numbers[i],i*4);
 return b;
}
function emitGlb(g,bin){
 const j=Buffer.from(JSON.stringify(g));
 const paddedJ=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]);
 const paddedB=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
 const total=12+8+paddedJ.length+8+paddedB.length;
 const header=Buffer.alloc(20);
 header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);
 header.writeUInt32LE(total,8);header.writeUInt32LE(paddedJ.length,12);
 header.writeUInt32LE(0x4e4f534a,16);
 const bh=Buffer.alloc(8);bh.writeUInt32LE(paddedB.length,0);
 bh.writeUInt32LE(0x004e4942,4);
 return Buffer.concat([header,paddedJ,bh,paddedB],total);
}
function segmentAlexFootwear(source){
 const original=parseLegacyGlb(source);
 if(original.sourceSha256!==ALEX_SOURCE_SHA256)
  throw new Error('Unexpected Alex source GLB SHA-256; independently re-audit before splitting');
 const audited=auditSourceGlb(source,'alex'),g=structuredClone(original.gltf);
 if(g.meshes.length!==1||g.meshes[0].primitives.length!==1||
   g.skins.length!==1||audited.skinnedMeshNodes.length!==1)
  throw new Error('Unrecognized original Alex skinned mesh layout');
 const prim=g.meshes[0].primitives[0],pos=sourceAccessor(original,prim.attributes.POSITION);
 const indices=sourceAccessor(original,prim.indices);
 const joints=sourceAccessor(original,prim.attributes.JOINTS_0);
 const weights=sourceAccessor(original,prim.attributes.WEIGHTS_0);
 if(pos.acc.componentType!==5126||pos.componentCount!==3||
   indices.acc.componentType!==5123||joints.componentCount!==4||weights.componentCount!==4)
  throw new Error('Unexpected source skin/position/index accessor encoding');
 const footIndexes=audited.footJointIndices;
 if(footIndexes.length!==2||!audited.bindSha256)
  throw new Error('Real foot joint indices and inverse-bind matrices required');
 const footStrength=index=>{
  let sum=0;for(let k=0;k<4;k++)if(footIndexes.includes(joints.values[index*4+k]))
    sum+=weights.values[index*4+k];
  return sum;
 };
 const shoeTriangles=[],bodyTriangles=[],all=indices.values;
 const xs=[[],[]],zs=[[],[]],shoeVertices=new Set(),bySide=[0,0];
 const sourceY=v=>pos.values[v*3+1],sourceX=v=>pos.values[v*3];
 for(let i=0;i<all.length;i+=3){
  const ids=all.slice(i,i+3);
  const y=ids.reduce((s,v)=>s+sourceY(v),0)/3;
  const strength=ids.reduce((s,v)=>s+footStrength(v),0)/3;
  if(y<=CUT_Y&&strength>=MIN_FOOT_WEIGHT){
   shoeTriangles.push(...ids);
   const side=ids.reduce((s,v)=>s+sourceX(v),0)<0?0:1;
   bySide[side]++;
   for(const v of ids){shoeVertices.add(v);xs[side].push(sourceX(v));zs[side].push(pos.values[v*3+2]);}
  }else bodyTriangles.push(...ids);
 }
 if(bySide.some(x=>x<400)||shoeTriangles.length<3000||bodyTriangles.length<50_000||
   shoeTriangles.length+bodyTriangles.length!==all.length)
  throw new Error('Automatic foot selection is not a safe two-shoe partition: '+JSON.stringify(bySide));
 const centers=xs.map((values,i)=>({
  x:values.reduce((s,v)=>s+v,0)/values.length,
  z:zs[i].reduce((s,v)=>s+v,0)/zs[i].length
 }));
 const altPos=pos.values.slice();let modified=0;
 for(const v of shoeVertices){
  const x=sourceX(v),y=sourceY(v),z=pos.values[v*3+2];
  const side=x<0?0:1;
  // Leave the ankle seam untouched; widen just the existing shoe surface.
  const fade=Math.max(0,Math.min(1,(CUT_Y-y)/.11));
  if(fade===0)continue;
  altPos[v*3]=x+(x-centers[side].x)*.115*fade;
  altPos[v*3+1]=y+.004*fade;
  altPos[v*3+2]=z+(z-centers[side].z)*.125*fade;
  modified++;
 }
 if(modified<700)throw new Error('No meaningful geometric footwear variant generated');
 const ext=binaryExtension({gltf:g,bin:original.bin});
 const bodyIndex=ext.append(packed(bodyTriangles,indices.acc.componentType),34963,
   indices.acc.componentType,'SCALAR',bodyTriangles.length,[0],[pos.acc.count-1]);
 const shoeIndex=ext.append(packed(shoeTriangles,indices.acc.componentType),34963,
   indices.acc.componentType,'SCALAR',shoeTriangles.length,[0],[pos.acc.count-1]);
 const lo=[0,1,2].map(k=>Math.min(...altPos.filter((_,i)=>i%3===k)));
 const hi=[0,1,2].map(k=>Math.max(...altPos.filter((_,i)=>i%3===k)));
 const altPosition=ext.append(floatBuffer(altPos),34962,5126,'VEC3',pos.acc.count,lo,hi);
 // Keep all original positions, normals, texture coordinates, bone weights,
 // bind matrices, textures, animations and the original full-body source geometry.
 const oldMeshNode=audited.skinnedMeshNodes[0],origNode=g.nodes[oldMeshNode.i];
 const originalPrim=structuredClone(prim);
 prim.indices=bodyIndex;
 const regularMesh=g.meshes.length;
 g.meshes.push({name:'CAS Alex original detachable shoes',primitives:[
   {...structuredClone(originalPrim),indices:shoeIndex}
 ]});
 const oldMaterial=g.materials?.[originalPrim.material];
 if(!oldMaterial)throw new Error('Expected original Alex texture material');
 const altMaterial=g.materials.length;
 g.materials.push({...structuredClone(oldMaterial),
  name:'CAS Alex alternative navy footwear demo',
  pbrMetallicRoughness:{...structuredClone(oldMaterial.pbrMetallicRoughness||{}),
   baseColorFactor:[.54,.72,.94,1]}});
 const altMesh=g.meshes.length;
 g.meshes.push({name:'CAS Alex alternative real-skinned shoes',primitives:[{
   ...structuredClone(originalPrim),indices:shoeIndex,material:altMaterial,
   attributes:{...structuredClone(originalPrim.attributes),POSITION:altPosition}
 }]});
 const parent=oldMeshNode.parent;
 const transform={};for(const key of ['matrix','translation','rotation','scale'])if(origNode[key])transform[key]=structuredClone(origNode[key]);
 const originalShoeNode=g.nodes.length;
 g.nodes.push({name:'CAS Alex shoes original',mesh:regularMesh,skin:oldMeshNode.skin,...structuredClone(transform)});
 const altShoeNode=g.nodes.length;
 g.nodes.push({name:'CAS Alex shoes alternative',mesh:altMesh,skin:oldMeshNode.skin,...structuredClone(transform)});
 if(parent>=0){g.nodes[parent].children??=[];g.nodes[parent].children.push(originalShoeNode,altShoeNode);}
 else {
  const scene=g.scenes?.[g.scene??0];
  if(!scene)throw Error('No source scene for skinned shoe nodes');
  scene.nodes.push(originalShoeNode,altShoeNode);
 }
 g.asset.generator='LifeSim CAS-02.1-D faithful Alex source mesh footwear split v1';
 g.extras={...(g.extras||{}),casAlexFootwear:{
  stage:'CAS-02.1-D',sourceSha256:original.sourceSha256,
  bindingSha256:audited.bindSha256,sourceTriangles:audited.triangles,
  bodyTriangles:bodyTriangles.length/3,shoeTriangles:shoeTriangles.length/3,
  bySide,cutY:CUT_Y,minFootWeight:MIN_FOOT_WEIGHT,
  originalShoeNode,altShoeNode,modifiedVertices:modified,
  originalClipNames:audited.clipNames,productionReady:false,
  methodology:'source exact skinned mesh triangle extraction; original fallback retained'
 }};
 const bin=ext.finish();
 const buffer=emitGlb(g,bin);
 return {buffer,json:g,metadata:{...g.extras.casAlexFootwear,
  bytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex')}};
}
export function buildAlexWardrobeGlb(buffer=readSourceAsset('alex')){
 return segmentAlexFootwear(buffer);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const {buffer,metadata}=buildAlexWardrobeGlb();
 mkdirSync('assets/characters',{recursive:true});
 writeFileSync(CAS_ALEX_WARDROBE_FILE,buffer);
 writeFileSync(CAS_ALEX_WARDROBE_MANIFEST,JSON.stringify({
  ...metadata,asset:CAS_ALEX_WARDROBE_FILE,
  sourceFile:'assets/characters/meshy-casual-v1.glb',
  sourceBuilder:'scripts/build-cas-alex-wardrobe.mjs',
  resident:'Alex',assetUsage:'standalone preview only',sceneIntegration:false,
  licenseNotes:'Derived from existing project-owned/shipped Alex asset; underlying Meshy rights still apply; no new external source',
  fullBodyReplacement:false,wardrobeApproved:false,physicalIphoneQAPassed:false
 },null,2)+'\n');
 console.log('CAS-02.1-D REAL ALEX WARDROBE '+JSON.stringify(metadata));
}