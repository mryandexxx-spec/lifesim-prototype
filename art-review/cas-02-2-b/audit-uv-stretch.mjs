/**
 * CAS-02.2-B G0/G1 UV distortion audit of source-derived *preview-only* morphs.
 * No dependency on Blender, WebGL, new textures, generation services, or game state.
 * Tests why true POSITION morph targets may still stretch an unchanged baked atlas.
 */
import {createHash} from 'node:crypto';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deriveSourceGLB, TARGETS} from './build-source-identities.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const SOURCE={
 alex:{file:'meshy-casual-v1.glb',sha:'7014401e6819b8b047fe384cfce4a62549711aa711d26a6894571800a40eb5f4'},
 mira:{file:'meshy-mira-mobile-v1.glb',sha:'40a2d1e0dcde53f7c2f53c6bd220f39ba440bbf4d42dfbad949ca82146594d0a'}
};
export const STRETCH_P95_MAX=1.20; // mechanical QA budget, NOT art approval
const hash=b=>createHash('sha256').update(b).digest('hex');
const q=(values,p)=>{
 if(!values.length)return 0;
 values.sort((a,b)=>a-b);
 const index=(values.length-1)*p,lo=Math.floor(index),t=index-lo;
 return values[lo]+t*(values[Math.min(values.length-1,lo+1)]-values[lo]);
};
const round=x=>Math.round(x*10000)/10000;
function glb(buf){
 if(buf.readUInt32LE(0)!==0x46546c67||buf.readUInt32LE(4)!==2||
  buf.readUInt32LE(8)!==buf.length)throw Error('Invalid glTF 2.0 container');
 const j=buf.readUInt32LE(12);if(buf.readUInt32LE(16)!==0x4e4f534a)throw Error('Missing JSON chunk');
 const offset=20+j;if(buf.readUInt32LE(offset+4)!==0x004e4942)throw Error('Missing BIN chunk');
 const g=JSON.parse(buf.toString('utf8',20,20+j));
 const bin=buf.subarray(offset+8,offset+8+buf.readUInt32LE(offset));
 return{g,bin};
}
function accessor({g,bin},i){
 const a=g.accessors[i],v=g.bufferViews[a?.bufferView];
 const c={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a?.type];
 const len={5121:1,5123:2,5125:4,5126:4}[a?.componentType];
 if(!v||!c||!len||a.sparse)throw Error('Unsupported accessor '+i);
 const method={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType];
 const off=(a.byteOffset||0)+(v.byteOffset||0),stride=v.byteStride||c*len;
 if(off+(a.count-1)*stride+c*len>bin.length)throw Error('Accessor outside GLB');
 const out=new Float64Array(a.count*c);
 for(let n=0;n<a.count;n++)for(let k=0;k<c;k++)
  out[n*c+k]=bin[method](off+n*stride+k*len);
 return out;
}
function areaAt(positions,i,j,k,delta){
 const ax=positions[3*i]+(delta?.[3*i]||0), ay=positions[3*i+1]+(delta?.[3*i+1]||0), az=positions[3*i+2]+(delta?.[3*i+2]||0);
 const ux=positions[3*j]+(delta?.[3*j]||0)-ax, uy=positions[3*j+1]+(delta?.[3*j+1]||0)-ay,uz=positions[3*j+2]+(delta?.[3*j+2]||0)-az;
 const vx=positions[3*k]+(delta?.[3*k]||0)-ax, vy=positions[3*k+1]+(delta?.[3*k+1]||0)-ay,vz=positions[3*k+2]+(delta?.[3*k+2]||0)-az;
 return Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)*.5;
}
function embeddedImagesHash(parsed){
 return parsed.g.images.map(image=>{
  const v=parsed.g.bufferViews[image.bufferView];
  if(!v)throw Error('Source embedded image required');
  return hash(parsed.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength));
 });
}
export function audit(kind,originalBytes,derivedBytes){
 const ref=SOURCE[kind];if(!ref)throw Error('Unknown source');
 if(hash(originalBytes)!==ref.sha)throw Error('Unverified original source SHA');
 const orig=glb(originalBytes),der=glb(derivedBytes);
 const a=orig.g.meshes?.[0]?.primitives?.[0],b=der.g.meshes?.[0]?.primitives?.[0];
 if(!a||!b||b.targets?.length!==TARGETS.length)throw Error('Missing derivative targets');
 if(JSON.stringify(a.attributes)!==JSON.stringify(b.attributes)||
  JSON.stringify(orig.g.images)!==JSON.stringify(der.g.images)||
  JSON.stringify(orig.g.skins)!==JSON.stringify(der.g.skins)||
  JSON.stringify(orig.g.animations)!==JSON.stringify(der.g.animations))
  throw Error('Changed original UV, material, skin or animation data');
 const pos=accessor(orig,a.attributes.POSITION),nor=accessor(orig,a.attributes.NORMAL),
  uv=accessor(orig,a.attributes.TEXCOORD_0),j=accessor(orig,a.attributes.JOINTS_0),
  w=accessor(orig,a.attributes.WEIGHTS_0),indices=accessor(orig,a.indices);
 const count=pos.length/3;
 if(nor.length!==pos.length||uv.length!==count*2||j.length!==count*4||w.length!==j.length)
  throw Error('Original attribute cardinalities do not match');
 const names=orig.g.skins[0].joints.map(id=>orig.g.nodes[id]?.name);
 const head=names.indexOf('mixamorig:Head');
 if(head<0||names.length!==66)throw Error('Unknown source rig');
 const allowed=new Uint8Array(count);
 const faceUV=new Set();
 let nface=0;
 for(let i=0;i<count;i++){
  let influence=0;for(let k=0;k<4;k++)if(j[i*4+k]===head)influence+=w[i*4+k];
  const y=pos[i*3+1],z=pos[i*3+2];
  if(influence>.75&&nor[i*3+2]>.20&&z>.015&&y>1.43&&y<1.68){
   allowed[i]=1;nface++;
   faceUV.add(Math.min(15,Math.max(0,Math.floor(uv[2*i]*16)))+16*Math.min(15,Math.max(0,Math.floor(uv[2*i+1]*16))));
  }
 }
 const triangles=[];
 for(let i=0;i<indices.length;i+=3){
  const tri=[indices[i],indices[i+1],indices[i+2]];
  if(tri.some(n=>!Number.isSafeInteger(n)||n<0||n>=count))throw Error('Invalid face index');
  if(tri.every(n=>allowed[n]))triangles.push([...tri,areaAt(pos,...tri)]);
 }
 const imageHashes=embeddedImagesHash(orig),unchanged=JSON.stringify(imageHashes)===JSON.stringify(embeddedImagesHash(der));
 const metrics=TARGETS.map((name,t)=>{
  const da=accessor(der,b.targets[t].POSITION);
  if(da.length!==pos.length||!da.every(Number.isFinite))throw Error('Invalid POSITION morph '+name);
  const changed=new Uint8Array(count);let vertices=0,maxDelta=0;
  for(let i=0;i<count;i++){
   const d=Math.hypot(da[i*3],da[i*3+1],da[i*3+2]);
   if(d>.0001){vertices++;changed[i]=1}
   if(d>maxDelta)maxDelta=d;
  }
  const stretch=[];
  for(const [i,j,k,base] of triangles){
   if(!changed[i]&&!changed[j]&&!changed[k])continue;
   const next=areaAt(pos,i,j,k,da);
   if(base>1e-10&&next>1e-10)stretch.push(Math.max(base/next,next/base));
  }
  return{name,changedVertices:vertices,maxDeltaMeters:round(maxDelta),
   affectedFaceTriangles:stretch.length,
   areaStretchP50:round(q(stretch,.50)),areaStretchP95:round(q(stretch,.95)),
   areaStretchP99:round(q(stretch,.99)),
   faceTrianglesAbove20pct:stretch.filter(x=>x>1.20).length,
   uvUnchanged:unchanged,
   atlasCorrected:false,artistSculptApproved:false};
 });
 if(nface<1000||triangles.length<1500)throw Error('Face topology segmentation failed');
 const failures=metrics.filter(m=>m.name!=='body'&&m.areaStretchP95>STRETCH_P95_MAX)
  .map(m=>m.name+':'+m.areaStretchP95);
 const report={kind,sourceSha256:ref.sha,derivativeSha256:hash(derivedBytes),
  vertices:count,facialVertices:nface,facialTriangles:triangles.length,
  uvAtlas16x16FaceBins:faceUV.size,originalTextureHashes:imageHashes,originalAtlasUnchanged:unchanged,
  morphTargets:metrics,morphAreaStretchFailures:failures,
  textureCorrectionAvailable:false,ownerArtApproved:false,productionReady:false,
  artBlockers:['Baked source atlas unchanged; actual face-identity skin/eyeball/hair texture corrections missing',
  ...failures.map(x=>'Facial triangle area distortion exceeds '+STRETCH_P95_MAX+': '+x),
  'Anatomical sculpted differences and independent hairstyle/body garment layers not art approved']};
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const outputs=[];
 for(const [kind,ref]of Object.entries(SOURCE)){
  const original=readFileSync(resolve(ROOT,'assets/characters',ref.file));
  const derivative=deriveSourceGLB(kind,original).buffer;
  outputs.push(audit(kind,original,derivative));
 }
 if(process.argv.includes('--export')){
  const output=resolve(ROOT,'art-review/cas-02-2-b/source-uv-audit.json');
  mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(outputs,null,2)+'\n');
  console.log('CAS_R3_UV_AUDIT_FILE',output);
 }
 for(const r of outputs)console.log('CAS_R3_UV_STRETCH '+JSON.stringify(r));
 if(outputs.some(x=>x.productionReady||x.morphAreaStretchFailures.length===0))
  throw Error('Unexpectedly passed art-blocking stretch regression');
}

