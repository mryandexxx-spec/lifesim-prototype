// Isolated D-TOOLS/1: upstream LimbSolver vs source segment-direction transfer.
// Actual D1 held-out joint proportions and D4/R1 source motion. No skin/contact certification.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {vec3 as v, quat as q} from 'gl-matrix';
import Armature from './src/armature/Armature';
import {IKChain} from './src/ikrig/rigs/IKChain';
import LimbSolver from './src/ikrig/solvers/LimbSolver';
const hash=b=>createHash('sha256').update(b).digest('hex');
const contract=JSON.parse(fs.readFileSync('d1/rig-contract.json'));
const {labels,parents}=contract;
assert.equal(labels.length,104);
assert.equal(new Set(labels).size,104);
assert.equal(parents.length,104);
const add=(a,b)=>v.add([0,0,0],a,b), sub=(a,b)=>v.sub([0,0,0],a,b), mul=(a,k)=>v.scale([0,0,0],a,k), norm=a=>v.normalize([0,0,0],a), dot=v.dot, len=v.length, dist=v.distance;
const pos=m=>[m[0][3],m[1][3],m[2][3]];
const get=(arr,name)=>{const i=labels.indexOf(name);assert(i>=0,name);return arr[i]};
const pins={male:'b54b0ad210d30ea27a93bdc90abe0656d1cc1af683322001a94a8ce6cfa22966',female:'5c275fe82f3bae7174f91bb27cdc47efbb3507b84731c5fac2b6df02c0b7b214'};
function readGLB(sex){
 const buf=fs.readFileSync('r1/d4-candidates/'+sex+'-grid_111.glb');assert.equal(hash(buf),pins[sex]);assert.equal(buf.toString('ascii',0,4),'glTF');
 const n=buf.readUInt32LE(12),j=JSON.parse(buf.toString('utf8',20,20+n)),bin=20+n+8;
 const nodes=j.skins[0].joints;assert.deepEqual(nodes.map(i=>j.nodes[i].name),labels);
 function accessor(i){
  const a=j.accessors[i],bv=j.bufferViews[a.bufferView],dim={SCALAR:1,VEC3:3,VEC4:4}[a.type];assert(dim&&a.componentType===5126&&!a.sparse&&bv.buffer===0);
  const stride=bv.byteStride??dim*4,off=bin+(bv.byteOffset??0)+(a.byteOffset??0);
  return Array.from({length:a.count},(_,k)=>Array.from({length:dim},(_,d)=>buf.readFloatLE(off+k*stride+4*d)));
 }
 return {j,nodes,accessor};
}
function sample(src,clip,t){
 const {j,nodes,accessor}=src;
 const l=nodes.map(i=>({p:[...(j.nodes[i].translation??[0,0,0])],r:[...(j.nodes[i].rotation??[0,0,0,1])]}));
 const anim=j.animations.find(a=>a.name===clip);assert(anim,clip);
 for(const c of anim.channels){
  const i=nodes.indexOf(c.target.node);assert(i>=0);
  const s=anim.samplers[c.sampler];assert.equal(s.interpolation??'LINEAR','LINEAR');
  const times=accessor(s.input).map(a=>a[0]),vals=accessor(s.output);assert(times.length>=2&&times.length===vals.length);
  const time=times[0]+t*(times.at(-1)-times[0]);
  let k=0;while(k<times.length-2&&time>times[k+1])k++;
  const a=(time-times[k])/(times[k+1]-times[k]);assert(Number.isFinite(a));
  if(c.target.path==='rotation')l[i].r=q.slerp([0,0,0,1],vals[k],vals[k+1],a);
  else {assert.equal(c.target.path,'translation');l[i].p=v.lerp([0,0,0],vals[k],vals[k+1],a);}
 }
 const w=[];
 for(let i=0;i<l.length;i++){const b=l[i],p=parents[i];w.push(p<0?b:{p:add(w[p].p,v.transformQuat([0,0,0],b.p,w[p].r)),r:q.mul([0,0,0,1],w[p].r,b.r)});}
 return w.map(b=>b.p);
}
const poleFor=(a,b,dir)=>{
 let pole=sub(a,mul(dir,dot(a,dir)));
 if(len(pole)<1e-5){const axis=Math.abs(dir[2])<.9?[0,0,1]:[1,0,0];pole=sub(axis,mul(dir,dot(axis,dir)));}
 return norm(pole);
};
function makeChain(A,B){
 // Canonical reduced chain has actual measured segment lengths, not authored offsets.
 const arm=new Armature();arm.addBone('a',-1,[0,0,0,1],[0,0,0]);arm.addBone('b',0,[0,0,0,1],[0,A,0]);arm.addBone('tip',1,[0,0,0,1],[0,B,0]);arm.bind();
 const pose=arm.newPose(true),chain=new IKChain(['a','b'],arm);
 chain.bindAltDirections(pose,[0,1,0],[0,0,1]);assert(Math.abs(chain.length-A-B)<1e-6);
 const solver=new LimbSolver();
 return {arm,pose,chain,solver};
}
function solve(c,target,pole,A,B){
 const d=len(target),dir=d>1e-8?norm(target):[0,1,0];
 const bounded=Math.min(A+B-1e-5,Math.max(Math.abs(A-B)+1e-5,d));
 const goal=mul(dir,bounded),start=performance.now();
 c.pose.setLocalRot(0,[0,0,0,1]);c.pose.setLocalRot(1,[0,0,0,1]);c.pose.updateWorld();
 c.solver.setTargetPos(goal,pole).resolve(c.chain,c.pose);c.pose.updateWorld();
 const ms=performance.now()-start;
 const end=Array.from(c.pose.bones[2].world.pos),mid=Array.from(c.pose.bones[1].world.pos);
 assert([...end,...mid].every(Number.isFinite));
 const err=dist(end,goal),lengthErr=Math.max(Math.abs(len(mid)-A),Math.abs(dist(mid,end)-B));
 const bend=dot(sub(mid,mul(dir,dot(mid,dir))),pole);
 return {err,requestedError:dist(end,target),clamp:Math.abs(d-bounded),lengthErr,bend,ms,end,mid};
}
const chains=['L','R'].flatMap(s=>[
 {names:['upperarm01.'+s,'lowerarm01.'+s,'wrist.'+s],clip:'reach_target',kind:'arm'},
 {names:['upperleg01.'+s,'lowerleg01.'+s,'foot.'+s],clip:'seat_hands_refined',kind:'leg'}]);
let rows=[],profileCount=0;const evidence={};
for(const sex of ['female','male']){
 const src=readGLB(sex), profiles=contract.sexes[sex].samples;
 assert.equal(profiles.length,81);
 // Three diagonal combinations are known D4 shapes; exclude them at every stature.
 const held=profiles.filter(p=>!['grid_000','grid_111','grid_222'].includes(p.grid));assert.equal(held.length,72);
 const source=new Map(chains.map(c=>[c.names[0],Array.from({length:17},(_,i)=>{
  const w=sample(src,c.clip,i/16);const [a,b,e]=c.names.map(n=>get(w,n));return {a:sub(b,a),b:sub(e,b)};
 })]));
 for(const p of held){
  profileCount++;
  const w=p.rest_world.map(pos),key=sex+'/'+p.grid+'/'+p.parameters.height_scale;
  for(const c of chains){
   const [a,b,e]=c.names.map(n=>get(w,n)),A=dist(a,b),B=dist(b,e);assert(A>.05&&B>.05);
   const ik=makeChain(A,B),frames=source.get(c.names[0]);
   for(let i=0;i<frames.length;i++){
    const f=frames[i],target=add(f.a,f.b);
    for(const offset of (i===16?[-.06,0,.06]:[0])){
     const goal=add(target,[0,offset,0]),dir=norm(goal),pole=poleFor(f.a,f.b,dir);
     // Comparator copies both source segment directions onto new measured lengths.
     const baseline=add(mul(norm(f.a),A),mul(norm(f.b),B));
     const s=solve(ik,goal,pole,A,B);
     rows.push({key,kind:c.kind,chain:c.names[0],frame:i,offset,baseline:dist(baseline,goal),...s});
    }
   }
  }
 }
}
assert.equal(profileCount,144);assert.equal(rows.length,144*4*19);
const feasible=rows.filter(r=>r.clamp<1e-7);
assert(feasible.length>1000);
const max=(a,k)=>Math.max(...a.map(r=>r[k])),mean=(a,k)=>a.reduce((s,r)=>s+r[k],0)/a.length;
const summary={scope:'Reduced two-bone skeleton test; not full 104-bone retarget, skin, chair contact, walk or browser certification.',upstream:'d1325d878f4875d0eafe42f8861a853263d57081',contractSha256:hash(fs.readFileSync('d1/rig-contract.json')),sourcePins:pins,profiles:profileCount,samples:rows.length,feasible:feasible.length,clamped:rows.length-feasible.length,baselineMeanM:mean(feasible,'baseline'),ossosMeanM:mean(feasible,'requestedError'),ossosMaxFeasibleM:max(feasible,'requestedError'),maxClampedTargetErrorM:max(rows,'err'),maxLengthErrorM:max(rows,'lengthErr'),minBendPoleM:Math.min(...rows.map(r=>r.bend)),meanSolverMs:mean(rows,'ms'),maxSolverMs:max(rows,'ms')};
summary.numericalPass=summary.maxClampedTargetErrorM<.0002&&summary.maxLengthErrorM<.00005&&summary.minBendPoleM>-.0002&&summary.ossosMeanM<summary.baselineMeanM;
fs.mkdirSync('d-tools-out',{recursive:true});fs.writeFileSync('d-tools-out/summary.json',JSON.stringify(summary,null,2));fs.writeFileSync('d-tools-out/rows.json',JSON.stringify(rows));console.log(JSON.stringify(summary,null,2));assert(summary.numericalPass,'Ossos candidate did not pass numerical gate');
