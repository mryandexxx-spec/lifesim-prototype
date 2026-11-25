// D-TOOLS/2: apply upstream reduced-chain solution to actual 104-bone hierarchy.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {vec3 as v,quat as q} from 'gl-matrix';
import Armature from './src/armature/Armature';
import {IKChain} from './src/ikrig/rigs/IKChain';
import LimbSolver from './src/ikrig/solvers/LimbSolver';
const {labels,parents,sources,targets}=JSON.parse(fs.readFileSync('full-input/poses.json'));
const add=(a,b)=>v.add([0,0,0],a,b),sub=(a,b)=>v.sub([0,0,0],a,b),mul=(a,k)=>v.scale([0,0,0],a,k),norm=a=>v.normalize([0,0,0],a),dot=v.dot,len=v.length,dist=v.distance,qr=(a,b)=>q.mul([0,0,0,1],a,b),inv=a=>q.invert([0,0,0,1],a),rot=(a,r)=>v.transformQuat([0,0,0],a,r),ident=[0,0,0,1];
const idx=n=>{const i=labels.indexOf(n);assert(i>=0,n);return i};
const chains=['L','R'].flatMap(s=>[['upperarm01.'+s,'lowerarm01.'+s,'wrist.'+s],['upperleg01.'+s,'lowerleg01.'+s,'foot.'+s]]).map(a=>a.map(idx));
function world(l){const w=[];for(let i=0;i<l.length;i++){const p=parents[i],b=l[i];w.push(p<0?{p:[...b.p],r:[...b.r]}:{p:add(w[p].p,rot(b.p,w[p].r)),r:qr(w[p].r,b.r)})}return w;}
function canonical(A,B){
 const arm=new Armature();arm.addBone('a',-1,ident,[0,0,0]);arm.addBone('b',0,ident,[0,A,0]);arm.addBone('e',1,ident,[0,B,0]);arm.bind();const pose=arm.newPose(true),chain=new IKChain(['a','b'],arm);chain.bindAltDirections(pose,[0,1,0],[0,0,1]);return {pose,chain,solver:new LimbSolver()};
}
function solve(A,B,goal,pole){
 const d=len(goal),dir=d>1e-8?norm(goal):[0,1,0],radius=Math.min(A+B-1e-5,Math.max(Math.abs(A-B)+1e-5,d)),g=mul(dir,radius);
 let po=sub(pole,mul(dir,dot(pole,dir)));
 if(len(po)<1e-5){const a=Math.abs(dir[2])<.9?[0,0,1]:[1,0,0];po=sub(a,mul(dir,dot(a,dir)));}
 const {pose,chain,solver}=canonical(A,B);solver.setTargetPos(g,norm(po)).resolve(chain,pose);pose.updateWorld();
 const mid=Array.from(pose.bones[1].world.pos),end=Array.from(pose.bones[2].world.pos);assert(dist(end,g)<.0002);return {mid,end,clamp:Math.abs(radius-d)};
}
function aim(l,i,child,desired){
 const w=world(l),old=norm(sub(w[child].p,w[i].p)),want=norm(desired);
 const swing=q.rotationTo([0,0,0,1],old,want),p=parents[i],wr=qr(swing,w[i].r);l[i].r=q.normalize([0,0,0,1],qr(p<0?ident:inv(w[p].r),wr));
}
const results={};let total=0;
for(const target of targets){
 const src=sources[target.sex],sr=world(src.rest),tr=world(target.rest),clips={},metrics={};
 for(const [clip,frames] of Object.entries(src.clips)){
  const baseline=[],corrected=[],m=[];
  for(let f=0;f<frames.length;f++){
   const sl=frames[f],sw=world(sl),t=f/(frames.length-1);
   // World/rest correction for all explicit joint labels; keep target translations.
   const l=target.rest.map((b,i)=>{
    const p=parents[i],r=qr(qr(qr(p<0?ident:inv(tr[p].r),p<0?ident:sr[p].r),sl[i].r),qr(inv(sr[i].r),tr[i].r));
    return {p:i===0?add(b.p,mul(sub(sl[i].p,src.rest[i].p),target.scale)):[...b.p],r:q.normalize([0,0,0,1],r)};
   });
   if(f===0){for(let i=0;i<l.length;i++){assert(dist(l[i].p,target.rest[i].p)<1e-6);assert(Math.abs(q.dot(l[i].r,target.rest[i].r))>1-1e-6);}}
   baseline.push(structuredClone(l));const bw=world(l);
   // Smoothly introduce IK, preserving neutral exactly. This is a relative wrist/ankle target, not a prop anchor.
   const u=Math.min(1,t/.35),weight=u*u*(3-2*u);
   for(const [a,b,e] of chains){
    const current=world(l),origin=current[a].p,baseEnd=sub(bw[e].p,bw[a].p),sourceEnd=sub(sw[e].p,sw[a].p),goal=v.lerp([0,0,0],baseEnd,sourceEnd,weight);
    const A=dist(current[a].p,current[b].p),B=dist(current[b].p,current[e].p);
    const before=dist(baseEnd,goal);
    if(f===0){m.push({frame:f,chain:labels[a],baseline:before,corrected:0,clamp:0,projection:0});continue;}
    const s=solve(A,B,goal,sub(sw[b].p,sw[a].p));
    aim(l,a,b,s.mid);let w=world(l);aim(l,b,e,sub(s.end,s.mid));w=world(l);
    // Preserve baseline end-joint world orientation; child finger/toe local pose unchanged.
    l[e].r=q.normalize([0,0,0,1],qr(inv(w[parents[e]].r),bw[e].r));w=world(l);
    const end=sub(w[e].p,origin),projection=dist(end,s.end);
    assert(projection<.0005,JSON.stringify({target:target.key,clip,f,chain:labels[a],projection}));
    assert(Math.abs(dist(w[a].p,w[b].p)-A)<.0001&&Math.abs(dist(w[b].p,w[e].p)-B)<.0001);
    m.push({frame:f,chain:labels[a],baseline:before,corrected:dist(end,goal),clamp:s.clamp,projection});
   }
   corrected.push(structuredClone(l));
  }
  clips['base_'+clip]=baseline;clips['ik_'+clip]=corrected;metrics[clip]=m;total+=m.length;
 }
 results[target.key]={clips,metrics};
}
assert.equal(total,6*2*17*4);
fs.mkdirSync('full-out',{recursive:true});fs.writeFileSync('full-out/solved.json',JSON.stringify(results));
const rows=Object.values(results).flatMap(r=>Object.values(r.metrics).flat()),feasible=rows.filter(r=>r.clamp<1e-7),mean=(a,k)=>a.reduce((s,x)=>s+x[k],0)/a.length;
const summary={scope:'Full 104-bone rotation projection; relative limb goals only; no contact guarantee.',samples:total,feasible:feasible.length,baselineMeanM:mean(feasible,'baseline'),candidateMeanM:mean(feasible,'corrected'),maxProjectionM:Math.max(...rows.map(r=>r.projection))};
fs.writeFileSync('full-out/projection.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));assert(summary.candidateMeanM<summary.baselineMeanM&&summary.maxProjectionM<.0005);
