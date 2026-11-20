/** LOT-C3c: actual PlayCanvas/SwiftShader WebGL and touch UX, four mobile viewports.
 * Chromium mobile emulation is NOT physical iPhone Safari acceptance.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const sizes=[[390,844],[375,667],[320,568],[844,390]];
const artifacts='lot-c3c-artifacts';
mkdirSync(artifacts,{recursive:true});
const root=newHousehold('2026-11-20');
root.paused=true;root.otherSim.paused=true;
root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
root.kitchen.pantry.herbs=14;
// Place the 110-credit bed at normal starting funds, then seed the grocery QA wallet.
const proposed=previewOutdoorFeatureEdit(root,{operation:'place',
  itemId:'garden.herb.mint',pose:{x:8,z:-7,yaw:0}});
assert.ok(proposed.ok,proposed.reason);
const seed=commitOutdoorFeatureEdit(root,proposed).root;
seed.shop.credits=60;
const plot=seed.world.outdoors.features.find(f=>f.itemId==='garden.herb.mint');
Object.assign(seed.world.outdoors.gardens[plot.instanceId],
  {progressWetMinutes:4320,evaluatedAt:seed.minutes});

function projected(w,h,x,z,y=-.53){
 const yaw=42*Math.PI/180,pitch=60*Math.PI/180,dist=43;
 const cx=7,cy=.62,cz=0;
 const px=cx+Math.sin(yaw)*Math.cos(pitch)*dist;
 const py=cy+Math.sin(pitch)*dist;
 const pz=cz+Math.cos(yaw)*Math.cos(pitch)*dist;
 const rx=x-px,ry=y-py,rz=z-pz;
 const right=rx*Math.cos(yaw)-rz*Math.sin(yaw);
 const up=-rx*Math.sin(yaw)*Math.sin(pitch)+ry*Math.cos(pitch)-
   rz*Math.cos(yaw)*Math.sin(pitch);
 const forward=-rx*Math.sin(yaw)*Math.cos(pitch)-ry*Math.sin(pitch)-
   rz*Math.cos(yaw)*Math.cos(pitch);
 const size=forward*Math.tan(41*Math.PI/360);
 return {x:w/2+right/(size*w/h)*w/2,y:h/2-up/size*h/2};
}
const errors=[],report=[];
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
try{
 for(const [w,h] of sizes){
  const context=await browser.newContext({viewport:{width:w,height:h},
    isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await context.addInitScript(({key,record,tour})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
    localStorage.setItem(tour,'done');
  },{key:SAVE_KEY,record:seed,tour:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(w+'x'+h+' pageerror: '+e.message));
  page.on('crash',()=>errors.push(w+'x'+h+' browser crash'));
  page.on('requestfailed',r=>{
    if(r.url().includes('/src/')||r.url().includes('/vendor/'))
      errors.push(w+'x'+h+' failed source: '+r.url());
  });
  const persisted=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
  const ready=async()=>{
    const response=await page.goto('http://127.0.0.1:8765/',
      {waitUntil:'domcontentloaded'});
    assert.equal(response.status(),200);
    await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    const canvas=page.locator('#game-canvas');
    assert.equal(await canvas.isVisible(),true);
    assert.equal(await canvas.evaluate(c=>Boolean(
      c.getContext('webgl2')||c.getContext('webgl'))),true,
      'a genuine PlayCanvas WebGL context, not stubbed canvas');
  };
  const lot=async()=>{
    await page.locator('#home-open').tap();
    await page.locator('#home-outdoors').tap();
    await page.locator('#outdoor-exit').tap();
  };
  const tapPlot=async()=>{
    const rect=await page.locator('#game-canvas').evaluate(c=>{
      const r=c.getBoundingClientRect();
      return {x:r.left,y:r.top,w:r.width,h:r.height};
    });
    const p=projected(rect.w,rect.h,plot.x,plot.z);
    assert.ok(p.x>8&&p.x<rect.w-8&&p.y>8&&p.y<rect.h-8,
      'plot projected inside mobile view');
    await page.evaluate(pos=>{
      const c=document.getElementById('game-canvas');
      const send=(target,type)=>target.dispatchEvent(new PointerEvent(type,{
        pointerId:91,pointerType:'touch',isPrimary:true,bubbles:true,cancelable:true,
        clientX:pos.x,clientY:pos.y,button:0,buttons:type==='pointerup'?0:1
      }));
      send(c,'pointerdown');send(window,'pointerup');
    },{x:rect.x+p.x,y:rect.y+p.y});
    await page.locator('#ground-walk-menu').waitFor({state:'visible',timeout:8000});
  };
  try{
   await ready();
   await lot();
   await tapPlot();
   assert.match(await page.locator('#ground-walk-title').textContent(),/Мята/i);
   assert.match(await page.locator('#ground-walk-info').textContent(),/Можно собрать/);
   assert.match(await page.locator('#ground-walk-info').textContent(),/14\/16/);
   // A legitimate C2b garden wish can promote Admire above Harvest.
   // Choose harvest explicitly instead of assuming it is always the primary CTA.
   const primaryHarvest=/Собрать/.test(await page.locator('#ground-walk-action-label').textContent());
   const harvestButton=primaryHarvest?page.locator('#ground-walk-action'):
     page.locator('#ground-walk-more [data-garden-action="harvest"]');
   assert.equal(await harvestButton.count(),1,'harvest remains an explicit option');
   assert.equal(await harvestButton.isEnabled(),true,'ripe herb capacity 14/16 is harvestable');
   const menu=await page.locator('#ground-walk-menu').boundingBox();
   const hud=await page.locator('#dashboard').boundingBox();
   assert.ok(menu.x>=0&&menu.x+menu.width<=w+1&&menu.y>=0&&
     menu.y+menu.height<=h+1,'garden menu fits mobile viewport');
   assert.ok(!hud||menu.y+menu.height<=hud.y+1,'garden menu avoids bottom HUD');
   assert.equal((await persisted()).kitchen.pantry.herbs,14,
     'touch cannot mint a crop before explicit action');
   await page.screenshot({path:artifacts+'/harvest-'+w+'x'+h+'.png',
     animations:'disabled'});
   await page.locator('#ground-walk-close').tap();
   assert.equal((await persisted()).actionQueues.byResident.alex.length,0);
   await tapPlot();
   await harvestButton.tap();
   await page.waitForFunction(key=>{
     const x=JSON.parse(localStorage.getItem(key));
     return x.actionQueues?.byResident?.alex?.some(
       q=>q.type==='garden'&&q.actionId==='harvest')||
       x.action?.gardenActionId==='harvest';
   },SAVE_KEY,{timeout:8000});
   assert.equal((await persisted()).kitchen.pantry.herbs,14,
     'queueing is not physical harvest completion');
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
   let saved=await persisted();
   assert.equal(saved.version,1);
   assert.equal(saved.kitchen.pantry.herbs,14);
   assert.ok(saved.actionQueues.byResident.alex.some(x=>x.actionId==='harvest')||
     saved.action?.gardenActionId==='harvest','queued harvest survived reload');
   // Existing optional on-screen object labels are a supported fridge entry path.
   // Use them to reach genuine touch buying UI without a brittle 3D fridge ray.
   const fridge=page.locator('#hotspots button.hotspot').filter({hasText:/холодильник/i});
   assert.equal(await fridge.count(),1,'fridge has accessible original hotspot');
   await fridge.evaluate(element=>element.click());
   assert.equal(await page.locator('#fridge-buy-button').isVisible(),true);
   assert.equal(await page.locator('#fridge-staple-select').isVisible(),true);
   const button=await page.locator('#fridge-buy-button').boundingBox();
   assert.ok(button.height>=44,'fridge buying target at least 44 px');
   await page.locator('#fridge-staple-select').selectOption('vegetables');
   page.once('dialog',dialog=>dialog.dismiss());
   await page.locator('#fridge-buy-button').tap();
   saved=await persisted();
   assert.equal(saved.shop.credits,60,'dismissed confirmation is cost-free');
   assert.equal(saved.kitchen.pantry.vegetables,8);
   page.once('dialog',dialog=>dialog.accept());
   await page.locator('#fridge-buy-button').tap();
   saved=await persisted();
   assert.equal(saved.shop.credits,45,'only accepted purchase debits 15');
   assert.equal(saved.kitchen.pantry.vegetables,13,'one purchase adds exactly 5');
   assert.equal(saved.financialHistory.entries.length,
     seed.financialHistory.entries.length+1,'garden and grocery purchases have distinct receipts');
   await page.screenshot({path:artifacts+'/groceries-'+w+'x'+h+'.png',
     animations:'disabled'});
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
   saved=await persisted();
   assert.equal(saved.shop.credits,45);
   assert.equal(saved.kitchen.pantry.vegetables,13);
   assert.equal(saved.kitchen.pantry.herbs,14);
   // Pagehide autosave rewrites localStorage on reload. Inject this seeded
   // capacity scenario in the NEW document before game.js reads the snapshot.
   // Otherwise the previous live in-memory 14/16 state overwrites the fixture.
   await context.addInitScript(key=>{
     if(sessionStorage.getItem('lot-c3c-full-herbs')!=='armed')return;
     sessionStorage.removeItem('lot-c3c-full-herbs');
     const x=JSON.parse(localStorage.getItem(key));
     x.kitchen.pantry.herbs=16;
     x.actionQueues.byResident.alex=[];
     x.actionQueues.byResident.mira=[];
     x.action=null;x.otherSim.action=null;
     localStorage.setItem(key,JSON.stringify(x));
   },SAVE_KEY);
   await page.evaluate(()=>sessionStorage.setItem('lot-c3c-full-herbs','armed'));
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
   await lot();await tapPlot();
   assert.match(await page.locator('#ground-walk-info').textContent(),/16\/16/);
   const disabled=page.locator('#ground-walk-more [data-garden-action="harvest"]');
   assert.equal(await disabled.count(),1);
   assert.equal(await disabled.isDisabled(),true,'capacity-full herb harvest forbidden');
   await page.screenshot({path:artifacts+'/blocked-'+w+'x'+h+'.png',
     animations:'disabled'});
   report.push({viewport:w+'x'+h,webgl:true,harvestQueueSaved:true,
     groceryBalance:45,groceryVegetables:13,capacityBlocked:true});
   console.log('C3c real WebGL '+w+'x'+h+': garden FIFO/reload, grocery dialog, cap PASS');
  }catch(e){
   errors.push(w+'x'+h+' '+(e.stack||e));
  }finally{await context.close();}
 }
}finally{await browser.close();}
writeFileSync(artifacts+'/report.json',JSON.stringify({report,errors},null,2));
console.log(JSON.stringify({report,errors},null,2));
assert.deepEqual(errors,[],'LOT-C3c four-viewports real WebGL verification');
