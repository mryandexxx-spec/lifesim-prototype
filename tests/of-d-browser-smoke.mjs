import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
import {newHousehold,loadHousehold} from '../src/household.js';
import {restoreOutdoorsWorld} from '../src/lot-surface.js';
import {OUTDOOR_CATALOG} from '../src/outdoor-catalog.js';
import {OF_OUTDOOR_ASSETS} from '../src/of-outdoor-assets.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
import {outdoorBenchApproach} from '../src/outdoor-interactions.js';
import {grillApproach} from '../src/grill-r1.js';
const out='artifacts/of-d';mkdirSync(out,{recursive:true});const ids=Object.keys(OF_OUTDOOR_ASSETS),report=[];
function fixture(night,active){const seed=newHousehold('2026-11-25');seed.minutes=6*1440+(night?0:720);seed.otherSim.minutes=seed.minutes;seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
 const features=ids.map((sku,i)=>({instanceId:'out-'+(i+1),itemId:sku,x:15.5+i%4*2,z:-5+Math.floor(i/4)*2.5,yaw:i%4*90,purchasePriceCredits:OUTDOOR_CATALOG[sku].price}));
 seed.world.outdoors={...seed.world.outdoors,features,nextId:features.length+1};assert.deepEqual(restoreOutdoorsWorld(seed.world.outdoors,seed.world.construction).features,features);
 if(active){const bench=features[0],grill=features[2];seed.position=outdoorBenchApproach(seed.world,bench.instanceId);seed.action={id:'bench',phase:'using',elapsed:3,automatic:false,targetInstanceId:bench.instanceId};seed.otherSim.position=grillApproach(seed.world,grill.instanceId);seed.otherSim.action={id:'grill',phase:'using',elapsed:3,automatic:false,targetInstanceId:grill.instanceId,recipeId:'grill.vegetables',grillStage:'cooking'};const r=loadHousehold(structuredClone(seed));assert.equal(r.action?.id,'bench');assert.equal(r.otherSim.action?.id,'grill');}
 return {seed,features};}
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const b=await engine.launch(name==='chromium'?{headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}:{headless:true});
 try{for(const [width,height] of [[390,844],[320,568]])for(const night of [false,true]){
  const {seed,features}=fixture(night,night);const ctx=await b.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block'});
  try{await ctx.addInitScript(({key,tour,seed})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));localStorage.setItem(tour,'done');},{key:SAVE_KEY,tour:UI_TOUR_STORAGE_KEY,seed});
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('crash'));
   const url='http://127.0.0.1:8765/?furniture=qa&garden-start-paused=1';
   const ready=async()=>{await page.locator('#loading').waitFor({state:'hidden',timeout:100000});await page.waitForFunction(n=>{const s=window.__LifeSimOutdoorFurnitureStats?.();return s&&s.objects.length===n&&s.objects.every(p=>p.attached&&!p.fallbackVisible&&p.meshInstances>0)&&!s.failures;},features.length,{timeout:100000});};
   await page.goto(url,{waitUntil:'domcontentloaded'});await ready();
   const scene=async()=>page.evaluate(async()=>{const {Application}=await import('playcanvas');const app=Application.getApplication();const grill=app.root.findByName('LOT-B2 out-3 garden.grill'),skewers=grill.children.filter(n=>n.name==='GRILL-R1 animated skewer');return {stats:window.__LifeSimOutdoorFurnitureStats(),lights:app.root.findComponents('light').filter(l=>l.entity.name.startsWith('LOT-B3 ')).map(l=>({name:l.entity.name,intensity:l.intensity,position:l.entity.getLocalPosition().y,shadow:l.castShadows})),skewers:skewers.map(n=>({position:n.getLocalPosition().y,angle:n.getLocalEulerAngles().x,rod:n.findByName('grill skewer rod')?.render.enabled,food:n.children.filter(c=>c.name==='grill food piece').filter(c=>c.enabled).length}))};});
   const s=await scene();assert.equal(s.lights.length,2);assert.ok(s.lights.every(l=>!l.shadow&&(night?l.intensity>0:l.intensity===0)));assert.equal(s.skewers.length,3);assert.ok(s.skewers.every(k=>k.rod&&Math.abs(k.position-1.115)<.001));
   if(night){await page.waitForFunction(async()=>{const {Application}=await import('playcanvas');const g=Application.getApplication().root.findByName('LOT-B2 out-3 garden.grill');return g.children.filter(n=>n.name==='GRILL-R1 animated skewer').every(n=>n.children.filter(c=>c.name==='grill food piece'&&c.enabled).length===3);},null,{timeout:20000});}
   const capture=async f=>page.evaluate(async f=>{
    const {Application,Vec3}=await import('playcanvas');const app=Application.getApplication(),cam=app.root.findByName('Camera'),node=f&&app.root.findByName('LOT-B2 '+f.instanceId+' '+f.itemId);
    const cp=cam.getPosition().clone(),cr=cam.getRotation().clone(),np=node?.getPosition().clone();
    try{
     if(node){const p=node.getLocalPosition();if(Math.abs(p.x-f.x)>.001||Math.abs(p.y+.53)>.001||Math.abs(p.z-f.z)>.001)throw Error('bad outdoor origin');if(!f.inPlace)node.setPosition(5,18,0);const tall=f.itemId==='light.standing';const p0=node.getPosition();const center=new Vec3(p0.x,p0.y+(tall?1.35:f.inPlace?1.05:.68),p0.z);cam.setPosition(center.clone().add(new Vec3(.76,.55,-1).normalize().mulScalar(tall?5.8:3.8)));cam.lookAt(center);}
     else{cam.setPosition(18,8,1);cam.lookAt(new Vec3(18,-.25,-3.75));}
     await new Promise(r=>setTimeout(r,350));
     for(let i=0;i<8;i++){const img=await new Promise(resolve=>{app.once('postrender',()=>resolve(app.graphicsDevice.canvas.toDataURL('image/png')));app.renderNextFrame=true;});const bitmap=await createImageBitmap(await (await fetch(img)).blob());const probe=document.createElement('canvas');probe.width=96;probe.height=96;const c=probe.getContext('2d');c.drawImage(bitmap,0,0,96,96);bitmap.close();const data=c.getImageData(0,0,96,96).data,colors=new Set();for(let j=0;j<data.length;j+=4)colors.add((data[j]>>4)*256+(data[j+1]>>4)*16+(data[j+2]>>4));if(colors.size>=8)return img;}
     throw Error('empty outdoor frame');
    }finally{if(node)node.setPosition(np);cam.setPosition(cp);cam.setRotation(cr);}
   },f);

   const store=(file,png)=>writeFileSync(out+'/'+file+'.png',Buffer.from(png.split(',')[1],'base64'));
   const label=name+'-'+width+'-'+(night?'night':'day');store(label+'-lot',await capture(null));
   if(night){
    const savedActors=await page.evaluate(()=>window.__LifeSimGardenSessionQA().actors);
    assert.equal(savedActors.alex.action?.id,'bench');assert.equal(savedActors.mira.action?.id,'grill');
    for(const [id,p] of [['alex',seed.position],['mira',seed.otherSim.position]])assert.ok(Math.hypot(savedActors[id].position.x-p.x,savedActors[id].position.z-p.z)<.45,'loaded outdoor contact '+id);
    await page.locator('#pause-btn').click();
    await page.waitForFunction(async()=>{const {Application}=await import('playcanvas');const g=Application.getApplication().root.findByName('LOT-B2 out-3 garden.grill');return g.children.filter(n=>n.name==='GRILL-R1 animated skewer').some(n=>Math.abs(n.getLocalEulerAngles().x)>4);},null,{timeout:15000});
    await page.waitForTimeout(800);
    await page.locator('#pause-btn').click();
    store(label+'-active-bench',await capture({...features[0],inPlace:true}));
    store(label+'-active-grill',await capture({...features[2],inPlace:true}));
   }
   if(width===390)for(const f of features)store(label+'-new-'+f.itemId,await capture(f));
   await page.reload({waitUntil:'domcontentloaded'});await ready();const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);assert.equal(saved.version,1);assert.deepEqual(saved.world.outdoors.features,features);
   if(width===390){await page.goto(url+'&outdoor-furniture=legacy',{waitUntil:'domcontentloaded'});await page.locator('#loading').waitFor({state:'hidden',timeout:100000});assert.equal((await page.evaluate(()=>window.__LifeSimOutdoorFurnitureStats())).objects.length,0);for(const f of features)store(label+'-legacy-'+f.itemId,await capture(f));}
   assert.deepEqual(errors,[]);report.push({name,width,night,scene:s});writeFileSync(out+'/report.json',JSON.stringify(report,null,2));
  }finally{await ctx.close();}
 }}finally{await b.close();}
}
