#!/usr/bin/env node
/**
 * CAS-HEAD-V2-P1 fail-closed inspection of REAL Blender-exported derivative heads.
 * This does not generate/approve art. Usage:
 * node art-review/cas-head-v2/verify-derived-heads.mjs PATH_ALEX.glb PATH_MIRA.glb
 *
 * Originals are read only and checked by full SHA-256.
 * Tests may import auditHeadGLB with synthetic source/candidate buffers.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const PIN=JSON.parse(readFileSync(resolve(ROOT,'art-review/cas-head-v2/MPFB-DONOR-PIN.json'),'utf8'));
const SOURCE={
  alex:'assets/characters/meshy-casual-v1.glb',
  mira:'assets/characters/meshy-mira-mobile-v1.glb'
};
const CHANNELS=['eyes','nose','lips','chin','cheeks'];
const TYPE_SIZES={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
const BYTE_SIZES={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};

export function sha256(buffer){return createHash('sha256').update(buffer).digest('hex');}

export function unpackGLB(data){
  assert.ok(Buffer.isBuffer(data),'GLB must be binary Buffer');
  assert.ok(data.length>=20 && data.toString('utf8',0,4)==='glTF','Invalid GLB header');
  assert.equal(data.readUInt32LE(4),2,'Only glTF 2.0');
  assert.equal(data.readUInt32LE(8),data.length,'GLB length mismatch');
  let offset=12,json=null,bin=null;
  while(offset<data.length){
    assert.ok(offset+8<=data.length,'Truncated chunk header');
    const bytes=data.readUInt32LE(offset),type=data.readUInt32LE(offset+4);
    offset+=8;
    assert.ok(bytes%4===0 && offset+bytes<=data.length,'Bad GLB chunk length');
    if(type===0x4e4f534a){
      assert.equal(json,null,'Duplicate JSON chunk');
      json=JSON.parse(data.subarray(offset,offset+bytes).toString('utf8').trimEnd());
    }else if(type===0x004e4942){
      assert.equal(bin,null,'Duplicate BIN chunk');
      bin=data.subarray(offset,offset+bytes);
    }
    offset+=bytes;
  }
  assert.ok(json&&bin,'GLB JSON/BIN required');
  assert.equal(json.asset?.version,'2.0');
  return {json,bin};
}

function componentValue(view,index,type){
  switch(type){
    case 5120:return view.getInt8(index);
    case 5121:return view.getUint8(index);
    case 5122:return view.getInt16(index,true);
    case 5123:return view.getUint16(index,true);
    case 5125:return view.getUint32(index,true);
    case 5126:return view.getFloat32(index,true);
    default:throw Error('Unsupported accessor component type '+type);
  }
}

export function accessor(glb,index){
  const {json,bin}=glb;
  const a=json.accessors?.[index];
  assert.ok(a,'Missing glTF accessor '+index);
  assert.ok(!a.sparse,'Sparse accessor requires explicit Blender pre-expansion');
  assert.ok(Number.isInteger(a.count)&&a.count>0,'Invalid accessor count');
  const n=TYPE_SIZES[a.type],b=BYTE_SIZES[a.componentType];
  assert.ok(n&&b,'Unsupported accessor encoding');
  const bufferView=json.bufferViews?.[a.bufferView];
  assert.ok(bufferView && bufferView.buffer===0,'Embedded BIN accessor required');
  const stride=bufferView.byteStride??n*b,rel=a.byteOffset??0;
  assert.ok(stride>=n*b&&stride%b===0,'Invalid byteStride');
  const start=(bufferView.byteOffset??0)+rel;
  assert.ok(start>=0&&start+(a.count-1)*stride+n*b<=bin.byteLength,'Accessor out of range');
  assert.ok(rel+(a.count-1)*stride+n*b<=bufferView.byteLength,'Accessor exceeds bufferView');
  const v=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
  const rows=[];
  for(let i=0;i<a.count;i++){
    const row=[];
    for(let j=0;j<n;j++){
      const value=componentValue(v,start+i*stride+j*b,a.componentType);
      assert.ok(Number.isFinite(value),'Non-finite accessor value');
      row.push(value);
    }
    rows.push(row);
  }
  return rows;
}

function embeddedImageBytes(glb,index){
  const {json,bin}=glb,image=json.images?.[index];
  assert.ok(image,'Missing texture image');
  if(image.bufferView!==undefined){
    const v=json.bufferViews?.[image.bufferView];
    assert.ok(v && v.buffer===0,'Non-BIN image');
    const start=v.byteOffset??0;
    assert.ok(start>=0 && start+v.byteLength<=bin.length,'Image out of bounds');
    return bin.subarray(start,start+v.byteLength);
  }
  if(image.uri?.startsWith('data:')){
    const sep=image.uri.indexOf(',');
    assert.ok(sep>=0 && image.uri.slice(0,sep).includes(';base64'),'Unsupported image data URI');
    return Buffer.from(image.uri.slice(sep+1),'base64');
  }
  throw Error('Head skin texture must be embedded; external URI not allowed');
}
function originalEmbeddedImages(original){
  const out=new Set();
  for(let i=0;i<(original.json.images?.length??0);i++){
    try{out.add(sha256(embeddedImageBytes(original,i)));}catch{}
  }
  return out;
}
function hierarchySignature(gltf,skin){
  const parents=new Map();
  for(const [parent,n] of (gltf.nodes??[]).entries()){
    for(const child of n.children??[]){
      assert.ok(!parents.has(child),'Joint has multiple parents');
      parents.set(child,parent);
    }
  }
  const jointIndex=new Map(skin.joints.map((j,i)=>[j,i]));
  return skin.joints.map(j=>{
    const name=gltf.nodes?.[j]?.name;
    assert.ok(name,'Missing bone name');
    let p=parents.get(j),internal=-1;
    while(p!==undefined){
      if(jointIndex.has(p)){internal=jointIndex.get(p);break;}
      p=parents.get(p);
    }
    return [name,internal];
  });
}
function sourceSignatures(original){
  assert.ok((original.json.skins?.length??0)>=1,'Source skin absent');
  const candidate=original.json.skins.find(s=>s.joints.length===66);
  assert.ok(candidate,'Source does not contain expected 66-joint rig');
  const names=(original.json.animations??[]).map(a=>a.name);
  assert.ok(names.every(x=>typeof x==='string'&&x.length),'Source clips missing names');
  return {joints:hierarchySignature(original.json,candidate),clips:names.sort()};
}
function targetChannels(mesh){
  const names=mesh.extras?.targetNames;
  assert.ok(Array.isArray(names),'Blender exported targetNames required');
  return names;
}

export function auditHeadGLB(candidateBuffer,sourceBuffer,family,opts={}){
  assert.ok(family==='alex'||family==='mira','Unknown family');
  const original=unpackGLB(sourceBuffer),derived=unpackGLB(candidateBuffer);
  const source=sourceSignatures(original);
  const requiredClips=family==='alex'?10:13;
  assert.equal(source.clips.length,requiredClips,'Source clip baseline mismatch');
  assert.deepEqual((derived.json.animations??[]).map(a=>a.name).sort(),source.clips,
    'Derivative must retain all original animation clip names');
  assert.ok((derived.json.images??[]).length>0,'New head must be textured');
  assert.notEqual(sha256(candidateBuffer),sha256(sourceBuffer),'Derivative must not be source clone');
  assert.notEqual(derived.json.extras?.productionReady,true,'Art gate cannot be self-certified');
  const candidates=[];
  for(const [nodeIndex,node] of (derived.json.nodes??[]).entries()){
    const mesh=derived.json.meshes?.[node.mesh];
    if(mesh?.extras?.lifeSimRole!=='derivative-head')continue;
    assert.ok(Number.isInteger(node.skin),'New head mesh is not skinned');
    const skin=derived.json.skins?.[node.skin];
    assert.ok(skin,'New head skin missing');
    assert.deepEqual(hierarchySignature(derived.json,skin),source.joints,
      'Original joint order/names/parent chains changed');
    candidates.push({node,nodeIndex,mesh});
  }
  assert.equal(candidates.length,1,'Exactly one tagged skinned derivative-head object is required');
  const {mesh}=candidates[0],names=targetChannels(mesh);
  assert.equal(new Set(names).size,names.length,'Duplicate morph target names');
  for(const channel of CHANNELS)assert.ok(names.includes(channel),'Missing real face morph '+channel);
  const textureHashes=originalEmbeddedImages(original);
  const targetChecks={};
  const morphSets={};
  let facePrimitives=0,triangleCount=0;
  for(const p of mesh.primitives??[]){
    if(p.mode!==undefined)assert.equal(p.mode,4,'Head must contain triangles');
    const pos=accessor(derived,p.attributes?.POSITION);
    assert.ok(pos.length>=(opts.minVertices??500),'Too little head topology to review');
    const normals=accessor(derived,p.attributes?.NORMAL);
    const uv=accessor(derived,p.attributes?.TEXCOORD_0);
    const joints=accessor(derived,p.attributes?.JOINTS_0);
    const weights=accessor(derived,p.attributes?.WEIGHTS_0);
    assert.ok([normals,uv,joints,weights].every(a=>a.length===pos.length),
      'POSITION/NORMAL/UV/skin vertex counts differ');
    assert.ok(weights.every(row=>Math.abs(row.reduce((a,b)=>a+b,0)-1)<.025),
      'Head skin weights must normalize to one');
    const mat=derived.json.materials?.[p.material];
    assert.ok(mat?.name?.startsWith('CAS_HEAD_SKIN_'),'Head skin material must be independently named');
    const tex=derived.json.textures?.[mat.pbrMetallicRoughness?.baseColorTexture?.index];
    assert.ok(tex&&tex.source!==undefined,'Head skin needs its own baked baseColor texture');
    const newTexture=embeddedImageBytes(derived,tex.source);
    assert.ok(newTexture.length>1024,'No meaningful skin texture bytes');
    assert.ok(!textureHashes.has(sha256(newTexture)),
      'Original combined source face+hair+clothes atlas reused');
    const tris=p.indices===undefined?Math.floor(pos.length/3):accessor(derived,p.indices).length/3;
    assert.ok(Number.isInteger(tris),'Triangle accessor malformed');
    triangleCount+=tris;facePrimitives++;
    assert.equal(p.targets?.length,names.length,'Morph mapping does not match targetNames');
    for(const channel of CHANNELS){
      const k=names.indexOf(channel),index=p.targets[k]?.POSITION;
      assert.ok(Number.isInteger(index),'No POSITION accessor for morph '+channel);
      const delta=accessor(derived,index);
      assert.equal(delta.length,pos.length,'Morph count differs from Basis');
      const affected=new Set();
      let maximum=0;
      for(let i=0;i<delta.length;i++){
        const mag=Math.hypot(...delta[i]);
        if(mag>1e-5){affected.add(i);maximum=Math.max(maximum,mag);}
      }
      assert.ok(affected.size>=(opts.minAffected??20),'Morph '+channel+' is functionally empty');
      assert.ok(maximum>0.001&&maximum<0.2,'Morph '+channel+' displacement is suspect');
      targetChecks[channel]={changedVertices:affected.size,maxDeltaMetres:maximum};
      morphSets[channel]=affected;
    }
  }
  assert.ok(facePrimitives>0,'No skinned head primitive');
  for(let i=0;i<CHANNELS.length;i++){
    for(let j=i+1;j<CHANNELS.length;j++){
      const a=morphSets[CHANNELS[i]],b=morphSets[CHANNELS[j]];
      let overlap=0;for(const x of a)if(b.has(x))overlap++;
      const score=overlap/(a.size+b.size-overlap);
      assert.ok(score<.96,'Two morph channels share practically identical vertex regions');
    }
  }
  return {
    schema:'lifesim.cas-head-v2-p1.structural-art-gate.v1',
    family,sourceSha256:sha256(sourceBuffer),
    derivativeSha256:sha256(candidateBuffer),
    sourceJointCount:66,sourceClipCount:requiredClips,
    skinnedHead:true,independentSkinTexture:true,
    triangleCount,morphTargets:targetChecks,
    geometryAndRigInspection:'PASS',
    semanticLoopsArtistVerified:false,
    neckSeamPoseVerified:false,
    uvAndFaceArtApproved:false,
    playcanvasWebGLVerified:false,
    iphoneSafariVerified:false,
    ownerArtApproved:false,
    productionReady:false
  };
}

export function verifyFiles(files){
  assert.equal(files.length,2,'Specify TWO actual Blender-exported derivative GLBs (Alex, Mira)');
  const receipts=[];
  for(const [i,family] of ['alex','mira'].entries()){
    const source=readFileSync(resolve(ROOT,SOURCE[family]));
    assert.equal(sha256(source),PIN.originalHeroGLBSha256[family],
      'Immutable original hash changed: '+family);
    receipts.push(auditHeadGLB(readFileSync(resolve(files[i])),source,family));
  }
  return receipts;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const receipts=verifyFiles(process.argv.slice(2));
    console.log(JSON.stringify(receipts,null,2));
  }catch(e){
    console.error('CAS_HEAD_V2_P1_REJECTED: '+e.message);
    process.exitCode=1;
  }
}
