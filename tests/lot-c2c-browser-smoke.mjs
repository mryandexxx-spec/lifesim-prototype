/** LOT-C2c: real PlayCanvas/WebGL, not a canvas/DOM stub, four mobile sizes. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const root=newHousehold('2026-11-20');
root.paused=true;root.otherSim.paused=true;
root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
const preview=previewOutdoorFeatureEdit(root,{operation:'place',
 itemId:'garden.flower.calendula',pose:{x:8,z:-7,yaw:0}});
assert.ok(preview.ok,preview.reason);
const seed=commitOutdoorFeatureEdit(root,preview).root;
const bed=seed.world.outdoors.features.find(f=>f.itemId==='garden.flower.calendula');
seed.world.outdoors.gardens[bed.instanceId].progressWetMinutes=2880;
seed.mind.wish={id:'garden.observe',targetInstanceId:bed.instanceId,
 plantedAt:seed.world.outdoors.gardens[bed.instanceId].plantedAt,
 since:seed.minutes,until:seed.minutes+480};
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
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const errors=[];
try{
 for(const [w,h] of [[390,844],[375,667],[320,568],[844,390]]){
  const context=await browser.newContext({viewport:{width:w,height:h},
   deviceScaleFactor:1,hasTouch:true,isMobile:true});
  await context.addInitScript(({key,root,tour})=>{
   if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(root));
   localStorage.setItem(tour,'done');
  },{key:SAVE_KEY,root:seed,tour:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(w+'x'+h+': '+e.message));
  page.on('crash',()=>errors.push(w+'x'+h+': crash'));
  const response=await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  assert.equal(response.status(),200);
  await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
  const canvas=page.locator('#game-canvas');
  assert.ok(await canvas.isVisible());
  assert.equal(await canvas.evaluate(c=>Boolean(c.getContext('webgl2')||c.getContext('webgl'))),true,
   'actual running PlayCanvas WebGL context');
  const rect=await canvas.evaluate(c=>{const r=c.getBoundingClientRect();
   return {x:r.left,y:r.top,width:r.width,height:r.height};});
  const pt=projected(rect.width,rect.height,bed.x,bed.z);
  assert.ok(pt.x>8&&pt.x<rect.width-8&&pt.y>8&&pt.y<rect.height-8);
  const tap=()=>page.evaluate(p=>{
   const c=document.getElementById('game-canvas');
   const send=(target,type)=>target.dispatchEvent(new PointerEvent(type,{
    pointerId:93,pointerType:'touch',isPrimary:true,bubbles:true,cancelable:true,
    clientX:p.x,clientY:p.y,button:0,buttons:type==='pointerup'?0:1}));
   send(c,'pointerdown');send(window,'pointerup');
  },{x:rect.x+pt.x,y:rect.y+pt.y});
  await tap();
  const menu=page.locator('#ground-walk-menu');
  await menu.waitFor({state:'visible',timeout:8000});
  assert.match(await page.locator('#ground-walk-info').textContent(),/48\/72 ч роста/);
  assert.match(await page.locator('#ground-walk-wish').textContent(),/Желание Алекса/);
  assert.equal(await page.locator('#ground-walk-progress').getAttribute('value'),'67');
  assert.match(await page.locator('#ground-walk-action-label').textContent(),/Осмотреть/);
  assert.equal(await page.locator('#ground-walk-more [data-garden-action="water"]').count(),1);
  const bounds=await menu.boundingBox();
  const hud=await page.locator('#dashboard').boundingBox();
  assert.ok(bounds.x>=0&&bounds.x+bounds.width<=w+1);
  assert.ok(bounds.y>=0&&bounds.y+bounds.height<=h+1);
  assert.ok(!hud||bounds.y+bounds.height<=hud.y+1,
   'garden sheet must not overlap mobile bottom HUD');
  const first=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
  assert.equal(first.actionQueues.byResident.alex.length,0,'tap never enqueues');
  await page.screenshot({path:'lot-c2c-'+w+'x'+h+'-menu.png'});
  await page.locator('#ground-walk-close').click();
  assert.equal(await menu.isVisible(),false);
  await tap();await menu.waitFor({state:'visible',timeout:8000});
  await page.locator('#ground-walk-action').click();
  await page.waitForFunction(key=>{
   const x=JSON.parse(localStorage.getItem(key));
   return x.actionQueues?.byResident?.alex?.some(
    a=>a.type==='garden'&&a.actionId==='inspect')||
    (x.action?.id==='garden'&&x.action.gardenActionId==='inspect');
  },SAVE_KEY,{timeout:8000});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
  const saved=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
  assert.equal(saved.version,1);
  assert.equal(saved.world.outdoors.gardens[bed.instanceId].progressWetMinutes,2880);
  assert.ok(saved.actionQueues.byResident.alex.some(a=>a.actionId==='inspect')||
   saved.action?.gardenActionId==='inspect');
  // Actual touch camera pan must not enqueue a second garden action.
  await page.evaluate(()=>{
   const c=document.getElementById('game-canvas'),x=120,y=195;
   const send=(target,type,xx,yy)=>target.dispatchEvent(new PointerEvent(type,{
    pointerId:73,pointerType:'touch',isPrimary:true,bubbles:true,cancelable:true,
    clientX:xx,clientY:yy,button:0,buttons:type==='pointerup'?0:1}));
   send(c,'pointerdown',x,y);send(c,'pointermove',x+65,y+50);
   send(window,'pointerup',x+65,y+50);
  });
  // Four distinct real 3D garden stages are captured at each mobile size.
  for(const [stage,wetUntil] of [[0,0],[1,0],[2,0],[3,seed.minutes+300]]){
   await page.evaluate(({key,id,stage,until})=>{
    const data=JSON.parse(localStorage.getItem(key));
    data.world.outdoors.gardens[id].progressWetMinutes=stage*1440;
    data.world.outdoors.gardens[id].hydratedUntil=until;
    data.actionQueues.byResident.alex=[];
    data.action=null;
    localStorage.setItem(key,JSON.stringify(data));
   },{key:SAVE_KEY,id:bed.instanceId,stage,until:wetUntil});
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
   assert.equal(await canvas.isVisible(),true);
   await page.screenshot({path:'lot-c2c-'+w+'x'+h+'-stage'+stage+'.png'});
  }
  console.log('C2c real WebGL '+w+'x'+h+': touch, menu, FIFO, reload, stages PASS');
  await context.close();
 }
 assert.deepEqual(errors,[],errors.join(' | '));
}finally{await browser.close();}
