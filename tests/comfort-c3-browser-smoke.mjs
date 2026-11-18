/** C3 real mobile-size PlayCanvas/WebGL: mounted saved geometry and touch modes. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {buyMarketItem} from '../src/furniture-shop.js';
import {SAVE_KEY} from '../src/simulation.js';

const seed=newHousehold('2026-11-18');
seed.minutes=30;
seed.autonomy.enabled=false;
seed.otherSim.autonomy.enabled=false;
seed.position={x:0,z:0};seed.otherSim.position={x:1,z:0};
const buy=buyMarketItem(seed.world.furniture,seed.shop,'ceiling.globe',
  {x:0,z:0,yaw:0},{construction:seed.world.construction});
assert.equal(buy.ok,true,'paid ceiling placement in existing room');
seed.world.furniture=buy.world;seed.shop=buy.shop;
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const faults=[];
try{
  for(const [width,height] of [[390,844],[844,390]]){
    const ctx=await browser.newContext({viewport:{width,height},isMobile:true,
      hasTouch:true,deviceScaleFactor:1});
    await ctx.addInitScript(({key,root})=>{
      localStorage.setItem(key,JSON.stringify(root));
      localStorage.setItem('lifesim.uiTour.v1','done');
    },{key:SAVE_KEY,root:seed});
    const page=await ctx.newPage();
    page.on('pageerror',e=>faults.push(width+'x'+height+' PAGE '+e.message));
    page.on('requestfailed',r=>{
      if(r.url().includes('/src/')||r.url().includes('/vendor/'))
        faults.push(width+'x'+height+' REQ '+r.url()+' '+r.failure()?.errorText);
    });
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
    const canvas=await page.locator('#game-canvas').screenshot();
    assert.ok(canvas.length>2000,'real WebGL renders a mounted light');
    await page.screenshot({path:'comfort-c3-mounted-night-'+width+'x'+height+'.png'});
    await page.locator('#home-open').tap();
    await page.locator('#home-furnish').tap();
    await page.locator('#furnish-item-select').selectOption(buy.instanceId);
    const mode=page.locator('#furnish-light-mode');
    assert.equal(await mode.isVisible(),true,'manual mode appears on selected fixture');
    await mode.selectOption('off');
    let data=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    let item=data.world.furniture.instances.find(x=>x.instanceId===buy.instanceId);
    assert.equal(item.lightMode,'off','explicit manual off saved in v1');
    await mode.selectOption('on');
    data=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    item=data.world.furniture.instances.find(x=>x.instanceId===buy.instanceId);
    assert.equal(item.lightMode,'on');
    assert.equal(item.mount.x,0);assert.equal(item.mount.z,0);
    assert.equal(data.version,1,'root save version unchanged');
    await page.locator('#furnish-exit').tap();
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
    assert.equal(faults.length,0,faults.join('\n'));
    await ctx.close();
  }
  console.log('C3 mounted saved light, mobile WebGL, touch modes and reload: PASS');
}finally{await browser.close();}
