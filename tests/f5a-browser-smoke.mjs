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
   // Seed only the first page load: a reload must exercise the REAL saved
   // construction world rather than replace it with the test fixture.
   if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(value));
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
   const cx=14.5,cy=.62,cz=0,w=390,h=844;
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
 const wallTouch=project(18,0,1.4);
 assert.ok(wallTouch.x>10&&wallTouch.x<380&&wallTouch.y>120&&wallTouch.y<565,
   'Exterior wall must be reachable above the iPhone build panel');
 await page.locator('[data-build-tool="move-wall"]').click();
 await send('pointerdown',wallTouch,'canvas');
 await send('pointerup',wallTouch,'window');
 assert.ok(await page.locator('#build-wall-controls').isVisible(),
   'A tap selects the physical outer wall and reveals resize controls');
 assert.equal(await page.locator('#build-wall-expand').isDisabled(),false);
 await page.locator('#build-wall-expand').click();
 assert.ok(await page.locator('#build-pending').isVisible(),
   'Expand stages a wall movement for explicit confirmation');
 await page.locator('#build-apply').click();
 assert.ok(await page.locator('#build-wall-controls').isHidden(),
   'The selected edge ID must be cleared after wall geometry changes');
 await page.locator('[data-build-tool="camera"]').click();
 assert.equal(await page.locator('[data-build-tool="camera"]').getAttribute('aria-pressed'),'true');
 const beforePan=await page.locator('#game-canvas').screenshot();
 await send('pointerdown',{x:175,y:275},'canvas');
 await send('pointermove',{x:245,y:305},'window');
 await send('pointerup',{x:245,y:305},'window');
 await page.waitForTimeout(250);
 const afterPan=await page.locator('#game-canvas').screenshot();
 assert.notDeepEqual(afterPan,beforePan,'One-finger swipe must actually pan the 3D camera');
 assert.ok(await page.locator('#build-pending').isHidden(),
   'A camera swipe must never change layout or stage a build');
 // Actual starter-home regression: the old apartment's walls were procedural
 // scene nodes absent from wallEdges, so no wall tool could resize them.
 await page.locator('[data-build-tool="move-wall"]').click();
 assert.ok(await page.locator('#build-starter-picker').isVisible());
 await page.locator('[data-starter-side="north"]').click();
 assert.match(await page.locator('#build-wall-label').innerText(),/Исходная квартира/);
 assert.ok(await page.locator('#build-wall-expand').isEnabled());
 await page.locator('#build-wall-expand').click();
 assert.ok(await page.locator('#build-pending').isVisible());
 await page.locator('#build-apply').click();
 assert.ok(await page.locator('#build-pending').isHidden());
 // Four explicit original boundaries remain select-able even when the initial
 // decorative back wall is offscreen at the eastern portrait camera pose.
 await page.locator('[data-starter-side="east"]').click();
 await page.locator('#build-wall-expand').click();
 await page.locator('#build-apply').click();
 await page.locator('[data-build-walls="up"]').click();
 await page.screenshot({path:'f5a-browser-build.png'});
 await page.locator('#build-exit').click();
 assert.equal(await page.locator('#build-toggle').getAttribute('aria-pressed'),'false');
 assert.ok(await page.locator('#build-editor').isHidden());
 await page.locator('#build-toggle').click();
 assert.ok(await page.locator('#build-editor').isVisible());
 await page.locator('#build-exit').click();
 await page.waitForTimeout(500);
 const saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
 assert.ok(saved.world.construction.wallEdges.length>32,'Touch-drawn room added real wall segments');
 assert.ok(saved.world.construction.revision>door.world.revision,'Dragged floor edit persisted');
 assert.equal(saved.world.construction.openings.length,1);
 assert.ok(saved.world.construction.wallEdges.some(w=>w.axis==='v'&&w.i===37&&w.j===0),
   '0.5m wall-expansion nudge moved the selected outer boundary');
 assert.equal(saved.world.construction.starterShell.north,-10,
   'The original solid back wall moved outward and persisted');
 assert.equal(saved.world.construction.starterShell.east,29,
   'The original open eastern boundary moved outward and persisted');
 assert.ok(saved.world.construction.starterOwned.length>0,
   'The original extension owns real saved foundation cells');
 assert.equal(saved.world.construction.schema,1);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#loading').waitFor({state:'hidden',timeout:25000});
 const afterReload=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
 assert.deepEqual(afterReload.world.construction.starterShell,saved.world.construction.starterShell,
   'Reload cannot reset any of the initial apartment walls');
 assert.deepEqual(afterReload.world.construction.starterOwned,saved.world.construction.starterOwned,
   'Reload cannot lose the original room foundation extensions');
 // F5-B: a real Safari-sized tap picks a floor style, stages a transaction,
 // renders a material and survives loading the same v1 save.
 await page.locator('#build-toggle').click();
 await page.locator('[data-build-tool="paint-room"]').click();
 assert.ok(await page.locator('#build-finish-picker').isVisible());
 await page.locator('[data-finish-id="floor.slate"]').click();
 const finishTouch=project(16,0);
 await send('pointerdown',finishTouch,'canvas');
 await send('pointerup',finishTouch,'window');
 assert.ok(await page.locator('#build-pending').isVisible(),
   'F5-B touch on room floor must stage material transaction');
 await page.locator('#build-apply').click();
 const finishSaved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
 assert.ok(Object.values(finishSaved.world.construction.materials.floor).includes('floor.slate'),
   'F5-B material must persist in the same version-1 save');
 await page.screenshot({path:'f5b-browser-finish.png'});
 await page.locator('#build-exit').click();
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#loading').waitFor({state:'hidden',timeout:25000});
 const finishAfter=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
 assert.deepEqual(finishAfter.world.construction.materials,finishSaved.world.construction.materials);
  console.log(JSON.stringify({errors,wallEdges:saved.world.construction.wallEdges.length,
  openings:saved.world.construction.openings.length,buildModeToggle:'ok'},null,2));
 assert.deepEqual(errors,[],'Real PlayCanvas/ES module browser runtime must not error');
}finally{await browser.close();}
