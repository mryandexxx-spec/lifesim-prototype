/** QSK-04 read-only GLB/texture passport, PlayCanvas asset provenance and bounded budgets.
 * No runtime imports, no license inference, no writes to source assets, no side effects on saves.
 */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const SHA_RE=/^[0-9a-f]{64}$/;
const SIZE={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
const COMPONENT={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
export const sha256=data=>createHash('sha256').update(data).digest('hex');
const validPath=p=>typeof p==='string'&&/^(?:assets\/characters\/|assets\/furniture\/)[a-zA-Z0-9._/-]+\.glb$/.test(p)&&!p.split('/').includes('..');
const invariant=(test,message)=>{if(!test)throw Error(message);};

export function decodeGlb(buffer){
  invariant(Buffer.isBuffer(buffer)&&buffer.length>=28,'GLB: truncated');
  invariant(buffer.readUInt32LE(0)===0x46546c67&&buffer.readUInt32LE(4)===2,'GLB: unsupported header/version');
  invariant(buffer.readUInt32LE(8)===buffer.length,'GLB: byte length mismatch');
  let offset=12,gltf=null,bin=null;
  while(offset<buffer.length){
    invariant(offset+8<=buffer.length,'GLB: truncated chunk header');
    const n=buffer.readUInt32LE(offset),type=buffer.readUInt32LE(offset+4);
    invariant(n%4===0&&offset+8+n<=buffer.length,'GLB: invalid chunk bounds');
    const data=buffer.subarray(offset+8,offset+8+n);
    if(type===0x4e4f534a){invariant(gltf===null&&offset===12,'GLB: JSON chunk order');gltf=JSON.parse(data.toString('utf8'));}
    if(type===0x004e4942){invariant(gltf!==null&&bin===null,'GLB: invalid BIN chunk');bin=data;}
    offset+=8+n;
  }
  invariant(gltf?.asset?.version==='2.0'&&Array.isArray(gltf.meshes)&&gltf.meshes.length>0,'GLB: invalid glTF asset');
  invariant(Array.isArray(gltf.buffers)&&gltf.buffers.length===1&&bin,'GLB: external or absent BIN not supported');
  invariant(Number.isInteger(gltf.buffers[0].byteLength)&&gltf.buffers[0].byteLength<=bin.length&&bin.length-gltf.buffers[0].byteLength<4,'GLB: BIN size differs');
  return {gltf,bin};
}

function accessor(g,id,binLength){
  const a=g.accessors?.[id];invariant(a&&!a.sparse,'GLB: missing/sparse accessor '+id);
  const n=SIZE[a.type],size=COMPONENT[a.componentType];
  invariant(n&&size&&Number.isSafeInteger(a.count)&&a.count>=0,'GLB: unsupported accessor '+id);
  const view=g.bufferViews?.[a.bufferView];
  invariant(view&&view.buffer===0&&Number.isSafeInteger(view.byteLength)&&view.byteLength>=0,'GLB: invalid view '+id);
  const offset=(a.byteOffset??0),viewStart=(view.byteOffset??0),stride=(view.byteStride??n*size);
  invariant(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(viewStart)&&viewStart>=0&&Number.isSafeInteger(stride)&&stride>=n*size,'GLB: invalid accessor offsets '+id);
  const end=offset+(a.count===0?0:(a.count-1)*stride+n*size);
  invariant(end<=view.byteLength&&viewStart+view.byteLength<=binLength,'GLB: accessor outside BIN '+id);
  if(a.min||a.max)invariant(Array.isArray(a.min)&&Array.isArray(a.max)&&a.min.length===n&&a.max.length===n&&
    [...a.min,...a.max].every(Number.isFinite)&&a.min.every((v,i)=>v<=a.max[i]),'GLB: invalid accessor bounds '+id);
  return a;
}

function jpegSize(data){
  invariant(data.length>=4&&data[0]===0xff&&data[1]===0xd8,'GLB: invalid JPEG');
  for(let pos=2;pos+4<=data.length;){
    if(data[pos]!==0xff){pos++;continue;}
    const marker=data[pos+1];pos+=2;
    if(marker===0xd8||marker===0xd9||marker===0x01||marker>=0xd0&&marker<=0xd7)continue;
    if(marker===0xda)break;
    invariant(pos+2<=data.length,'GLB: JPEG truncated marker');
    const length=data.readUInt16BE(pos);
    invariant(length>=2&&pos+length<=data.length,'GLB: JPEG truncated segment');
    if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
      invariant(length>=7,'GLB: invalid JPEG SOF');
      return {width:data.readUInt16BE(pos+5),height:data.readUInt16BE(pos+3)};
    }
    pos+=length;
  }
  throw Error('GLB: JPEG dimensions not found');
}
export function imageDimensions(data,mime){
  if(mime==='image/png'){
    invariant(data.length>=24&&data.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))&&data.toString('ascii',12,16)==='IHDR','GLB: invalid PNG');
    return {width:data.readUInt32BE(16),height:data.readUInt32BE(20)};
  }
  if(mime==='image/jpeg')return jpegSize(data);
  throw Error('GLB: unsupported embedded image MIME '+mime);
}

export function inspectGlb(buffer){
  const {gltf:g,bin}=decodeGlb(buffer);
  let triangles=0,vertices=0,uvPrimitives=0,primitiveCount=0,normalPrimitives=0;
  let skinnedPrimitives=0,morphTargets=0;
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const mesh of g.meshes)for(const prim of mesh.primitives??[]){
    invariant((prim.mode??4)===4,'GLB: non-triangle primitive');
    const pos=accessor(g,prim.attributes?.POSITION,bin.length);
    invariant(pos.type==='VEC3'&&pos.componentType===5126,'GLB: POSITION must be float VEC3');
    const count=prim.indices===undefined?pos.count:accessor(g,prim.indices,bin.length).count;
    invariant(count%3===0,'GLB: invalid triangle index count');
    if(prim.indices!==undefined)invariant([5121,5123,5125].includes(g.accessors[prim.indices].componentType),'GLB: invalid index type');
    triangles+=count/3;vertices+=pos.count;primitiveCount++;
    const uv=prim.attributes.TEXCOORD_0;
    if(uv!==undefined){const a=accessor(g,uv,bin.length);invariant(a.count===pos.count&&a.type==='VEC2','GLB: UV vertex count mismatch');uvPrimitives++;}
    if(prim.attributes.NORMAL!==undefined){const a=accessor(g,prim.attributes.NORMAL,bin.length);invariant(a.count===pos.count&&a.type==='VEC3','GLB: normal count mismatch');normalPrimitives++;}
    if(prim.attributes.JOINTS_0!==undefined||prim.attributes.WEIGHTS_0!==undefined){
      invariant(prim.attributes.JOINTS_0!==undefined&&prim.attributes.WEIGHTS_0!==undefined,'GLB: incomplete skin attributes');
      for(const key of ['JOINTS_0','WEIGHTS_0']){
        const a=accessor(g,prim.attributes[key],bin.length);invariant(a.count===pos.count&&a.type==='VEC4','GLB: malformed '+key);
      }
      skinnedPrimitives++;
    }
    for(const target of prim.targets??[]){for(const index of Object.values(target))invariant(accessor(g,index,bin.length).count===pos.count,'GLB: morph accessor mismatch');morphTargets++;}
    if(pos.min&&pos.max)for(let i=0;i<3;i++){min[i]=Math.min(min[i],pos.min[i]);max[i]=Math.max(max[i],pos.max[i]);}
  }
  invariant(triangles>0&&vertices>0,'GLB: no triangles');
  const skins=(g.skins??[]).map(s=>{
    invariant(Array.isArray(s.joints)&&s.joints.length>0&&s.joints.every(j=>Number.isInteger(j)&&j>=0&&j<(g.nodes?.length??0)),'GLB: invalid skeleton joints');
    if(s.inverseBindMatrices!==undefined){const a=accessor(g,s.inverseBindMatrices,bin.length);invariant(a.type==='MAT4'&&a.count===s.joints.length,'GLB: invalid inverse bind matrices');}
    return {joints:s.joints.length,inverseBindPresent:s.inverseBindMatrices!==undefined};
  });
  const images=(g.images??[]).map((im,i)=>{
    invariant(Number.isInteger(im.bufferView)&&im.bufferView>=0,'GLB: external image '+i+' not allowed');
    const view=g.bufferViews?.[im.bufferView];
    invariant(view?.buffer===0&&Number.isSafeInteger(view.byteLength)&&view.byteLength>0,'GLB: invalid image view '+i);
    const start=view.byteOffset??0;
    invariant(start>=0&&start+view.byteLength<=bin.length,'GLB: image view outside BIN '+i);
    const dims=imageDimensions(bin.subarray(start,start+view.byteLength),im.mimeType);
    invariant(dims.width>0&&dims.height>0&&dims.width<=16384&&dims.height<=16384,'GLB: invalid image dimensions');
    return {index:i,mime:im.mimeType,bytes:view.byteLength,...dims};
  });
  return {sha256:sha256(buffer),bytes:buffer.length,triangles,vertices,primitiveCount,uvPrimitives,normalPrimitives,
    skinnedPrimitives,skinCount:skins.length,skins,animationClips:g.animations?.length??0,
    materials:g.materials?.length??0,textures:g.textures?.length??0,images,morphTargets,
    rawLocalBounds:min.every(Number.isFinite)?{min,max,extent:min.map((v,i)=>max[i]-v),center:min.map((v,i)=>(max[i]+v)/2)}:null,
    requiredExtensions:g.extensionsRequired??[],lod:'not-declared-or-verified',pivot:'not-author-verified',
    unitScale:'gltf-metres-assumed; local transforms and final stage placement require visual QA'};
}

export function expandPassport(registry,readText){
  invariant(registry?.schema===1&&Array.isArray(registry.origins)&&Array.isArray(registry.collections),'QSK-04: malformed registry');
  const results=[];
  for(const entry of registry.origins)results.push({...entry});
  for(const collection of registry.collections){
    const data=JSON.parse(readText(collection.manifest));
    const rows=data[collection.array];
    invariant(Array.isArray(rows)&&rows.length>0,'QSK-04: missing source manifest rows '+collection.manifest);
    if(collection.expectedCount!==undefined)invariant(rows.length===collection.expectedCount,'QSK-04: source manifest count drift '+collection.manifest);
    for(const record of rows){
      const file=collection.fileField==='glb'?path.posix.join(collection.base,record.glb):record.file;
      results.push({id:collection.id+':'+(record.sku??record.slug),file,sha256:record.sha256,bytes:record.bytes,
        category:'furniture',status:collection.status,provenance:{source:collection.source,sourceSha256:null,
          license:'unknown-not-cleared',evidence:collection.manifest},
        budget:collection.budget,expected:{triangles:record.triangles??null,skins:0}});
    }
  }
  const seen=new Set();
  for(const e of results){
    invariant(validPath(e.file)&&!seen.has(e.file),'QSK-04: duplicate/unsafe file '+e.file);
    seen.add(e.file);
    invariant(typeof e.id==='string'&&e.id&&SHA_RE.test(e.sha256)&&Number.isSafeInteger(e.bytes)&&e.bytes>28,'QSK-04: missing asset identity '+e.file);
    invariant(e.provenance&&typeof e.provenance.source==='string'&&typeof e.provenance.license==='string'&&typeof e.provenance.evidence==='string','QSK-04: provenance not explicit '+e.file);
    invariant(e.status==='existing-published'||e.status==='staged-not-integrated','QSK-04: unsafe promotion flag '+e.file);
    invariant(e.budget&&Number.isInteger(e.budget.triangles)&&Number.isInteger(e.budget.textureEdge),'QSK-04: missing budget '+e.file);
  }
  return results;
}

export function auditEntry(entry,raw){
  const issues=[],errors=[];const report={id:entry.id,file:entry.file,category:entry.category,status:entry.status,
    provenance:entry.provenance,budget:entry.budget,rightsCleared:entry.provenance.license==='approved-with-evidence',
    readyForNewIntegration:false,provenanceGate:'blocked-until-reviewed',issues,errors};
  if(!report.rightsCleared)issues.push('License/author rights evidence not independently cleared for NEW integration');
  try{
    invariant(raw.length===entry.bytes,'QSK-04: GLB byte length drift '+entry.file);
    invariant(sha256(raw)===entry.sha256,'QSK-04: SHA256 drift '+entry.file);
    const metrics=inspectGlb(raw);report.metrics=metrics;
    if(metrics.triangles>entry.budget.triangles)errors.push('Triangles exceed recorded QA budget');
    if(metrics.images.some(x=>Math.max(x.width,x.height)>entry.budget.textureEdge))errors.push('Texture edge exceeds QA budget');
    if(entry.expected?.triangles!=null&&metrics.triangles!==entry.expected.triangles)errors.push('Triangle count changed from existing manifest');
    if(entry.expected?.skins!=null&&metrics.skinCount!==entry.expected.skins)errors.push('Unexpected skeleton count');
    if(entry.expected?.joints!=null&&metrics.skins[0]?.joints!==entry.expected.joints)errors.push('Canonical skeleton joint count changed');
    if(entry.expected?.clips!=null&&metrics.animationClips!==entry.expected.clips)errors.push('Canonical animation clip count changed');
    if(metrics.uvPrimitives!==metrics.primitiveCount)issues.push('Missing UV on one or more primitives; visual review required');
    if(metrics.normalPrimitives!==metrics.primitiveCount)issues.push('Missing normals on one or more primitives; shading review required');
    if(!metrics.rawLocalBounds)issues.push('Accessor bounds incomplete; pivot/scale cannot be inferred');
    if(metrics.requiredExtensions.length)issues.push('Required extensions need PlayCanvas decoder/Pages compatibility review');
    issues.push('LOD, true world pivot and animation contact are NOT established by metadata; PlayCanvas/human review required');
  }catch(err){errors.push(err.message);}
  return {...report,integrity:errors.length===0?'pass':'fail'};
}

export function runAudit(registry,{root=process.cwd(),writeReport=true}={}){
  const files=expandPassport(registry,file=>readFileSync(path.join(root,file),'utf8'));
  const entries=files.map(file=>auditEntry(file,readFileSync(path.join(root,file.file))));
  const report={stage:'QSK-04',schema:1,gitCommit:process.env.GITHUB_SHA??null,
    scope:'existing shipped binaries and staged v3 only; no CAS-B candidate art or #145 PR binaries',
    statement:'SHA/geometry/texture integrity scan is NOT copyright clearance, LOD approval, original mesh QA or iPhone Safari sign-off',
    assetCount:entries.length,integrityFailures:entries.filter(x=>x.integrity!=='pass').length,
    rightsNotCleared:entries.filter(x=>!x.rightsCleared).length,
    newIntegrationsApproved:0,entries};
  if(writeReport){mkdirSync(path.join(root,'artifacts/qsk-04'),{recursive:true});
    writeFileSync(path.join(root,'artifacts/qsk-04/asset-passport.json'),JSON.stringify(report,null,2)+'\n');}
  if(report.integrityFailures)throw Error('QSK-04 GLB integrity FAIL '+entries.filter(x=>x.integrity==='fail').map(x=>x.file+': '+x.errors.join(',')).join('; '));
  return report;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const registry=JSON.parse(readFileSync(new URL('../docs/qsk-04-asset-registry.json',import.meta.url),'utf8'));
  const report=runAudit(registry);
  console.log('QSK-04 asset integrity PASS '+report.assetCount+'/'+report.assetCount+'; licensing not-cleared '+report.rightsNotCleared+'; release approval '+report.newIntegrationsApproved);
}
