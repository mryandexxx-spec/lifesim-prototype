/** Actual reusable CAS component and canonical save admission in mobile browser;
 * harness is not the future live CAS screen or physical iPhone acceptance. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(process.env.LP_EXPECTED_SHA)assert.equal(sha,process.env.LP_EXPECTED_SHA);
const out='artifacts/lp02c-picker';mkdirSync(out,{recursive:true});
const report={sha,cases:[],limitations:['isolated actual reusable component; live CAS integration still open','mobile emulation only']};
for(const [engine,launcher] of [['chromium',chromium],['webkit',webkit]]){
 for(const [width,height] of [[320,568],[390,844]]){
  const row={engine,width,height,status:'OPEN',errors:[]};report.cases.push(row);
  let browser;
  try{
   browser=await launcher.launch({headless:true});
   const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:1});
   const page=await context.newPage();page.on('pageerror',e=>row.errors.push(e.message));
   await page.goto('http://127.0.0.1:8765/package.json');
   await page.setContent('<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;font:16px system-ui}#host{height:100%;width:100%}</style></head><body><main id="host"></main></body></html>');
   await page.evaluate(async()=>{
    const {mountTraitPicker}=await import('/src/trait-picker.js');
    const {newHousehold,loadHousehold}=await import('/src/household.js');
    const {newGame,SAVE_KEY}=await import('/src/simulation.js');
    const {proposePopulationSave,commitPopulationSave}=await import('/src/resident-population.js');
    const root=newHousehold(),id='resident_3';window.__base=JSON.stringify(root);window.__touches=0;window.__writes=0;
    localStorage.setItem(SAVE_KEY,window.__base);
    document.addEventListener('touchstart',e=>{if(e.isTrusted)window.__touches++;},{passive:true});
    mountTraitPicker(document.querySelector('#host'),{onConfirm:profile=>{
     const actor=newGame();actor.personality=profile;
     const pop={schema:1,nextResidentSerial:4,residentsById:{[id]:{id,identity:{firstName:'Вера',lastName:'Тест',lifeStage:'adult'},actor}},
      linksByResident:Object.fromEntries(['alex','mira',id].map(x=>[x,{familyId:'family_1',dwellingId:'dwelling_1'}])),kinship:[]};
     const result=commitPopulationSave(root,proposePopulationSave(root,pop,loadHousehold),text=>{window.__writes++;localStorage.setItem(SAVE_KEY,text);});
     window.__confirmed=result.ok;window.__unchanged=JSON.stringify(root)===window.__base;
    }});
   });
   const choose=id=>page.locator('[data-trait="'+id+'"]'),confirm=page.locator('.trait-confirm');
   async function tap(el){await el.scrollIntoViewIfNeeded();const box=await el.boundingBox();assert.ok(box&&box.height>=44&&box.width>=44);await el.tap();}
   assert.equal(await page.locator('.trait-choice').count(),24);assert.equal(await confirm.isDisabled(),true);
   await tap(choose('pace.patient'));assert.equal(await choose('pace.impatient').isDisabled(),true);
   assert.match(await choose('pace.impatient').innerText(),/Несовместимо/);assert.equal(await confirm.isDisabled(),true);
   await tap(choose('communication.direct'));assert.equal(await confirm.isEnabled(),true);
   await tap(choose('communication.diplomatic'));assert.equal(await choose('tone.serious').isDisabled(),true);
   await tap(choose('pace.patient'));assert.equal(await choose('pace.impatient').isEnabled(),true);
   await tap(choose('tone.serious'));assert.equal(await choose('tone.playful').isDisabled(),true);
   assert.equal(await page.evaluate(()=>window.__writes),0);
   const layout=await page.evaluate(()=>{const l=document.querySelector('.trait-list'),f=document.querySelector('.trait-confirm').getBoundingClientRect();return {w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,scroll:l.scrollHeight>l.clientHeight,footer:f.bottom<=innerHeight+1};});
   assert.ok(layout.sw<=layout.w+1&&layout.sh<=layout.h+1&&layout.scroll&&layout.footer,JSON.stringify(layout));
   await page.screenshot({path:out+'/'+engine+'-'+width+'.png'});
   await tap(confirm);
   assert.deepEqual(await page.evaluate(()=>[window.__confirmed,window.__unchanged,window.__writes]),[true,true,1]);
   assert.ok(await page.evaluate(()=>window.__touches>=6));
   await page.reload({waitUntil:'domcontentloaded'});
   const persisted=await page.evaluate(async()=>{
    const {loadHousehold}=await import('/src/household.js');const {SAVE_KEY}=await import('/src/simulation.js');
    const root=loadHousehold(JSON.parse(localStorage.getItem(SAVE_KEY)));
    return root.population.residentsById.resident_3.actor.personality.traitIds;
   });
   assert.deepEqual(persisted,['communication.direct','communication.diplomatic','tone.serious']);
   assert.deepEqual(row.errors,[]);row.status='PASS';row.layout=layout;row.persisted=persisted;
  }catch(e){row.status='FAIL';row.error=String(e.stack||e);throw e;}
  finally{writeFileSync(out+'/report.json',JSON.stringify(report,null,2));await browser?.close();}
 }
}
console.log('LP-02C reusable CAS picker trusted touch and canonical v1 admission PASS',JSON.stringify(report));
