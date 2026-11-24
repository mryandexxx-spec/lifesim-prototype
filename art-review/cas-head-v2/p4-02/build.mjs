import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const pin='ef4f26db3842d30d6124b665fd51e0ebff27cd94bdd49f08a312d5cd99da8a2c';
const hash=b=>createHash('sha256').update(b).digest('hex');
const source=readFileSync(process.argv[2]);assert.equal(hash(source),pin);
const size=source.readUInt32LE(12),doc=JSON.parse(source.subarray(20,20+size)),bin=Buffer.from(source.subarray(28+size)),before=Buffer.from(bin);
const head=doc.meshes[1].primitives[0],allowed=new Set();
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
const peak=(v,c,inner,outer)=>1-smooth(inner,outer,Math.abs(v-c));
function field(v){
 const [x,y,z]=v,dx=x-.001,ax=Math.abs(dx);
 // Local field, identity at eye region and neck seam. Preserve oral cavity behind lips.
 const front=smooth(.033,.051,z), lip=peak(y,1.4445,.004,.012)*peak(ax,0,.020,.036)*front;
 const corner=smooth(.010,.023,ax)*(1-smooth(.023,.033,ax));
 const nose=peak(y,1.470,.005,.023)*peak(ax,0,.007,.023)*smooth(.053,.065,z);
 const chin=peak(y,1.432,.003,.010)*peak(ax,0,.018,.048)*smooth(.035,.057,z);
 const gate=smooth(1.419,1.425,y)*(1-smooth(1.493,1.499,y));
 return [x+gate*(.11*dx*lip),y+gate*(.16*(y-1.4445)*lip-.0018*corner*lip+.0012*chin),z+gate*(.0012*lip-.0035*nose-.0022*chin)];
}
const vec=(i)=>{const a=doc.accessors[i],v=doc.bufferViews[a.bufferView];assert.equal(a.componentType,5126);assert.equal(a.type,'VEC3');const stride=v.byteStride||12,off=(v.byteOffset||0)+(a.byteOffset||0);return Array.from({length:a.count},(_,k)=>[0,1,2].map(c=>bin.readFloatLE(off+k*stride+c*4)))};
function write(i,rows){const a=doc.accessors[i],v=doc.bufferViews[a.bufferView],stride=v.byteStride||12,off=(v.byteOffset||0)+(a.byteOffset||0);allowed.add(a.bufferView);let mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];rows.forEach((r,k)=>r.forEach((f,c)=>{const q=Math.fround(f);bin.writeFloatLE(q,off+k*stride+c*4);mn[c]=Math.min(mn[c],q);mx[c]=Math.max(mx[c],q)}));if(a.min)a.min=mn;if(a.max)a.max=mx}
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
function normal(p,n){const q=field(p);if(q.every((v,i)=>v===p[i]))return n;const e=1e-5,cols=[0,1,2].map(k=>{const lo=p.slice(),hi=p.slice();lo[k]-=e;hi[k]+=e;return sub(field(hi),field(lo)).map(x=>x/(2*e))});const co=[cross(cols[1],cols[2]),cross(cols[2],cols[0]),cross(cols[0],cols[1])];assert.ok(dot(cols[0],co[0])>.25);const r=[0,1,2].map(i=>co.reduce((s,v,k)=>s+v[i]*n[k],0));const l=Math.hypot(...r);return r.map(x=>x/l)}
const p=vec(head.attributes.POSITION),n=vec(head.attributes.NORMAL),d=head.targets.map(t=>vec(t.POSITION)),dn=head.targets.map(t=>vec(t.NORMAL));
const q=p.map(field),qn=p.map((v,i)=>normal(v,n[i]));
const dd=d.map((rows,k)=>rows.map((v,i)=>{const x=add(p[i],v),y=field(x);return y.every((t,c)=>t===x[c])&&q[i].every((t,c)=>t===p[i][c])?v:sub(y,q[i])}));
const nd=dn.map((rows,k)=>rows.map((v,i)=>{const x=add(p[i],d[k][i]);return field(x).every((t,c)=>t===x[c])&&q[i].every((t,c)=>t===p[i][c])?v:sub(normal(x,add(n[i],v)),qn[i])}));
write(head.attributes.POSITION,q);write(head.attributes.NORMAL,qn);head.targets.forEach((t,k)=>{write(t.POSITION,dd[k]);write(t.NORMAL,nd[k])});
for(const [i,v] of doc.bufferViews.entries()){if(!allowed.has(i)){const s=v.byteOffset||0;assert.ok(before.subarray(s,s+v.byteLength).equals(bin.subarray(s,s+v.byteLength)),i)}}
const json=Buffer.from(JSON.stringify(doc));const j=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),h=Buffer.alloc(20),bh=Buffer.alloc(8);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(28+j.length+bin.length,8);h.writeUInt32LE(j.length,12);h.write('JSON',16);bh.writeUInt32LE(bin.length,0);bh.write('BIN',4);const out=Buffer.concat([h,j,bh,bin]);writeFileSync(process.argv[3],out);console.log(JSON.stringify({source:pin,candidate:hash(out),maxDisplacementMm:1000*Math.max(...q.map((v,i)=>Math.hypot(...sub(v,p[i])))),unchangedViews:doc.bufferViews.length-allowed.size,clips:doc.animations.length,joints:doc.skins[0].joints.length}));

