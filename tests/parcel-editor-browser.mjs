import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';

const base=newHousehold('2026-11-22');
base.paused=base.otherSim.paused=true;
base.autonomy.enabled=base.otherSim.autonomy.enabled=false;
const proposal=previewOutdoorFeatureEdit(base,{operation:'place',itemId:'garden.bench',pose:{x:8,z:-7,yaw:0}});
assert.ok(proposal.ok,proposal.reason);
const seed=commitOutdoorFeatureEdit(base,proposal).root;
await mkdir('artifacts/parcel-editor',{recursive:true});
const browser=await chromium.launch({args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 for(const [width,height] of [[390,844],[320,568],[844,390]]){
  const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await ctx.addInitScript(({key,seed})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));
    localStorage.setItem('lifesim.uiTour.v1','done');
  },{key:SAVE_KEY,seed});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:75000});
  const action=id=>page.locator('[data-parcel-action="'+id+'"]');
  const tap=id=>action(id).tap({timeout:8000});
  const root=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
  const worldTap=async(x,z,y=-.53)=>{
    const pt=await page.evaluate(async({x,z,y})=>{
      const {Application,Vec3}=await import('playcanvas');
      const app=Application.getApplication(),camera=app.root.findComponent('camera');
      const p=camera.worldToScreen(new Vec3(x,y,z)),r=app.graphicsDevice.canvas.getBoundingClientRect();
      return {x:r.left+p.x,y:r.top+p.y};
    },{x,y,z});
    await page.touchscreen.tap(pt.x,pt.y);
  };
  await page.locator('#home-open').tap();await page.locator('#home-outdoors').tap();
  if(height>width){
    const visibleRatio=await page.evaluate(()=>{
      const top=document.querySelector('#parcel-bar').getBoundingClientRect();
      const panel=document.querySelector('#parcel-editor').getBoundingClientRect();
      return (panel.top-top.bottom)/(window.innerHeight-top.bottom);
    });
    assert.ok(visibleRatio>=.65,'Central interactive scene must retain at least 65%, got '+visibleRatio);
  }
  const sceneViewport=await page.evaluate(async()=>{
    const {Application}=await import('playcanvas');
    const camera=Application.getApplication().root.findComponent('camera');
    const {x,y,z,w}=camera.rect;
    return {x,y,z,w};
  });
  if(width>height){
    assert.ok(sceneViewport.z>=.5&&sceneViewport.z<=.7&&sceneViewport.w===1,
      'Landscape viewport must exclude side panel: '+JSON.stringify(sceneViewport));
  }else{
    assert.ok(sceneViewport.y>0&&sceneViewport.w>=.5&&sceneViewport.w<=.8,
      'Portrait viewport must exclude tray: '+JSON.stringify(sceneViewport));
  }
  assert.equal(await page.locator('#hint').isVisible(),false,
    'Legacy Life-mode hint must not block the build lot');
  const clip=await page.locator('#game-canvas').evaluate(el=>el.style.clipPath);
  assert.ok(clip.startsWith('inset('),'PlayCanvas residue outside editing viewport must be clipped');
  await page.screenshot({path:'artifacts/parcel-editor/'+width+'x'+height+'-overview.png'});
  await worldTap(8,-7,.35);
  assert.equal(await page.locator('#parcel-editor h2').textContent(),'Садовая скамейка');
  await tap('rotate');assert.equal((await root()).world.outdoors.features[0].yaw,0);
  await tap('apply');assert.equal((await root()).world.outdoors.features[0].yaw,90);
  await tap('undo');assert.equal((await root()).world.outdoors.features[0].yaw,0);
  await tap('redo');
  await tap('group:ground');await tap('pick:stone');
  await worldTap(2.25,-7.75);await worldTap(3.75,-7.75);
  assert.match(await page.locator('.parcel-wallet').textContent(),/32 кр/);
  await page.screenshot({path:'artifacts/parcel-editor/'+width+'x'+height+'-draft.png'});
  await tap('view');await tap('view');await tap('apply');
  assert.equal((await root()).shop.credits,seed.shop.credits-32);
  await tap('section:pool');await tap('group:water');await tap('pick:paint');
  await worldTap(1.25,-8.75);await worldTap(3.75,-7.25);await tap('cancel');
  assert.equal((await root()).shop.credits,seed.shop.credits-32);
  await tap('section:house');await tap('group:room');await tap('pick:room');
  // The initial editor focuses the house; deliberate zoom-out exposes the
  // east extension for a new room without burying the home at initial load.
  await tap('zoom-out');await tap('zoom-out');
  await worldTap(16,-6);await worldTap(19,-4);
  assert.equal(await action('apply').isEnabled(),true,
    'Build preview: '+await page.locator('#parcel-editor output').textContent());
  await tap('apply');assert.ok((await root()).world.construction.revision>0);
  const built=(await root()).world.construction.floorCells.length;
  await tap('undo');
  assert.equal((await root()).world.construction.floorCells.length,
    seed.world.construction.floorCells.length);
  await tap('undo');
  assert.equal((await root()).shop.credits,seed.shop.credits,
    'History status: '+await page.locator('#parcel-editor output').textContent());
  await tap('redo');
  assert.equal((await root()).shop.credits,seed.shop.credits-32);
  await tap('redo');
  assert.equal((await root()).world.construction.floorCells.length,built);
  await tap('section:furniture');
  // Furnishing defaults to a tilted camera, unlike house planning.
  assert.equal(await action('view').textContent(),'План');
  const furnishingPitch=await page.evaluate(async()=>{
    const {Application}=await import('playcanvas');
    return Application.getApplication().root.findComponent('camera').entity
      .getEulerAngles().x;
  });
  assert.ok(Number.isFinite(furnishingPitch));
  await tap('group:owned');
  assert.ok(await page.locator('[data-parcel-action^="select:"]').count()>0);
  await page.locator('[data-parcel-action^="select:"]').first().tap();
  assert.equal(await page.locator('#parcel-editor').getAttribute('data-stage'),'selected');
  await tap('back');await tap('group:shop');
  // Owner correction: the category tabs are essential for browsing.
  // Only the search and the two native room/function dropdowns disappear.
  assert.equal(await page.locator('#furnish-type-tabs').isVisible(),true);
  assert.ok(await page.locator('#furnish-type-tabs button').count()>1,
    'Visible category buttons must remain available');
  assert.equal(await page.locator('#furnish-filter-count').isVisible(),true);
  for(const selector of ['.furnish-search-label','#furnish-catalog-filters',
    '#furnish-room-filter','#furnish-function-filter']){
    assert.equal(await page.locator(selector).isVisible(),false,selector);
  }
  const category=page.locator('#furnish-type-tabs button').nth(1);
  await category.tap();
  assert.equal(await category.getAttribute('aria-pressed'),'true',
    'Selecting a category must continue to filter the catalog');
  assert.ok(await page.locator('#furnish-stock button:not([hidden])').count()>0);
  await page.locator('#furnish-type-tabs button').first().tap();
  assert.equal(await page.locator('#furnish-type-tabs button').first().getAttribute('aria-pressed'),'true');
  await page.locator('#furnish-stock button:not([hidden])').first().tap();
  assert.equal(await page.locator('#parcel-editor').getAttribute('data-stage'),'list');
  assert.equal(await action('try').isVisible(),true);
  await page.locator('.parcel-native').evaluate(el=>{el.scrollTop=el.scrollHeight});
  const tryBounds=await action('try').boundingBox(),
    dockBounds=await page.locator('.parcel-actions').boundingBox(),
    nativeBounds=await page.locator('.parcel-native').boundingBox();
  assert.ok(tryBounds&&dockBounds&&nativeBounds);
  assert.ok(tryBounds.y>=nativeBounds.y+nativeBounds.height,
    'Preview CTA must remain below and outside catalog scrolling viewport');
  await tap('try');
  assert.equal(await page.locator('#parcel-editor').getAttribute('data-stage'),'draft');
  const turnBefore=await action('turn').boundingBox();
  assert.equal(await action('turn').isEnabled(),true);
  await tap('turn');
  const turnAfter=await action('turn').boundingBox();
  assert.ok(Math.abs(turnBefore.x-turnAfter.x)<1,
    'The 90° button cannot switch places on the first press');
  await tap('turn');
  const turnTwice=await action('turn').boundingBox();
  assert.ok(Math.abs(turnBefore.x-turnTwice.x)<1,
    'The 90° button must keep its x coordinate across repeated turns');
  await tap('cancel');await tap('exit');
  assert.equal(await page.locator('#game-canvas').evaluate(el=>el.style.clipPath),'');
  await page.reload();await page.locator('#loading').waitFor({state:'hidden',timeout:75000});
  assert.equal((await root()).world.outdoors.features[0].yaw,90);
  if(width===390){
    // Owner reproduction: independent fresh save, not an in-place localStorage
    // mutation wiped by the currently running game's unload persistence.
    const poorSeed=structuredClone(seed);poorSeed.shop.credits=281;
    const poorCtx=await browser.newContext({
      viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true
    });
    await poorCtx.addInitScript(({key,seed})=>{
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));
      localStorage.setItem('lifesim.uiTour.v1','done');
    },{key:SAVE_KEY,seed:poorSeed});
    const poorPage=await poorCtx.newPage(),poorErrors=[];
    poorPage.on('pageerror',error=>poorErrors.push(error.message));
    await poorPage.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await poorPage.locator('#loading').waitFor({state:'hidden',timeout:75000});
    const poorAction=id=>poorPage.locator('[data-parcel-action="'+id+'"]');
    const poorTap=id=>poorAction(id).tap({timeout:8000});
    const poorRoot=()=>poorPage.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal((await poorRoot()).shop.credits,281);
    await poorPage.locator('#home-open').tap();
    await poorPage.locator('#home-furnish').tap();
    assert.equal(await poorAction('view').textContent(),'План');
    await poorTap('group:shop');
    const expensive=poorPage.locator('#furnish-stock button').filter({hasText:'Шкаф с историями'});
    assert.ok(await expensive.count()>0,'Expected canonical wardrobe product');
    await expensive.first().tap();
    assert.equal(await poorPage.locator('#parcel-editor').getAttribute('data-stage'),'list');
    assert.equal(await poorAction('try').isEnabled(),true);
    await poorTap('try');
    assert.equal(await poorPage.locator('#parcel-editor').getAttribute('data-stage'),'draft');
    assert.equal((await poorRoot()).shop.credits,281,'Preview never charges');
    assert.equal(await poorAction('apply').isEnabled(),false,'Unaffordable purchase cannot commit');
    assert.equal(await poorAction('turn').isEnabled(),true);
    await poorTap('turn');
    assert.equal((await poorRoot()).shop.credits,281);
    await poorTap('cancel');await poorTap('exit');
    assert.deepEqual(poorErrors,[]);await poorCtx.close();
  }
  assert.deepEqual(errors,[]);await ctx.close();console.log('Parcel editor passed',width,height);
 }
}finally{await browser.close();}
