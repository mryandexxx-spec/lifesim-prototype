/** LOT-A: real PlayCanvas/WebGL and mobile tap-to-walk at four CSS viewports. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const seed=newHousehold('2026-11-16');
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
seed.paused=true;seed.otherSim.paused=true;
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const issues=[];
function projectYard(w,h){
 const yaw=42*Math.PI/180,pitch=47*Math.PI/180,dist=44.5;
 const cx=0,cy=.62,cz=0,x=0,y=-.53,z=5;
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
try{
 for(const [w,h] of [[390,844],[375,667],[320,568],[844,390]]){
  const context=await browser.newContext({viewport:{width:w,height:h},
    deviceScaleFactor:1,hasTouch:true,isMobile:true});
  await context.addInitScript(({key,record,tourKey})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
    localStorage.setItem(tourKey,'done');
  },{key:SAVE_KEY,record:seed,tourKey:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage();
  page.on('pageerror',e=>issues.push(w+'x'+h+' PAGE: '+e.message));
  page.on('crash',()=>issues.push(w+'x'+h+' CRASH'));
  page.on('requestfailed',r=>{
    if(/\\/src\\/|\\/vendor\\//.test(r.url()))
      issues.push(w+'x'+h+' REQUEST: '+r.url()+' '+r.failure()?.errorText);
  });
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
  await page.locator('#game-canvas').evaluate(canvas=>{
    canvas.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:2300}));
  });
  await page.waitForTimeout(220);
  const yard=projectYard(w,h);
  assert.ok(yard.x>20&&yard.x<w-20&&yard.y>60&&yard.y<h-60,
    'Test must touch visible outdoor terrain, not the HUD');
  const ptr=async(type,point,id=41,where='canvas')=>page.evaluate(({type,point,id,where})=>{
    const element=where==='canvas'?document.querySelector('#game-canvas'):window;
    element.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,
      pointerType:'touch',pointerId:id,button:0,buttons:type==='pointerup'?0:1,
      clientX:point.x,clientY:point.y}));
  },{type,point,id,where});
  await ptr('pointerdown',yard);await ptr('pointerup',yard,41,'window');
  await page.waitForTimeout(160);
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
  assert.equal(saved.world.outdoors.schema,1);
  assert.equal(saved.actionQueues.byResident.alex.length,1,
    'Physical tap must queue exactly one manual walk');
  const cmd=saved.actionQueues.byResident.alex[0];
  assert.equal(cmd.type,'move');
  assert.ok(cmd.z>=4.4&&cmd.z<=5.6,'Tap lands on real lawn rather than an object');
  assert.equal(saved.shop.credits,seed.shop.credits);
  // A gesture moves camera; it must not enqueue another command.
  await ptr('pointerdown',yard,45);
  await ptr('pointermove',{x:yard.x+70,y:yard.y-25},45,'window');
  await ptr('pointerup',{x:yard.x+70,y:yard.y-25},45,'window');
  const swiped=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
  assert.equal(swiped.actionQueues.byResident.alex.length,1);
  await page.screenshot({path:'lot-a-'+w+'x'+h+'.png'});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
  const restored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
  assert.equal(restored.actionQueues.byResident.alex[0].type,'move');
  await context.close();
 }
 assert.deepEqual(issues,[],'No module/scene runtime errors');
 console.log('LOT-A real WebGL free-walk tap, gesture and save PASS: four viewports');
}finally{await browser.close();}
