import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {OF_OUTDOOR_ASSETS,outdoorModelSpec} from '../src/of-outdoor-assets.js';
import {OUTDOOR_CATALOG} from '../src/outdoor-catalog.js';
import {createOutdoorFurnitureVisual} from '../src/of-outdoor-visual.js';
const ids=['garden.bench','garden.table','garden.grill','light.path','light.standing','fence.wood','hedge.short'];
function vertices(bytes,j,material){const p=[];for(const mesh of j.meshes)for(const prim of mesh.primitives){if(material&&j.materials[prim.material]?.name!==material)continue;const a=j.accessors[prim.attributes.POSITION],v=j.bufferViews[a.bufferView],start=20+bytes.readUInt32LE(12)+8+(v.byteOffset||0)+(a.byteOffset||0);assert.equal(a.componentType,5126);assert.equal(a.type,'VEC3');for(let i=0;i<a.count;i++){const offset=start+i*(v.byteStride||12);p.push([0,4,8].map(d=>bytes.readFloatLE(offset+d)));}}return p;}
test('OF-D approved GLB bytes, native ground, real seats, grate and lamp contact vertices',()=>{
 assert.deepEqual(Object.keys(OF_OUTDOOR_ASSETS),ids);assert.equal(outdoorModelSpec('tree.round'),null);assert.equal(outdoorModelSpec('constructor'),null);
 for(const [sku,v] of Object.entries(OF_OUTDOOR_ASSETS)){
  assert.ok(OUTDOOR_CATALOG[sku]);const b=readFileSync('assets/furniture/of-r2/'+sku+'-new.glb');assert.equal(b.length,v.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),v.sha256);assert.equal(b.toString('ascii',0,4),'glTF');assert.equal(b.readUInt32LE(8),b.length);
  const j=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));assert.ok(j.meshes.length);const p=vertices(b,j);assert.ok(p.length>0&&p.every(x=>x.every(Number.isFinite)));assert.ok(Math.min(...p.map(x=>x[1]))>=-.002);assert.ok(Math.min(...p.map(x=>x[1]))<.025);
  if(sku==='garden.bench'){const seat=vertices(b,j,'Honey oak').filter(x=>Math.abs(x[1]-.64)<.001&&Math.abs(x[2])<.315);assert.ok(seat.length>=6);assert.ok(Math.max(...seat.map(x=>x[0]))>.7);assert.ok(Math.min(...seat.map(x=>x[0]))<-.7);}
  if(sku==='garden.grill'){const grate=vertices(b,j,'Steel');assert.ok(grate.length>0);assert.ok(Math.abs(Math.max(...grate.map(x=>x[1]))-1.0375)<.002);}
  if(sku.startsWith('light.')){const lens=vertices(b,j,'Warm opal');assert.ok(lens.length>0);const y=lens.map(x=>x[1]),h=sku==='light.standing'?2.35:1.06;assert.ok(Math.min(...y)<h+.09&&Math.max(...y)>h+.09);}
 }
});
function fixture(){let resolve,reject;const legacy={enabled:true},overlay={enabled:true},food={enabled:true};const events={};const node={name:'LOT-B2 out-1 garden.grill',parent:{},findComponents:()=>[legacy,overlay,food],once:(k,f)=>events[k]=f,addChild:p=>p.parent=node};const pivot={findComponents:()=>[{meshInstances:[{}]}],destroy(){this.parent=null;}};class Asset{ready(f){resolve=()=>{this.resource={instantiateRenderEntity:()=>pivot};f();};}once(k,f){reject=f;}}const app={assets:{add(){},load(){}}};return {node,legacy,overlay,food,pivot,events,pc:{Asset},app,resolve:()=>resolve(),reject:()=>reject(Error('test'))};}
const flush=()=>new Promise(r=>setImmediate(r));
test('OF-D atomic replacement retains moving overlays, fallback on failed load or legacy mode',async()=>{
 const f=fixture(),v=createOutdoorFurnitureVisual(f);assert.ok(v.attach(f.node,'garden.grill',[{findComponents:()=>[f.overlay,f.food]}]));assert.equal(f.legacy.enabled,true);f.resolve();await flush();assert.equal(f.legacy.enabled,false);assert.equal(f.overlay.enabled,true);assert.equal(f.food.enabled,true);assert.equal(v.stats().objects[0].attached,true);f.events.destroy();assert.equal(v.stats().objects.length,0);
 const g=fixture(),bad=createOutdoorFurnitureVisual(g);bad.attach(g.node,'garden.grill');g.reject();await flush();assert.equal(g.legacy.enabled,true);assert.equal(bad.stats().failures,1);
 const h=fixture(),off=createOutdoorFurnitureVisual({...h,enabled:false});assert.equal(off.attach(h.node,'garden.grill'),false);assert.equal(h.legacy.enabled,true);
 const stale=fixture(),loader=createOutdoorFurnitureVisual(stale);loader.attach(stale.node,'garden.grill');stale.events.destroy();stale.resolve();await flush();assert.equal(stale.legacy.enabled,true);assert.equal(stale.pivot.parent,undefined);
});
