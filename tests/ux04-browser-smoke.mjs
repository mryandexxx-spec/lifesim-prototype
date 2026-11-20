/** UX-04 genuine PlayCanvas/WebGL, 4 mobile viewports and queue/cancel. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
import {newHousehold} from '../src/household.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {SAVE_KEY} from '../src/simulation.js';
const seed=newHousehold('2026-11-20');
seed.paused=true;seed.otherSim.paused=true;
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
const p=previewOutdoorFeatureEdit(seed,{operation:'place',
  itemId:'garden.flower.calendula',pose:{x:8,z:-7,yaw:0}});
assert.ok(p.ok,p.reason);
const game=commitOutdoorFeatureEdit(seed,p).root;
const bed=game.world.outdoors.features.find(f=>f.itemId==='garden.flower.calendula');
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
mkdirSync('ux04-artifacts',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--enable-webgl',
  '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--disable-dev-shm-usage']});
try{
 for(const [w,h] of [[390,844],[375,667],[320,568],[844,390]]){
  const ctx=await browser.newContext({viewport:{width:w,height:h},
    deviceScaleFactor:1,hasTouch:true,isMobile:true});
  await ctx.addInitScript(({key,root})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(root));
    localStorage.setItem('lifesim.uiTour.v1','done');
  },{key:SAVE_KEY,root:game});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',r=>{if(r.url().includes('/src/'))errors.push(r.url());});
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
  assert.ok(await page.locator('#game-canvas').evaluate(c=>
    Boolean(c.getContext('webgl2')||c.getContext('webgl'))),'live WebGL');
  await page.locator('#home-open').click();
  await page.locator('#home-outdoors').click();
  assert.ok(await page.locator('#outdoor-editor').isVisible());
  for(const id of ['ground','plants','garden','objects']){
    await page.locator('[data-outdoor-palette="'+id+'"]').click();
    assert.equal(await page.locator('#outdoor-category').inputValue(),id);
    assert.equal(await page.locator('[data-outdoor-palette="'+id+'"]')
      .getAttribute('aria-pressed'),'true');
  }
  await page.locator('[data-outdoor-palette="ground"]').click();
  await page.locator('#outdoor-ground-kind').selectOption('stone');
  assert.match(await page.locator('#outdoor-selection-summary').textContent(),
    /8 кр.\/клетка/);
  assert.ok(await page.locator('#outdoor-apply').isDisabled());
  await page.locator('#outdoor-cancel').click();
  assert.ok(await page.locator('#outdoor-apply').isDisabled());
  await page.screenshot({path:'ux04-artifacts/lot-'+w+'x'+h+'.png'});
  await page.locator('#outdoor-exit').click();
  const canvas=page.locator('#game-canvas');
  const rect=await canvas.evaluate(c=>{const r=c.getBoundingClientRect();
    return {x:r.left,y:r.top,width:r.width,height:r.height};});
  const pt=projected(rect.width,rect.height,bed.x,bed.z);
  await page.evaluate(p=>{
    const c=document.getElementById('game-canvas');
    const send=(target,type)=>target.dispatchEvent(new PointerEvent(type,{
      pointerId:197,pointerType:'touch',isPrimary:true,bubbles:true,
      cancelable:true,clientX:p.x,clientY:p.y,button:0}));
    send(c,'pointerdown');send(window,'pointerup');
  },{x:rect.x+pt.x,y:rect.y+pt.y});
  await page.locator('#ground-walk-menu').waitFor({state:'visible',timeout:8000});
  assert.match(await page.locator('#ground-walk-title').textContent(),/Календула/);
  assert.match(await page.locator('#ground-walk-info').textContent(),/роста/);
  const before=JSON.parse(await page.evaluate(k=>localStorage.getItem(k),SAVE_KEY));
  assert.equal(before.actionQueues.byResident.alex.length,0,'tap must not enqueue');
  await page.screenshot({path:'ux04-artifacts/garden-'+w+'x'+h+'.png'});
  await page.locator('#ground-walk-close').click();
  assert.equal(await page.locator('#ground-walk-menu').isVisible(),false);
  // A second explicit tap + chosen water action is the only queue mutation.
  await page.evaluate(p=>{
    const c=document.getElementById('game-canvas');
    const send=(target,type)=>target.dispatchEvent(new PointerEvent(type,{
      pointerId:198,pointerType:'touch',isPrimary:true,bubbles:true,
      cancelable:true,clientX:p.x,clientY:p.y,button:0}));
    send(c,'pointerdown');send(window,'pointerup');
  },{x:rect.x+pt.x,y:rect.y+pt.y});
  await page.locator('#ground-walk-menu').waitFor({state:'visible',timeout:8000});
  const water=page.locator('#ground-walk-more [data-garden-action="water"]');
  if(await water.count())await water.click();
  else{
    assert.match(await page.locator('#ground-walk-action-label').textContent(),/Полить/);
    await page.locator('#ground-walk-action').click();
  }
  await page.waitForFunction(key=>{
    const r=JSON.parse(localStorage.getItem(key));
    return r.actionQueues.byResident.alex.some(a=>
      a.type==='garden'&&a.actionId==='water')||
      (r.action?.id==='garden'&&r.action.gardenActionId==='water');
  },SAVE_KEY,{timeout:8000});
  const queued=JSON.parse(await page.evaluate(k=>localStorage.getItem(k),SAVE_KEY));
  assert.equal(queued.actionQueues.byResident.mira.length,0,'Mira queue untouched');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
  const restored=JSON.parse(await page.evaluate(k=>localStorage.getItem(k),SAVE_KEY));
  assert.equal(restored.version,1);
  assert.ok(restored.actionQueues.byResident.alex.some(a=>a.actionId==='water')||
    (restored.action?.id==='garden'&&restored.action.gardenActionId==='water'));
  assert.equal(errors.length,0,JSON.stringify(errors));
  await ctx.close();
 }
}finally{await browser.close();}
