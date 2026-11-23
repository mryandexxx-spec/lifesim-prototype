/**
 * CAS-02.2-A: source-preserving experimental head/upper-torso morph targets
 * on the two real shipped residents. NOT face presets, naked bodies, or
 * production wardrobe. No transformation of the rig or game save state.
 */
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseLegacyGlb,sourceAccessor,readSourceAsset,auditSourceGlb}
  from './cas-source-asset-audit.mjs';

export const CAS_022_SOURCE_SHA256=Object.freeze({
  alex:'7014401e6819b8b047fe384cfce4a62549711aa711d26a6894571800a40eb5f4',
  mira:'40a2d1e0dcde53f7c2f53c6bd220f39ba440bbf4d42dfbad949ca82146594d0a'
});
export const CAS_022_MORPHS=Object.freeze(['head-width-pilot','upper-torso-width-pilot']);
const scalar=(n)=>Math.max(0,Math.min(1,n));
const smooth=(n)=>{const t=scalar(n);return t*t*(3-2*t);};
const digest=b=>createHash('sha256').update(b).digest('hex');

function floatBuffer(values){
  const b=Buffer.alloc(values.length*4);
  for(let i=0;i<values.length;i++)b.writeFloatLE(values[i],i*4);
  return b;
}
function emitGlb(g,bin){
  const j=Buffer.from(JSON.stringify(g));
  const json=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]);
  const pad=(4-bin.length%4)%4;
  const binary=pad?Buffer.concat([bin,Buffer.alloc(pad)]):bin;
  const total=12+8+json.length+8+binary.length;
  const out=Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67,0);
  out.writeUInt32LE(2,4);
  out.writeUInt32LE(total,8);
  out.writeUInt32LE(json.length,12);
  out.writeUInt32LE(0x4e4f534a,16);
  json.copy(out,20);
  const offset=20+json.length;
  out.writeUInt32LE(binary.length,offset);
  out.writeUInt32LE(0x004e4942,offset+4);
  binary.copy(out,offset+8);
  return out;
}
function weightedStrength(joints,weights,vertex,boneSet){
  let total=0;
  for(let k=0;k<4;k++)
    if(boneSet.has(joints[vertex*4+k]))total+=weights[vertex*4+k];
  return scalar(total);
}
function weightedCenter(pos,strength){
  let sum=0,x=0,count=0,minY=Infinity,maxY=-Infinity;
  for(let i=0;i<strength.length;i++){
    if(strength[i]<.55)continue;
    const s=strength[i];
    x+=pos[i*3]*s;sum+=s;count++;
    const y=pos[i*3+1];minY=Math.min(minY,y);maxY=Math.max(maxY,y);
  }
  if(count<50||sum<30||!Number.isFinite(minY)||maxY-minY<.05)
    throw new Error('Unsafe/unsegmented source head or torso: '+count);
  return {x:x/sum,count,yMin:minY,yMax:maxY};
}
export function buildCas022Morphs(kind,source=readSourceAsset(kind)){
  if(!Object.hasOwn(CAS_022_SOURCE_SHA256,kind))throw new Error('Unknown resident');
  const original=parseLegacyGlb(source);
  if(original.sourceSha256!==CAS_022_SOURCE_SHA256[kind])
    throw new Error('Unexpected '+kind+' GLB SHA: source re-audit mandatory');
  const audited=auditSourceGlb(source,kind),g=structuredClone(original.gltf);
  if(g.meshes?.length!==1||g.meshes[0].primitives?.length!==1||
    g.skins?.length!==1||audited.skinnedMeshNodes.length!==1||
    audited.morphTargets!==0||!audited.bindSha256)
    throw new Error('Unsupported source topology, skin or existing morph targets');
  const p=g.meshes[0].primitives[0];
  if(p.targets?.length)throw new Error('Refusing to overwrite original morph data');
  const aPos=sourceAccessor(original,p.attributes.POSITION);
  const aJoint=sourceAccessor(original,p.attributes.JOINTS_0);
  const aWeight=sourceAccessor(original,p.attributes.WEIGHTS_0);
  if(aPos.acc.componentType!==5126||aPos.componentCount!==3||
    aJoint.componentCount!==4||aWeight.componentCount!==4||
    aWeight.acc.componentType!==5126||
    aPos.acc.count!==aJoint.acc.count||aPos.acc.count!==aWeight.acc.count)
    throw new Error('Unsupported source vertex/skin data');
  const names=g.skins[0].joints.map(i=>g.nodes[i]?.name);
  const byName=regex=>new Set(names.map((n,i)=>regex.test(n||'')?i:-1).filter(i=>i>=0));
  const head=byName(/^mixamorig:Head$/);
  const torso=byName(/^mixamorig:Spine(?:1|2)?$/);
  if(head.size!==1||torso.size<1)throw new Error('Head/Spine source joints missing');
  const count=aPos.acc.count,heads=[],torsos=[];
  for(let i=0;i<count;i++){
    heads.push(weightedStrength(aJoint.values,aWeight.values,i,head));
    torsos.push(weightedStrength(aJoint.values,aWeight.values,i,torso));
  }
  const h=weightedCenter(aPos.values,heads),t=weightedCenter(aPos.values,torsos);
  const targets=[[],[]],modified=[0,0],absoluteMax=[0,0];
  for(let i=0;i<count;i++){
    const x=aPos.values[i*3],y=aPos.values[i*3+1];
    // Bone-weighted, local and reversible; source UVs, indices, skin,
    // animation clips, shoes, bind matrices, textures and mesh nodes stay intact.
    const headWeight=smooth((heads[i]-.20)/.80);
    const torsoWeight=smooth((torsos[i]-.25)/.75);
    const headDx=(x-h.x)*.105*headWeight;
    const torsoDx=(x-t.x)*.115*torsoWeight;
    for(const [j,dx] of [[0,headDx],[1,torsoDx]]){
      targets[j].push(dx,0,0);
      if(Math.abs(dx)>1e-7){modified[j]++;absoluteMax[j]=Math.max(absoluteMax[j],Math.abs(dx));}
    }
  }
  if(modified.some(n=>n<100)||absoluteMax.some(n=>n<.001||n>.06))
    throw new Error('Morph regions failed geometry bounds: '+JSON.stringify({modified,absoluteMax}));
  let bytes=original.bin.length;
  const chunks=[original.bin];
  const ids=[];
  for(const values of targets){
    const pad=(4-bytes%4)%4;if(pad){chunks.push(Buffer.alloc(pad));bytes+=pad;}
    const buf=floatBuffer(values);
    const view=g.bufferViews.length;
    g.bufferViews.push({buffer:0,byteOffset:bytes,byteLength:buf.length,target:34962});
    chunks.push(buf);bytes+=buf.length;
    const id=g.accessors.length;
    const max=Math.max(...values.filter((_,i)=>i%3===0));
    const min=Math.min(...values.filter((_,i)=>i%3===0));
    g.accessors.push({bufferView:view,componentType:5126,type:'VEC3',count,
      min:[min,0,0],max:[max,0,0]});
    ids.push(id);
  }
  const pad=(4-bytes%4)%4;if(pad){chunks.push(Buffer.alloc(pad));bytes+=pad;}
  const bin=Buffer.concat(chunks,bytes);g.buffers[0].byteLength=bytes;
  p.targets=ids.map(id=>({POSITION:id}));
  g.meshes[0].weights=[0,0];
  g.meshes[0].extras={...(g.meshes[0].extras||{}),targetNames:[...CAS_022_MORPHS]};
  g.asset.generator='LifeSim CAS-02.2-A exact-source morph study';
  g.extras={...(g.extras||{}),cas022:{
    stage:'CAS-02.2-A',resident:kind,sourceSha256:original.sourceSha256,
    sourceBindSha256:audited.bindSha256,sourceTriangles:audited.triangles,
    sourceClips:audited.clipNames,targets:CAS_022_MORPHS,
    vertexCounts:modified,maxVertexDisplacementMeters:absoluteMax,
    sourceHasMorphs:false,productionReady:false,wardrobeApproved:false,
    meaning:'Experimental head width / baked upper-body silhouette, NOT independently adjustable face features or true undressed body types'
  }};
  const buffer=emitGlb(g,bin);
  return {buffer,json:g,metadata:{
    ...g.extras.cas022,asset:'assets/characters/cas-02-2-'+kind+'-morphs.glb',
    sha256:digest(buffer),bytes:buffer.length,sourceBytes:source.length,
    originalAnimations:audited.clipNames.length,skins:audited.skinCount,
    joints:audited.joints,morphTargets:ids.length,sourceMeshCount:audited.meshCount,
    licenseNotes:'Derived solely from already shipped resident source; no third-party source added',
    physicalIphoneQAPassed:false,gameRuntimeChanged:false,saveSchemaChanged:false
  }};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  mkdirSync('assets/characters',{recursive:true});
  for(const kind of ['alex','mira']){
    const {buffer,metadata}=buildCas022Morphs(kind);
    writeFileSync(metadata.asset,buffer);
    writeFileSync(metadata.asset.replace(/\\.glb$/,'.json'),JSON.stringify(metadata,null,2)+'\n');
    console.log('CAS-02.2-A SOURCE MORPHS '+JSON.stringify(metadata));
  }
}
