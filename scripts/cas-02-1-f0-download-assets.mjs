/** CAS-02.1-F0. Third-party CC0 footwear: download, fail closed, inspect actual GLB.
 * No external model becomes game content or runs in the production resident renderer.
 * First PR run discovers exact SHA-256; pin before promotion to main.
 */
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export const CC0_SHOE_CANDIDATES=Object.freeze([
  {id:'dress',label:'Кожаные туфли',slug:'shoe',file:'shoe.glb',
   page:'https://grab3d.com/models/props/shoe/',expectedTriangles:19744},
  {id:'sneakers',label:'Повседневные кеды',slug:'sneaker',file:'sneaker.glb',
   page:'https://grab3d.com/models/props/sneaker/',expectedTriangles:19838},
  {id:'boots',label:'Туристические ботинки',slug:'hiking-boots',file:'hiking-boots.glb',
   page:'https://grab3d.com/models/props/hiking-boots/',expectedTriangles:20008}
]);
export const ASSET_DIR='assets/characters/cas-cc0-f0';
export const ASSET_SHA256=Object.freeze({
  dress:null,sneakers:null,boots:null // pinned before main release after exact real CI audit
});
const PREFIX='https://grab3d.com/dl/';
function sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}
export function inspectCandidateGlb(input,entry){
  if(!Buffer.isBuffer(input)||input.length<32||input.length>14_000_000)
    throw Error(entry.id+': unsupported external GLB length');
  if(input.readUInt32LE(0)!==0x46546c67||input.readUInt32LE(4)!==2||
    input.readUInt32LE(8)!==input.length||
    input.readUInt32LE(16)!==0x4e4f534a)throw Error(entry.id+': invalid GLB 2.0 header');
  const jsonLength=input.readUInt32LE(12),binHeader=20+jsonLength;
  if(binHeader+8>input.length)throw Error(entry.id+': invalid GLB chunk boundary');
  const json=JSON.parse(input.subarray(20,binHeader).toString('utf8'));
  if(json.asset?.version!=='2.0'||!Array.isArray(json.meshes)||!json.meshes.length)
    throw Error(entry.id+': invalid glTF asset/meshes');
  let triangles=0;
  const attributes=new Set();
  for(const mesh of json.meshes)for(const primitive of mesh.primitives||[]){
    if((primitive.mode??4)!==4)continue;
    const count=json.accessors?.[primitive.indices??primitive.attributes?.POSITION]?.count;
    if(!Number.isInteger(count)||count<3||count%3!==0)throw Error(entry.id+': non-triangle primitive');
    triangles+=count/3;
    for(const a of Object.keys(primitive.attributes||{}))attributes.add(a);
  }
  if(triangles<3000||triangles>120000||!attributes.has('POSITION'))
    throw Error(entry.id+': invalid triangles/vertex attributes');
  const extensionNames=[...(json.extensionsRequired||[])];
  if(extensionNames.some(name=>!['KHR_materials_unlit','KHR_texture_transform'].includes(name)))
    throw Error(entry.id+': unsupported required GLB extension '+extensionNames.join(','));
  const bounds=(json.accessors||[]).filter(a=>a.type==='VEC3'&&a.min?.length===3&&a.max?.length===3)
    .map(a=>({min:a.min,max:a.max})).filter(b=>[...b.min,...b.max].every(Number.isFinite));
  return {id:entry.id,sha256:sha256(input),bytes:input.length,triangles,
    expectedTriangles:entry.expectedTriangles,triangleDifference:triangles-entry.expectedTriangles,
    gltfVersion:json.asset.version,sceneCount:json.scenes?.length||0,
    meshes:json.meshes.length,materials:json.materials?.length||0,
    textures:json.textures?.length||0,images:json.images?.length||0,
    skins:json.skins?.length||0,animations:json.animations?.length||0,
    extensionsRequired:extensionNames,attributes:[...attributes].sort(),
    boundingAccessors:bounds.slice(0,12),
    nodeNames:(json.nodes||[]).map(n=>n.name||'').filter(Boolean).slice(0,35)};
}
async function getExternal(url,kind,{maxBytes=14_000_000}={}){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),30000);
 try {
   const res=await fetch(url,{signal:ctrl.signal,redirect:'follow',
    headers:{'User-Agent':'LifeSim-CAS-CC0-license-audit/1.0'}});
   const finalUrl=new URL(res.url);
   if(finalUrl.protocol!=='https:'||finalUrl.hostname!=='grab3d.com')
     throw Error('External redirect left trusted license source '+url+' -> '+res.url);
   if(!res.ok)throw Error('HTTP '+res.status+' '+url);
   const declared=Number(res.headers.get('content-length')||0);
   if(declared>maxBytes)throw Error('Oversized remote candidate '+url);
   const bytes=Buffer.from(await res.arrayBuffer());
   if(bytes.length>maxBytes)throw Error('Oversized fetched candidate '+url);
   if(kind==='text')return bytes.toString('utf8');
   return bytes;
 }finally{clearTimeout(timer)}
}
function licenseChecked(license,manifest,entry){
 if(!/CC0|Creative Commons Zero|Public Domain/i.test(license))
   throw Error('No CC0 proof in '+entry.slug+' package LICENSE');
 if(!/CC0|public.domain/i.test(JSON.stringify(manifest)))
   throw Error('No CC0 proof in '+entry.slug+' manifest');
 const cited=JSON.stringify(manifest);
 if(!cited.includes(entry.file))
   throw Error('License manifest does not identify source model '+entry.file);
 return true;
}
export async function downloadAndAuditCandidates(){
 mkdirSync(ASSET_DIR,{recursive:true});
 const results=[];
 for(const entry of CC0_SHOE_CANDIDATES){
  const remote=PREFIX+entry.slug+'/';
  const [bytes,license,licenseManifest]=await Promise.all([
    getExternal(remote+entry.file,'bin'),
    getExternal(remote+'LICENSE.txt','text',{maxBytes:300000}),
    getExternal(remote+'manifest.json','text',{maxBytes:300000})
  ]);
  const manifest=JSON.parse(licenseManifest);
  licenseChecked(license,manifest,entry);
  const info=inspectCandidateGlb(bytes,entry);
  if(ASSET_SHA256[entry.id] && ASSET_SHA256[entry.id]!==info.sha256)
    throw Error(entry.id+': external source changed; no silent republish');
  const base=ASSET_DIR+'/'+entry.id;
  writeFileSync(base+'.glb',bytes);
  writeFileSync(base+'.license.txt',license);
  writeFileSync(base+'.origin.json',JSON.stringify(manifest,null,2)+'\n');
  const safeInfo={...info,license:'CC0-1.0',licenseSource:remote+'LICENSE.txt',
    originSource:remote+'manifest.json',modelSource:remote+entry.file,
    sourcePage:entry.page,originalFile:entry.file,
    productionReady:false,fitConfirmed:false,rightsOwnerVerified:false,
    requiresOptimization:true,requiresTwoFootRetarget:true};
  writeFileSync(base+'.audit.json',JSON.stringify(safeInfo,null,2)+'\n');
  results.push(safeInfo);
  console.log('CAS-02.1-F0 REAL CC0 GLB AUDIT '+JSON.stringify(safeInfo));
 }
 writeFileSync(ASSET_DIR+'/index.json',JSON.stringify(results,null,2)+'\n');
 return results;
}
if(process.argv[1]===fileURLToPath(import.meta.url))
 await downloadAndAuditCandidates();
