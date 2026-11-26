import assert from 'node:assert/strict';
import {newHousehold} from '../../src/household.js';
const seed=()=>{const s=newHousehold('2026-11-26');s.calendar.anchorConfirmed=true;s.paused=true;s.otherSim.paused=true;s.autonomy.enabled=false;s.otherSim.autonomy.enabled=false;s.otherSim.position={x:18,z:7};return s;};
async function project(page,name){
 return page.evaluate(async name=>{
  const {Application,Vec3}=await import('playcanvas');
  const app=Application.getApplication(),avatar=app.root.findByName(name),cam=app.root.findByName('Camera').camera;
  if(!avatar?.enabled)throw Error('missing rendered resident '+name);
  const p=avatar.getPosition(),rect=document.querySelector('#game-canvas').getBoundingClientRect();
  const probes=[1.45,1.0,1.85].map(y=>{const v=cam.worldToScreen(p.clone().add(new Vec3(0,y,0))),x=Math.round(v.x+rect.left),y2=Math.round(v.y+rect.top);return {x,y:y2,hit:document.elementFromPoint(x,y2)?.id||null};});
  const c=cam.entity.getPosition(),q=cam.entity.getRotation();
  return {probes,position:[p.x,p.y,p.z],camera:[c.x,c.y,c.z,q.x,q.y,q.z,q.w],distance:c.distance(p),width:innerWidth,height:innerHeight};
 },name);
}
function invariant(before,after){
 assert.deepEqual(after.actionQueues,before.actionQueues);
 assert.equal(after.shop.credits,before.shop.credits);
 assert.deepEqual(after.position,before.position);
 assert.deepEqual(after.otherSim.position,before.otherSim.position);
}
const settle=page=>page.waitForTimeout(2100);
export const scenarios=[{id:'resident-recovery',goal:'Recover offscreen residents by actual menu touch, preserve manual control and social selection',seed,async run(h){
 const {page,step,tap,snapshot,observe}=h;
 const menu=page.locator('#view-panel');
 const open=async()=>{await tap('#view-toggle');await menu.waitFor({state:'visible'});};
 await step('offscreen-baseline',async()=>{
  if(await page.locator('#pause-btn').getAttribute('aria-label')!=='Продолжить')await tap('#pause-btn');
  assert.equal(await page.locator('#pause-btn').getAttribute('aria-label'),'Продолжить');
  const m=await project(page,'Мира');observe({baseline:m});
  assert.ok(m.probes.every(p=>p.hit!=='game-canvas'),'negative control: fixture must start inaccessible');
 });
 for(const [id,name,other] of [['mira','Мира','alex'],['alex','Алекс','mira']]){
  await step(id+'-find',async()=>{
   await tap('#pick-'+id);const before=await snapshot(),old=await project(page,name);
   await open();const button=page.locator('#menu-find-resident-btn'),box=await button.boundingBox();
   assert.ok(box&&box.width>=44&&box.height>=44,'recovery target below 44px');
   await tap('#menu-find-resident-btn');await menu.waitFor({state:'hidden'});await settle(page);
   const p=await project(page,name);observe({before:old,after:p});
   assert.ok(p.probes.some(p=>p.hit==='game-canvas'),'resident not on usable canvas after recovery');
   assert.ok(p.distance<20,'resident recovery left unusable overview zoom');
   invariant(before,await snapshot());
  });
  await step(id+'-world-selection',async()=>{
   await tap('#pick-'+other);const before=await snapshot();let opened=false;
   for(const p of (await project(page,name)).probes){
    if(p.hit!=='game-canvas')continue;
    await h.tapPoint(p.x,p.y);await page.waitForTimeout(150);
    observe({probe:p,trace:await h.inputTrace()});invariant(before,await snapshot());
    if(await page.locator('#social-context').isVisible()){opened=true;break;}
    if(await page.locator('#ground-walk-menu').isVisible())await tap('#ground-walk-close');
    if(await page.locator('#action-sheet').isVisible())await tap('#close-action');
   }
   assert.ok(opened,'recovered resident not actually selectable');
   await tap('#social-context-close');invariant(before,await snapshot());
  });
 }
 await step('overview-wins',async()=>{
  const before=await snapshot();
  await h.doubleTap('#pick-mira');await open();await tap('#menu-lot-camera-btn');await menu.waitFor({state:'hidden'});
  const immediate=await project(page,'Мира');await settle(page);const settled=await project(page,'Мира');
  observe({immediate,settled,trace:await h.inputTrace()});
  assert.ok(Math.hypot(...settled.camera.map((v,i)=>v-immediate.camera[i]))<.01,'old focus overwrote later lot overview');
  invariant(before,await snapshot());
 });
 await step('zoom-recovery',async()=>{
  const before=await snapshot(),old=await project(page,'Мира');assert.ok(old.distance>25,'expected distant overview');
  await open();await tap('#menu-find-resident-btn');await settle(page);
  const p=await project(page,'Мира');observe({before:old,after:p});
  assert.ok(p.distance<20&&p.probes.some(p=>p.hit==='game-canvas'),'explicit focus failed to restore useful scale');
  invariant(before,await snapshot());
  await open();await tap('#view-close');await menu.waitFor({state:'hidden'});
 });
}}];
