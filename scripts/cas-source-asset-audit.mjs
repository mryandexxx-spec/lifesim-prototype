/** CAS-02.1-D: inspect the REAL shipped Alex and Mira GLBs. Pure Node, no third-party model generation. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const COMPONENTS=Object.freeze({
  5120:{bytes:1,get:'getInt8'},5121:{bytes:1,get:'getUint8'},
  5122:{bytes:2,get:'getInt16'},5123:{bytes:2,get:'getUint16'},
  5125:{bytes:4,get:'getUint32'},5126:{bytes:4,get:'getFloat32'}
});
const SIZES=Object.freeze({SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16});
export const LEGACY_CAS_FILES=Object.freeze({
  alex:'meshy-casual-v1.glb',mira:'meshy-mira-mobile-v1.glb'
});
export function parseLegacyGlb(buffer){
  if(!Buffer.isBuffer(buffer)||buffer.length<28||
    buffer.readUInt32LE(0)!==0x46546c67||buffer.readUInt32LE(4)!==2||
    buffer.readUInt32LE(8)!==buffer.length||buffer.readUInt32LE(16)!==0x4e4f534a)
    throw new Error('Invalid source GLB 2.0');
  const jsonSize=buffer.readUInt32LE(12),binAt=20+jsonSize;
  if(jsonSize<4||binAt+8>buffer.length||buffer.readUInt32LE(binAt+4)!==0x004e4942)
    throw new Error('Missing source GLB BIN chunk');
  const gltf=JSON.parse(buffer.subarray(20,binAt).toString('utf8'));
  const binLength=buffer.readUInt32LE(binAt);
  if(binAt+8+binLength>buffer.length)throw new Error('Truncated source BIN');
  const bin=buffer.subarray(binAt+8,binAt+8+binLength);
  return {gltf,bin,sourceSha256:createHash('sha256').update(buffer).digest('hex')};
}
export function sourceAccessor({gltf,bin},id){
  const acc=gltf.accessors?.[id];
  if(!acc||acc.sparse)throw new Error('Missing/sparse source accessor '+id);
  const view=gltf.bufferViews?.[acc.bufferView],ty=COMPONENTS[acc.componentType],count=SIZES[acc.type];
  if(!view||!ty||!count||!Number.isInteger(acc.count)||acc.count<0)throw new Error('Invalid source accessor '+id);
  const stride=view.byteStride??ty.bytes*count;
  const offset=(view.byteOffset??0)+(acc.byteOffset??0);
  if(offset+Math.max(0,acc.count-1)*stride+ty.bytes*count>bin.length)
    throw new Error('Out of bounds source accessor '+id);
  const data=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
  const values=new Array(acc.count*count);
  for(let i=0;i<acc.count;i++)for(let j=0;j<count;j++)
    values[i*count+j]=data[ty.get](offset+i*stride+j*ty.bytes,true);
  return {acc,values,componentCount:count};
}
export function auditSourceGlb(buffer,label='unknown'){
  const glb=parseLegacyGlb(buffer),g=glb.gltf;
  const skin=g.skins?.[0]||{},jointNames=(skin.joints||[]).map(i=>g.nodes?.[i]?.name);
  const footJoints=jointNames.map((name,i)=>/mixamorig:(?:LeftFoot|RightFoot)$/.test(name||'')?i:-1).filter(i=>i>=0);
  const primitives=[];let allTriangles=0;
  for(let meshIndex=0;meshIndex<(g.meshes?.length||0);meshIndex++){
    const mesh=g.meshes[meshIndex];
    for(let pIndex=0;pIndex<(mesh.primitives||[]).length;pIndex++){
      const p=mesh.primitives[pIndex];
      if((p.mode??4)!==4)continue;
      const pos=sourceAccessor(glb,p.attributes.POSITION).values;
      const tris=p.indices!==undefined?sourceAccessor(glb,p.indices).values:
        Array.from({length:pos.length/3},(_,i)=>i);
      const joints=p.attributes.JOINTS_0!==undefined?sourceAccessor(glb,p.attributes.JOINTS_0).values:[];
      const weights=p.attributes.WEIGHTS_0!==undefined?sourceAccessor(glb,p.attributes.WEIGHTS_0).values:[];
      const low={},bands=[.10,.14,.18,.22,.28,.35];
      for(const cut of bands)low[cut]={all:0,centroid:0,footWeight:0,crossing:0};
      let yMin=Infinity,yMax=-Infinity;
      for(let i=1;i<pos.length;i+=3){yMin=Math.min(yMin,pos[i]);yMax=Math.max(yMax,pos[i]);}
      for(let t=0;t<tris.length;t+=3){
        const ids=tris.slice(t,t+3),ys=ids.map(i=>pos[i*3+1]),avg=(ys[0]+ys[1]+ys[2])/3;
        let weightSum=0;
        if(joints.length&&weights.length)for(const v of ids)for(let s=0;s<4;s++)
          if(footJoints.includes(joints[v*4+s]))weightSum+=weights[v*4+s]/3;
        for(const cut of bands){
          if(ys.every(y=>y<=cut))low[cut].all++;
          if(avg<=cut)low[cut].centroid++;
          if(ys.some(y=>y<=cut)&&ys.some(y=>y>cut))low[cut].crossing++;
          if(avg<=cut&&weightSum>=.5)low[cut].footWeight++;
        }
      }
      allTriangles+=tris.length/3;
      primitives.push({
        meshIndex,primitiveIndex:pIndex,meshName:mesh.name||null,material:p.material??null,
        vertices:pos.length/3,triangles:tris.length/3,indexType:p.indices===undefined?'unindexed':g.accessors[p.indices].componentType,
        yMin,yMax,attributes:Object.keys(p.attributes||{}),low
      });
    }
  }
  let bindHash=null;
  if(skin.inverseBindMatrices!==undefined){
    const binds=sourceAccessor(glb,skin.inverseBindMatrices);
    const binBytes=Buffer.alloc(binds.values.length*4);
    if(binds.acc.componentType!==5126)throw new Error('Inverse binds must be FLOAT');
    for(let i=0;i<binds.values.length;i++)binBytes.writeFloatLE(binds.values[i],i*4);
    bindHash=createHash('sha256').update(binBytes).digest('hex');
  }
  return {label,sha256:glb.sourceSha256,bytes:buffer.length,
    meshCount:g.meshes?.length||0,skinCount:g.skins?.length||0,joints:jointNames.length,
    footJointIndices:footJoints,bindSha256:bindHash,
    clipNames:(g.animations||[]).map(a=>a.name),morphTargets:(g.meshes||[]).reduce((n,m)=>n+(m.primitives||[]).reduce((s,p)=>s+(p.targets?.length||0),0),0),
    materials:(g.materials||[]).map((m,i)=>({index:i,name:m.name||null,texture:m.pbrMetallicRoughness?.baseColorTexture?.index??null,baseColor:m.pbrMetallicRoughness?.baseColorFactor||null})),
    primitives,triangles:allTriangles,
    skinnedMeshNodes:(g.nodes||[]).map((n,i)=>({i,name:n.name,mesh:n.mesh,skin:n.skin,parent:(g.nodes||[]).findIndex(x=>x.children?.includes(i))})).filter(n=>Number.isInteger(n.skin)),
    textures:g.textures?.length||0,images:g.images?.length||0};
}
export function readSourceAsset(kind){
 const file=LEGACY_CAS_FILES[kind];
 if(!file)throw new Error('Unknown original resident model '+kind);
 return readFileSync(new URL('../assets/characters/'+file,import.meta.url));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const records=Object.keys(LEGACY_CAS_FILES).map(kind=>auditSourceGlb(readSourceAsset(kind),kind));
 for(const record of records)console.log('CAS-02.1-D REAL GLB AUDIT '+JSON.stringify(record));
}