/** Comfort C1: real 390x844 PlayCanvas/WebGL night and day screenshots, no save migration. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const errors=[];
try{
 const capture=async({date,minutes,phase,filename})=>{
  const seed=newHousehold(date);
  seed.minutes=minutes;seed.otherSim.minutes=minutes;
  seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
  const context=await browser.newContext({viewport:{width:390,height:844},
   hasTouch:true,isMobile:true,deviceScaleFactor:1});
  await context.addInitScript(({key,record})=>{
   localStorage.setItem(key,JSON.stringify(record));
   localStorage.setItem('lifesim.uiTour.v1','done');
  },{key:SAVE_KEY,record:seed});
  try{
   const page=await context.newPage();
   page.on('pageerror',e=>errors.push('PAGE '+e.message));
   page.on('requestfailed',r=>{
    if(r.url().includes('/src/')||r.url().includes('/vendor/'))
     errors.push('REQUEST '+r.url()+' '+r.failure()?.errorText);
   });
   await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
   await page.locator('#loading').waitFor({state:'hidden',timeout:30000});
   await page.locator('#pause-btn').click();
   await page.waitForTimeout(350);
   assert.equal(await page.locator('#light-phase-label').innerText(),phase);
   const pixel=await page.locator('#game-canvas').screenshot();
   assert.ok(pixel.length>2000,'real WebGL canvas screenshot');
   await page.screenshot({path:filename});
   return pixel;
  }finally{await context.close();}
 };
 const midnight=await capture({date:'2026-12-21',minutes:60,phase:'Ночь',
  filename:'comfort-c1-winter-midnight-390x844.png'});
 const daytime=await capture({date:'2026-06-21',minutes:780,phase:'День',
  filename:'comfort-c1-summer-day-390x844.png'});
 assert.notDeepEqual(midnight,daytime,'Real WebGL day/night remain distinct');
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('Comfort C1 390x844 real PlayCanvas/WebGL night/day screenshot and phase checks PASS');
}finally{await browser.close();}
