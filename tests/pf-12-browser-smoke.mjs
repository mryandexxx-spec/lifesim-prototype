import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
import {newHousehold} from '../src/household.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const dir='artifacts/pf-12';mkdirSync(dir,{recursive:true});
let seed=newHousehold('2026-11-26');seed.shop.credits=30000;seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;seed.minutes=720;seed.otherSim.minutes=720;
const owned=[];
for(const [sku,x,z] of [['garden.bench',18,8],['garden.grill',18,-5],['light.path',21,-5]]){
 const draft=previewOutdoorFeatureEdit(seed,{operation:'place',itemId:sku,pose:{x,z,yaw:0}});
 assert.ok(draft.ok,sku+' '+draft.reason);seed=commitOutdoorFeatureEdit(seed,draft).root;
 const rotate=previewOutdoorFeatureEdit(seed,{operation:'move',instanceId:draft.instanceId,pose:{x,z,yaw:90}});
 assert.ok(rotate.ok,sku+' rotate '+rotate.reason);owned.push({sku,x,z,id:draft.instanceId});
}
const candidates=[];
for(let x=1;x<=21;x+=.5)for(let z=-10;z<=10;z+=.5){
 const intent={operation:'place',itemId:'garden.table',pose:{x,z,yaw:0}};
 if(previewOutdoorFeatureEdit(seed,intent).ok&&previewOutdoorFeatureEdit(seed,{...intent,pose:{x,z,yaw:90}}).ok)candidates.push({x,z});
}
assert.ok(candidates.length);
const report=[];
for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch(engineName==='chromium'?{headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}:{headless:true});
 try{for(const [width,height] of [[390,844],[320,568]]){
 const label=engineName+'-'+width;const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const errors=[];const result={label,steps:[]};report.push(result);
 try{
 await context.addInitScript(({seed,key,tour})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));localStorage.setItem(tour,'done');},{seed,key:SAVE_KEY,tour:UI_TOUR_STORAGE_KEY});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('crash'));
 // Test a real asynchronous GLB swap for a previously unowned SKU.
 let releaseTable;const tableGate=new Promise(r=>releaseTable=r);
 await page.route('**/garden.table-new.glb',async route=>{await tableGate;await route.continue();});
 const ready=async()=>{await page.locator('#loading').waitFor({state:'hidden',timeout:100000});await page.waitForFunction(()=>{const s=window.__LifeSimOutdoorFurnitureStats?.();return s&&s.objects.length>=3&&s.objects.filter(o=>o.node.startsWith('LOT-B2')).every(o=>o.attached&&!o.fallbackVisible);},null,{timeout:100000});};
 await page.goto('http://127.0.0.1:8765/?furniture=qa&garden-start-paused=1',{waitUntil:'domcontentloaded'});await ready();
 const tap=id=>page.locator('[data-parcel-action="'+id+'"]').tap();
 const save=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
 const snapshot=async()=>{const a=await save();return {outdoors:a.world.outdoors,credits:a.shop.credits,finance:a.financialHistory};};
 const initial=await snapshot();
 const scene=async(name)=>page.evaluate(async name=>{
  const {Application,Vec3}=await import('playcanvas');const root=Application.getApplication().root;
  const n=root.findByName(name);if(!n)return null;
  const p=n.getLocalPosition(),f=n.getWorldTransform().transformVector(new Vec3(0,0,1));
  const pivot=n.children.find(c=>c.name.startsWith('OF outdoor '));
  const mesh=pivot?.findComponents('render').flatMap(c=>c.meshInstances).find(m=>m.mesh);
  const native=mesh?mesh.node.getWorldTransform().transformVector(new Vec3(0,0,1)):null;
  return {position:[p.x,p.y,p.z],forward:[f.x,f.z],native:native?[native.x,native.z]:null,meshes:n.findComponents('render').length,
    emitters:n.findComponents('light').length,rootName:n.name};
 },name);
 const facing=async(name,yaw,native=true)=>{
  const a=await scene(name);assert.ok(a&&a.meshes>0,name+' rendered model');assert.ok(!native||a.native,name+' native render mesh missing');
  const theta=yaw*Math.PI/180;
  assert.ok(Math.abs(a.forward[0]+Math.sin(theta))<.001&&Math.abs(a.forward[1]-Math.cos(theta))<.001,JSON.stringify({name,yaw,a}));
  return a;
 };
 const shot=async(file)=>page.screenshot({path:dir+'/'+label+'-'+file+'.png'});
 const enter=async()=>{await page.locator('#home-open').tap();await page.locator('#home-outdoors').tap();};
 const select=async(id)=>{await tap('group:owned');await tap('select:'+id);};
 await enter();
 for(const f of owned){
  const name='LOT-B2 '+f.id+' '+f.sku;
  await select(f.id);const before=await facing(name,0);
  if(f.sku==='garden.bench')await shot('bench-before');
  await tap('rotate');const after=await facing(name,90);
  assert.notDeepEqual(after.native,before.native,'actual native mesh transform must change');
  if(f.sku==='garden.bench')await shot('bench-draft-90');
  await tap('turn');await facing(name,180);
  await tap('turn');await facing(name,270);
  assert.deepEqual(await snapshot(),initial,'preview cannot save or charge');
  await tap('cancel');await facing(name,0);
  assert.deepEqual(await snapshot(),initial,'cancel cannot save or charge');
  result.steps.push({sku:f.sku,before,after,cancelled:true});
 }
 // New placement through the actual catalog and a clear canvas tap.
 await tap('group:objects');await tap('pick:garden.table');
 const project=()=>page.evaluate(async points=>{
  const {Application,Vec3}=await import('playcanvas');const cam=Application.getApplication().root.findByName('Camera').camera;
  const canvas=document.querySelector('#game-canvas'),rect=canvas.getBoundingClientRect();
  for(const p of points){const v=cam.worldToScreen(new Vec3(p.x,-.53,p.z));const x=Math.round(v.x+rect.left),y=Math.round(v.y+rect.top);
   if([[0,0],[-5,0],[5,0],[0,-5],[0,5]].every(([dx,dy])=>document.elementFromPoint(x+dx,y+dy)===canvas))return {x,y,point:p};
  }return null;
 },candidates);
 let point=await project();for(let i=0;!point&&i<3;i++){await tap('zoom-out');point=await project();}
 assert.ok(point,'visible valid new placement point');await page.touchscreen.tap(point.x,point.y);
 const previewName='PF-12 outdoor placement garden.table';await facing(previewName,0,false);
 await tap('turn');await facing(previewName,90,false);assert.equal((await scene(previewName)).emitters,0);
 releaseTable();await page.waitForFunction(()=>window.__LifeSimOutdoorFurnitureStats?.().objects.some(o=>o.node==='PF-12 outdoor placement garden.table'&&o.attached&&!o.fallbackVisible),null,{timeout:60000});
 await facing(previewName,90);await shot('new-native-90');assert.deepEqual(await snapshot(),initial);
 await tap('cancel');assert.equal(await scene(previewName),null);assert.deepEqual(await snapshot(),initial);
 // Confirm the asymmetric existing bench rotation; reload checks canonical save and model.
 const f=owned[0],name='LOT-B2 '+f.id+' '+f.sku;
 await select(f.id);await tap('rotate');await facing(name,90);
 assert.equal(await page.locator('[data-parcel-action="apply"]').isDisabled(),false);
 await tap('apply');await ready();await facing(name,90);
 const final=await snapshot();assert.equal(final.credits,initial.credits);assert.equal(final.outdoors.features.find(x=>x.instanceId===f.id).yaw,90);
 await tap('exit');await page.reload({waitUntil:'domcontentloaded'});await ready();await facing(name,90);
 assert.equal((await snapshot()).outdoors.features.find(x=>x.instanceId===f.id).yaw,90);
 await shot('bench-reloaded');assert.deepEqual(errors,[]);result.passed=true;
 }catch(e){result.error=String(e.stack||e);throw e;}finally{writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));await context.close();}
 }}finally{await browser.close();}
}
