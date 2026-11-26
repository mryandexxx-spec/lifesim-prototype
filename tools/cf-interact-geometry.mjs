import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateSeatInteractionAsset,resolveSeatInteraction,interactionLocalToWorld} from '../src/interaction-anchors.js';
export const SOURCE='assets/furniture/of-r2/garden.bench-new.glb';
export const SOURCE_SHA='eb4407b9e6abc3ad42568f90e3a5d9242845dd7af81fa7f84714aeb4de7cd30b';
const hash=b=>createHash('sha256').update(b).digest('hex');
const near=(a,b,t=.00001)=>assert.ok(Math.abs(a-b)<=t,a+' != '+b);
const round=x=>Math.round(x*1e5)/1e5;
function decode(bytes){
  assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  const n=bytes.readUInt32LE(12);assert.equal(bytes.toString('ascii',16,20),'JSON');
  const j=JSON.parse(bytes.toString('utf8',20,20+n));
  const off=20+n;assert.equal(bytes.toString('ascii',off+4,off+8),'BIN\0');
  const bin=Buffer.from(bytes.subarray(off+8));assert.equal(bytes.readUInt32LE(off),bin.length);
  // This pinned fixture is static, one untransformed mesh. Other layouts need
  // a proper scene-graph importer; do not silently use raw accessor bounds.
  assert.equal(j.nodes.length,1);const node=j.nodes[0];
  assert.equal(node.mesh,0);for(const k of ['matrix','translation','rotation','scale','children','skin'])assert.equal(node[k],undefined);
  assert.deepEqual(j.scenes[j.scene??0].nodes,[0]);assert.equal(j.meshes.length,1);
  assert.equal(j.buffers.length,1);assert.equal(j.buffers[0].uri,undefined);
  return {j,bin};
}
function accessor(d,id){
  const a=d.j.accessors[id],v=d.j.bufferViews[a.bufferView];assert.equal(v.buffer,0);assert.equal(a.sparse,undefined);
  const size={5123:2,5125:4,5126:4}[a.componentType],dim={SCALAR:1,VEC3:3}[a.type];assert.ok(size&&dim);
  const offset=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||size*dim;
  const pos=(i,k)=>offset+i*stride+k*size;
  const get=(i,k)=>{const p=pos(i,k);return a.componentType===5126?d.bin.readFloatLE(p):size===2?d.bin.readUInt16LE(p):d.bin.readUInt32LE(p);};
  return {a,read:()=>Array.from({length:a.count},(_,i)=>Array.from({length:dim},(_,k)=>get(i,k))),
    write:(i,k,x)=>{assert.equal(a.componentType,5126);d.bin.writeFloatLE(x,pos(i,k));}};
}
function encode(d){
  const json=Buffer.from(JSON.stringify(d.j)),pad=(4-json.length%4)%4,n=json.length+pad;
  const out=Buffer.alloc(28+n+d.bin.length,0);out.write('glTF');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);
  out.writeUInt32LE(n,12);out.write('JSON',16);json.copy(out,20);out.fill(32,20+json.length,20+n);
  out.writeUInt32LE(d.bin.length,20+n);out.write('BIN\0',24+n);d.bin.copy(out,28+n);return out;
}
export function deriveHeight(bytes,height){
  assert.equal(hash(bytes),SOURCE_SHA);const d=decode(bytes);
  const drop=.64-height;assert.ok(drop>0&&drop<.54);
  const seen=new Set(),normals=new Set();
  for(const p of d.j.meshes[0].primitives){
    assert.ok(!seen.has(p.attributes.POSITION)&&!normals.has(p.attributes.NORMAL));
    seen.add(p.attributes.POSITION);normals.add(p.attributes.NORMAL);
    const pa=accessor(d,p.attributes.POSITION),na=accessor(d,p.attributes.NORMAL),ps=pa.read(),ns=na.read();
    assert.equal(ps.length,ns.length);
    for(let i=0;i<ps.length;i++){
      const y=ps[i][1],q=y-drop*Math.min(1,Math.max(0,y/.54));
      pa.write(i,1,q);
      // Piecewise inverse-transpose normal transform; diagnostic geometry only,
      // not approved render normals at the deformation boundary.
      const n=ns[i],dy=y>0&&y<.54?1-drop/.54:1,nn=[n[0],n[1]/dy,n[2]],len=Math.hypot(...nn);
      assert.ok(len>0);nn.forEach((v,k)=>na.write(i,k,v/len));
    }
    const actual=pa.read();
    for(const [key,f] of [['min',Math.min],['max',Math.max]])if(pa.a[key])pa.a[key]=[0,1,2].map(k=>f(...actual.map(v=>v[k])));
    const actualN=na.read();
    for(const [key,f] of [['min',Math.min],['max',Math.max]])if(na.a[key])na.a[key]=[0,1,2].map(k=>f(...actualN.map(v=>v[k])));
  }
  return encode(d);
}
const bbox=t=>({minX:round(Math.min(...t.map(v=>v[0]))),maxX:round(Math.max(...t.map(v=>v[0]))),minZ:round(Math.min(...t.map(v=>v[2]))),maxZ:round(Math.max(...t.map(v=>v[2])))});
const triangleArea=t=>Math.abs((t[1][0]-t[0][0])*(t[2][2]-t[0][2])-(t[2][0]-t[0][0])*(t[1][2]-t[0][2]))/2;
export function measureBench(bytes,expectedHeight){
  const d=decode(bytes),vertices=[],wood=[],triangles=[];
  for(const p of d.j.meshes[0].primitives){
    const ps=accessor(d,p.attributes.POSITION).read();vertices.push(...ps);
    assert.ok(ps.every(v=>v.every(Number.isFinite)));
    if(d.j.materials[p.material].name!=='Honey oak')continue;
    wood.push(...ps);assert.equal(p.mode??4,4);
    const is=accessor(d,p.indices).read().flat();assert.equal(is.length%3,0);
    for(let i=0;i<is.length;i+=3){
      const t=is.slice(i,i+3).map(k=>ps[k]);assert.ok(t.every(Boolean));
      if(t.every(v=>Math.abs(v[1]-expectedHeight)<.001)&&triangleArea(t)>1e-8)triangles.push(t);
    }
  }
  const floorY=round(Math.min(...vertices.map(v=>v[1])));near(floorY,0);
  assert.equal(triangles.length,6);
  const measuredY=round(triangles.flat().reduce((s,v)=>s+v[1],0)/(triangles.length*3));near(measuredY,expectedHeight);
  // High wooden backrest must be entirely on one native Z side.
  const back=wood.filter(v=>v[1]>measuredY+.16);assert.ok(back.length>0);
  const sign=Math.sign(back.reduce((s,v)=>s+v[2],0));assert.ok(back.every(v=>sign*v[2]>.15));
  const frontYaw=sign===1?180:0;
  const canonical=triangles.map(t=>t.map(v=>sign===1?[-v[0],v[1],-v[2]]:v));
  const groups=new Map();
  for(const t of canonical){
    const box=bbox(t),key=JSON.stringify(box);
    groups.set(key,(groups.get(key)||0)+triangleArea(t));
  }
  const regions=[...groups].map(([key,a])=>{
    const r=JSON.parse(key);near(a,(r.maxX-r.minX)*(r.maxZ-r.minZ));return r;
  }).sort((a,b)=>a.minZ-b.minZ);
  assert.equal(regions.length,3);
  return {assetSha:hash(bytes),floorY,seatY:measuredY,frontYaw,regions,vertexCount:vertices.length,topTriangles:triangles.length};
}
// Authored asset descriptor: frozen independent horizontal contact geometry.
// Variants change only measured revision and declared seat plane.
export function benchDescriptor(assetSha,seatY){
  return {version:1,sku:'garden.bench',units:'m',up:'+Y',assetSha,frontYaw:180,floorY:0,seatY,
    regions:[{minX:-.735,maxX:.735,minZ:-.3,maxZ:-.16},{minX:-.735,maxX:.735,minZ:-.07,maxZ:.07},{minX:-.735,maxX:.735,minZ:.16,maxZ:.3}],
    slots:[{id:'left',region:{minX:-.735,maxX:0,minZ:-.3,maxZ:.3},anchorX:-.3675,anchorZ:0},
      {id:'right',region:{minX:0,maxX:.735,minZ:-.3,maxZ:.3},anchorX:.3675,anchorZ:0}]};
}
export function runProbe(out='artifacts/cf-interact-01a'){
  const source=readFileSync(SOURCE);assert.equal(hash(source),SOURCE_SHA);mkdirSync(out,{recursive:true});
  // Held-out 42cm selected before executing the matrix. Same derivation and
  // resolver, no per-variant fitting. These are isolated geometry fixtures.
  const variants=[['native',.64,source],['candidate45',.45,deriveHeight(source,.45)],['heldout42',.42,deriveHeight(source,.42)]];
  const rigs=[{id:'female-central',revision:'R3-knee-ceiling-diagnostic',maxFlatKneeHeight:.5197,supportWidth:.32,supportDepth:.24},
    {id:'male-central',revision:'R3-knee-ceiling-diagnostic',maxFlatKneeHeight:.5273,supportWidth:.36,supportDepth:.26}];
  // Width/depth and support fraction are explicitly hypothetical preflight
  // inputs, not measured skin patches. Actual rig passport belongs to 01B.
  const action={kind:'sit.normal',revision:'preflight-v1',sourceClip:'Sitting_Enter+Sitting_Exit',approachGap:.55,minSupportFraction:.5};
  const cases=[],fixtures=[];
  for(const [name,height,bytes] of variants){
    const measurement=measureBench(bytes,height),asset=benchDescriptor(hash(bytes),height);
    assert.equal(validateSeatInteractionAsset(asset,measurement).ok,true);
    if(name!=='native')writeFileSync(out+'/'+name+'.glb',bytes);
    writeFileSync(out+'/'+name+'.interaction.json',JSON.stringify(asset,null,2));
    fixtures.push({name,measurement,asset});
    for(const yaw of [0,90,180,270,37,-123])for(const rig of rigs){
      const instance={id:'bench-instance',origin:{x:19,y:-.53,z:8},yaw};
      const environment={occupiedSlots:[],corridorClear:()=>true};
      const args={asset,measurement,instance,rig,action,environment};
      const result=resolveSeatInteraction(args);
      if(name==='native'){assert.equal(result.reason,'SEAT_TOO_HIGH');}
      else{
        assert.equal(result.status,'PREFLIGHT_CANDIDATE');assert.equal(result.slotId,'bench-instance:left');
        const other=resolveSeatInteraction({...args,environment:{...environment,occupiedSlots:[result.slotId]}});
        assert.equal(other.slotId,'bench-instance:right');assert.notEqual(other.cacheKey,result.cacheKey);
        for(const [target,local] of [[result.contact,[-.3675,height,0]],[result.front,[-.3675,0,.3]],[result.approach,[-.3675,0,.85]]]){
          // Independent direct yaw matrix, not the implementation helper.
          const a=(yaw+180)*Math.PI/180,[x,y,z]=local;
          near(target.x,19+x*Math.cos(a)+z*Math.sin(a));near(target.y,-.53+y);near(target.z,8-x*Math.sin(a)+z*Math.cos(a));
        }
        near(Math.hypot(result.contact.x-other.contact.x,result.contact.z-other.contact.z),.735);
        near(Math.hypot(result.normal.x,result.normal.y,result.normal.z),1);near(Math.hypot(result.tangent.x,result.tangent.y,result.tangent.z),1);
        assert.equal(resolveSeatInteraction({...args,environment:{...environment,corridorClear:()=>false}}).reason,'APPROACH_BLOCKED');
        assert.equal(resolveSeatInteraction({...args,environment:{...environment,occupiedSlots:[result.slotId,other.slotId]}}).reason,'SLOT_OCCUPIED');
        assert.deepEqual(resolveSeatInteraction(args),result);
      }
      cases.push({name,yaw,rig:rig.id,result});
    }
  }
  assert.equal(hash(readFileSync(SOURCE)),SOURCE_SHA);
  const report={stage:'01A',sourceSha:SOURCE_SHA,frozenFbik:'6974fc7e91ee2b089bde79c701eee946da142b51',solverExecuted:false,
    rigStatus:'diagnostic knee ceilings from prior rig measurements; synthetic support dimensions',fixtures,cases,
    limitations:['Planar static mesh only','No final limb, skin or obstacle clearance proof','No animation bake or render acceptance','No runtime integration']};
  writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
  console.log('CF-INTERACT 01A: '+cases.length+' matched preflight cases; 12 native rejections, 24 candidate plans; two-slot and rotation checks PASS.');
  return report;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)runProbe();
