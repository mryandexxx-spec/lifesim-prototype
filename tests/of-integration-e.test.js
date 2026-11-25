import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {OF_POOL_ASSETS,createPoolFixtureModels,poolFixtureVisualPose} from '../src/pool-visual.js';
import {poolCellIndex,poolCellBounds} from '../src/pool-topology.js';
import {poolFixtureSite} from '../src/pool-equipment.js';
test('OF-E approved fixture bytes and actual wet/deck/launch geometry',()=>{
 assert.deepEqual(Object.keys(OF_POOL_ASSETS).sort(),['board','ladder','steps']);
 for(const [kind,s] of Object.entries(OF_POOL_ASSETS)){
  const b=readFileSync('assets/furniture/of-r2/pool.'+kind+'-new.glb');
  assert.equal(b.length,s.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),s.sha256);
  assert.equal(b.toString('ascii',0,4),'glTF');assert.equal(b.readUInt32LE(8),b.length);
  const j=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12))),points=[];
  for(const mesh of j.meshes)for(const prim of mesh.primitives){
   const a=j.accessors[prim.attributes.POSITION],view=j.bufferViews[a.bufferView],start=20+b.readUInt32LE(12)+8+(view.byteOffset||0)+(a.byteOffset||0);
   assert.equal(a.componentType,5126);assert.equal(a.type,'VEC3');
   for(let i=0;i<a.count;i++)points.push([0,4,8].map(d=>b.readFloatLE(start+i*(view.byteStride||12)+d)));
  }
  assert.ok(points.length&&points.every(p=>p.every(Number.isFinite)));
  const min=i=>Math.min(...points.map(p=>p[i])),max=i=>Math.max(...points.map(p=>p[i]));
  assert.ok(min(2)<.015&&max(2)>.14,'native wall and inward wet span');
  assert.ok(Math.abs(max(0)-.23)<.01&&Math.abs(min(0)+.23)<.01);
  if(kind==='ladder'){assert.ok(min(1)<-.80&&max(1)>.50&&min(2)<-.1);}
  if(kind==='steps'){assert.ok(Math.abs(min(1)+1.2)<.002&&Math.abs(max(1)+.04)<.006&&max(2)>.58);}
  if(kind==='board'){assert.ok(Math.abs(max(1)-.478)<.006&&min(2)<-.39&&max(2)>.59&&min(1)>=-.002);}
 }
});
test('OF-E all four wall origins and inward +Z align with canonical dry approach',()=>{
 const start=poolCellIndex(15.25,-7.25),cells=Array.from({length:64},(_,i)=>start+Math.floor(i/8)*64+i%8),pool={poolId:'pool-1',cells};
 const cases=[['west',start+3*64,1,0],['east',start+3*64+7,-1,0],['north',start+3,0,1],['south',start+7*64+3,0,-1]];
 for(const [side,edgeCell,dx,dz] of cases)for(const kind of ['ladder','steps','board']){
  const pose=poolFixtureVisualPose({edgeCell,side}),site=poolFixtureSite(pool,edgeCell,side,kind),b=poolCellBounds(edgeCell);
  assert.ok(site);assert.ok(pose.dx===dx&&pose.dz===dz,'exact cardinal direction (signed zero is geometrically identical)');
  assert.ok(Math.abs((pose.x-site.dryApproach.x)*dx+(pose.z-site.dryApproach.z)*dz-.29)<1e-8);
  assert.ok(Math.abs(pose.x+dx*.25-(b.minX+b.maxX)/2)<1e-8&&Math.abs(pose.z+dz*.25-(b.minZ+b.maxZ)/2)<1e-8);
 }
});
function fixture(){
 const legacy={enabled:true},events={};let resolve,reject;
 const pivot={findComponents:()=>[{meshInstances:[{}]}],destroy(){this.parent=null;}};
 const root={name:'fixture-1 ladder',enabled:true,parent:{},findComponents:()=>[legacy],once:(k,f)=>events[k]=f,addChild:p=>p.parent=root};
 class Asset{ready(f){resolve=()=>{this.resource={instantiateRenderEntity:()=>pivot};f();};}once(k,f){reject=f;}}
 return {root,legacy,pivot,events,pc:{Asset},app:{assets:{add(){},load(){}}},resolve:()=>resolve(),reject:()=>reject(Error('fixture'))};
}
const flush=()=>new Promise(r=>setImmediate(r));
test('OF-E atomic native replacement, failed load, destroyed preview and legacy mode',async()=>{
 const f=fixture(),v=createPoolFixtureModels(f);assert.ok(v.attach(f.root,'ladder'));assert.equal(f.legacy.enabled,true);f.resolve();await flush();assert.equal(f.legacy.enabled,false);assert.equal(v.stats().objects[0].attached,true);f.events.destroy();assert.equal(v.stats().objects.length,0);
 const g=fixture(),bad=createPoolFixtureModels(g);bad.attach(g.root,'steps');g.reject();await flush();assert.equal(g.legacy.enabled,true);assert.equal(bad.stats().failures,1);
 const h=fixture(),stale=createPoolFixtureModels(h);stale.attach(h.root,'board');h.events.destroy();h.resolve();await flush();assert.equal(h.legacy.enabled,true);assert.equal(h.pivot.parent,undefined);
 const off=createPoolFixtureModels({...f,enabled:false});assert.equal(off.attach(f.root,'ladder'),false);assert.equal(off.attach(f.root,'constructor'),false);
});