/** QSK-03: read-only 2/4 resident mobile-sized PlayCanvas profiling.
 * Chromium/SwiftShader CI is NOT a physical iPhone or Safari GPU benchmark.
 * The current released CAS source models are used, not unapproved CAS-B art.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold,loadHousehold} from '../src/household.js';
import {newGame,SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
import {summarizeFrames,summarizeAssetResources} from '../scripts/qsk-03-metrics.mjs';

const DIR='artifacts/qsk-03',URL='http://127.0.0.1:8765/?lot-e1=qa&qsk-03=baseline';
const SNAPSHOT_FRAMES=150;
mkdirSync(DIR,{recursive:true});

function fixture(count){
  const household=newHousehold('2026-11-23');
  household.autonomy.enabled=true;
  if(count===4){
    const extra=(id,name,x)=>{const actor=newGame();
      actor.position={x,z:1.2};actor.personality.name=name;
      return {id,identity:{firstName:name,lastName:'Тест',lifeStage:'adult'},actor};
    };
    household.population={schema:1,nextResidentSerial:5,
      residentsById:{resident_3:extra('resident_3','Вера',1.2),
        resident_4:extra('resident_4','Игорь',2.1)},
      linksByResident:{
        alex:{familyId:'family_1',dwellingId:'dwelling_1'},
        mira:{familyId:'family_1',dwellingId:'dwelling_1'},
        resident_3:{familyId:'family_2',dwellingId:'dwelling_1'},
        resident_4:{familyId:'family_3',dwellingId:'dwelling_1'}},kinship:[]};
  }
  return loadHousehold(JSON.parse(JSON.stringify(household)));
}

const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const results=[],contextLoss=[];
let completed=false;
try{
  for(const [width,height] of [[390,844],[320,568]]){
    for(const residents of [2,4]){
      const initial=fixture(residents),label=width+'x'+height+'-'+residents;
      const context=await browser.newContext({
        viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true,
        serviceWorkers:'block',reducedMotion:'reduce'});
      await context.addInitScript(({key,seed,tour})=>{
        if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));
        localStorage.setItem(tour,'done');
      },{key:SAVE_KEY,seed:initial,tour:UI_TOUR_STORAGE_KEY});
      const page=await context.newPage(),errors=[],modelResponses=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('crash',()=>errors.push('renderer crashed'));
      page.on('response',response=>{
        if(/\/assets\/characters\/.*\.glb(?:\?|$)/.test(response.url()))
          modelResponses.push({status:response.status(),path:new URL(response.url()).pathname});
      });
      try{
        for(const pass of ['cold','warm']){
          const started=Date.now();
          if(pass==='cold')await page.goto(URL,{waitUntil:'domcontentloaded'});
          else await page.reload({waitUntil:'domcontentloaded'});
          await page.locator('#loading').waitFor({state:'hidden',timeout:85000});
          await page.locator('#game-canvas').waitFor({state:'visible',timeout:10000});
          const loadMs=Date.now()-started;
          assert.equal(await page.locator('#dashboard .resident-switch button').count(),
            residents,label+' '+pass+' actual resident switcher');
          const raw=await page.evaluate(async samples=>{
            const {Application}=await import('playcanvas');
            const app=Application.getApplication(),device=app?.graphicsDevice;
            const canvas=document.querySelector('#game-canvas');
            if(!device?.gl||!canvas||typeof window.__LifeSimE1Stats!=='function')
              throw new Error('QSK-03 requires actual PlayCanvas WebGL and read-only E1 counters');
            const frames=[],finite=x=>Number.isFinite(x)?x:null;
            let last=null;
            for(let i=0;i<samples;i++){
              await new Promise(resolve=>requestAnimationFrame(time=>{
                const stats=window.__LifeSimE1Stats(),now=performance.now();
                frames.push({
                  rafIntervalMs:last===null?null:finite(time-last),
                  frameTimeMs:finite(stats.frameTimeMs),
                  cpuUpdateMs:finite(stats.cpuUpdateMs),
                  cpuRenderMs:finite(stats.cpuRenderMs),
                  gpuFrameMs:finite(stats.gpuFrameMs),
                  drawCalls:finite(stats.drawCallCount),
                  fps:finite(stats.fps),
                  triangles:finite(app.stats?.frame?.triangles),
                  vramBytes:finite(stats.vramBytes),
                  jsHeapBytes:finite(performance.memory?.usedJSHeapSize)
                });
                last=time;resolve();
              }));
            }
            const instances=[],materials=new Set(),meshes=new Set(),textures=new Set();
            for(const type of ['render','model']){
              for(const component of app.root.findComponents(type)){
                for(const instance of component.meshInstances??[]){
                  instances.push(instance);
                  if(instance.mesh)meshes.add(instance.mesh);
                  if(instance.material)materials.add(instance.material);
                }
              }
            }
            for(const material of materials)
              for(const value of Object.values(material)){
                if(value&&typeof value==='object'&&value.constructor?.name?.includes('Texture'))
                  textures.add(value);
              }
            return {
              canvas:{width:canvas.width,height:canvas.height},
              hasWebGL:Boolean(device.gl),
              visibleExtra:residents=>residents===2||['resident_3','resident_4']
                .every(id=>Boolean(app.root.findByName('CAS resident '+id)?.enabled)),
              frames,
              scene:{meshInstances:instances.length,meshes:meshes.size,
                materials:materials.size,referencedMaterialTextures:textures.size,
                appAssets:app.assets.list().length},
              resourceEntries:performance.getEntriesByType('resource').map(entry=>({
                name:entry.name,decodedBodySize:entry.decodedBodySize,
                transferSize:entry.transferSize,durationMs:entry.duration}))
            };
          },SNAPSHOT_FRAMES);
          assert.ok(raw.hasWebGL&&raw.canvas.width>150&&raw.canvas.height>150,
            label+' must actually render PlayCanvas WebGL');
          assert.equal(raw.frames.length,SNAPSHOT_FRAMES);
          assert.ok(raw.frames.some(frame=>frame.drawCalls>0),
            label+' '+pass+' must have non-zero actual engine draw calls');
          const extras=await page.evaluate(()=>{
            const pc=window.__LifeSimE1Stats;
            return typeof pc==='function';
          });
          assert.ok(extras);
          if(residents===4){
            const enabled=await page.evaluate(async()=>{
              const {Application}=await import('playcanvas'),app=Application.getApplication();
              return ['resident_3','resident_4']
                .map(id=>Boolean(app.root.findByName('CAS resident '+id)?.enabled));
            });
            assert.deepEqual(enabled,[true,true],'both added 3D residents must be present');
          }
          const saved=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
          assert.equal(saved.version,1,'v1 save unchanged');
          assert.equal(saved.shop.credits,initial.shop.credits,'no profiling-side wallet mutation');
          assert.equal(Boolean(saved.population),residents===4,'correct population fixture persists');
          assert.deepEqual(errors,[],'no browser JS errors or crashes');
          await page.screenshot({path:DIR+'/'+label+'-'+pass+'.png'});
          const summary={viewport:width+'x'+height,residents,pass,loadMs,
            sourceScene:'published CAS original Alex/Mira family; no CAS-B provisional morph assets',
            sampleFrames:raw.frames.length,canvas:raw.canvas,scene:raw.scene,
            metrics:summarizeFrames(raw.frames),
            resources:summarizeAssetResources(raw.resourceEntries),
            glbHttpStatus:[...new Set(modelResponses.map(x=>x.status))].sort(),
            storageVersion:saved.version,errors:errors.length};
          results.push(summary);
          console.log('QSK-03 measured '+label+' '+pass+': '+JSON.stringify({
            loadMs,rafP95:summary.metrics.rafIntervalMs.p95,
            updateP95:summary.metrics.cpuUpdateMs.p95,
            drawCallsP95:summary.metrics.drawCalls.p95,
            vramP95:summary.metrics.vramBytes.p95}));
        }
        if(width===390&&residents===4){
          // Measure the real context-loss/recovery path once, outside frame timing.
          const supported=await page.evaluate(()=>{
            const gl=document.querySelector('#game-canvas').getContext('webgl2');
            const ext=gl?.getExtension('WEBGL_lose_context');
            if(!ext)return false;
            window.__qsk03Restore=()=>ext.restoreContext();
            ext.loseContext();
            return true;
          });
          let recovered=null;
          if(supported){
            await page.waitForFunction(()=>!document.querySelector('#viewport-recovery').hidden,
              null,{timeout:12000});
            await page.evaluate(()=>window.__qsk03Restore());
            await page.waitForFunction(()=>document.querySelector('#viewport-recovery').hidden,
              null,{timeout:18000});
            recovered=true;
          }
          contextLoss.push({viewport:'390x844',residents:4,supported,recovered,
            note:'WEBGL_lose_context extension in Chromium; NOT actual iPhone pressure'});
          assert.deepEqual(errors,[]);
        }
      }finally{await context.close();}
    }
  }
  completed=true;
}finally{
  await browser.close();
  const report={stage:'QSK-03',schema:1,gitCommit:process.env.GITHUB_SHA??null,
    environment:'GitHub Actions Linux Chromium headless PlayCanvas 2.24.1 SwiftShader, mobile viewport emulation',
    notSafariHardware:true,physicalIphoneAccepted:false,
    serviceWorkers:'blocked to separate HTTP caching from SW',
    methodology:{framesPerPass:SNAPSHOT_FRAMES,pass:['cold','warm'],
      cpu:'PlayCanvas app.stats; unavailable values null',
      gpu:'WebGL GPU timing unavailable unless PlayCanvas reports it; missing values null',
      memory:'Chromium JS heap and PlayCanvas VRAM estimates, NOT process/GPU physical peak',
      resources:'same-origin ResourceTiming decoded/transfer bytes; HTTP warm cache can report zero transfer',
      timing:'requestAnimationFrame real frame intervals and engine app.stats; no fixed FPS pass gate'},
    results,contextLoss,completed};
  writeFileSync(DIR+'/baseline.json',JSON.stringify(report,null,2)+'\n');
  console.log('QSK-03 '+(completed?'PASS':'INCOMPLETE')+' '+JSON.stringify({
    cases:results.length,loss:contextLoss,notSafariHardware:true}));
}
assert.equal(results.length,8,'two mobile viewports x 2/4 residents x cold/warm');
