/**
 * CAS-02.1: renderer-independent skeletal authoring gate.
 *
 * This inspects glTF JSON only. A passing legacy asset is NOT a modular
 * character: compatible bind-pose, separate meshes, legal provenance and
 * contact animation still require independent evidence.
 *
 * World units: metres, +Y up. Furniture's local +Z is its approach/front
 * direction; imported skeleton axes must be adapted at the render boundary.
 * Game-world avatar transform, navigation, finance and save-v1 are untouched.
 */
export const CAS_RIG_CONTRACT_VERSION=1;
export const CAS_REQUIRED_BONES=Object.freeze([
  'mixamorig:Hips','mixamorig:Spine','mixamorig:Neck','mixamorig:Head',
  'mixamorig:LeftShoulder','mixamorig:LeftArm','mixamorig:LeftForeArm',
  'mixamorig:LeftHand','mixamorig:RightShoulder','mixamorig:RightArm',
  'mixamorig:RightForeArm','mixamorig:RightHand',
  'mixamorig:LeftUpLeg','mixamorig:LeftLeg','mixamorig:LeftFoot',
  'mixamorig:RightUpLeg','mixamorig:RightLeg','mixamorig:RightFoot'
]);
export const CAS_CONTACT_BONES=Object.freeze({
  pelvis:'mixamorig:Hips',head:'mixamorig:Head',
  leftHand:'mixamorig:LeftHand',rightHand:'mixamorig:RightHand',
  leftFoot:'mixamorig:LeftFoot',rightFoot:'mixamorig:RightFoot'
});
const safeArray=value=>Array.isArray(value)?value:[];
const unique=values=>new Set(values).size===values.length;

/**
 * Structural GLB/skinned-mesh inspection. Deliberately does not infer body
 * morphing or garment interchangeability from having a named skeleton.
 */
export function inspectCasRigGltf(gltf){
  const issues=[];
  if(!gltf||typeof gltf!=='object'||Array.isArray(gltf))
    return Object.freeze({valid:false,issues:Object.freeze(['invalid glTF root']),
      jointNames:Object.freeze([]),morphTargets:0,animations:Object.freeze([]),
      modularReady:false});
  const nodes=safeArray(gltf.nodes),skins=safeArray(gltf.skins);
  if(skins.length!==1)issues.push('exactly one skin required for CAS base rig');
  const joints=safeArray(skins[0]?.joints);
  if(!joints.length)issues.push('missing skin joints');
  if(joints.some(i=>!Number.isInteger(i)||i<0||i>=nodes.length))
    issues.push('skin joint index outside nodes');
  const jointNames=joints.map(i=>nodes[i]?.name).filter(s=>typeof s==='string');
  if(jointNames.length!==joints.length||!unique(jointNames))
    issues.push('missing or duplicate joint names');
  for(const bone of CAS_REQUIRED_BONES)
    if(!jointNames.includes(bone))issues.push('missing bone '+bone);
  const meshes=safeArray(gltf.meshes);
  const skinnedNodes=nodes.filter(n=>
    Number.isInteger(n?.mesh)&&n.mesh>=0&&n.mesh<meshes.length&&
    Number.isInteger(n.skin)&&n.skin>=0&&n.skin<skins.length);
  if(!skinnedNodes.length)issues.push('missing skin-bound mesh node');
  let weighted=0,morphTargets=0;
  for(const node of skinnedNodes){
    for(const primitive of safeArray(meshes[node.mesh]?.primitives)){
      if(primitive?.attributes?.JOINTS_0!==undefined&&
         primitive?.attributes?.WEIGHTS_0!==undefined)weighted++;
      morphTargets+=safeArray(primitive?.targets).length;
    }
  }
  if(!weighted)issues.push('missing weighted skin primitives');
  const animations=safeArray(gltf.animations).map(a=>a?.name)
    .filter(s=>typeof s==='string');
  const valid=issues.length===0;
  return Object.freeze({
    valid,issues:Object.freeze(issues),
    jointNames:Object.freeze(jointNames),
    boneCount:joints.length,skinnedPrimitiveCount:weighted,
    morphTargets,animations:Object.freeze(animations),
    // Skinning alone never proves detachable tops/legs/hair/shoes.
    modularReady:false
  });
}

/**
 * Manifest compatibility is intentionally fail-closed: names/order AND a
 * verified bind-pose digest must match. Hashes are supplied by an asset
 * pipeline reading inverse-bind data; an editable manifest assertion alone
 * is not acceptable evidence for production. Actual skinned proof is CAS-02.2+.
 */
export function compareCasRigBinding(base,candidate,{
  baseBindSha256='',candidateBindSha256=''
}={}){
  const reasons=[];
  if(!base?.valid||!candidate?.valid)reasons.push('invalid rig');
  if(!Array.isArray(base?.jointNames)||!Array.isArray(candidate?.jointNames)||
    base.jointNames.length!==candidate.jointNames.length||
    base.jointNames.some((name,index)=>name!==candidate.jointNames[index]))
    reasons.push('different joint order or names');
  const hash=/^[a-f0-9]{64}$/;
  if(!hash.test(baseBindSha256)||!hash.test(candidateBindSha256))
    reasons.push('missing verified inverse-bind SHA256');
  else if(baseBindSha256!==candidateBindSha256)
    reasons.push('different inverse-bind pose');
  return Object.freeze({compatible:reasons.length===0,
    reasons:Object.freeze(reasons)});
}
