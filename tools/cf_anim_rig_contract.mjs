// RIG-CONTRACT R1: actual GLB hierarchy and stock VRM normalization probes.
// Diagnostic only. No VRM export, canonical T-pose calibration, retarget clip or engine swap.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import { VRMHumanoid } from '@pixiv/three-vrm-core';

const OUT='artifacts/cf-anim-rig-contract';fs.mkdirSync(OUT,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const pins={
 'male-grid_021-100':'bd45b8419c805e6ff5268a90e0d2d7c48e91055d25d5d9abc1d70cf786cb77bf',
 'male-grid_021-90':'af47150d743f75a9d61d7c601a66be4bd7875a26795f721d7928dbb96bc1274e',
 'female-grid_201-100':'d96f4072b70e7a571736244a128f91d53b61e5f12a936d489d3b2753ce69967c',
 'female-grid_201-110':'dfb2953e80303450532d5015baa19cfe594c0b603c790ecdf7dab7f0b03e3c2b'
};
const names={hips:'root',spine:'spine04',chest:'spine02',upperChest:'spine01',neck:'neck01',head:'head',
 leftEye:'eye.L',rightEye:'eye.R'};
const parents={spine:'hips',chest:'spine',upperChest:'chest',neck:'upperChest',head:'neck',leftEye:'head',rightEye:'head'};
for(const [side,suffix] of [['left','L'],['right','R']]){
 for(const [role,bone,parent] of [['UpperLeg','upperleg01','hips'],['LowerLeg','lowerleg01',side+'UpperLeg'],['Foot','foot',side+'LowerLeg'],['Toes','toe1-1',side+'Foot'],['Shoulder','clavicle','upperChest'],['UpperArm','upperarm01',side+'Shoulder'],['LowerArm','lowerarm01',side+'UpperArm'],['Hand','wrist',side+'LowerArm']]){
  names[side+role]=bone+'.'+suffix;parents[side+role]=parent;
 }
}
const required=['hips','spine','head',...['left','right'].flatMap(s=>['UpperLeg','LowerLeg','Foot','UpperArm','LowerArm','Hand'].map(k=>s+k))];
const EPS=.0002;
const V=(...a)=>new THREE.Vector3(...a);
const Q=()=>new THREE.Quaternion();
function parseGlb(b){
 assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(b.readUInt32LE(4),2);assert.equal(b.readUInt32LE(8),b.length);
 let n=b.readUInt32LE(12);assert.equal(b.readUInt32LE(16),0x4e4f534a);
 const g=JSON.parse(b.subarray(20,20+n).toString());let off=20+n;
 assert.equal(b.readUInt32LE(off+4),0x004e4942);
 const bin=b.subarray(off+8,off+8+b.readUInt32LE(off));
 function accessor(i){
  const a=g.accessors[i],v=g.bufferViews[a.bufferView];assert(!a.sparse && !a.normalized);
  const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};let width=widths[a.type];assert(width);
  const size={5126:4,5123:2,5121:1,5125:4}[a.componentType];assert(size);
  const stride=v.byteStride??size*width,start=(v.byteOffset??0)+(a.byteOffset??0);
  assert((a.count-1)*stride+size*width+(a.byteOffset??0)<=v.byteLength);
  const read={5126:'readFloatLE',5123:'readUInt16LE',5121:'readUInt8',5125:'readUInt32LE'}[a.componentType];
  return Array.from({length:a.count},(_,j)=>Array.from({length:width},(_,k)=>bin[read](start+j*stride+k*size)));
 }
 return {g,accessor};
}
function snapshot(nodes){return nodes.map(n=>({p:n.getWorldPosition(V()),q:n.getWorldQuaternion(Q())}));}
function validateMap(map,byName,joints){
 assert(required.every(k=>map[k]),'missing required role');
 assert.equal(new Set(Object.values(map)).size,Object.keys(map).length,'duplicate mapped bone');
 const rev=new Map(Object.entries(map).map(([k,n])=>[byName[n],k]));
 for(const [role,n] of Object.entries(map)){
  const bone=byName[n];assert(bone&&joints.includes(bone),'not a skin joint: '+role);
  if(role==='hips')continue;
  let p=bone.parent;while(p&&!rev.has(p))p=p.parent;
  assert.equal(rev.get(p),parents[role],'wrong semantic ancestor: '+role);
 }
 for(const s of ['left','right']){
  const sign=s==='left'?1:-1;let x=byName[map.hips].getWorldPosition(V()).x;
  for(const k of ['UpperLeg','Foot','UpperArm','Hand'])assert(sign*(byName[map[s+k]].getWorldPosition(V()).x-x)>.025,'wrong anatomical side '+s+k);
 }
}
function max(a){return Math.max(0,...a);}
function run(key,pin){
 const bytes=fs.readFileSync('input-rigs/'+key+'.glb');
 const cacheBytes=fs.readFileSync('input-caches/'+key+'/pose-cache.json');
 assert.equal(sha(cacheBytes),pin);const c=JSON.parse(cacheBytes);assert.equal(c.rig,key);assert.equal(sha(bytes),c.rigSha);
 const {g,accessor}=parseGlb(bytes);assert.equal(g.skins.length,1);const skin=g.skins[0];assert.equal(skin.joints.length,104);
 const carrier=new THREE.Group(),nodes=g.nodes.map(d=>{
  const n=new THREE.Bone();n.name=d.name??'';
  if(d.matrix)new THREE.Matrix4().fromArray(d.matrix).decompose(n.position,n.quaternion,n.scale);
  else {if(d.translation)n.position.fromArray(d.translation);if(d.rotation)n.quaternion.fromArray(d.rotation).normalize();if(d.scale)n.scale.fromArray(d.scale);}
  assert(n.scale.toArray().every(v=>Math.abs(v-1)<.0002),'non-unit scale');return n;
 });
 g.nodes.forEach((d,i)=>(d.children??[]).forEach(j=>nodes[i].add(nodes[j])));
 for(const i of g.scenes[g.scene??0].nodes)carrier.add(nodes[i]);carrier.updateMatrixWorld(true);
 const joints=skin.joints.map(i=>nodes[i]),byName=Object.fromEntries(joints.map(n=>[n.name,n]));
 assert.equal(Object.keys(byName).length,104);
 assert(c.boneNames.every((n,i)=>byName[n]&&(c.parents[i]<0||byName[n].parent===byName[c.boneNames[c.parents[i]]])),'cached hierarchy mismatch');
 // Independent Blender-extracted neutral position comparison, not quaternion axes
 // (Blender glTF import can change bone basis without changing landmarks).
 const cacheWorld=[];
 c.neutral.forEach((b,i)=>{
  const p=V().fromArray(b.p),q=Q().fromArray(b.r).normalize(),parent=cacheWorld[c.parents[i]];
  cacheWorld.push(parent?{p:p.applyQuaternion(parent.q).add(parent.p),q:parent.q.clone().multiply(q)}:{p,q});
 });
 const cacheError=max(c.boneNames.map((n,i)=>byName[n].getWorldPosition(V()).distanceTo(cacheWorld[i].p)));
 assert(cacheError<EPS,'actual GLB vs frozen native landmark mismatch '+cacheError);
 validateMap(names,byName,joints);
 assert.throws(()=>validateMap({...names,leftHand:names.rightHand},byName,joints),/duplicate/);
 assert.throws(()=>validateMap({...names,leftUpperLeg:names.rightUpperLeg,rightUpperLeg:names.leftUpperLeg},byName,joints),/ancestor|side/);
 assert.throws(()=>validateMap({...names,spine:'spine01',upperChest:'spine04'},byName,joints),/ancestor/);
 const human=new VRMHumanoid(Object.fromEntries(Object.entries(names).map(([k,n])=>[k,{node:byName[n]}])));
 carrier.add(human.normalizedHumanBonesRoot);
 const neutral=snapshot(joints),local=joints.map(n=>({p:n.position.clone(),q:n.quaternion.clone()}));
 const inv=accessor(skin.inverseBindMatrices).map(x=>new THREE.Matrix4().fromArray(x));
 assert.equal(inv.length,joints.length);
 const meshNode=nodes[g.nodes.findIndex(n=>n.skin===0)];assert(meshNode);
 const mesh=g.meshes[g.nodes[nodes.indexOf(meshNode)].mesh];
 // Actual weighted base vertices; no morphs applied. Reference native rest input.
 const prims=mesh.primitives.map(p=>({p:accessor(p.attributes.POSITION),j:accessor(p.attributes.JOINTS_0),w:accessor(p.attributes.WEIGHTS_0)}));
 assert(mesh.primitives.every(p=>!('JOINTS_1' in p.attributes)),'unhandled skin weights');
 const tmp=V(),sum=V();
 function skinCheck(delta=null){
  carrier.updateMatrixWorld(true);const mats=joints.map((n,i)=>n.matrixWorld.clone().multiply(inv[i]));
  let error=0,count=0,lo=V(Infinity,Infinity,Infinity),hi=V(-Infinity,-Infinity,-Infinity);
  for(const p of prims)for(let i=0;i<p.p.length;i++){
   const point=p.p[i];sum.set(0,0,0);let total=0;
   for(let k=0;k<4;k++){
    const w=p.w[i][k];assert(Number.isFinite(w)&&w>=0);if(!w)continue;
    assert(mats[p.j[i][k]]);sum.addScaledVector(tmp.fromArray(point).applyMatrix4(mats[p.j[i][k]]),w);total+=w;
   }
   assert(Math.abs(total-1)<.001);assert(sum.toArray().every(Number.isFinite));lo.min(sum);hi.max(sum);count++;
   if(delta)error=Math.max(error,sum.distanceTo(tmp.fromArray(point).add(delta)));
  }
  if(delta)assert(error<.002,'weighted skin translation/identity error '+error);
  return {vertices:count,maxErrorM:delta?error:null,bounds:[lo.toArray(),hi.toArray()]};
 }
 const neutralSkin=skinCheck(V());
 function update(){human.update();carrier.updateMatrixWorld(true);}
 function reset(){human.resetNormalizedPose();update();}
 reset();let id=max(snapshot(joints).map((b,i)=>b.p.distanceTo(neutral[i].p)));
 assert(id<EPS,'identity drift');assert(max(joints.map((b,i)=>b.quaternion.angleTo(local[i].q)))<.002);
 const probes=[];
 function descendant(n,p){for(let q=n;q;q=q.parent)if(q===p)return true;return false;}
 // One fixed normalized rotation at a time: expected world motion is independent
 // rigid rotation about the joint pivot, including unmapped descendants.
 for(const role of ['hips','spine','chest','neck','head','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm','leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg','leftFoot','rightFoot']){
  for(const [axis,label] of [[V(1,0,0),'X'],[V(0,1,0),'Y'],[V(0,0,1),'Z']]){
   reset();const q=Q().setFromAxisAngle(axis,Math.PI/12),pivot=byName[names[role]],center=pivot.getWorldPosition(V());
   human.getNormalizedBoneNode(role).quaternion.copy(q);update();
   const current=snapshot(joints);
   let posError=0,rotError=0;
   for(let i=0;i<joints.length;i++){
    const active=descendant(joints[i],pivot);
    const expected=neutral[i].p.clone();if(active)expected.sub(center).applyQuaternion(q).add(center);
    const expectedQ=active?q.clone().multiply(neutral[i].q):neutral[i].q;
    posError=Math.max(posError,expected.distanceTo(current[i].p));
    rotError=Math.max(rotError,expectedQ.angleTo(current[i].q));
   }
   assert(posError<EPS&&rotError<.002,'stock normalized axis probe '+role+'/'+label+' '+posError+' '+rotError);
   const lengthDrift=max(joints.filter(n=>n!==byName[names.hips]).map(n=>n.position.distanceTo(local[joints.indexOf(n)].p)));
   assert(lengthDrift<EPS,'bone local length changed');
   probes.push({role,axis:label,posErrorM:posError,rotationErrorRad:rotError,localLengthDriftM:lengthDrift});
  }
 }
 reset();const delta=V(.25,-.2,.35);human.getNormalizedBoneNode('hips').position.add(delta);update();
 const rootError=max(snapshot(joints).map((b,i)=>b.p.distanceTo(neutral[i].p.clone().add(delta))));
 assert(rootError<EPS,'hips translation must not change skeletal offsets');
 const translatedSkin=skinCheck(delta);
 reset();const locomotion=V(2,0,-1);carrier.position.copy(locomotion);update();
 const locomotionError=max(snapshot(joints).map((b,i)=>b.p.distanceTo(neutral[i].p.clone().add(locomotion))));
 assert(locomotionError<EPS,'separate scene locomotion error');const locomotionSkin=skinCheck(locomotion);
 carrier.position.set(0,0,0);reset();
 const hip=byName[names.hips].getWorldPosition(V()),foot=byName[names.leftFoot].getWorldPosition(V());
 const armAngles={};
 for(const s of ['left','right']){
  const a=byName[names[s+'UpperArm']].getWorldPosition(V()),b=byName[names[s+'LowerArm']].getWorldPosition(V());
  armAngles[s]=Math.asin(Math.abs(b.y-a.y)/b.distanceTo(a))*180/Math.PI;
 }
 const status={rig:key,rigSha:c.rigSha,cacheSha:pin,skinJoints:joints.length,mappedRoles:Object.keys(names).length,requiredRoles:required.length,cacheLandmarkMaxM:cacheError,identityMaxM:id,hipsHeightM:hip.y,ankleHeightM:foot.y,armAngleFromHorizontalDeg:armAngles,stockProbes:probes,rootTranslationMaxM:rootError,sceneLocomotionMaxM:locomotionError,neutralSkin,translatedSkin,locomotionSkin,fullVRMConformance:'OPEN: native A-pose, not T-pose calibrated; fingers/expressions/export not qualified',ART:'OPEN',status:'STRUCTURE_AND_STOCK_AXIS_PROBES_PASS'};
 fs.writeFileSync(OUT+'/'+key+'.json',JSON.stringify(status,null,2));
 console.log(key,status.status,'axis probes',probes.length,'arm angles',armAngles);
 return status;
}
const results=Object.entries(pins).map(([key,pin])=>run(key,pin));
const report={head:process.env.EXPECTED_SHA,stage:'RIG-CONTRACT/R1',scope:'real GLB base skin, explicit VRM role mapping, stock VRMHumanoid normalization and controlled axes; no real animation or T-pose calibration',three:THREE.REVISION,vrmCore:'3.4.2',results,ART:'OPEN',production:'BLOCKED'};
fs.writeFileSync(OUT+'/report.json',JSON.stringify(report,null,2));
