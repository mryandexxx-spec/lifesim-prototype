// Fixed world foot anchors + pelvis trajectory. Uses unchanged D-TOOLS/2 upstream LimbSolver bridge.
// Geometry-derived placement, no profile-specific corrections. A sampled feasibility experiment.
const legs=['L','R'].map(s=>['upperleg01.'+s,'lowerleg01.'+s,'foot.'+s].map(idx));
const smooth=t=>t*t*(3-2*t);
const lerp=(a,b,t)=>a+(b-a)*t;
// Clip an entire triangle to the four vertical planes of the fixed seat footprint.
// Minimum Y is attained at a vertex of the clipped polygon, including edge intersections.
function clippedMin(tri,x0,x1,z0,z1){
 let poly=tri;
 for(const [axis,bound,sign] of [[0,x0,1],[0,x1,-1],[2,z0,1],[2,z1,-1]]){
  const next=[];
  for(let i=0;i<poly.length;i++){
   const a=poly[i],b=poly[(i+1)%poly.length],da=sign*(a[axis]-bound),db=sign*(b[axis]-bound);
   if(da>=0)next.push(a);
   if((da>=0)!==(db>=0)){const t=da/(da-db);next.push([lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)]);}
  }
  poly=next;if(!poly.length)return Infinity;
 }
 return Math.min(...poly.map(a=>a[1]));
}
// Regression: a crossing triangle with no vertex in the footprint.
assert.equal(clippedMin([[-2,.2,0],[2,.2,0],[0,.2,2]],-.5,.5,-.5,.5),.2);
assert.equal(clippedMin([[2,0,2],[3,1,2],[2,2,3]],-.5,.5,-.5,.5),Infinity);
// Support is measured on the actual clipped surface, not a point/edge contact.
// Integrate projected area of triangles near the seat top, inside its interior.
function clipPoly(poly,axis,bound,sign){
 const out=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],da=sign*(a[axis]-bound),db=sign*(b[axis]-bound);
  if(da>=0)out.push(a);
  if((da>=0)!==(db>=0)){const t=da/(da-db);out.push([lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)]);}
 }
 return out;
}
function supportArea(tri,x0,x1,z0,z1,top){
 let poly=tri;
 for(const [axis,bound,sign] of [[0,x0,1],[0,x1,-1],[2,z0,1],[2,z1,-1],[1,top,-0+1],[1,top+.015,-1]]){
  poly=clipPoly(poly,axis,bound,sign);if(poly.length<3)return 0;
 }
 let a=0;for(let i=0;i<poly.length;i++){const b=poly[(i+1)%poly.length];a+=poly[i][0]*b[2]-b[0]*poly[i][2];}
 return Math.abs(a)*.5;
}
assert(Math.abs(supportArea([[0,.003,0],[.1,.003,0],[0,.003,.1]],-.2,.2,-.2,.2,0)-.005)<1e-10);
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
 // Real LBS: full body vertices and complete connected triangles, not joint proxies.
 function surface(w,top,measureSupport=false){
  let minY=Infinity,insideMin=Infinity,seatVertices=0,underSeat=0,vertexMin=Infinity,support=0;const positions=[];
  for(let n=0;n<skin.v.length;n++){
   let x=0,y=0,z=0;
   for(let k=0;k<4;k++){
    const a=skin.ww[n][k];if(a===0)continue;const b=w[skin.wi[n][k]],r=rot(skin.local[n][k],b.r);
    x+=(r[0]+b.p[0])*a;y+=(r[1]+b.p[1])*a;z+=(r[2]+b.p[2])*a;
   }
   positions.push([x,y,z]);minY=Math.min(minY,y);
   if(Math.abs(x-cx)<=hw&&Math.abs(z-cz)<=hd){insideMin=Math.min(insideMin,y);vertexMin=Math.min(vertexMin,y);if(y<top)underSeat++;if(y>top-.04&&y<top)seatVertices++;}
  }
  const x0=cx-hw,x1=cx+hw,z0=cz-hd,z1=cz+hd;
  for(const [i,j,k] of skin.faces){
   const a=positions[i],b=positions[j],c=positions[k];
   if(!measureSupport&&Math.min(a[1],b[1],c[1])>=insideMin)continue;
   if(Math.max(a[0],b[0],c[0])<x0||Math.min(a[0],b[0],c[0])>x1||Math.max(a[2],b[2],c[2])<z0||Math.min(a[2],b[2],c[2])>z1)continue;
   if(Math.min(a[1],b[1],c[1])<insideMin)insideMin=Math.min(insideMin,clippedMin([a,b,c],x0,x1,z0,z1));
   if(measureSupport&&Math.min(a[1],b[1],c[1])<=top+.015&&Math.max(a[1],b[1],c[1])>=top)support+=supportArea([a,b,c],x0+.025,x1-.025,z0+.025,z1-.025,top);
  }
  return {minY,insideMin:Number.isFinite(insideMin)?insideMin:null,seatVertices,underSeat,vertexMin:Number.isFinite(vertexMin)?vertexMin:null,support};
 }
 for(const height of [.38,.43,.48]){
  const top=floor+height;
  const slabVertices=skin.v.filter(v=>v[1]>=top-.05&&v[1]<=top+.02);assert(slabVertices.length>0);
  // Stand entirely in front of the chair slab before starting the sit motion.
  const minShift=front-Math.min(...slabVertices.map(v=>v[2]));
  const root=rest[0].p,region=skin.v.filter(v=>Math.abs(v[0]-root[0])<.21&&v[1]>root[1]-.24&&v[1]<root[1]+.04&&v[2]<root[2]-.025);
  assert(region.length>20);
  const back=Math.min(...region.map(v=>v[2])),nominalZ=cz+(root[2]-back)*.55;
  // Search a small set of feasible pre-contact stances and seated depth, shared for every profile.
  // All anchors are established BEFORE the clip starts; no sliding during contact.
  // Exact skin clearance is a hard constraint; support patch area prefers actual sitting over edge perching.
  let best=null;
    const evaluate=(y,z,shift,anchors)=>{
   const a=pose(1,y,z,anchors),s=surface(a.w,top,true);
   if(s.insideMin===null||s.vertexMin===null)return;
   const gap=s.insideMin-top,vgap=s.vertexMin-top;
   const violation=Math.max(0,.001-gap)+Math.max(0,vgap-.009)+Math.max(0,floor-s.minY)+a.maxAnchor;
   const score=100*violation+Math.abs(gap-.003)+.035*Math.abs(z-nominalZ)+.015*Math.abs(shift-minShift-.035)-.7*Math.min(s.support,.018);
   const r={y,z,shift,anchors,score,violation,s};
   if(best===null||score<best.score)best=r;
   return r;
  };
  for(const clearance of [.015,.035,.065]){
   const shift=minShift+clearance,anchors=legs.map(([h,k,e])=>add(tr[e].p,[0,0,shift]));
   for(const depth of [-.08,-.04,0,.04]){
    const z=nominalZ+depth;
    let coarse=null;
    for(let i=0;i<=40;i++){
     const y=top+.035+i*.005,r=evaluate(y,z,shift,anchors);
     if(r&&(!coarse||r.score<coarse.score))coarse=r;
    }
    if(coarse)for(let i=-10;i<=10;i++)evaluate(coarse.y+i*.0005,z,shift,anchors);
   }
  }
  assert(best,'seat region absent');
  const {shift,anchors}=best,endZ=best.z,startY=root[1],startZ=root[2]+shift;
  console.log('endpoint-search',target.key,height,JSON.stringify({gap:best.s.insideMin-top,vertexGap:best.s.vertexMin-top,supportM2:best.s.support,violation:best.violation,shift,endZ}));
  const frames=[],metrics=[];
  for(let i=0;i<=64;i++){
   const t=i/64,u=smooth(t);
   // Move hips back while still above the seat; descend continuously. Feet remain anchored.
   const z=lerp(startZ,endZ,smooth(Math.min(1,t/.8))),y=lerp(startY,best.y,u);
   let a=pose(t,y,z,anchors),s=surface(a.w,top);
   // Bounded vertical clearance correction, never moves the fixture or feet.
   // Report any unreachable constraints instead of changing the anchors.
   let lift=0;
   if(i>0&&i<64&&s.insideMin!==null&&s.insideMin<top+.003){
    for(let k=0;k<12;k++){
     lift+=.005;const b=pose(t,y+lift,z,anchors),ss=surface(b.w,top);
     if(ss.insideMin===null||ss.insideMin>=top+.003){a=b;s=ss;break;}
    }
   }
   frames.push(a.l);metrics.push({t,floorMin:s.minY-floor,seatMin:s.insideMin===null?null:s.insideMin-top,seatVertices:s.seatVertices,underSeat:s.underSeat,anchorError:a.maxAnchor,lift});
  }
  const id='contact_seat_'+Math.round(height*100);
  out[id]={height,seatCenter:[cx,cz],halfSize:[hw,hd],anchors,shift,endY:best.y,endZ,endpointSupportM2:best.s.support,endpointConstraintViolationM:best.violation,frames,metrics};
  cases++;console.log(target.key,id,JSON.stringify({floor:Math.min(...metrics.map(m=>m.floorMin)),anchor:Math.max(...metrics.map(m=>m.anchorError)),seatVertices:Math.max(...metrics.map(m=>m.seatVertices)),end:metrics.at(-1)}));
 }
 all[target.key]=out;
}
assert.equal(cases,18);
fs.mkdirSync('contact-out',{recursive:true});fs.writeFileSync('contact-out/solved.json',JSON.stringify(all));
