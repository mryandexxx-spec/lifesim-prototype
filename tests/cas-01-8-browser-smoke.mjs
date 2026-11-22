/** CAS-01.8: measured real PlayCanvas WebGL mobile-sized soak, never iPhone Safari certification. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold,loadHousehold} from '../src/household.js';
import {newGame,SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const copy=x=>JSON.parse(JSON.stringify(x));
function seed(people){
  const root=newHousehold('2026-11-23');
  root.autonomy.enabled=true;
  if(people===4){
    const extra=(id,name,x)=>{const actor=newGame();
      actor.position={x,z:1.2};actor.personality.name=name;
      return {id,identity:{firstName:name,lastName:'Тест',lifeStage:'adult'},actor};
    };
    root.population={schema:1,nextResidentSerial:5,
      residentsById:{resident_3:extra('resident_3','Вера',1.2),
        resident_4:extra('resident_4','Игорь',2.1)},
      linksByResident:{
        alex:{familyId:'family_1',dwellingId:'dwelling_1'},
        mira:{familyId:'family_1',dwellingId:'dwelling_1'},
        resident_3:{familyId:'family_2',dwellingId:'dwelling_1'},
        resident_4:{familyId:'family_3',dwellingId:'dwelling_1'}},kinship:[]};
  }
  return loadHousehold(copy(root));
}
function percentile(values,p){
  const data=values.filter(Number.isFinite).sort((a,b)=>a-b);
  return data.length?+data[Math.min(data.length-1,Math.ceil(data.length*p)-1)].toFixed(2):null;
}
mkdirSync('artifacts/cas-01-8',{recursive:true});
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const results=[];
try{
  for(const [width,height] of [[390,844],[320,568]]){
    for(const people of [2,4]){
      const household=seed(people),balance=household.shop.credits;
      const context=await browser.newContext({
        viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block'});
      await context.addInitScript(({key,data,tour})=>{
        if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(data));localStorage.setItem(tour,'done');
      },{key:SAVE_KEY,data:household,tour:UI_TOUR_STORAGE_KEY});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('crash',()=>errors.push('renderer crash'));
      const started=Date.now();
      await page.goto('http://127.0.0.1:8765/?lot-e1=qa&cas-01-8=qa',
        {waitUntil:'domcontentloaded'});
      await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
      const loadMs=Date.now()-started;
      const canvas=await page.evaluate(()=>{
        const c=document.querySelector('#game-canvas'),b=c.getBoundingClientRect();
        return {width:b.width,height:b.height,
          webgl:!!(c.getContext('webgl2')||c.getContext('webgl')),
          stats:typeof window.__LifeSimE1Stats};
      });
      assert.ok(canvas.webgl&&canvas.width>100&&canvas.height>100);
      assert.equal(canvas.stats,'function');
      assert.equal(await page.locator('#dashboard .resident-switch button').count(),people);
      if(people===4){
        await page.locator('#pick-resident_3').tap();
        assert.equal(await page.locator('#resident-name').innerText(),'Вера');
        await page.locator('#pick-resident_4').tap();
        assert.equal(await page.locator('#resident-name').innerText(),'Игорь');
        const visible=await page.evaluate(async()=>{
          const {Application}=await import('playcanvas'),app=Application.getApplication();
          return ['resident_3','resident_4'].map(id=>!!app.root.findByName('CAS resident '+id)?.enabled);
        });
        assert.deepEqual(visible,[true,true],'both extra residents must be rendered');
        const hit=await page.evaluate(()=>[...document.querySelectorAll('#dashboard .resident-switch button')]
          .map(e=>{const b=e.getBoundingClientRect();return b.width>=43.5&&b.height>=43.5&&
            b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight;}));
        assert.ok(hit.every(Boolean),'4 resident targets must be >=44px and fully visible');
      }
      const samples=[];
      for(let i=0;i<28;i++){
        await page.waitForTimeout(140);
        const s=await page.evaluate(()=>window.__LifeSimE1Stats());
        assert.ok(s&&Number.isFinite(s.drawCallCount)&&Number.isFinite(s.frameTimeMs),
          'real engine frame counters are required');
        samples.push(s);
      }
      assert.ok(samples.some(x=>x.drawCallCount>0),'nonzero real WebGL draw calls');
      await page.screenshot({path:'artifacts/cas-01-8/'+people+'-'+width+'x'+height+'.png'});
      const original=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
      assert.equal(original.version,1);
      assert.equal(original.shop.credits,balance,'no phantom salary or purchase during render stress');
      assert.equal(Boolean(original.population),people===4);
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
      assert.equal(await page.locator('#dashboard .resident-switch button').count(),people);
      const restored=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
      assert.equal(restored.version,1);
      assert.equal(restored.shop.credits,balance);
      assert.deepEqual(restored.population?.linksByResident,original.population?.linksByResident);
      assert.deepEqual(errors,[],'no uncaught JS errors or renderer crash');
      const field=k=>samples.map(s=>s[k]);
      results.push({
        viewport:width+'x'+height,people,loadMs,frameSamples:samples.length,
        frameTimeMs:{p50:percentile(field('frameTimeMs'),.5),p95:percentile(field('frameTimeMs'),.95)},
        cpuUpdateMsP95:percentile(field('cpuUpdateMs'),.95),
        cpuRenderMsP95:percentile(field('cpuRenderMs'),.95),
        drawCallsP95:percentile(field('drawCallCount'),.95),
        fpsMedian:percentile(field('fps'),.5),
        vramBytes:samples.at(-1).vramBytes,
        saveReload:true,errorCount:0
      });
      await context.close();
    }
  }
}finally{
  await browser.close();
  const report={stage:'CAS-01.8',environment:'GitHub Actions Linux Chromium SwiftShader PlayCanvas, not iPhone Safari',
    physicalSafariAccepted:false,results};
  writeFileSync('artifacts/cas-01-8/browser.json',JSON.stringify(report,null,2));
  console.log('CAS-01.8 real mobile-size WebGL results '+JSON.stringify(report));
}
