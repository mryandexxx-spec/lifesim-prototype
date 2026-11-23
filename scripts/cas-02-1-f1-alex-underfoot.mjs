/** CAS-02.1-F1: preserve and independently mask original Alex's source-foot
 * residue in the 02.1-E body mesh. Original and game GLBs remain byte-for-byte.
 *
 * The 02.1-E foot-weight cut leaves part of the WHITE sneaker upper in the
 * body node even when the old shoe node is disabled. This makes external shoes
 * appear pasted over the original shoe. Split that underfoot region into a
 * second skin-bound node that can be disabled only when CC0 shoes are worn.
 */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {parseLegacyGlb,sourceAccessor} from './cas-source-asset-audit.mjs';
import {fileURLToPath} from 'node:url';

export const F1_ALEX_SOURCE='assets/characters/cas-alex-footwear-v2.glb';
export const F1_ALEX_FILE='assets/characters/cas-alex-cc0-fitting-base.glb';
export const F1_ALEX_SOURCE_SHA256='685c6ad9c7a8e43c5c4ccfb0e8c36c966e928c717a5220ac77cb8437df035aab';
const sha=b=>createHash('sha256').update(b).digest('hex');
function pad4(data,fill=0){
 return Buffer.concat([data,Buffer.alloc((4-data.length%4)%4,fill)]);
}
function writeGlb(g,bin){
 const json=pad4(Buffer.from(JSON.stringify(g)),32),binary=pad4(bin);
 const result=Buffer.alloc(12+8+json.length+8+binary.length);
 result.writeUInt32LE(0x46546c67,0);
 result.writeUInt32LE(2,4);
 result.writeUInt32LE(result.length,8);
 result.writeUInt32LE(json.length,12);
 result.writeUInt32LE(0x4e4f534a,16);
 json.copy(result,20);
 const offset=20+json.length;
 result.writeUInt32LE(binary.length,offset);
 result.writeUInt32LE(0x004e4942,offset+4);
 binary.copy(result,offset+8);
 return result;
}
export function buildAlexF1Underfoot(source){
 if(sha(source)!==F1_ALEX_SOURCE_SHA256)
  throw Error('F1 source Alex GLB does not match audited E source SHA');
 const parsed=parseLegacyGlb(source),g=structuredClone(parsed.gltf);
 if(g.skins?.length!==1||g.skins[0].joints.length!==66||
    g.animations?.length!==10||g.meshes?.[0]?.primitives?.length!==1||
    g.buffers?.length!==1)throw Error('F1 underlying Alex skin/clip topology drift');
 const base=g.meshes[0].primitives[0],indices=sourceAccessor(parsed,base.indices).values;
 const positions=sourceAccessor(parsed,base.attributes.POSITION).values;
 const jointIds=sourceAccessor(parsed,base.attributes.JOINTS_0).values;
 const weights=sourceAccessor(parsed,base.attributes.WEIGHTS_0).values;
 const footJoints=g.skins[0].joints.map((id,i)=>
  /^mixamorig:(?:Left|Right)(?:Foot|ToeBase)$/.test(g.nodes[id]?.name||'')?i:-1)
  .filter(i=>i>=0);
 if(footJoints.length!==4)throw Error('F1 four source foot/toe anchors not found');
 const kept=[],masked=[];
 for(let i=0;i<indices.length;i+=3){
  const triangle=indices.slice(i,i+3);
  const y=triangle.reduce((sum,index)=>sum+positions[index*3+1],0)/3;
  let footWeight=0;
  for(const id of triangle)for(let k=0;k<4;k++)
   if(footJoints.includes(jointIds[id*4+k]))footWeight+=weights[id*4+k]/3;
  // Never mask upper ankle/leg/face; this is the residual below 17 cm ONLY.
  (y<=.17&&footWeight>=.25?masked:kept).push(...triangle);
 }
 if(masked.length<2100||masked.length>5100||kept.length<60000||
    kept.length+masked.length!==indices.length)
  throw Error('Unsafe source Alex foot mask '+JSON.stringify({
    kept:kept.length/3,masked:masked.length/3}));
 const chunks=[Buffer.from(parsed.bin)];let length=parsed.bin.length;
 function addIndex(values){
  const componentType=g.accessors[base.indices].componentType;
  if(componentType!==5123&&componentType!==5125)
   throw Error('Unsupported F1 index encoding');
  const bytes=componentType===5123?2:4;
  const pad=(4-length%4)%4;
  if(pad){chunks.push(Buffer.alloc(pad));length+=pad;}
  const data=Buffer.alloc(values.length*bytes);
  values.forEach((v,i)=>componentType===5123?data.writeUInt16LE(v,i*bytes):data.writeUInt32LE(v,i*bytes));
  const view=g.bufferViews.length;
  g.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length,target:34963});
  const accessor=g.accessors.length;
  g.accessors.push({bufferView:view,componentType,type:'SCALAR',
   count:values.length,min:[0],max:[Math.floor(positions.length/3)-1]});
  chunks.push(data);length+=data.length;
  return accessor;
 }
 const keptIndex=addIndex(kept),maskedIndex=addIndex(masked);
 base.indices=keptIndex;
 const meshIndex=g.meshes.length;
 const maskPrimitive={...structuredClone(base),indices:maskedIndex};
 g.meshes.push({name:'CAS F1 original white sneaker underfoot residual',
  primitives:[maskPrimitive]});
 const sourceNodeIndex=g.nodes.findIndex(n=>n.mesh===0&&n.skin===0);
 const sourceNode=g.nodes[sourceNodeIndex];
 if(!sourceNode)throw Error('Source body skin node missing');
 const copyTransforms={};
 for(const key of ['matrix','translation','rotation','scale'])
  if(sourceNode[key]!==undefined)copyTransforms[key]=structuredClone(sourceNode[key]);
 const nodeIndex=g.nodes.length;
 g.nodes.push({name:'CAS F1 source underfoot residual',mesh:meshIndex,
  skin:0,...copyTransforms});
 const parentIndex=g.nodes.findIndex(n=>n.children?.includes(sourceNodeIndex));
 if(parentIndex>=0)g.nodes[parentIndex].children.push(nodeIndex);
 else g.scenes?.[g.scene??0]?.nodes?.push(nodeIndex);
 g.buffers[0].byteLength=length;
 const model=writeGlb(g,Buffer.concat(chunks));
 const metadata={stage:'CAS-02.1-F1',sourceSha256:sha(source),sha256:sha(model),
  sourceBodyTriangles:indices.length/3,
  unmaskedBodyTriangles:kept.length/3,
  maskedSourceSneakerTriangles:masked.length/3,
  sourceResidualNode:'CAS F1 source underfoot residual',
  sourceSkinCount:1,sourceJoints:66,sourceClips:10,
  sourceMeshPreserved:true,gameplayUnchanged:true,productionReady:false,
  physicalIphoneApproved:false};
 if(metadata.unmaskedBodyTriangles+metadata.maskedSourceSneakerTriangles!==
    metadata.sourceBodyTriangles)throw Error('Source Alex faces disappeared');
 return {model,metadata};
}
export function build(){
 const {model,metadata}=buildAlexF1Underfoot(readFileSync(F1_ALEX_SOURCE));
 writeFileSync(F1_ALEX_FILE,model);
 writeFileSync(F1_ALEX_FILE.replace(/\.glb$/,'.json'),JSON.stringify(metadata,null,2)+'\n');
 console.log('CAS-02.1-F1 NONDESTRUCTIVE ALEX FOOT MASK '+JSON.stringify(metadata));
 return metadata;
}
if(process.argv[1]===fileURLToPath(import.meta.url))build();
