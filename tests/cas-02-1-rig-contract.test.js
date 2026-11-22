import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  CAS_RIG_CONTRACT_VERSION,CAS_REQUIRED_BONES,CAS_CONTACT_BONES,
  inspectCasRigGltf,compareCasRigBinding
} from '../src/cas-rig-contract.js';

function readGlb(file){
  const buffer=readFileSync(new URL('../assets/characters/'+file,import.meta.url));
  assert.equal(buffer.readUInt32LE(0),0x46546c67,'GLB v2 magic');
  assert.equal(buffer.readUInt32LE(4),2,'GLB version');
  assert.equal(buffer.readUInt32LE(8),buffer.length,'GLB length');
  assert.equal(buffer.readUInt32LE(16),0x4e4f534a,'JSON chunk');
  return JSON.parse(buffer.subarray(20,20+buffer.readUInt32LE(12)).toString('utf8'));
}

test('CAS-02.1 validates both real skinned legacy GLBs without claiming modularity',()=>{
  assert.equal(CAS_RIG_CONTRACT_VERSION,1);
  for(const file of ['meshy-casual-v1.glb','meshy-mira-mobile-v1.glb']){
    const report=inspectCasRigGltf(readGlb(file));
    assert.equal(report.valid,true,file+': '+report.issues.join('; '));
    assert.equal(report.boneCount,66,file);
    assert.ok(report.skinnedPrimitiveCount>=1,file);
    assert.equal(report.morphTargets,0,file+': face morph UI must stay disabled');
    assert.equal(report.modularReady,false,file+': single-piece meshes are not swappable outfits');
    for(const bone of CAS_REQUIRED_BONES)assert.ok(report.jointNames.includes(bone),file+': '+bone);
    for(const bone of Object.values(CAS_CONTACT_BONES))
      assert.ok(report.jointNames.includes(bone),file+': contact '+bone);
    assert.ok(report.animations.length>=10,file);
  }
});

test('CAS-02.1 rejects missing, aliased, duplicate and unweighted skeletons',()=>{
  const original=readGlb('meshy-casual-v1.glb');
  assert.equal(inspectCasRigGltf(null).valid,false);
  const noSkin=structuredClone(original);noSkin.skins=[];
  assert.equal(inspectCasRigGltf(noSkin).valid,false);
  const missing=structuredClone(original);
  missing.nodes[missing.skins[0].joints.find(i=>missing.nodes[i].name==='mixamorig:Hips')].name='fake:Hips';
  assert.equal(inspectCasRigGltf(missing).valid,false);
  const dup=structuredClone(original);
  dup.nodes[dup.skins[0].joints.find(i=>dup.nodes[i].name==='mixamorig:Head')].name='mixamorig:Hips';
  assert.equal(inspectCasRigGltf(dup).valid,false);
  const noWeights=structuredClone(original);
  for(const mesh of noWeights.meshes)for(const primitive of mesh.primitives||[]){
    delete primitive.attributes.JOINTS_0;
    delete primitive.attributes.WEIGHTS_0;
  }
  assert.equal(inspectCasRigGltf(noWeights).valid,false);
});

test('CAS-02.1 modular compatibility rejects missing, stale and changed bind poses',()=>{
  const base=inspectCasRigGltf(readGlb('meshy-casual-v1.glb'));
  const female=inspectCasRigGltf(readGlb('meshy-mira-mobile-v1.glb'));
  assert.equal(compareCasRigBinding(base,base).compatible,false,
    'matching names without verified bind data are not enough');
  const hash='a'.repeat(64);
  assert.equal(compareCasRigBinding(base,base,{
    baseBindSha256:hash,candidateBindSha256:hash
  }).compatible,true,'a verified identical bind digest is allowed');
  assert.equal(compareCasRigBinding(base,base,{
    baseBindSha256:hash,candidateBindSha256:'b'.repeat(64)
  }).compatible,false,'different inverse binds invalidate clothing');
  const reversed={...base,jointNames:[...base.jointNames].reverse()};
  assert.equal(compareCasRigBinding(base,reversed,{
    baseBindSha256:hash,candidateBindSha256:hash
  }).compatible,false,'joint ordering must not drift');
  assert.equal(compareCasRigBinding(base,female).compatible,false,
    'two complete originals are not independently proven interchangeable');
});

test('CAS-02.1 inspection is read-only and never touches canonical household saves',()=>{
  const gltf=readGlb('meshy-casual-v1.glb');
  const before=JSON.stringify(gltf);
  const a=inspectCasRigGltf(gltf),b=inspectCasRigGltf(gltf);
  assert.deepEqual(a,b);
  assert.equal(JSON.stringify(gltf),before);
  assert.equal(Object.isFrozen(a),true);
  assert.equal(Object.isFrozen(a.jointNames),true);
});
