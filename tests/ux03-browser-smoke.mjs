import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {BUILD_TOOL_GROUPS} from '../src/build-tool-palette.js';
import {mkdirSync} from 'node:fs';
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
mkdirSync('ux03-artifacts',{recursive:true});
try{
 for(const [width,height] of [[390,844],[375,667],[320,568],[844,390]]){
  const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await ctx.addInitScript(()=>localStorage.setItem('lifesim.uiTour.v1','done'));
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',r=>{if(r.url().includes('/src/')||r.url().includes('/vendor/'))errors.push(r.url());});
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:25000});
  await page.locator('#home-open').click();
  await page.locator('#home-build').click();
  assert.ok(await page.locator('#build-editor').isVisible());
  assert.equal(await page.locator('[data-build-tool]').count(),31);
  for(const group of BUILD_TOOL_GROUPS){
   await page.locator('[data-build-group-tab="'+group.id+'"]').click();
   assert.equal(await page.locator('[data-build-group-tab="'+group.id+'"]').getAttribute('aria-pressed'),'true');
   const visible=await page.locator('#build-tools [data-build-tool]:visible').count();
   assert.equal(visible,group.tools.length,group.id+' exposes its exact scoped actions');
   await page.locator('[data-build-tool="'+group.tools[0]+'"]').click();
   assert.equal(await page.locator('[data-build-tool="'+group.tools[0]+'"]').getAttribute('aria-pressed'),'true');
  }
  await page.locator('#build-view-trigger').click();
  assert.ok(await page.locator('#build-view-panel').isVisible());
  await page.locator('[data-build-tool="camera"]').click();
  await page.locator('[data-build-walls="up"]').click();
  await page.locator('[data-build-walls="cut"]').click();
  await page.locator('#build-view-trigger').click();
  await page.locator('[data-build-group-tab="room"]').click();
  await page.locator('[data-build-tool="room"]').click();
  assert.match(await page.locator('#build-instruction').innerText(),/Протяни прямоугольник/);
  const counts=await page.evaluate(()=>({
   saved:localStorage.getItem('lifesim.room01.v1'),
   width:document.documentElement.scrollWidth,viewport:innerWidth,
   tabHeight:document.querySelector('[data-build-group-tab="room"]').getBoundingClientRect().height
  }));
  assert.ok(counts.tabHeight>=44);
  assert.ok(counts.width<=counts.viewport+2,'no horizontal viewport overflow');
  await page.screenshot({path:'ux03-artifacts/build-'+width+'x'+height+'.png'});
  await page.locator('#build-exit').click();
  assert.deepEqual(errors,[],errors.join('\n'));
  await ctx.close();
 }
}finally{await browser.close();}
