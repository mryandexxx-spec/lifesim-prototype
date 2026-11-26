// Reuse the observed GQ-04 red scenarios without importing its unrelated long sessions.
import assert from 'node:assert/strict';
import {findMarketPlacement,buyMarketItem} from '../../src/furniture-shop.js';
import {PAINT_ACTIVITY_ID} from '../../src/painting.js';
import {newHousehold} from '../../src/household.js';
const auditSeed=()=>{const s=newHousehold('2026-11-26');s.calendar.anchorConfirmed=true;s.paused=true;s.otherSim.paused=true;s.autonomy.enabled=false;s.otherSim.autonomy.enabled=false;return s;};
const creativeSeed=()=>{const s=auditSeed();const pose=findMarketPlacement(s.world.furniture,s.shop,'easel.starter');assert.ok(pose);const tx=buyMarketItem(s.world.furniture,s.shop,'easel.starter',pose);assert.ok(tx.ok,tx.reason);s.world.furniture=tx.world;s.shop=tx.shop;return s;};
async function pause(h){if(await h.page.locator('#pause-btn').getAttribute('aria-label')!=='Продолжить')await h.tap('#pause-btn');assert.equal(await h.page.locator('#pause-btn').getAttribute('aria-label'),'Продолжить');}
export const scenarios=[
{id:'social-scene',goal:'Find the other resident on the 3D lot and enqueue talk with explicit confirmation in both directions',seed:auditSeed,async run(h){
  const {page,step,tap,snapshot}=h;
  await step('pause',()=>pause(h));
  for(const [actor,partner,name] of [['alex','mira','Мира'],['mira','alex','Алекс']]){
   await step(actor+'-find-partner',async()=>{
    await tap('#pick-'+actor);await page.waitForTimeout(500);const baseline=await snapshot();
    const probes=[];
    for(const y of [1.45,1.85,1.0]){
     const pt=await page.evaluate(async({name,y})=>{const {Application,Vec3}=await import('playcanvas');const app=Application.getApplication();const avatar=app.root.findByName(name);const camera=app.root.findComponents('camera').find(c=>c.enabled);if(!avatar||!camera)throw Error('resident or camera missing');const p=camera.worldToScreen(avatar.getPosition().clone().add(new Vec3(0,y,0)));return {x:Math.round(p.x),y:Math.round(p.y),w:innerWidth,h:innerHeight};},{name,y});
     if(pt.x<0||pt.x>=pt.w||pt.y<0||pt.y>=pt.h)continue;
     const hit=await page.evaluate(({x,y})=>{const e=document.elementFromPoint(x,y);return {id:e?.id,tag:e?.tagName,cls:typeof e?.className==='string'?e.className:''};},pt);
     probes.push({...pt,hit});h.observe({actor,partner,point:pt,hit});
     // Never tap through a menu or an overlay to probe another world point.
     if(hit.id!=='game-canvas')continue;
     const prior=await snapshot();
     await h.tapPoint(pt.x,pt.y);
     h.observe({worldInput:await h.inputTrace()});
     // Canvas tap may be deferred until gesture recognition finishes.
     await page.locator('#social-context').waitFor({state:'visible',timeout:1500}).catch(()=>{});
     assert.deepEqual((await snapshot()).actionQueues,prior.actionQueues,'scene selection alone must not enqueue');
     if(await page.locator('#social-context').isVisible())break;
     assert.equal(await page.locator('#social-menu-panel').isVisible(),false,'unexpected social menu after scene-only tap');
     if(await page.locator('#ground-walk-menu').isVisible())await tap('#ground-walk-close');
     if(await page.locator('#action-button').isVisible())await tap('#close-action');
    }
    assert.deepEqual((await snapshot()).actionQueues,baseline.actionQueues,'finding a resident must not enqueue');assert.ok(await page.locator('#social-context').isVisible(),'resident not discoverable through projected touch '+JSON.stringify(probes));
   });
   await step(actor+'-confirm-talk',async()=>{const b=await snapshot();await tap('#conversation-btn');await tap('#social-menu-options button:has-text("Поговорить")');await tap('#social-menu-options button:has-text("В очередь · Поговорить")');const a=await snapshot();assert.equal(a.actionQueues.byResident[actor].length,b.actionQueues.byResident[actor].length+1);assert.ok(a.actionQueues.byResident[actor].some(q=>q.type==='social'&&q.targetId===partner&&q.actionId==='talk'));assert.deepEqual(a.actionQueues.byResident[partner],b.actionQueues.byResident[partner]);});
  }
 }},
 {id:'creative-admission',goal:'Find a purchased easel, choose painting, admit a real creative action without spending again',seed:creativeSeed,async run(h){
  const {page,step,tap,snapshot}=h;let before;
  await step('show-item-labels',async()=>{await pause(h);before=await snapshot();await tap('#view-toggle');await tap('#item-labels-btn');assert.equal(await page.locator('#item-labels-btn').getAttribute('aria-pressed'),'true');await tap('#view-close');await page.locator('#view-panel').waitFor({state:'hidden'});});
  await step('choose-easel',async()=>{
   const item=before.world.furniture.instances.find(i=>i.prefabId==='easel'&&i.location==='home');assert.ok(item,'purchased easel exists');
   const label=page.locator('#hotspots button:has-text("Мольберт")');
   h.observe({easelInstance:item.instanceId,labelVisible:await label.isVisible()});
   // The optional legacy hotspot does not necessarily cover a purchased instance.
   // Select the real placed object by its live camera projection, no action injection.
   await tap('#view-toggle');await tap('#item-labels-btn');await tap('#view-close');await page.locator('#view-panel').waitFor({state:'hidden'});
   for(const y of [1.15,.75,1.5]){
    const pt=await page.evaluate(async({x,z,y,instanceId})=>{const {Application,Vec3}=await import('playcanvas');const app=Application.getApplication();const node=app.root.findByName('F2 purchased / '+instanceId);if(!node?.enabled)throw Error('placed easel not rendered');const cam=app.root.findComponents('camera').find(c=>c.enabled);const p=cam.worldToScreen(new Vec3(x,y,z));const b=document.querySelector('#game-canvas').getBoundingClientRect();const px=Math.round(p.x+b.left),py=Math.round(p.y+b.top);return {x:px,y:py,hit:document.elementFromPoint(px,py)?.id};},{x:item.x,z:item.z,y,instanceId:item.instanceId});
    h.observe({easelProjection:pt});if(pt.hit!=='game-canvas')continue;
    await h.tapPoint(pt.x,pt.y);await page.locator('#painting-theme-select').waitFor({state:'visible',timeout:1500}).catch(()=>{});
    h.observe({worldInput:await h.inputTrace()});assert.deepEqual((await snapshot()).actionQueues,before.actionQueues,'selecting easel must not enqueue or start a different command');
    if(await page.locator('#painting-theme-select').isVisible())break;
    if(await page.locator('#ground-walk-menu').isVisible())await tap('#ground-walk-close');
    if(await page.locator('#social-context').isVisible())await tap('#social-context-close');
    if(await page.locator('#action-button').isVisible())await tap('#close-action');
   }
   await page.locator('#painting-theme-select').waitFor({state:'visible',timeout:2000});assert.ok(await page.locator('#painting-theme-select option:not([disabled])').count()>0);
  });
  await step('queue-painting',async()=>{await tap('#action-button');const s=await snapshot();assert.equal(s.shop.credits,before.shop.credits);assert.equal(s.actionQueues.byResident.alex.length,before.actionQueues.byResident.alex.length+1);assert.ok(s.actionQueues.byResident.alex.some(q=>q.type==='activity'&&q.activityId===PAINT_ACTIVITY_ID));assert.deepEqual(s.actionQueues.byResident.mira,before.actionQueues.byResident.mira);});
 }}
];
