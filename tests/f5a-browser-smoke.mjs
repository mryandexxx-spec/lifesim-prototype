import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold,loadHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {proposeConstructionEdit} from '../src/construction.js';
const state=newHousehold();
const room=proposeConstructionEdit(state.world.construction,{type:'room',from:{x:14,z:-2},to:{x:18,z:2}});
assert.ok(room.ok,room.reason);
const wall=room.world.wallEdges.find(w=>w.axis==='v'&&w.i===28&&w.j===0);
const door=proposeConstructionEdit(room.world,{type:'door',edgeId:wall.id});
assert.ok(door.ok,door.reason);
state.world.construction=door.world;
state.autonomy.enabled=false;state.otherSim.autonomy.enabled=false;
assert.equal(loadHousehold(state).world.construction.wallEdges.length,32);
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
 await ctx.addInitScript(({key,value})=>{
   localStorage.setItem(key,JSON.stringify(value));
   localStorage.setItem('lifesim.uiTour.v1','done');
 },{key:SAVE_KEY,value:state});
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push('PAGE '+e.stack));
 page.on('crash',()=>errors.push('CRASH'));
 page.on('requestfailed',r=>{
   if(r.url().includes('/src/')||r.url().includes('/vendor/'))
     errors.push('REQUEST '+r.url()+' '+r.failure()?.errorText);
 });
 await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
 await page.locator('#loading').waitFor({state:'hidden',timeout:25000});
 await page.locator('#build-toggle').click();
 assert.equal(await page.locator('#build-toggle').getAttribute('aria-pressed'),'true');
 assert.ok(await page.locator('#build-editor').isVisible());
 await page.locator('[data-build-tool="wall"]').click();
 assert.equal(await page.locator('[data-build-tool="wall"]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-build-walls="down"]').click();
 assert.equal(await page.locator('[data-build-walls="down"]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-build-walls="cut"]').click();
 await page.locator('[data-build-tool="remove-opening"]').click();
 await page.locator('[data-build-tool="move-wall"]').click();
 await page.locator('[data-build-tool="room"]').click();
 // Run an actual mobile-sized pointer transaction on an empty eastern ground patch.
 // The projection uses the exact initial camera pose set by the build editor.
 const project=(x,z)=>{
   const yaw=42*Math.PI/180,pitch=64*Math.PI/180,distance=36;
   const cx=11.5,cy=.62,cz=0,w=390,h=844;
   const px=cx+Math.sin(yaw)*Math.cos(pitch)*distance;
   const py=cy+Math.sin(pitch)*distance;
   const pz=cz+Math.cos(yaw)*Math.cos(pitch)*distance;
   const rx=x-px,ry=-py,rz=z-pz;
   const right=rx*Math.cos(yaw)-rz*Math.sin(yaw);
   const up=-rx*Math.sin(yaw)*Math.sin(pitch)+ry*Math.cos(pitch)-
     rz*Math.cos(yaw)*Math.sin(pitch);
   const forward=-rx*Math.sin(yaw)*Math.cos(pitch)-ry*Math.sin(pitch)-
     rz*Math.cos(yaw)*Math.cos(pitch);
   const size=forward*Math.tan(41*Math.PI/360);
   return {x:w/2+right/(size*w/h)*w/2,y:h/2-up/size*h/2};
 };
 const from=project(15.2,-4.4),to=project(17.2,-2.4);
 const trace={from,to};
 console.log('F5-A touch stroke:',JSON.stringify(trace));
 assert.ok(from.x>0&&from.x<390&&to.x>0&&to.x<390&&
   from.y>120&&from.y<520&&to.y>120&&to.y<520,
   'Construction test touch points must be visible above panel');
 const send=async(type,point,where)=>page.evaluate(({type,point,where})=>{
   const node=where==='canvas'?document.querySelector('#game-canvas'):window;
   node.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,
     pointerType:'touch',pointerId:51,button:0,buttons:type==='pointerup'?0:1,
     clientX:point.x,clientY:point.y}));
 },{type,point,where});
 await send('pointerdown',from,'canvas');
 await send('pointermove',to,'window');
 await send('pointerup',to,'window');
 console.log('Construction feedback:',await page.locator('#build-feedback').innerText());
 assert.ok(await page.locator('#build-pending').isVisible(),
   'Dragging an empty floor rectangle must stage an explicit build transaction');
 await page.locator('#build-apply').click();
 assert.ok(await page.locator('#build-pending').isHidden());
 await page.screenshot({path:'f5a-browser-build.png'});
 await page.locator('#build-exit').click();
 assert.equal(await page.locator('#build-toggle').getAttribute('aria-pressed'),'false');
 assert.ok(await page.locator('#build-editor').isHidden());
 await page.locator('#build-toggle').click();
 assert.ok(await page.locator('#build-editor').isVisible());
 await page.locator('#build-exit').click();
 await page.waitForTimeout(500);
 const saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
 assert.equal(saved.world.construction.wallEdges.length,32);
 assert.ok(saved.world.construction.revision>door.world.revision,'Dragged floor edit persisted');
 assert.equal(saved.world.construction.openings.length,1);
 assert.equal(saved.world.construction.schema,1);
 console.log(JSON.stringify({errors,wallEdges:saved.world.construction.wallEdges.length,
  openings:saved.world.construction.openings.length,buildModeToggle:'ok'},null,2));
 assert.deepEqual(errors,[],'Real PlayCanvas/ES module browser runtime must not error');
}finally{await browser.close();}
