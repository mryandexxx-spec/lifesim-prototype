/**
 * CAS-02.2-B G1: read-only source topology passport, NOT a facial sculptor.
 * Coordinate bands are candidate probe regions, NOT validated eye/nose/lip landmarks.
 * This code never writes or re-encodes original Alex/Mira assets.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const SOURCES = Object.freeze({
  alex: { file: 'meshy-casual-v1.glb', sha: '7014401e6819b8b047fe384cfce4a62549711aa711d26a6894571800a40eb5f4' },
  mira: { file: 'meshy-mira-mobile-v1.glb', sha: '40a2d1e0dcde53f7c2f53c6bd220f39ba440bbf4d42dfbad949ca82146594d0a' }
});
const sha = buf => createHash('sha256').update(buf).digest('hex');
const round = n => Math.round(n * 10000) / 10000;
const BANDS = Object.freeze({
  upperFaceCandidate: [1.584, 1.65],
  midFaceCandidate: [1.538, 1.59],
  mouthCandidate: [1.499, 1.542],
  jawCandidate: [1.443, 1.508]
});

export function readGLB(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 36 ||
      bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 ||
      bytes.readUInt32LE(8) !== bytes.length)
    throw Error('Unrecognized or truncated GLB');
  const jl = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a || jl + 28 > bytes.length)
    throw Error('Missing or invalid JSON chunk');
  const b = 20 + jl;
  if (bytes.readUInt32LE(b + 4) !== 0x004e4942 || b + 8 + bytes.readUInt32LE(b) > bytes.length)
    throw Error('Missing or truncated binary chunk');
  return { json: JSON.parse(bytes.toString('utf8', 20, 20 + jl)),
    bin: bytes.subarray(b + 8, b + 8 + bytes.readUInt32LE(b)) };
}
export function accessor(glb, id) {
  const a = glb.json.accessors[id], view = glb.json.bufferViews[a?.bufferView];
  const components = {SCALAR:1, VEC2:2, VEC3:3, VEC4:4}[a?.type];
  const spec = {5121:[1,'readUInt8'], 5123:[2,'readUInt16LE'],
    5125:[4,'readUInt32LE'], 5126:[4,'readFloatLE']}[a?.componentType];
  if (!a || !view || !spec || !components || a.sparse || !Number.isSafeInteger(a.count) || a.count < 1)
    throw Error('Unsupported source accessor ' + id);
  const [width, fn] = spec;
  const stride = view.byteStride || components * width;
  const start = (view.byteOffset || 0) + (a.byteOffset || 0);
  const end = start + stride * (a.count - 1) + width * components;
  if (stride < width * components || start < 0 || end > glb.bin.length ||
      end > (view.byteOffset || 0) + view.byteLength)
    throw Error('Out-of-range source accessor ' + id);
  const out = new Float64Array(a.count * components);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < components; k++)
    out[i * components + k] = glb.bin[fn](start + stride * i + width * k);
  return out;
}

/** Counts real indexed connectivity, open/non-manifold edges, and component sizes. */
export function measureConnectivity(indices, vertexCount, allowed) {
  if (indices.length % 3) throw Error('Not a triangle index buffer');
  if (allowed.length !== vertexCount) throw Error('Face-mask cardinality mismatch');
  const parent = Int32Array.from({length:vertexCount}, (_, i) => i);
  const rank = new Uint8Array(vertexCount), incident = new Uint8Array(vertexCount);
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const join = (a, b) => {
    a = find(a); b = find(b); if (a === b) return;
    if (rank[a] < rank[b]) [a, b] = [b, a];
    parent[b] = a; if (rank[a] === rank[b]) rank[a]++;
  };
  let triangles = 0, degenerates = 0;
  const edges = new Map();
  for (let n = 0; n < indices.length; n += 3) {
    const tri = [indices[n], indices[n+1], indices[n+2]];
    for (const ix of tri) if (!Number.isSafeInteger(ix) || ix < 0 || ix >= vertexCount)
      throw Error('Invalid index ' + ix);
    if (!tri.every(ix => allowed[ix])) continue;
    triangles++;
    if (new Set(tri).size !== 3) {degenerates++; continue;}
    for (const ix of tri) incident[ix] = 1;
    join(tri[0],tri[1]); join(tri[1],tri[2]);
    for (const [i,j] of [[0,1],[1,2],[2,0]]) {
      const a = Math.min(tri[i],tri[j]), b = Math.max(tri[i],tri[j]);
      const key = a + ':' + b;
      edges.set(key,(edges.get(key)||0)+1);
    }
  }
  const groups = new Map();
  for (let i = 0; i < vertexCount; i++) if (incident[i]) {
    const p = find(i); groups.set(p,(groups.get(p)||0)+1);
  }
  const sizes = [...groups.values()].sort((a,b)=>b-a);
  return {
    triangles, usedVertices:sizes.reduce((a,b)=>a+b,0),
    connectedComponents:sizes.length, largestComponentVertices:sizes[0]||0,
    largestComponentShare:round(sizes[0] / Math.max(1,sizes.reduce((a,b)=>a+b,0))),
    degenerateIndexTriangles:degenerates,
    openEdges:[...edges.values()].filter(n=>n===1).length,
    nonManifoldEdges:[...edges.values()].filter(n=>n>2).length
  };
}
/**
 * Diagnostic geometric-position welding only. Never rewrite an asset with these
 * indices: coincident eyelids/lips may be separate physical layers in Blender.
 * This supplies an upper bound on continuity hidden by UV-split vertex indices.
 */
export function weldConnectivityProbe(indices, positions, allowed) {
  if (positions.length !== allowed.length*3) throw Error('Weld position cardinality mismatch');
  const rep = Int32Array.from({length:allowed.length},(_,i)=>i);
  const seen = new Map(); let duplicated = 0;
  for(let i=0;i<allowed.length;i++)if(allowed[i]){
    const key=[positions[3*i],positions[3*i+1],positions[3*i+2]]
      .map(x=>Math.round(x*100000)).join(':');
    if(seen.has(key)){rep[i]=seen.get(key);duplicated++;}
    else seen.set(key,i);
  }
  const mapped=Float64Array.from(indices,i=>rep[i]);
  return {coincidentIndexDuplicates:duplicated,
    connectivity:measureConnectivity(mapped,allowed.length,allowed)};
}
export function auditFaceTopology(kind, bytes) {
  const source = SOURCES[kind];
  if (!source) throw Error('Unknown original family');
  if (sha(bytes) !== source.sha) throw Error('Original GLB SHA mismatch');
  const glb = readGLB(bytes), g = glb.json;
  const primitives = g.meshes?.flatMap(m=>m.primitives||[]) || [];
  if (primitives.length !== 1 || g.skins?.length !== 1 || g.images?.length !== 1)
    throw Error('Unexpected source mesh/skin/atlas count');
  const p = primitives[0];
  const pos = accessor(glb,p.attributes.POSITION),norm = accessor(glb,p.attributes.NORMAL);
  const uv = accessor(glb,p.attributes.TEXCOORD_0);
  const joints = accessor(glb,p.attributes.JOINTS_0), weights = accessor(glb,p.attributes.WEIGHTS_0);
  const indices = accessor(glb,p.indices);
  const vertexCount = pos.length/3;
  if (norm.length !== pos.length || uv.length !== 2*vertexCount ||
      joints.length !== 4*vertexCount || weights.length !== 4*vertexCount ||
      g.skins[0].joints.length !== 66 || g.animations.length !== (kind === 'alex'?10:13))
    throw Error('Original rig/attribute mismatch');
  const names = g.skins[0].joints.map(id=>g.nodes[id]?.name || '');
  const head = names.indexOf('mixamorig:Head');
  if (head < 0) throw Error('Missing original Head joint');
  const mask = new Uint8Array(vertexCount), bins = new Set();
  let visibleCount = 0;
  const welds = new Map(), uvSeamsAtCoincidentPositions = new Set();
  for (let i=0;i<vertexCount;i++) {
    let hw=0;
    for(let k=0;k<4;k++)if(joints[4*i+k]===head)hw+=weights[4*i+k];
    const y=pos[3*i+1], z=pos[3*i+2], nz=norm[3*i+2];
    if(hw<=.75 || nz<=.2 || z<=.015 || y<=1.43 || y>=1.68)continue;
    mask[i]=1;visibleCount++;
    const u=Math.max(0,Math.min(15,Math.floor(uv[2*i]*16)));
    const v=Math.max(0,Math.min(15,Math.floor(uv[2*i+1]*16)));
    bins.add(u+16*v);
    // Positions coincident in geometry but carrying different atlas UVs are seam evidence.
    const key=[pos[3*i],y,z].map(x=>Math.round(x*100000)).join(':');
    const uvKey=[uv[2*i],uv[2*i+1]].map(x=>Math.round(x*100000)).join(':');
    if (welds.has(key) && welds.get(key)!==uvKey)uvSeamsAtCoincidentPositions.add(key);
    else welds.set(key,uvKey);
  }
  if(visibleCount<1000)throw Error('Unable to isolate source front-face candidate');
  const probeBands = Object.fromEntries(Object.entries(BANDS).map(([name,[lo,hi]])=>{
    const allowed = new Uint8Array(vertexCount);let vertices=0;
    for(let i=0;i<vertexCount;i++)if(mask[i]&&pos[3*i+1]>=lo&&pos[3*i+1]<=hi){
      allowed[i]=1;vertices++;
    }
    return [name,{candidateVertices:vertices,...measureConnectivity(indices,vertexCount,allowed)}];
  }));
  const originalGeometry=measureConnectivity(indices,vertexCount,mask);
  const weldedProbe=weldConnectivityProbe(indices,pos,mask);
  const output={
    kind, sourceSha256:source.sha, vertexCount, triangleCount:indices.length/3,
    joints:g.skins[0].joints.length, animationClips:g.animations.length,
    primitiveCount:primitives.length, materials:g.materials?.length||0,
    atlasImages:g.images.length, sourceMorphTargets:p.targets?.length||0,
    frontFaceCandidateVertices:visibleCount,
    frontFaceCandidate:originalGeometry,
    coincidenceWeldedFaceProbe:weldedProbe.connectivity,
    coincidenceWeldedDuplicateVertexIndices:weldedProbe.coincidentIndexDuplicates,
    rawVsCoincidenceWeldedComponentRatio:round(
      originalGeometry.connectedComponents/Math.max(1,weldedProbe.connectivity.connectedComponents)),
    atlasBins16x16:bins.size,
    coincidentPositionUvSeams:uvSeamsAtCoincidentPositions.size,
    probeBands,
    anatomyLandmarksValidated:false,
    eyelidLipNostrilLoopsValidated:false,
    independentSkinEyeLipHairUVValidated:false,
    correctedTexturesAvailable:false,
    artistSculptedNewIdentities:0,
    productionReady:false,
    conclusion:'Source vertices permit POSITION deformation; UV-split indices and positional coincidence must not be mistaken for validated eyelid/lip topology or a reusable painted atlas.'
  };
  return output;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const assetDir=resolve(dirname(fileURLToPath(import.meta.url)),'../../assets/characters');
  for (const [kind,info] of Object.entries(SOURCES))
    console.log('CAS_B_G1_TOPOLOGY '+JSON.stringify(auditFaceTopology(kind,readFileSync(resolve(assetDir,info.file)))));
}
