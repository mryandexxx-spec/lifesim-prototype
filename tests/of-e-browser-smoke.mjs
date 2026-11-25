import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
import {newHousehold,loadHousehold} from '../src/household.js';
import {poolCellIndex} from '../src/pool-topology.js';
import {POOL_FIXTURE_PRICES,poolFixtureSite} from '../src/pool-equipment.js';
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
   await page.reload({waitUntil:'domcontentloaded'});await ready();
   const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);assert.equal(saved.version,1);assert.deepEqual(saved.world.outdoors.poolFixtures,fixtures);
   await page.goto(url+'&pool-fixtures=legacy',{waitUntil:'domcontentloaded'});await page.locator('#loading').waitFor({state:'hidden',timeout:100000});assert.equal((await page.evaluate(()=>window.__LifeSimPoolVisualStats())).fixtureModels.objects.length,0);
   await store('legacy-lot',null);for(const f of fixtures)await store('legacy-'+f.kind+'-'+f.side,{...f,pose:poolFixtureVisualPose(f)});
   assert.deepEqual(errors,[]);report.push({name,width,height,stats});writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
  }finally{await ctx.close();}
 }}finally{await b.close();}
}