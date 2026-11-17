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
 // Native original house editing: no extra starter-side buttons. The same
 // canvas tool selects BOTH an old back wall and a newly constructed wall.
 await page.locator('#build-exit').click();
 await page.locator('#build-toggle').click(); // restores the known initial build camera
 assert.equal(await page.locator('#build-starter-picker').count(),0,
   'The original home must not need a separate wall-side picker');
 await page.locator('[data-build-tool="move-wall"]').click();
 const oldNorth=project(11,-4.34);
 assert.ok(oldNorth.x>20&&oldNorth.x<375&&oldNorth.y>100&&oldNorth.y<540);
 await send('pointerdown',oldNorth,'canvas');
 await send('pointerup',oldNorth,'window');
 assert.ok(await page.locator('#build-wall-controls').isVisible(),
   'A touch on the OLD back wall selects it just like a new wall');
 assert.ok(await page.locator('#build-wall-expand').isEnabled());
 await page.locator('#build-wall-expand').click();
 assert.ok(await page.locator('#build-pending').isVisible());
 await page.locator('#build-apply').click();
 assert.ok(await page.locator('#build-pending').isHidden());
 // The original east cutaway is also directly selectable, no special button.
 const oldEast=project(14.25,-3.25);
 await send('pointerdown',oldEast,'canvas');
 await send('pointerup',oldEast,'window');
 assert.ok(await page.locator('#build-wall-expand').isEnabled());
 await page.locator('#build-wall-expand').click();
 assert.ok(await page.locator('#build-pending').isVisible());
 await page.locator('#build-apply').click();
 // Place a real opening straight into the ORIGINAL back wall.
 await page.locator('[data-build-tool="window"]').click();
 const starterOpeningTouch=project(11,-4.84);
 await send('pointerdown',starterOpeningTouch,'canvas');
 await send('pointerup',starterOpeningTouch,'window');
 assert.ok(await page.locator('#build-pending').isVisible(),
   'An old wall must accept the ordinary Window tool with no other controls');
 await page.locator('#build-apply').click();
 const oldOpeningSaved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
 assert.ok(oldOpeningSaved.world.construction.openings.some(o=>
   o.type==='window'&&o.edgeIds.every(id=>id.startsWith('starter:north:'))),
   'Original-wall window creates stable saved physical segments');
 // Real window frame must appear where the old wall was cut.
 await page.screenshot({path:'f5b3-original-wall-openings.png'});
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
 assert.equal(saved.world.construction.openings.length,2,
   'Original-house window and new extension door are saved together');
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
  // F5-B.2: actual touch on the published PlayCanvas opening editor, not
 // only headless domain functions. Build entry restores the default mobile pose.
 await page.locator('#build-toggle').click();
 await page.locator('[data-build-tool="arch"]').click();
 assert.ok(await page.locator('#build-opening-picker').isVisible());
 await page.locator('[data-opening-style="arch.wide"]').click();
 const portalTouch=project(18.5,0);
 assert.ok(portalTouch.x>0&&portalTouch.x<390&&portalTouch.y>95&&portalTouch.y<570,
   'F5-B.2 wall target must be inside the iPhone viewport');
 await send('pointerdown',portalTouch,'canvas');
 await send('pointerup',portalTouch,'window');
 assert.ok(await page.locator('#build-pending').isVisible(),
   'F5-B.2 arched opening must stage from an actual pointer tap');
 await page.locator('#build-apply').click();
 const archSaved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
 const arch=archSaved.world.construction.openings.find(o=>o.styleId==='arch.wide');
 assert.ok(arch,'New 2m arch persists its style');
 assert.equal(arch.edgeIds.length,4);
 await page.locator('[data-build-tool="change-opening"]').click();
 await send('pointerdown',portalTouch,'canvas');
 await send('pointerup',portalTouch,'window');
 assert.match(await page.locator('#build-opening-label').innerText(),/замену/);
 await page.locator('[data-opening-style="door.double"]').click();
 assert.ok(await page.locator('#build-pending').isVisible());
 await page.locator('#build-apply').click();
 const replacement=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
 assert.equal(replacement.world.construction.openings.find(o=>o.id===arch.id)?.styleId,'door.double');
 await page.screenshot({path:'f5b2-browser-openings.png'});
 await page.locator('#build-exit').click();
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#loading').waitFor({state:'hidden',timeout:25000});
 const restoredOpening=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
 assert.equal(restoredOpening.world.construction.openings.find(o=>o.id===arch.id)?.type,'door');
 assert.equal(restoredOpening.world.construction.openings.find(o=>o.id===arch.id)?.styleId,'door.double');
  // F5-B.4: actual mobile WebGL touch on ceiling/pattern and v1 save.
  await page.locator('#build-toggle').click();
  await page.locator('[data-build-tool="paint-ceiling-room"]').click();
  assert.equal(await page.locator('#build-ceiling-toggle').getAttribute('aria-pressed'),'true');
  await page.locator('[data-finish-id="ceiling.blue"]').click();
  const ceilingTap=project(16,0);
  await send('pointerdown',ceilingTap,'canvas');
  await send('pointerup',ceilingTap,'window');
  assert.ok(await page.locator('#build-pending').isVisible(),
    'F5-B.4 ceiling touch must stage valid preview');
  await page.locator('#build-apply').click();
  const ceilingSave=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
  assert.equal(ceilingSave.world.construction.materials.ceiling['32,0'],'ceiling.blue');
  await page.screenshot({path:'f5b4-ceiling-preview.png'});
  await page.locator('[data-build-tool="paint-floor"]').click();
  assert.equal(await page.locator('#build-ceiling-toggle').getAttribute('aria-pressed'),'false');
  await page.locator('[data-finish-id="floor.planks-z"]').click();
  await send('pointerdown',ceilingTap,'canvas');
  await send('pointerup',ceilingTap,'window');
  assert.ok(await page.locator('#build-pending').isVisible());
  await page.locator('#build-apply').click();
  const patterned=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
  assert.equal(patterned.world.construction.materials.floor['32,0'],'floor.planks-z');
  await page.screenshot({path:'f5b4-floor-direction.png'});
  await page.locator('#build-exit').click();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:25000});
  const restoredB4=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
  assert.equal(restoredB4.world.construction.materials.ceiling['32,0'],'ceiling.blue');
  assert.equal(restoredB4.world.construction.materials.floor['32,0'],'floor.planks-z');
  // F5-C.1: author a real roof, change its shape and reload with PlayCanvas.
  await page.locator('#build-toggle').click();
  await page.locator('[data-build-tool="roof-auto"]').click();
  assert.ok(await page.locator('#build-roof-picker').isVisible());
  assert.ok(await page.locator('#build-pending').isVisible(),
    'Auto roof must stage rather than commit immediately');
  await page.locator('#build-apply').click();
  const roofSave=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
  assert.equal(roofSave.world.construction.roofAuto,true);
  assert.ok(roofSave.world.construction.roofModules.length>=1);
  assert.equal(await page.locator('#build-roof-toggle').getAttribute('aria-pressed'),'true');
  await page.screenshot({path:'f5c1-auto-roof.png'});
  await page.locator('[data-build-tool="roof-edit"]').click();
  const roofTap=project(16,0);
  await send('pointerdown',roofTap,'canvas');
  await send('pointerup',roofTap,'window');
  assert.match(await page.locator('#build-roof-tip').innerText(),/Секция выбрана/);
  await page.locator('[data-roof-choice="roof.hip"]').click();
  assert.ok(await page.locator('#build-pending').isVisible());
  await page.locator('#build-apply').click();
  const hipSave=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
  assert.ok(hipSave.world.construction.roofModules.some(m=>m.styleId==='roof.hip'));
  await page.screenshot({path:'f5c1-hip-roof.png'});
  await page.locator('#build-roof-toggle').click();
  assert.equal(await page.locator('#build-roof-toggle').getAttribute('aria-pressed'),'false');
  await page.locator('#build-exit').click();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:25000});
  const afterRoofReload=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
  assert.deepEqual(afterRoofReload.world.construction.roofModules,
    hipSave.world.construction.roofModules);
  await page.locator('#build-toggle').click();
  assert.equal(await page.locator('#build-roof-toggle').getAttribute('aria-pressed'),'false',
    'A roof never covers the life view or starts visible by default');
  await page.locator('#build-exit').click();
  console.log(JSON.stringify({errors,wallEdges:saved.world.construction.wallEdges.length,
  openings:saved.world.construction.openings.length,buildModeToggle:'ok'},null,2));
 assert.deepEqual(errors,[],'Real PlayCanvas/ES module browser runtime must not error');
}finally{await browser.close();}
