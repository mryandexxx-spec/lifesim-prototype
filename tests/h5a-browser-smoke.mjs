import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold,chooseResidentAction,tickHousehold} from '../src/household.js';
import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {PAINT_ACTIVITY_ID,PAINT_CONTENT_IDS} from '../src/painting.js';
import {arrive,SAVE_KEY} from '../src/simulation.js';
const h=newHousehold();
const pose=findMarketPlacement(h.world.furniture,h.shop,'easel.starter');
assert.ok(pose);
const tx=buyMarketItem(h.world.furniture,h.shop,'easel.starter',pose);
assert.equal(tx.ok,true,tx.reason);
h.world.furniture=tx.world;h.shop=tx.shop;
assert.equal(chooseResidentAction(h,'paint',false,'alex',tx.instanceId,
  PAINT_ACTIVITY_ID,PAINT_CONTENT_IDS[0]),true);
h.position={...furnitureActionApproach(h.world,'paint',tx.instanceId)};
arrive(h);
tickHousehold(h,44.8);
assert.equal(h.createdWorks.length,0);
assert.equal(h.action?.id,'paint');
// H5c: exercise a brand-new, seeded high-tier composition through the real
// PlayCanvas finished-art renderer while the legacy H5a brush completes.
h.createdWorks.push({
  id:'work:painting:alex:h5c-webgl',ownerId:'alex',
  easelInstanceId:tx.instanceId,contentId:'painting.aurora',
  seed:9876543,quality:86,createdAt:h.minutes,
  renderVersion:1,kind:'artwork',location:'studio',
  origin:{x:pose.x,z:pose.z,yaw:pose.yaw}
});
h.autonomy.enabled=false;h.otherSim.autonomy.enabled=false;
h.actionQueues.byResident.alex=[];
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage',
]});
try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},
    deviceScaleFactor:1});
  await ctx.addInitScript(({key,record})=>{
    localStorage.setItem(key,JSON.stringify(record));
    localStorage.setItem('lifesim.uiTour.v1','done');
  },{key:SAVE_KEY,record:h});
  const page=await ctx.newPage();
  const errors=[];
  page.on('pageerror',err=>{errors.push('PAGE '+err.stack)});
  page.on('console',msg=>{if(msg.type()==='error')errors.push('CONSOLE '+msg.text())});
  page.on('crash',()=>errors.push('PAGE CRASH'));
  page.on('requestfailed',request=>{
    if(request.url().includes('/src/')||request.url().includes('/vendor/'))
      errors.push('REQUEST '+request.url()+' '+request.failure()?.errorText);
  });
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(6000);
  const before=await page.locator('#time-label').innerText();
  await page.waitForTimeout(3500);
  const after=await page.locator('#time-label').innerText();
  const loading=await page.locator('#loading-status').innerText();
  await page.screenshot({path:'h5a-browser-canvas.png'});
  console.log(JSON.stringify({before,after,loading,errors},null,2));
  assert.equal(errors.length,0,'Browser JavaScript/graphics exceptions');
  assert.notEqual(before,after,'Canvas update must continue after artwork creation');
  const saved=await page.evaluate(key=>{
    try{return JSON.parse(localStorage.getItem(key))}catch{return null}
  },SAVE_KEY);
  console.log('Saved state exists?',Boolean(saved));
  assert.ok(saved?.createdWorks?.some(work=>work.contentId==='painting.aurora'&&
    work.renderVersion===1),'Seeded high-tier artwork survived browser runtime');
}finally{await browser.close();}
