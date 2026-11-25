// D-TOOLS/4: fixed world fingertip surface landmark, not a simulated grasp.
// Use existing upstream ossos bridge; no body-shape-specific offsets or moving target.
const smooth=t=>t*t*(3-2*t);
const [a,b,e]=['upperarm01.R','lowerarm01.R','wrist.R'].map(idx);
const clav=idx('clavicle.R');
const descendants=new Set([clav]);for(let i=clav+1;i<labels.length;i++)if(descendants.has(parents[i]))descendants.add(i);
const fixtures=[
 {id:'near',point:[-.30,1.15,.31],mustReach:true},
 {id:'higher',point:[-.32,1.35,.34],mustReach:null},
 {id:'far',point:[-.30,1.15,1.20],mustReach:false}
];
const all={},decisions={};
let accepted=0,rejected=0;
for(const target of targets){
 const rest=target.rest,tr=world(rest),point=target.landmark;
 function skin(w){
  let result=[0,0,0];for(let k=0;k<4;k++){const a=point.ww[k];if(!a)continue;const bone=w[point.wi[k]];result=add(result,mul(add(bone.p,rot(point.local[k],bone.r)),a));}return result;
 }
 assert(dist(skin(tr),point.neutral)<1e-6);
 const out={},row={};
 for(const fixture of fixtures){
  const frames=[],metrics=[];
  let failed=false;
  for(let i=0;i<=64;i++){
   const t=i/64,u=smooth(Math.min(1,t/.7)),f=u*16,k=Math.min(15,Math.floor(f)),s=f-k;
   // Use authored source arm/finger motion as seed; keep entire non-arm support unchanged.
   const l=rest.map((r,n)=>({p:[...r.p],r:descendants.has(n)?q.slerp([0,0,0,1],target.source[k][n].r,target.source[k+1][n].r,s):[...r.r]}));
   const bw=world(l),basePoint=skin(bw),goal=v.lerp([0,0,0],basePoint,fixture.point,u);
   const offset=sub(basePoint,bw[e].p),wristGoal=sub(goal,offset),origin=bw[a].p;
   const A=dist(origin,bw[b].p),B=dist(bw[b].p,bw[e].p);
   let pole=sub(bw[b].p,origin);
   if(i>0){
    const ik=solve(A,B,sub(wristGoal,origin),pole);
    if(ik.clamp>.001){failed=true;metrics.push({t,clampM:ik.clamp,reason:'outside-arm-reach'});break;}
    aim(l,a,b,ik.mid);aim(l,b,e,sub(ik.end,ik.mid));
    let now=world(l);l[e].r=q.normalize([0,0,0,1],qr(inv(now[parents[e]].r),bw[e].r));
   }
   const w=world(l),actual=skin(w),error=dist(actual,goal);
   assert(error<.001,JSON.stringify({target:target.key,fixture:fixture.id,t,error}));
   assert(Math.abs(dist(w[a].p,w[b].p)-A)<.0001&&Math.abs(dist(w[b].p,w[e].p)-B)<.0001);
   for(const side of ['L','R'])assert(dist(w[idx('foot.'+side)].p,tr[idx('foot.'+side)].p)<1e-7);
   frames.push(l);metrics.push({t,goal,actual,errorM:error,fixtureErrorM:dist(actual,fixture.point)});
  }
  const status=failed?'reject':'candidate';row[fixture.id]={status,fixture:fixture.point,metrics,reason:failed?'outside-arm-reach':'sampled landmark candidate only'};
  if(fixture.mustReach!==null)assert.equal(!failed,fixture.mustReach,JSON.stringify({target:target.key,fixture:fixture.id,metrics:metrics.at(-1)}));
  if(failed){rejected++;continue;}
  accepted++;
  out['world_reach_'+fixture.id]={frames,metrics,fixture:fixture.point,landmark:point.neutral,holdFrom:.7};
 }
 all[target.key]=out;decisions[target.key]=row;
}
assert(accepted>=6&&rejected>=6);
fs.mkdirSync('reach-out',{recursive:true});fs.writeFileSync('reach-out/solved.json',JSON.stringify(all));fs.writeFileSync('reach-out/decisions.json',JSON.stringify(decisions));
console.log(JSON.stringify({accepted,rejected,scope:'Fixed world skin landmark; no grip/prop collision or body collision claim'}));
