/** Comfort C2 — real Chromium WebGL, thumb inputs and before/after HUD geometry.
 * This is independent from iPhone Safari physical acceptance.
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {startConversation,arriveSocial} from '../src/relationships.js';
import {SAVE_KEY} from '../src/simulation.js';

const sizes=[[390,844],[375,667],[320,568],[844,390]];
const gameSeed=newHousehold('2026-11-16');
gameSeed.autonomy.enabled=false;
gameSeed.otherSim.autonomy.enabled=false;
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const failures=[],report=[];
const area=async page=>page.evaluate(()=>{
 const selectors=['.topbar .brand','#queue-toggle','#calendar-anchor-toggle',
   '#plan-peek','#dashboard','.life-nav','.life-clock-controls',
   '.control-tray > button'];
 const rects=[];
 for(const selector of selectors)for(const e of document.querySelectorAll(selector)){
  const style=getComputedStyle(e),r=e.getBoundingClientRect();
  if(style.display==='none'||style.visibility==='hidden'||e.hidden||
     Number(style.opacity)===0||r.width<=0||r.height<=0)continue;
  const x1=Math.max(0,r.left),x2=Math.min(innerWidth,r.right);
  const y1=Math.max(0,r.top),y2=Math.min(innerHeight,r.bottom);
  if(x2>x1&&y2>y1)rects.push({x1,x2,y1,y2});
 }
 const xs=[...new Set(rects.flatMap(r=>[r.x1,r.x2]))].sort((a,b)=>a-b);
 let total=0;
 for(let i=1;i<xs.length;i++){
  const left=xs[i-1],right=xs[i];
  const yy=rects.filter(r=>r.x1<right&&r.x2>left)
   .map(r=>[r.y1,r.y2]).sort((a,b)=>a[0]-b[0]);
  let length=0,start=-1,end=-1;
  for(const [lo,hi] of yy){
   if(start<0){start=lo;end=hi;}
   else if(lo>end){length+=end-start;start=lo;end=hi;}
   else end=Math.max(end,hi);
  }
  if(start>=0)length+=end-start;
  total+=(right-left)*length;
 }
 return {pixels:Math.round(total),screen:innerWidth*innerHeight,components:rects.length,
  rects};
});
const visit=async(w,h,version)=>{
 const ctx=await browser.newContext({viewport:{width:w,height:h},
    deviceScaleFactor:1,isMobile:true,hasTouch:true});
 await ctx.addInitScript(({key,seed,old})=>{
  localStorage.setItem(key,JSON.stringify(seed));
  localStorage.setItem('lifesim.uiTour.v1','done');
  if(old)localStorage.setItem('blins.ui.hud.compact.v1','full');
  else localStorage.removeItem('blins.ui.hud.compact.v1');
 },{key:SAVE_KEY,seed:gameSeed,old:version==='before'});
 const page=await ctx.newPage();
 page.on('pageerror',e=>failures.push(version+' '+w+'x'+h+' PAGE '+e.message));
 page.on('requestfailed',r=>{
  if(r.url().includes('/src/')||r.url().includes('/vendor/'))
   failures.push(version+' '+w+'x'+h+' REQUEST '+r.url()+' '+r.failure()?.errorText);
 });
 const port=version==='before'?8766:8765;
 await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'domcontentloaded'});
 await page.locator('#loading').waitFor({state:'hidden',timeout:55000});
 await page.waitForTimeout(180);
 const screen=await page.locator('#game-canvas').screenshot();
 assert.ok(screen.length>2000,'real WebGL canvas renders '+version+' '+w+'x'+h);
 const footprint=await area(page);
 await page.screenshot({path:'comfort-c2-'+version+'-'+w+'x'+h+'.png'});
 return {ctx,page,footprint};
};
async function tap(page,id){await page.locator(id).tap({timeout:12000});}
async function exercise(page){
 const hidden=id=>page.locator(id).evaluate(el=>el.hidden);
 const visible=id=>page.locator(id).isVisible();
 assert.equal(await page.locator('#dashboard').getAttribute('data-collapsed'),'true');
 for(const id of ['#pause-btn','#speed-btn','#plan-peek','#pick-alex',
   '#pick-mira','#hud-toggle','#career-phone-toggle','#home-open','#view-toggle']){
  const r=await page.locator(id).boundingBox();
  assert.ok(r&&r.height>=43&&r.width>=43,id+' thumb target');
 }
 await tap(page,'#pause-btn');
 assert.match(await page.locator('#pause-btn').getAttribute('aria-label'),/Продолжить/);
 await tap(page,'#speed-btn');
 assert.equal((await page.locator('#speed-btn').innerText()).trim(),'3×');
 await tap(page,'#speed-btn');
 assert.equal((await page.locator('#speed-btn').innerText()).trim(),'1×');
 await tap(page,'#pick-mira');
 assert.equal(await page.locator('#pick-mira').getAttribute('aria-pressed'),'true');
 await tap(page,'#hud-toggle');
 assert.equal(await page.locator('#dashboard').getAttribute('data-collapsed'),'false');
 for(const key of ['hunger','energy','hygiene','fun','social','bladder'])
  assert.equal(await page.locator('.need[data-need="'+key+'"]').isVisible(),true,key);
 await tap(page,'#hud-toggle');
 await tap(page,'#pick-alex');
 await tap(page,'#plan-peek');
 assert.equal(await visible('#queue-panel'),true);
 await tap(page,'#queue-close');
 assert.equal(await hidden('#queue-panel'),true);
 await tap(page,'#view-toggle');
 assert.equal(await visible('#view-panel'),true);
 assert.equal(await hidden('#home-panel'),true);
 assert.equal(await page.locator('#view-toggle').getAttribute('aria-expanded'),'true');
 await tap(page,'#menu-rotate-btn');
 assert.equal(await page.locator('#rotate-camera-btn').getAttribute('aria-pressed'),'true');
 await tap(page,'#menu-reset-camera-btn');
 await tap(page,'#auto-btn');
 assert.equal(await page.locator('#auto-btn').getAttribute('aria-pressed'),'true');
 await tap(page,'#save-btn');
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
 assert.equal(saved.version,1);
 assert.ok(saved.world?.furniture,'saved furnished world survives');
 assert.ok(saved.careerSystem,'career system survives');
 assert.ok(saved.otherSim,'second resident survives');
 await tap(page,'#view-close');
 assert.equal(await hidden('#view-panel'),true);
 assert.equal(await page.locator('#view-toggle').getAttribute('aria-expanded'),'false');
 await tap(page,'#home-open');
 assert.equal(await visible('#home-panel'),true);
 assert.equal(await hidden('#view-panel'),true);
 await tap(page,'#home-furnish');
 assert.equal(await page.locator('.app-shell').getAttribute('data-furnish-mode'),'true');
 await tap(page,'#furnish-exit');
 await tap(page,'#home-open');
 await tap(page,'#home-build');
 assert.equal(await page.locator('.app-shell').getAttribute('data-build-mode'),'true');
 await tap(page,'#build-exit');
 await tap(page,'#career-phone-toggle');
 await page.locator('#career-phone-panel').waitFor({state:'visible'});
 await tap(page,'.career-phone-x');
 assert.equal(await hidden('#home-panel'),true);
 // Camera receives real drag events, without pointer interception by invisible HUD.
 const canvas=await page.locator('#game-canvas').boundingBox();
 assert.ok(canvas?.height>100);
 await page.mouse.move(canvas.x+canvas.width*.55,canvas.y+canvas.height*.36);
 await page.mouse.down();await page.mouse.move(canvas.x+canvas.width*.65,
   canvas.y+canvas.height*.43,{steps:5});await page.mouse.up();
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#loading').waitFor({state:'hidden',timeout:55000});
 assert.equal(await page.locator('#dashboard').getAttribute('data-collapsed'),'true');
 assert.equal(await page.locator('#pick-alex').getAttribute('aria-pressed'),'true');
 assert.equal(failures.length,0,failures.join('\n'));
}

async function verifyRequiredChoice(){
 const seed=newHousehold('2026-11-16');
 assert.equal(startConversation(seed,'alex',{x:-.2,z:1.85},'daily'),true);
 assert.equal(arriveSocial(seed),true);
 const ctx=await browser.newContext({viewport:{width:390,height:844},
   isMobile:true,hasTouch:true,deviceScaleFactor:1});
 await ctx.addInitScript(({key,root})=>{
  localStorage.setItem(key,JSON.stringify(root));
  localStorage.setItem('lifesim.uiTour.v1','done');
 },{key:SAVE_KEY,root:seed});
 try{
  const page=await ctx.newPage();
  page.on('pageerror',e=>failures.push('MANDATORY '+e.message));
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:55000});
  await page.locator('#conversation-panel.dialogue-required').waitFor({state:'visible'});
  assert.equal(await page.locator('#conversation-panel').getAttribute('aria-modal'),'true');
  assert.equal(await page.locator('#conversation-close').isVisible(),false);
  assert.equal(await page.locator('#dialogue-backdrop').isVisible(),true);
  const before=await page.locator('#time-label').innerText();
  await page.waitForTimeout(550);
  assert.equal(await page.locator('#time-label').innerText(),before,'mandatory choice freezes time');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#conversation-panel').isVisible(),true);
  await page.locator('#conversation-options button').first().tap();
  assert.equal(await page.locator('#conversation-panel').isVisible(),true);
  await page.screenshot({path:'comfort-c2-required-decision-390x844.png'});
 }finally{await ctx.close();}
}
try{
 for(const [w,h] of sizes){
  const before=await visit(w,h,'before');
  const baseline=before.footprint;
  await before.ctx.close();
  const after=await visit(w,h,'after');
  const next=after.footprint;
  const delta=Number(((baseline.pixels-next.pixels)/baseline.pixels*100).toFixed(1));
  report.push({viewport:w+'x'+h,before:baseline.pixels,after:next.pixels,
   reductionPercent:delta,screen:w*h,
   beforeSharePercent:Number((baseline.pixels/(w*h)*100).toFixed(1)),
   afterSharePercent:Number((next.pixels/(w*h)*100).toFixed(1))});
  assert.ok(next.pixels>0,'footprint exists');
  assert.ok(next.pixels<baseline.pixels,'HUD is smaller '+w+'x'+h);
  if(w===390)assert.ok(delta>=25,'390x844 reduction '+delta+'% must be >=25%');
  if(w===390)await exercise(after.page);
  await after.ctx.close();
 }
 await verifyRequiredChoice();
 writeFileSync('comfort-c2-areas.json',JSON.stringify(report,null,2)+'\n');
 assert.equal(failures.length,0,failures.join('\n'));
 console.log('Comfort C2 real PlayCanvas/WebGL HUD screens, touch, saves:',JSON.stringify(report));
}finally{await browser.close();}
