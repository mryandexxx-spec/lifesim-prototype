import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
import {newHousehold,loadHousehold} from '../src/household.js';
import {poolCellIndex} from '../src/pool-topology.js';
import {POOL_FIXTURE_PRICES,poolFixtureSite} from '../src/pool-equipment.js';
import {beginPoolSwim,arrivePoolApproach,advancePoolSwim} from '../src/pool-swim-runtime.js';
import {poolEntryMinutes} from '../src/pool-navigation.js';
import {poolFixtureVisualPose} from '../src/pool-visual.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const out='artifacts/of-e';mkdirSync(out,{recursive:true});
const seed=newHousehold('2026-11-25');seed.minutes=720;seed.otherSim.minutes=720;seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
const start=poolCellIndex(15.25,-7.25),cells=Array.from({length:64},(_,i)=>start+Math.floor(i/8)*64+i%8),pool={poolId:'pool-1',cells};
const fixtures=[];
for(const side of ['west','east','north','south'])for(const [i,kind] of ['ladder','board','steps'].entries()){
 const k=1+i*2,edgeCell={west:start+k*64,east:start+k*64+7,north:start+k,south:start+7*64+k}[side];
 assert.ok(poolFixtureSite(pool,edgeCell,side,kind));
 fixtures.push({fixtureId:'fixture-'+(fixtures.length+1),poolId:pool.poolId,kind,edgeCell,side,purchasePriceCredits:POOL_FIXTURE_PRICES[kind]});
}
seed.world.outdoors={...seed.world.outdoors,pools:[pool],poolFixtures:fixtures,nextPoolId:2,nextFixtureId:13};
assert.deepEqual(loadHousehold(structuredClone(seed)).world.outdoors.poolFixtures,fixtures);
const report=[];
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const b=await engine.launch(name==='chromium'?{headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}:{headless:true});
 try{for(const [width,height] of [[390,844],[320,568]]){
  const ctx=await b.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block'});
  try{
   await ctx.addInitScript(({key,tour,seed})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));localStorage.setItem(tour,'done');},{key:SAVE_KEY,tour:UI_TOUR_STORAGE_KEY,seed});
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('crash'));
   const url='http://127.0.0.1:8765/?pool=qa&furniture=qa&garden-start-paused=1';
   const ready=async()=>{await page.locator('#loading').waitFor({state:'hidden',timeout:100000});await page.waitForFunction(n=>{const s=window.__LifeSimPoolVisualStats?.();return s?.meshCount===5&&s.fixtureModels.objects.length===n&&s.fixtureModels.objects.every(o=>o.attached&&!o.fallbackVisible&&o.meshInstances>0)&&!s.fixtureModels.failures;},fixtures.length,{timeout:100000});};
   await page.goto(url,{waitUntil:'domcontentloaded'});await ready();
   const capture=async f=>page.evaluate(async f=>{
    const {Application,Vec3}=await import('playcanvas'),app=Application.getApplication(),cam=app.root.findByName('Camera'),cp=cam.getPosition().clone(),cr=cam.getRotation().clone();
    try{
     if(f){const node=app.root.findByName(f.fixtureId+' '+f.kind),p=node.getPosition();if(Math.hypot(p.x-f.pose.x,p.y+.53,p.z-f.pose.z)>.001)throw Error('bad origin');const inward=node.forward.clone().mulScalar(-1);if(Math.hypot(inward.x-f.pose.dx,inward.z-f.pose.dz)>.001)throw Error('bad orientation');const center=p.clone().add(new Vec3(f.pose.dx*.15,-.20,f.pose.dz*.15));cam.setPosition(center.clone().add(new Vec3(f.pose.dx*.9+f.pose.tx*.9,1.4,f.pose.dz*.9+f.pose.tz*.9).normalize().mulScalar(3.6)));cam.lookAt(center);}
     else{cam.setPosition(21,9,-1);cam.lookAt(new Vec3(17,-.5,-5.5));}
     await new Promise(r=>setTimeout(r,350));
     for(let i=0;i<8;i++){const img=await new Promise(resolve=>{app.once('postrender',()=>resolve(app.graphicsDevice.canvas.toDataURL('image/png')));app.renderNextFrame=true;});const bitmap=await createImageBitmap(await(await fetch(img)).blob()),probe=document.createElement('canvas');probe.width=96;probe.height=96;const c=probe.getContext('2d');c.drawImage(bitmap,0,0,96,96);bitmap.close();const data=c.getImageData(0,0,96,96).data,colors=new Set();for(let j=0;j<data.length;j+=4)colors.add((data[j]>>4)*256+(data[j+1]>>4)*16+(data[j+2]>>4));if(colors.size>=8)return img;}throw Error('empty pool frame');
    }finally{cam.setPosition(cp);cam.setRotation(cr);}
   },f);
   const store=async(label,f)=>writeFileSync(out+'/'+name+'-'+width+'-'+label+'.png',Buffer.from((await capture(f)).split(',')[1],'base64'));
   await store('native-lot',null);
   for(const f of fixtures)await store('native-'+f.kind+'-'+f.side,{...f,pose:poolFixtureVisualPose(f)});
   const stats=await page.evaluate(()=>window.__LifeSimPoolVisualStats());assert.equal(stats.fixtureModels.cached,3);
   // Real current parcel editor: rotate an installed fixture, then cancel.
   // The draft must use native GLB, hide the old root and never debit/save.
   const command=id=>page.locator('[data-parcel-action="'+id+'"]');
   await page.locator('#home-open').tap();await page.locator('#home-pool').tap();
   for(const f of fixtures.slice(0,3)){
    await command('group:owned').tap();await command('select:'+f.fixtureId).tap();await command('rotate').tap();
    await page.waitForFunction(n=>{const o=window.__LifeSimPoolVisualStats().fixtureModels.objects;return o.length===13&&o.filter(x=>x.node===n).length===2&&o.filter(x=>x.node===n).some(x=>!x.visible)&&o.filter(x=>x.node===n).some(x=>x.visible&&x.attached&&!x.fallbackVisible);},f.fixtureId+' '+f.kind,{timeout:15000});
    await page.screenshot({path:out+'/'+name+'-'+width+'-preview-'+f.kind+'.png'});
    await command('cancel').tap();await page.waitForFunction(()=>{const s=window.__LifeSimPoolVisualStats().fixtureModels;return s.objects.length===12&&s.objects.every(o=>o.visible&&o.attached);},null,{timeout:15000});
    const draftSave=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);assert.deepEqual(draftSave.world.outdoors.poolFixtures,fixtures);assert.equal(draftSave.shop.credits,seed.shop.credits);
   }
   await command('exit').tap();
   await page.reload({waitUntil:'domcontentloaded'});await ready();
   const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);assert.equal(saved.version,1);assert.deepEqual(saved.world.outdoors.poolFixtures,fixtures);
   await page.goto(url+'&pool-fixtures=legacy',{waitUntil:'domcontentloaded'});await page.locator('#loading').waitFor({state:'hidden',timeout:100000});assert.equal((await page.evaluate(()=>window.__LifeSimPoolVisualStats())).fixtureModels.objects.length,0);
   await store('legacy-lot',null);for(const f of fixtures)await store('legacy-'+f.kind+'-'+f.side,{...f,pose:poolFixtureVisualPose(f)});
   assert.deepEqual(errors,[]);report.push({name,width,height,stats});writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
  }finally{await ctx.close();}
 }}finally{await b.close();}
}
 // Independent canonical entry-state samples: compare original vs native
 // in place, never move fixtures/avatars or mutate live game state.
 const active=[];
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch(name==='chromium'?{headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}:{headless:true});
  try{for(const [kind,id,fraction] of [['ladder','alex',.25],['steps','mira',.45],['board','alex',.55]]){
   const root=structuredClone(seed),f=fixtures.find(x=>x.kind===kind&&x.side==='west'),actor=id==='alex'?root:root.otherSim;
   root.paused=false;root.otherSim.paused=false;
   const plan=beginPoolSwim(root,id,{actionId:kind==='board'?'jump':'swim',poolId:f.poolId,fixtureId:f.fixtureId});assert.ok(plan,'canonical '+kind+' admission');
   actor.position={...plan.action.dryApproach};assert.ok(arrivePoolApproach(root,id));
   advancePoolSwim(root,id,.1);assert.equal(actor.action.stage,'entering');
   advancePoolSwim(root,id,poolEntryMinutes(kind)*fraction);assert.equal(actor.action.stage,'entering');
   const restored=loadHousehold(structuredClone(root));assert.equal((id==='alex'?restored:restored.otherSim).action?.stage,'entering');
   for(const legacy of [false,true]){
    const width=name==='chromium'?390:320,height=width===390?844:568;
    const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block'});
    try{
     await ctx.addInitScript(({key,tour,root})=>{localStorage.setItem(key,JSON.stringify(root));localStorage.setItem(tour,'done');},{key:SAVE_KEY,tour:UI_TOUR_STORAGE_KEY,root});
     const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
     await page.goto('http://127.0.0.1:8765/?pool=qa&furniture=qa&garden-start-paused=1'+(legacy?'&pool-fixtures=legacy':''),{waitUntil:'domcontentloaded'});
     await page.locator('#loading').waitFor({state:'hidden',timeout:100000});
     if(!legacy)await page.waitForFunction(()=>window.__LifeSimPoolVisualStats()?.fixtureModels.objects.every(o=>o.attached&&!o.fallbackVisible)&&window.__LifeSimPoolVisualStats()?.fixtureModels.objects.length===12,null,{timeout:30000});
     const state=await page.evaluate(id=>window.__LifeSimSwimVisualQA()[id],id);
     assert.equal(state.stage,'entering');assert.equal(state.paused,true);assert.ok(Math.hypot(state.avatar.x-state.pose.x,state.avatar.y-state.pose.y,state.avatar.z-state.pose.z)<.03);
     const img=await page.evaluate(async({f,pose})=>{
      const {Application,Vec3}=await import('playcanvas'),app=Application.getApplication(),cam=app.root.findByName('Camera');
      const center=new Vec3((f.x+pose.x)/2,(pose.y+1.4-.53)/2,(f.z+pose.z)/2);
      cam.setPosition(center.clone().add(new Vec3(f.dx*.75+f.tx, .8,f.dz*.75+f.tz).normalize().mulScalar(4)));cam.lookAt(center);
      for(let i=0;i<8;i++){const img=await new Promise(resolve=>{app.once('postrender',()=>resolve(app.graphicsDevice.canvas.toDataURL('image/png')));app.renderNextFrame=true;});const bitmap=await createImageBitmap(await(await fetch(img)).blob()),probe=document.createElement('canvas');probe.width=96;probe.height=96;const c=probe.getContext('2d');c.drawImage(bitmap,0,0,96,96);bitmap.close();const data=c.getImageData(0,0,96,96).data,colors=new Set();for(let j=0;j<data.length;j+=4)colors.add((data[j]>>4)*256+(data[j+1]>>4)*16+(data[j+2]>>4));if(colors.size>=8)return img;}throw Error('empty active contact frame');
     },{f:poolFixtureVisualPose(f),pose:state.pose});
     writeFileSync(out+'/'+name+'-entry-'+kind+'-'+(legacy?'legacy':'native')+'.png',Buffer.from(img.split(',')[1],'base64'));
     assert.deepEqual(errors,[]);active.push({name,kind,id,fraction,legacy,state});writeFileSync(out+'/active.json',JSON.stringify(active,null,2));
    }finally{await ctx.close();}
   }
  }}finally{await browser.close();}
 }
