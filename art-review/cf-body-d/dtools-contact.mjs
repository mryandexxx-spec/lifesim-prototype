// Fixed world foot anchors + pelvis trajectory. Uses unchanged D-TOOLS/2 upstream LimbSolver bridge.
// Geometry-derived placement, no profile-specific corrections. A sampled feasibility experiment.
const legs=['L','R'].map(s=>['upperleg01.'+s,'lowerleg01.'+s,'foot.'+s].map(idx));
const smooth=t=>t*t*(3-2*t);
const lerp=(a,b,t)=>a+(b-a)*t;
const all={};let cases=0;
for(const target of targets){
 const rest=target.rest,tr=world(rest),skin=target.skin, floor=target.floor;
 const forward=Math.sign(tr[idx('toe1-1.L')].p[2]-tr[idx('foot.L')].p[2]);assert(forward===1,'canonical forward +Z expected');
 const cx=0,cz=-.04,hw=.26,hd=.21,front=cz+hd;
 const out={};
 function pose(t,y,z,anchors){
  const f=t*16,k=Math.min(15,Math.floor(f)),a=f-k;
  const l=rest.map((b,i)=>({p:[...b.p],r:q.slerp([0,0,0,1],target.source[k][i].r,target.source[k+1][i].r,a)}));
  l[0].p=[rest[0].p[0],y,z];let maxAnchor=0;
  for(let i=0;i<legs.length;i++){
   const [h,k,e]=legs[i];let w=world(l),origin=w[h].p,A=dist(origin,w[k].p),B=dist(w[k].p,w[e].p);
   const restPole=sub(tr[k].p,tr[h].p),restDir=norm(sub(tr[e].p,tr[h].p)),perp=norm(sub(restPole,mul(restDir,dot(restPole,restDir))));
   const pole=v.lerp([0,0,0],perp,[0,0,1],smooth(Math.min(1,t/.4)));
   const s=solve(A,B,sub(anchors[i],origin),pole);
   aim(l,h,k,s.mid);aim(l,k,e,sub(s.end,s.mid));w=world(l);
   l[e].r=q.normalize([0,0,0,1],qr(inv(w[parents[e]].r),tr[e].r));w=world(l);
   maxAnchor=Math.max(maxAnchor,dist(w[e].p,anchors[i]));
  }
  return {l,w:world(l),maxAnchor};
 }
 // Real LBS: lower-body vertices in neutral-selected set, not joint proxies.
 function surface(w,top){
  let minY=Infinity,insideMin=Infinity,seatVertices=0,underSeat=0;
  for(let n=0;n<skin.v.length;n++){
   let x=0,y=0,z=0;
   for(let k=0;k<4;k++){
    const a=skin.ww[n][k];if(a===0)continue;const b=w[skin.wi[n][k]],r=rot(skin.local[n][k],b.r);
    x+=(r[0]+b.p[0])*a;y+=(r[1]+b.p[1])*a;z+=(r[2]+b.p[2])*a;
   }
   minY=Math.min(minY,y);
   if(Math.abs(x-cx)<=hw&&Math.abs(z-cz)<=hd){insideMin=Math.min(insideMin,y);if(y<top)underSeat++;if(y>top-.04&&y<top)seatVertices++;}
  }
  return {minY,insideMin:Number.isFinite(insideMin)?insideMin:null,seatVertices,underSeat};
 }
 for(const height of [.38,.43,.48]){
  const top=floor+height;
  const slabVertices=skin.v.filter(v=>v[1]>=top-.05&&v[1]<=top+.02);assert(slabVertices.length>0);
  // Stand entirely in front of the chair slab before starting the sit motion.
  const shift=front+.035-Math.min(...slabVertices.map(v=>v[2]));
  const startY=rest[0].p[1],startZ=rest[0].p[2]+shift;
  const anchors=legs.map(([h,k,e])=>add(tr[e].p,[0,0,shift]));
  // Root target aligns seat with rear pelvis, using actual neutral posterior skin.
  const root=rest[0].p,region=skin.v.filter(v=>Math.abs(v[0]-root[0])<.21&&v[1]>root[1]-.24&&v[1]<root[1]+.04&&v[2]<root[2]-.025);
  assert(region.length>20);
  const back=Math.min(...region.map(v=>v[2])),endZ=cz+(root[2]-back)*.55;
  // Find endpoint by generic root-height search against actual skinned chair footprint.
  let best=null;
  for(let i=0;i<=40;i++){
   const y=top+.035+i*.005, a=pose(1,y,endZ,anchors),s=surface(a.w,top);
   if(s.insideMin===null)continue;
   const score=Math.abs(s.insideMin-top-.002)+10*Math.max(0,top-s.insideMin)+10*Math.max(0,floor-s.minY)+4*a.maxAnchor;
   if(best===null||score<best.score)best={y,score,s};
  }
  assert(best,'seat region absent');
  // Refine only root height from constraints; same procedure for every morphology.
  const coarse=best.y;
  for(let i=-10;i<=10;i++){
   const y=coarse+i*.0005,a=pose(1,y,endZ,anchors),s=surface(a.w,top);if(s.insideMin===null)continue;
   const score=Math.abs(s.insideMin-top-.002)+10*Math.max(0,top-s.insideMin)+10*Math.max(0,floor-s.minY)+4*a.maxAnchor;
   if(score<best.score)best={y,score,s};
  }
  const frames=[],metrics=[];
  for(let i=0;i<=32;i++){
   const t=i/32,u=smooth(t);
   // Move hips back while still above the seat; descend continuously. Feet remain anchored.
   const z=lerp(startZ,endZ,smooth(Math.min(1,t/.8))),y=lerp(startY,best.y,u);
   let a=pose(t,y,z,anchors),s=surface(a.w,top);
   // Bounded vertical clearance correction, never moves the fixture or feet.
   // Report any unreachable constraints instead of changing the anchors.
   let lift=0;
   if(i>0&&i<32&&s.insideMin!==null&&s.insideMin<top+.002){
    for(let k=0;k<12;k++){
     lift+=.005;const b=pose(t,y+lift,z,anchors),ss=surface(b.w,top);
     if(ss.insideMin===null||ss.insideMin>=top+.002){a=b;s=ss;break;}
    }
   }
   frames.push(a.l);metrics.push({t,floorMin:s.minY-floor,seatMin:s.insideMin===null?null:s.insideMin-top,seatVertices:s.seatVertices,underSeat:s.underSeat,anchorError:a.maxAnchor,lift});
  }
  const id='contact_seat_'+Math.round(height*100);
  out[id]={height,seatCenter:[cx,cz],halfSize:[hw,hd],anchors,shift,endY:best.y,endZ,frames,metrics};
  cases++;console.log(target.key,id,JSON.stringify({floor:Math.min(...metrics.map(m=>m.floorMin)),anchor:Math.max(...metrics.map(m=>m.anchorError)),seatVertices:Math.max(...metrics.map(m=>m.seatVertices)),end:metrics.at(-1)}));
 }
 all[target.key]=out;
}
assert.equal(cases,18);
fs.mkdirSync('contact-out',{recursive:true});fs.writeFileSync('contact-out/solved.json',JSON.stringify(all));
