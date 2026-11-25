// Exact upstream ossos retarget + LimbSolver, semantic adapter only; no profile angle tables.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {vec3 as v,quat as q,mat3} from 'gl-matrix';
import Armature from './src/armature/Armature';
import Retarget from './src/animation/Retarget';
import {IKChain} from './src/ikrig/rigs/IKChain';
import LimbSolver from './src/ikrig/solvers/LimbSolver';
const input=JSON.parse(fs.readFileSync('anim-tools-out/input.json'));
const dir='anim-tools-out/';
const I=[0,0,0,1],add=(a,b)=>v.add([],a,b),sub=(a,b)=>v.sub([],a,b),mul=(a,k)=>v.scale([],a,k),norm=a=>v.normalize([],a),cross=(a,b)=>v.cross([],a,b),rot=(a,b)=>v.transformQuat([],a,b),qr=(a,b)=>q.mul([],a,b),inv=a=>q.invert([],a),dist=v.distance,len=v.length,dot=v.dot;
const required=['hip','head','upperarm_l','upperarm_r','forearm_l','forearm_r','hand_l','hand_r','thigh_l','thigh_r','shin_l','shin_r','foot_l','foot_r'];
function roles(names,parents){
 const candidates={};
 for(const [i,raw] of names.entries()){
  let a=raw.toLowerCase().split(':').at(-1),side=/left|[._-]l$/.test(a)?'l':/right|[._-]r$/.test(a)?'r':'';
  let n=a.replace(/left|right/g,'').replace(/[._-][lr]$/,'').replace(/[^a-z0-9]/g,'');
  if(/twist|roll|end|tip|helper|ik|target/.test(n))continue;
  let k=null,rank=0;
  if(side){
   if(/^(clavicle|collar)(01|1)?$/.test(n))k='shoulder';
   else if(/^(upperarm|arm)(01|1)?$/.test(n))k='upperarm';
   else if(/^(lowerarm|forearm)(01|1)?$/.test(n))k='forearm';
   else if(/^(wrist|hand)(01|1)?$/.test(n))k='hand';
   else if(/^(upperleg|upleg|thigh)(01|1)?$/.test(n))k='thigh';
   else if(/^(lowerleg|leg|shin|calf)(01|1)?$/.test(n))k='shin';
   else if(/^(foot|ankle)(01|1)?$/.test(n))k='foot';
   if(k)k+='_'+side;
  }else{
   if(/^(hip|hips|pelvis)(01|1)?$/.test(n))k='hip';
   else if(/^head(01|1)?$/.test(n))k='head';
   else if(/^neck(01|1)?$/.test(n))k='neck';
   else if(/^(spine[0-9]*|chest|upperchest)$/.test(n))k='spine_'+i;
  }
  if(k)(candidates[k]??=[]).push({i,raw,rank});
 }
 const map={};for(const [k,c] of Object.entries(candidates))if(c.length===1)map[k]=c[0].i;
 // Native D skeleton has a central pelvis at root, with bilateral pelvis branches and lumbar branch.
 // UAL has an independent ground root and a central pelvis child. Validate topology, not name guesses.
 if(map.hip===undefined){
  const root=names.indexOf('root'),left=names.indexOf('pelvis.L'),right=names.indexOf('pelvis.R'),lumbar=names.indexOf('spine05');
  if(root>=0&&parents[root]===-1&&[left,right,lumbar].every(i=>i>=0&&parents[i]===root)){
   map.hip=root;candidates.hip=[{i:root,raw:names[root],evidence:'common parent of left/right pelvis and lumbar chain'}];
  }
 }
 return {map,candidates,missing:required.filter(k=>map[k]===undefined)};
}
function alias(r){return r.names.map((_,i)=>{
 const k=Object.keys(r.roles.map).find(k=>r.roles.map[k]===i);if(!k)return 'aux'+i;
 if(k.startsWith('spine_'))return 'spine'+i;
 const [n,s]=k.split('_');return n+(s?'_'+s:'');
});}
function world(r,l){
 const w=[];for(let i=0;i<l.length;i++){const p=r.parents[i],b=l[i];w.push(p<0?{p:[...b.p],r:[...b.r]}:{p:add(w[p].p,rot(b.p,w[p].r)),r:qr(w[p].r,b.r)});}return w;
}
function arm(r,names){const a=new Armature();r.rest.forEach((b,i)=>a.addBone(names[i],r.parents[i],b.r,b.p));return a.bind();}
function basis(r){const w=world(r,r.rest),m=r.roles.map,x=norm(sub(w[m.upperarm_l].p,w[m.upperarm_r].p)),y0=norm(sub(w[m.head].p,w[m.hip].p)),z=norm(cross(x,y0)),y=norm(cross(z,x));assert(len(z)>.9);return q.fromMat3([],mat3.fromValues(...x,...y,...z));}
function align(s,t){const a=qr(basis(t),inv(basis(s)));const change=ls=>ls.map((b,i)=>s.parents[i]<0?{p:rot(b.p,a),r:qr(a,b.r)}:b);return {...s,rest:change(s.rest),clips:Object.fromEntries(Object.entries(s.clips).map(([k,c])=>[k,{...c,frames:c.frames.map(change)}]))};}
function engine(s,t,semantic){
 const ret=new Retarget();ret.setClipArmature(arm(s,semantic?alias(s):s.names));ret.setTargetArmature(arm(t,semantic?alias(t):t.names));ret.bind();return ret;
}
const getLinks=(ret,s,t)=>Object.fromEntries([...ret.map].map(([k,b])=>[k,{source:s.names[b.fromIndex],target:t.names[b.toIndex]}]));
function solved(ret,s,t,f){
 const sp=ret.getClipPose(),tp=ret.getTargetPose();
 for(let i=0;i<f.length;i++){v.copy(sp.bones[i].local.pos,f[i].p);q.copy(sp.bones[i].local.rot,f[i].r);}
 for(let i=0;i<t.rest.length;i++){v.copy(tp.bones[i].local.pos,t.rest[i].p);q.copy(tp.bones[i].local.rot,t.rest[i].r);}
 sp.updateWorld(true);ret.applyRetarget();
 // The upstream hip translation assumes a root hip. Preserve target bind and convert the normalized source pelvis displacement through the actual target parent.
 const a=t.roles.map.hip,b=s.roles.map.hip,sw=world(s,f),sr=world(s,s.rest),tr=world(t,t.rest);
 const l=tp.bones.map((bone,i)=>({p:[...t.rest[i].p],r:Array.from(q.normalize([],bone.local.rot))}));
 const scale=dist(tr[t.roles.map.head].p,tr[a].p)/dist(sr[s.roles.map.head].p,sr[b].p);
 const d=mul(sub(sw[b].p,sr[b].p),scale),w=world(t,l),p=t.parents[a];
 l[a].p=p<0?add(tr[a].p,d):rot(sub(add(tr[a].p,d),w[p].p),inv(w[p].r));
 return l;
}
function aim(t,l,a,b,want){let w=world(t,l);const now=norm(sub(w[b].p,w[a].p)),swing=q.rotationTo([],now,norm(want)),p=t.parents[a];l[a].r=q.normalize([],qr(p<0?I:inv(w[p].r),qr(swing,w[a].r)));}
function chainSolve(A,B,goal,pole){
 const d=len(goal);if(d<1e-8)return null;
 const dir=norm(goal),radius=Math.max(Math.abs(A-B)+1e-5,Math.min(A+B-1e-5,d)),g=mul(dir,radius);
 const po=sub(pole,mul(dir,dot(pole,dir)));if(len(po)<1e-5)return null;
 const ar=new Armature();ar.addBone('a',-1,I,[0,0,0]);ar.addBone('b',0,I,[0,A,0]);ar.addBone('e',1,I,[0,B,0]);ar.bind();
 const pose=ar.newPose(true),chain=new IKChain(['a','b'],ar);chain.bindAltDirections(pose,[0,1,0],[0,0,1]);new LimbSolver().setTargetPos(g,norm(po)).resolve(chain,pose);pose.updateWorld();
 const mid=Array.from(pose.bones[1].world.pos),end=Array.from(pose.bones[2].world.pos);assert(dist(end,g)<.0005);
 return {mid,end,clamp:Math.abs(radius-d)};
}
function withIK(s,t,f,l){
 const sw=world(s,f),bw=world(t,l),out=structuredClone(l),metrics=[];
 for(const side of ['l','r'])for(const chain of [['upperarm','forearm','hand'],['thigh','shin','foot']]){
  const roles=chain.map(k=>k+'_'+side),[a,b,e]=roles.map(k=>t.roles.map[k]),[sa,sb,se]=roles.map(k=>s.roles.map[k]);
  const w=world(t,out),A=dist(w[a].p,w[b].p),B=dist(w[b].p,w[e].p),S=dist(sw[sa].p,sw[sb].p)+dist(sw[sb].p,sw[se].p);
  const goal=mul(sub(sw[se].p,sw[sa].p),(A+B)/S),pole=sub(sw[sb].p,sw[sa].p),sol=chainSolve(A,B,goal,pole);
  if(!sol){metrics.push({chain:roles[0],skipped:true});continue;}
  const before=dist(sub(bw[e].p,bw[a].p),goal);aim(t,out,a,b,sol.mid);aim(t,out,b,e,sub(sol.end,sol.mid));
  const w2=world(t,out);out[e].r=q.normalize([],qr(inv(w2[t.parents[e]].r),bw[e].r));
  const w3=world(t,out),actual=sub(w3[e].p,w3[a].p);
  metrics.push({chain:roles[0],before,after:dist(actual,goal),clamp:sol.clamp,projection:dist(actual,sol.end)});
 }
 return {out,metrics};
}
const all=[...Object.values(input.sources),...Object.values(input.targets)];for(const r of all)r.roles=roles(r.names,r.parents);
const inventory={sources:Object.fromEntries(Object.entries(input.sources).map(([k,r])=>[k,r.roles])),targets:Object.fromEntries(Object.entries(input.targets).map(([k,r])=>[k,r.roles]))};
fs.writeFileSync(dir+'semantic-inventory.json',JSON.stringify(inventory,null,2));
assert(all.every(r=>r.roles.missing.length===0),'Unmapped or ambiguous required semantic role; inspect inventory, no guessed matches.');
const result={},summary={};for(const [key,t] of Object.entries(input.targets)){
 result[key]={};summary[key]={};
 for(const [sk,raw] of Object.entries(input.sources)){
  const s=align(raw,t),automatic=engine(s,t,false),semantic=engine(s,t,true);
  const links=getLinks(semantic,s,t),rawLinks=getLinks(automatic,s,t);
  for(const role of required){assert.equal(links[role]?.target,t.names[t.roles.map[role]],role);assert.equal(links[role]?.source,s.names[s.roles.map[role]],role);}
  for(const [name,c] of Object.entries(s.clips)){
   const variants={retarget:[],relative_ik:[]},rows=[];
   const atRest=solved(semantic,s,t,s.rest);
   assert(atRest.every((b,i)=>dist(b.p,t.rest[i].p)<.0001&&Math.abs(q.dot(b.r,t.rest[i].r))>1-1e-5),'Rest replay');
   for(const f of c.frames){const l=solved(semantic,s,t,f),ik=withIK(s,t,f,l);variants.retarget.push(l);variants.relative_ik.push(ik.out);rows.push(...ik.metrics);}
   const valid=rows.filter(r=>!r.skipped);
   assert(variants.retarget.every(f=>f.every(b=>[...b.p,...b.r].every(Number.isFinite))));
   result[key][name]={duration:c.duration,variants};
   const motion=(f,i)=>Math.max(...f.map(x=>1-Math.abs(q.dot(x[i].r,f[0][i].r))));
   summary[key][name]={source:sk,rawLinks,semanticLinks:links,frames:c.frames.length,unmappedTargetBones:t.names.filter(n=>!Object.values(links).some(b=>b.target===n)),ikSamples:valid.length,skipped:rows.length-valid.length,meanBefore:valid.reduce((a,b)=>a+b.before,0)/valid.length,meanAfter:valid.reduce((a,b)=>a+b.after,0)/valid.length,maxProjection:Math.max(...valid.map(r=>r.projection)),maxClamp:Math.max(...valid.map(r=>r.clamp)),armMotion:['upperarm_l','upperarm_r','forearm_l','forearm_r'].map(k=>motion(variants.retarget,t.roles.map[k]))};
  }
 }
}
fs.writeFileSync(dir+'solved.json',JSON.stringify(result));fs.writeFileSync(dir+'comparison.json',JSON.stringify({profiles:summary,scope:'Actual ossos raw mapping coverage vs semantic retarget, relative limb IK trial; no contact or finger certification; ART OPEN'},null,2));
console.log('Completed actual source retarget for',Object.keys(result).length,'diagnostic profiles');
