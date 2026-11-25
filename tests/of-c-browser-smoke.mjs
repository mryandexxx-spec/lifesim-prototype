import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
import {newHousehold} from '../src/household.js';
import {restoreOutdoorsWorld} from '../src/lot-surface.js';
import {newGardenRecord} from '../src/gardening.js';
import {OUTDOOR_CATALOG} from '../src/outdoor-catalog.js';
import {OF_GARDEN_ASSETS,gardenModelState} from '../src/of-garden-assets.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const out='artifacts/of-c';mkdirSync(out,{recursive:true});
const species=Object.keys(OF_GARDEN_ASSETS);
function fixture(group){
 const seed=newHousehold('2026-11-25');seed.minutes=6*1440+720;seed.otherSim.minutes=seed.minutes;seed.paused=true;seed.otherSim.paused=true;seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
 const configurations=group===0?species.flatMap(s=>[[s,0,false,false],[s,1,true,false]]):group===1?species.flatMap(s=>[[s,2,true,false],[s,3,false,false]]):[...species.map(s=>[s,3,true,false]),...species.filter(s=>s.includes('.herb.')).map(s=>[s,3,true,true])];
 const features=[],gardens={};
 for(const [i,[sku,stage,wet,harvested]] of configurations.entries()){
  const f={instanceId:'out-'+(i+1),itemId:sku,x:15.5+(i%4)*2,z:-5+Math.floor(i/4)*2.5,yaw:i%4*90,purchasePriceCredits:OUTDOOR_CATALOG[sku].price};
  features.push(f);gardens[f.instanceId]={...newGardenRecord(0),evaluatedAt:seed.minutes,progressWetMinutes:stage*1440,hydratedUntil:wet?seed.minutes+1000:0,lastWateredAt:wet?seed.minutes:null,harvestedAt:harvested?seed.minutes:null};
 }
 seed.world.outdoors={...seed.world.outdoors,features,gardens,nextId:features.length+1};
 const restored=restoreOutdoorsWorld(seed.world.outdoors,seed.world.construction);
 assert.deepEqual(restored.features,features);assert.deepEqual(restored.gardens,gardens);
 return {seed,features,gardens,expected:configurations.map(([sku,stage,wet,harvested])=>gardenModelState(sku,{stage,waterRemaining:wet?1000:0,harvestedAt:harvested?seed.minutes:null}))};
}
const report=[];
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const b=await engine.launch(name==='chromium'?{headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}:{headless:true});
 try{for(const [width,height] of [[390,844],[320,568]])for(let group=0;group<3;group++){
  const {seed,features,gardens,expected}=fixture(group);const ctx=await b.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  try{
   await ctx.addInitScript(({key,tour,seed})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));localStorage.setItem(tour,'done');},{key:SAVE_KEY,tour:UI_TOUR_STORAGE_KEY,seed});
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('crash'));
   const ready=async()=>{await page.locator('#loading').waitFor({state:'hidden',timeout:100000});await page.waitForFunction(n=>{const s=window.__LifeSimGardenStats?.();return s&&s.plots.length===n&&s.plots.every(p=>p.attached&&!p.fallbackVisible)&&!s.failures;},features.length,{timeout:100000});};
   await page.goto('http://127.0.0.1:8765/?furniture=qa',{waitUntil:'domcontentloaded'});await ready();
   const stats=await page.evaluate(()=>window.__LifeSimGardenStats());
   for(const [i,f] of features.entries()){const p=stats.plots.find(p=>p.node==='LOT-B2 '+f.instanceId+' '+f.itemId),e=expected[i];assert.ok(p&&p.meshInstances>0);assert.equal(p.variant,e.variant);assert.equal(p.wet,e.wet);assert.equal(p.soil,e.wet?'Wet soil':'Dry soil');}
   const capture=async f=>page.evaluate(async f=>{
    const {Application,Vec3}=await import('playcanvas');const app=Application.getApplication(),cam=app.root.findByName('Camera'),node=f&&app.root.findByName('LOT-B2 '+f.instanceId+' '+f.itemId);
    const cp=cam.getPosition().clone(),cr=cam.getRotation().clone(),np=node?.getPosition().clone();
    try{
     if(node){const p=node.getLocalPosition();if(Math.abs(p.x-f.x)>.001||Math.abs(p.y+.53)>.001||Math.abs(p.z-f.z)>.001)throw Error('bad garden origin');node.setPosition(5,18,0);const center=new Vec3(5,18.4,0);cam.setPosition(center.clone().add(new Vec3(.76,.65,-1).normalize().mulScalar(3.8)));cam.lookAt(center);}
     else{cam.setPosition(18,8,1);cam.lookAt(new Vec3(18,-.25,-3.75));}
     await new Promise(r=>setTimeout(r,350));
     for(let i=0;i<8;i++){const img=await new Promise(resolve=>{app.once('postrender',()=>resolve(app.graphicsDevice.canvas.toDataURL('image/png')));app.renderNextFrame=true;});const bitmap=await createImageBitmap(await (await fetch(img)).blob());const probe=document.createElement('canvas');probe.width=96;probe.height=96;const c=probe.getContext('2d');c.drawImage(bitmap,0,0,96,96);bitmap.close();const data=c.getImageData(0,0,96,96).data,colors=new Set();for(let j=0;j<data.length;j+=4)colors.add((data[j]>>4)*256+(data[j+1]>>4)*16+(data[j+2]>>4));if(colors.size>=8)return img;}
     throw Error('empty garden frame');
    }finally{if(node)node.setPosition(np);cam.setPosition(cp);cam.setRotation(cr);}
   },f);
   const store=(file,png)=>writeFileSync(out+'/'+file+'.png',Buffer.from(png.split(',')[1],'base64'));
   store(name+'-'+width+'-group'+group+'-lot',await capture(null));
   if(width===390)for(const [i,f] of features.entries())store(name+'-'+f.itemId+'-'+expected[i].variant,await capture(f));
   await page.reload({waitUntil:'domcontentloaded'});await ready();
   const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
   assert.equal(saved.version,1);assert.deepEqual(saved.world.outdoors.features,features);assert.deepEqual(saved.world.outdoors.gardens,gardens);
   // Live clock crossing: wet sprout and growing are seeded just before
   // their next boundary in a separate document; no direct mutation of the live game.
   assert.deepEqual(errors,[]);report.push({name,width,group,stats});writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
  }finally{await ctx.close();}
 }}finally{await b.close();}
}
