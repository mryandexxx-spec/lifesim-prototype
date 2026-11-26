// Reuse the observed GQ-04 red scenarios without importing its unrelated long sessions.
import assert from 'node:assert/strict';
import {findMarketPlacement,buyMarketItem} from '../../src/furniture-shop.js';
import {PAINT_ACTIVITY_ID} from '../../src/painting.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../../src/outdoor-proposals.js';
import {outdoorCellAt} from '../../src/lot-surface.js';
import {poolFixtureVisualPose} from '../../src/pool-visual.js';
import {startConversation,arriveSocial} from '../../src/relationships.js';
import {dialogueNeedsDecision} from '../../src/dialogue-decision.js';
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
    await checkLayout(h,'#social-context');
   });
   await step(actor+'-confirm-talk',async()=>{const b=await snapshot();await tap('#conversation-btn');await tap('#social-menu-options button:has-text("Поговорить")');await tap('#social-menu-options button:has-text("В очередь · Поговорить")');const a=await snapshot();assert.equal(a.actionQueues.byResident[actor].length,b.actionQueues.byResident[actor].length+1);assert.ok(a.actionQueues.byResident[actor].some(q=>q.type==='social'&&q.targetId===partner&&q.actionId==='talk'));assert.deepEqual(a.actionQueues.byResident[partner],b.actionQueues.byResident[partner]);});
  }
 }},
 {id:'creative-admission',goal:'Find a purchased easel, choose painting, admit a real creative action without spending again',seed:creativeSeed,async run(h){
  const {page,step,tap,snapshot}=h;let before;
  await step('show-item-labels',async()=>{await pause(h);before=await snapshot();await tap('#view-toggle');await tap('#item-labels-btn');assert.equal(await page.locator('#item-labels-btn').getAttribute('aria-pressed'),'true');await tap('#view-close');await page.locator('#view-panel').waitFor({state:'hidden'});});
  await step('choose-easel',async()=>{
   const item=before.world.furniture.instances.find(i=>i.prefabId==='easel'&&i.location==='home');assert.ok(item,'purchased easel exists');
   const selector='#hotspots button[data-instance-id="'+item.instanceId+'"]';
   const label=page.locator(selector);
   await label.waitFor({state:'visible',timeout:4000});
   h.observe({easelInstance:item.instanceId,labelVisible:await label.isVisible()});
   await tap(selector);
   await page.locator('#painting-theme-select').waitFor({state:'visible'});
   assert.deepEqual((await snapshot()).actionQueues,before.actionQueues,'label selection must not enqueue');
   await tap('#close-action');
   // Also preserve selection by actual 3D geometry with labels disabled.
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

async function checkLayout(h,selector){
 const layout=await h.page.evaluate(selector=>{
  const panel=document.querySelector(selector),r=panel.getBoundingClientRect(),hud=document.querySelector('#dashboard').getBoundingClientRect();
  const toast=document.querySelector('#toast'),style=getComputedStyle(panel);
  const controls=[...panel.querySelectorAll('button:not([hidden])')].filter(e=>e.getClientRects().length).map(e=>({id:e.id,height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width}));
  return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,hudTop:hud.top,width:innerWidth,height:innerHeight,panelZ:Number(style.zIndex),toastZ:Number(getComputedStyle(toast).zIndex),toastActionable:toast.classList.contains('toast-actionable'),controls,scroll:document.documentElement.scrollHeight};
 },selector);
 h.observe({layout,selector});
 assert.ok(layout.x>=-1&&layout.right<=layout.width+1&&layout.y>=0&&layout.bottom<=layout.hudTop+1,'context overlaps HUD '+JSON.stringify(layout));
 assert.ok(layout.scroll<=layout.height+2,'whole screen scroll');
 if(!layout.toastActionable)assert.ok(layout.toastZ<layout.panelZ,'passive toast should be behind active menu');
}
function yardSeed(){
 let s=auditSeed();s.shop.credits=30000;
 const cell=outdoorCellAt(7.25,-7.25);
 s.world.outdoors={...s.world.outdoors,revision:s.world.outdoors.revision+1,
  pools:[{poolId:'pool-1',cells:Array.from({length:16},(_,i)=>cell+Math.floor(i/4)*64+i%4).sort((a,b)=>a-b)}],
  poolFixtures:[{fixtureId:'fixture-1',poolId:'pool-1',kind:'ladder',edgeCell:cell,side:'west',purchasePriceCredits:120}]};
 for(const [x,z] of [[15,-5],[19,-5],[19,7],[15,7],[8,7]]){
  const proposal=previewOutdoorFeatureEdit(s,{operation:'place',itemId:'garden.flower.calendula',pose:{x,z,yaw:0}});
  if(proposal.ok){const tx=commitOutdoorFeatureEdit(s,proposal);assert.ok(tx.ok);s=tx.root;}
 }
 assert.ok(s.world.outdoors.features.filter(f=>f.itemId==='garden.flower.calendula').length>=3);
 return s;
}
async function projectWorld(page,points){
 return page.evaluate(async points=>{
  const {Application,Vec3}=await import('playcanvas');
  const cam=Application.getApplication().root.findByName('Camera').camera;
  const canvas=document.querySelector('#game-canvas'),rect=canvas.getBoundingClientRect();
  return points.map(p=>{const v=cam.worldToScreen(new Vec3(p.x,p.y,p.z)),x=Math.round(v.x+rect.left),y=Math.round(v.y+rect.top);
   return {...p,x,y,hit:document.elementFromPoint(x,y)?.id};});
 },points);
}
scenarios.push({id:'yard-contexts',goal:'Actual land, outdoor plant, pool water and ladder selection never queues before explicit tap',seed:yardSeed,async run(h){
 const {page,step,tap,snapshot,seed}=h;
 const menu=page.locator('#ground-walk-menu');
 await step('frame-lot',async()=>{await pause(h);await tap('#view-toggle');await tap('#menu-lot-camera-btn');await page.locator('#view-panel').waitFor({state:'hidden'});await page.waitForTimeout(500);});
 const beds=seed.world.outdoors.features.filter(f=>f.itemId==='garden.flower.calendula');
 const pose=poolFixtureVisualPose(seed.world.outdoors.poolFixtures[0]);assert.ok(pose);
 for(const [name,points,title] of [
  ['ground',[{x:11,y:-.53,z:0},{x:13,y:-.53,z:-2},{x:7,y:-.53,z:4},{x:10,y:-.53,z:3}],/Действия на земле/],
  ['garden',beds.flatMap(f=>[0,-.25].map(y=>({x:f.x,z:f.z,y}))),/Календула/],
  ['pool-water',[{x:8.1,y:-.475,z:-6.4},{x:8.6,y:-.475,z:-6.1}],/Бассейн · вода/],
  ['pool-ladder',[{x:pose.x,y:0,z:pose.z},{x:pose.x,y:-.25,z:pose.z},{x:pose.x,y:.25,z:pose.z}],/Лестница бассейна/]
 ]){
  await step(name+'-select',async()=>{
   const before=await snapshot(),probes=await projectWorld(page,points);h.observe({probes});
   let found=false;
   for(const p of probes){
    if(p.hit!=='game-canvas')continue;
    await h.tapPoint(p.x,p.y);
    await page.waitForTimeout(150);
    h.observe({trace:await h.inputTrace()});
    const after=await snapshot();
    assert.deepEqual(after.actionQueues,before.actionQueues,'scene selection must not enqueue');
    assert.equal(after.shop.credits,before.shop.credits);
    if(await menu.isVisible()){
     const heading=await page.locator('#ground-walk-title').textContent();
     h.observe({heading});
     if(title.test(heading)){found=true;break;}
     await tap('#ground-walk-close');
    }else if(await page.locator('#action-sheet').isVisible())await tap('#close-action');
    else if(await page.locator('#social-context').isVisible())await tap('#social-context-close');
   }
   assert.ok(found,'world context not discoverable: '+name);
   await checkLayout(h,'#ground-walk-menu');
  });
  await step(name+'-dismiss',async()=>{const before=await snapshot();await tap('#ground-walk-close');assert.equal(await menu.isVisible(),false);assert.deepEqual((await snapshot()).actionQueues,before.actionQueues);});
 }
}});
scenarios.push({id:'required-dialogue',goal:'Mandatory dialog cannot be dismissed by backdrop or activate a choice unintentionally',seed:()=>{
 const s=auditSeed();s.paused=false;s.otherSim.paused=false;assert.equal(startConversation(s,'alex',{x:-.2,z:1.85},'daily'),true);assert.equal(arriveSocial(s),true);assert.ok(dialogueNeedsDecision(s));return s;
},async run(h){
 const {page,step,tap,snapshot}=h;
 await step('required-backdrop',async()=>{
  await page.locator('#conversation-panel.dialogue-required').waitFor({state:'visible',timeout:15000});
  const before=await snapshot();
  const point=await page.evaluate(()=>{
   for(const y of [20,40,80,innerHeight-30])for(const x of [10,innerWidth/2,innerWidth-10])if(document.elementFromPoint(x,y)?.id==='dialogue-backdrop')return {x,y};
   return null;
  });
  assert.ok(point,'required backdrop must be reachable');
  await h.tapPoint(point.x,point.y);await page.waitForTimeout(100);
  assert.ok(await page.locator('#conversation-panel.dialogue-required').isVisible());
  assert.deepEqual((await snapshot()).socialAction,before.socialAction);
  assert.deepEqual((await snapshot()).actionQueues,before.actionQueues);
 });
 await step('explicit-end',async()=>{
  await tap('#conversation-options button:has-text("Завершить разговор")');
  await page.locator('#conversation-panel.dialogue-required').waitFor({state:'hidden'});
  assert.equal(dialogueNeedsDecision(await snapshot()),false);
 });
}});

/** Camera gesture recovery in the real renderer, separate from the optional
 * social/yard interaction flow. No new gameplay or camera policy. */
scenarios.push({id:'gesture-recovery',goal:'Trusted hold, swipe and two-contact pinch do not select or enqueue; next independent touch works',seed:yardSeed,async run(h){
 const {page,step,tap,snapshot,gesture}=h;
 const menu=page.locator('#ground-walk-menu');
 const assertUnchanged=async(before)=>{
  for(const id of ['#ground-walk-menu','#action-sheet','#social-context','#social-menu-panel'])
    assert.equal(await page.locator(id).isVisible(),false,'gesture opened '+id);
  const after=await snapshot();
  assert.deepEqual(after.actionQueues,before.actionQueues);assert.equal(after.shop.credits,before.shop.credits);
 };
 const view=()=>page.evaluate(async()=>{
  const {Application}=await import('playcanvas');
  const app=Application.getApplication(),cam=app.root.findComponents('camera').find(c=>c.enabled);
  const p=cam.entity.getPosition(),q=cam.entity.getRotation();
  return [p.x,p.y,p.z,q.x,q.y,q.z,q.w];
 });
 const change=async(before)=>{
  // Real camera frame must change, rather than only the input trace.
  for(let i=0;i<20;i++){const a=await view();if(Math.hypot(...a.map((v,j)=>v-before[j]))>.01)return a;await page.waitForTimeout(100);}
  assert.fail('camera did not respond to trusted gesture');
 };
 const free=()=>page.evaluate(()=>{
  const canvas=document.querySelector('#game-canvas');
  for(const dy of [0,-30,30,-60,60,-90,90]){
   const y=Math.round(innerHeight*.44+dy);
   for(const dx of [0,-20,20,-40,40]){
    const x=Math.round(innerWidth/2+dx);
    if([x-55,x-35,x-18,x,x+18,x+35,x+55].every(px=>document.elementFromPoint(px,y)===canvas))return {x,y};
   }
  }
  return null;
 });
 await step('frame-lot',async()=>{await pause(h);await tap('#view-toggle');await tap('#menu-lot-camera-btn');await page.locator('#view-panel').waitFor({state:'hidden'});await page.waitForTimeout(500);});
 await step('hold-no-selection',async()=>{
  const before=await snapshot();
  const candidates=await projectWorld(page,[{x:11,y:-.53,z:0},{x:13,y:-.53,z:-2},{x:7,y:-.53,z:4},{x:10,y:-.53,z:3}]);
  let point;
  // Establish that this real canvas point is selectable with a normal tap.
  for(const p of candidates){
   if(p.hit!=='game-canvas')continue;
   await h.tapPoint(p.x,p.y);await page.waitForTimeout(150);
   if(await menu.isVisible()){
    const title=await page.locator('#ground-walk-title').textContent();
    await tap('#ground-walk-close');
    if(title==='Действия на земле'){point=p;break;}
   }else if(await page.locator('#action-sheet').isVisible())await tap('#close-action');
   else if(await page.locator('#social-context').isVisible())await tap('#social-context-close');
  }
  assert.ok(point,'no selectable land point for hold');
  await gesture('hold',[{type:'touchStart',points:[point],wait:550},{type:'touchEnd',points:[point]}]);
  await assertUnchanged(before);
  await h.tapPoint(point.x,point.y);await menu.waitFor({state:'visible',timeout:3000});
  assert.equal(await page.locator('#ground-walk-title').textContent(),'Действия на земле');
  await tap('#ground-walk-close');await assertUnchanged(before);
 });
 await step('swipe-no-selection',async()=>{
  const before=await snapshot(),camera=await view(),p=await free();assert.ok(p,'no unobscured camera drag lane');
  const at=dx=>({x:p.x+dx,y:p.y});
  await gesture('swipe',[{type:'touchStart',points:[at(-35)],wait:60},{type:'touchMove',points:[at(-12)],wait:60},{type:'touchMove',points:[at(20)],wait:60},{type:'touchEnd',points:[at(20)]}]);
  h.observe({before:camera,after:await change(camera)});await assertUnchanged(before);
  await tap('#view-toggle');await page.locator('#view-panel').waitFor({state:'visible'});await tap('#view-close');await assertUnchanged(before);
 });
 await step('pinch-no-selection',async()=>{
  const before=await snapshot(),camera=await view(),p=await free();assert.ok(p,'no unobscured two-contact camera lane');
  const pair=d=>[{x:p.x-d,y:p.y},{x:p.x+d,y:p.y}];
  await gesture('pinch',[{type:'touchStart',points:pair(18),wait:70},{type:'touchMove',points:pair(35),wait:70},{type:'touchMove',points:pair(55),wait:70},{type:'touchEnd',points:pair(55)}]);
  h.observe({before:camera,after:await change(camera)});await assertUnchanged(before);
  await tap('#view-toggle');await page.locator('#view-panel').waitFor({state:'visible'});await tap('#view-close');await assertUnchanged(before);
 });
}});
