/**
 * CAS-00.4: mobile-sized real PlayCanvas performance inventory for the
 * EXISTING TWO-person scene. This is not a four-resident simulation test.
 * SwiftShader Chromium measurements must not be reported as iPhone Safari FPS.
 * Run with the same static HTTP server and vendor PlayCanvas module as CI.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const VIEWPORTS=[[390,844],[375,667],[320,568],[844,390]];
const ARTIFACT_DIR='artifacts/cas-00';
const seed=newHousehold('2026-11-22');
seed.paused=true;
seed.otherSim.paused=true;
seed.autonomy.enabled=false;
seed.otherSim.autonomy.enabled=false;
const initial=JSON.parse(JSON.stringify(seed));
const snapshots=[];
mkdirSync(ARTIFACT_DIR,{recursive:true});

const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
try {
  for (const [width,height] of VIEWPORTS) {
    const name=width+'x'+height;
    const context=await browser.newContext({
      viewport:{width,height},deviceScaleFactor:1,isMobile:true,
      hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'
    });
    await context.addInitScript(({key,seed,tour})=>{
      if (!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));
      localStorage.setItem(tour,'done');
    },{key:SAVE_KEY,seed:initial,tour:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage(),errors=[],glbResponses=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('crash',()=>errors.push('Chromium renderer crashed'));
    page.on('response',response=>{
      if (/\/assets\/characters\/.*\.glb/.test(response.url()))
        glbResponses.push({status:response.status(),file:response.url().split('/').pop().split('?')[0]});
    });
    const boot=async(label)=>{
      const started=Date.now();
      if (label==='cold')await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
      else await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('#loading').waitFor({state:'hidden',timeout:85000});
      await page.locator('#game-canvas').waitFor({state:'visible',timeout:10000});
      // Wait for a measured sequence of REAL frames after the loading overlay.
      const profile=await page.evaluate(async()=>{
        const {Application}=await import('playcanvas');
        const app=Application.getApplication();
        const device=app?.graphicsDevice;
        const stamps=[];
        for (let i=0;i<46;i++)
          await new Promise(resolve=>requestAnimationFrame(()=>{
            stamps.push(performance.now());resolve();
          }));
        const deltas=stamps.slice(1).map((t,i)=>t-stamps[i]).sort((a,b)=>a-b);
        const pick=p=>Number(deltas[Math.min(deltas.length-1,Math.floor((deltas.length-1)*p))].toFixed(2));
        const canvas=document.getElementById('game-canvas');
        const bounds=canvas?.getBoundingClientRect();
        const statuses=Object.fromEntries(['engine','scene','frame','alex','mira'].map(id=>
          [id,document.querySelector('#loading-stages [data-stage="'+id+'"]')?.dataset.status??null]));
        const appStats=app?.stats;
        return {
          hasWebGL:Boolean(device?.gl&&device.canvas),
          graphicsDeviceName:device?.constructor?.name??null,
          alexVisual:Boolean(app?.root.findByName('Meshy Alex visual')),
          miraVisual:Boolean(app?.root.findByName('Meshy Mira visual')),
          drawCalls:Number.isFinite(appStats?.drawCalls?.total)?appStats.drawCalls.total:null,
          triangles:Number.isFinite(appStats?.frame?.triangles)?appStats.frame.triangles:null,
          vramGeometryBytes:Number.isFinite(device?.vram?.vb)?device.vram.vb:null,
          jsHeapBytes:Number.isFinite(performance.memory?.usedJSHeapSize)?performance.memory.usedJSHeapSize:null,
          frameMedianMs:pick(.5),frameP95Ms:pick(.95),
          canvasSize:{width:Math.round(bounds?.width??0),height:Math.round(bounds?.height??0)},
          loading:statuses,
          scrollOverflow:document.documentElement.scrollWidth-innerWidth
        };
      });
      const bootMs=Date.now()-started;
      assert.ok(profile.hasWebGL,name+' '+label+' must have an actual PlayCanvas WebGL context');
      assert.ok(profile.canvasSize.width>=180&&profile.canvasSize.height>=130,
        name+' '+label+' must render a substantial canvas');
      assert.ok(profile.alexVisual&&profile.miraVisual,
        name+' '+label+' must create both currently owned character visual nodes');
      assert.ok(profile.frameMedianMs>0&&profile.frameP95Ms>0,
        name+' '+label+' must sample 45 real RAF frame intervals');
      assert.ok(profile.scrollOverflow<=2,
        name+' '+label+' must not cause horizontal mobile overflow');
      assert.deepEqual(errors,[],name+' '+label+' must boot without uncaught errors');
      const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
      assert.equal(saved?.version,1,'root save version must remain v1');
      assert.equal(saved?.shop?.credits,initial.shop.credits,'no phantom money at loading');
      assert.equal(saved?.selectedSim,initial.selectedSim,'resident selection must be preserved');
      assert.equal(saved?.relationship?.affinity,initial.relationship.affinity,'no phantom social reward');
      await page.screenshot({path:ARTIFACT_DIR+'/'+name+'-'+label+'.png'});
      const entry={viewport:name,pass:label,bootMs,...profile,characterResponses:glbResponses};
      snapshots.push(entry);
      console.log('CAS-00 mobile PlayCanvas baseline:',JSON.stringify(entry));
    };
    await boot('cold');
    if (width===390)await boot('warm');
    await context.close();
  }
  writeFileSync(ARTIFACT_DIR+'/baseline.json',JSON.stringify({
    engine:'PlayCanvas real WebGL on Playwright Chromium/SwiftShader',
    device:'CI runner, NOT a physical iPhone',
    population:'current 2 residents only',
    buildSource:'exact PR HEAD',measurements:snapshots
  },null,2)+'\n');
  assert.equal(snapshots.length,VIEWPORTS.length+1);
  console.log('CAS-00.4: 4 iPhone-size real Chromium WebGL scenes and 390 warm reload PASS; iPhone Safari QA deferred');
} finally {
  await browser.close();
}
