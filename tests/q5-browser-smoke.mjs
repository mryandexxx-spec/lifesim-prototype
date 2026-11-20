/** Q5 real PlayCanvas/WebGL browser smoke + DOM/VoiceOver semantics at four iPhone sizes. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {chooseCareerSpecialization,specializationReadiness} from '../src/career-specializations.js';
import {loadHousehold} from '../src/household.js';
import {resetSeniorProof} from '../src/career-seniority.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const seed=newHousehold('2026-11-16');
seed.careerSystem=hireCareer(seed.careerSystem,'alex','city-services',480);
seed.careerSystem=hireCareer(seed.careerSystem,'mira','editorial',480);
// Seed between shifts so a guarded career transfer is genuinely allowed.
seed.minutes=1200;seed.otherSim.minutes=1200;
const contract=seed.careerSystem.byResident.alex;
contract.level=4;contract.rankShifts=10;contract.performance=100;
contract.workedShifts=20;
assert.equal(chooseCareerSpecialization(seed,'alex','logistics').ok,true);
contract.level=6;contract.workedShifts+=2;
contract.seniorProofs=resetSeniorProof(contract,seed.minutes);
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
seed.paused=true;seed.otherSim.paused=true;
const startingCredits=seed.shop.credits;
const reloaded=loadHousehold(JSON.parse(JSON.stringify(seed)));
assert.equal(reloaded.careerSystem.byResident.alex.currentShift,null);
assert.equal(specializationReadiness(reloaded,'alex').canSwitch,true,
  'Canonical transfer must be permitted after save restoration');
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const errors=[];
try{
  for(const [width,height] of [[390,844],[375,667],[320,568],[844,390]]){
    const context=await browser.newContext({viewport:{width,height},
      deviceScaleFactor:1,isMobile:true,hasTouch:true});
    await context.addInitScript(({key,record,tourKey})=>{
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
      localStorage.setItem(tourKey,'done');
    },{key:SAVE_KEY,record:seed,tourKey:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(width+'x'+height+': '+error.message));
    page.on('crash',()=>errors.push(width+'x'+height+': crashed'));
    page.on('dialog',dialog=>dialog.accept());
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    const canvas=page.locator('#game-canvas');
    assert.ok(await canvas.isVisible(),'PlayCanvas canvas is visible '+width+'x'+height);
    assert.equal(await canvas.evaluate(c=>Boolean(c.getContext('webgl2')||c.getContext('webgl'))),
      true,'Actual PlayCanvas WebGL is initialized');
    await page.locator('#career-phone-toggle').tap();
    const phone=page.locator('#career-phone-panel');
    await phone.locator('.career-map-open').tap();
    assert.equal(await phone.locator('.career-map-node').count(),11);
    assert.equal(await phone.locator('.career-map-track').count(),2);
    assert.equal(await phone.locator('.career-map-node[aria-current="step"]').count(),1);
    assert.equal(await phone.locator('.career-map-node[aria-controls="career-map-detail"]').count(),11);
    assert.equal(await phone.locator('.career-map-node').first().getAttribute('role'),null);
    const last=phone.locator('[data-node-id="logistics-7"]');
    await last.tap();
    assert.match(await phone.locator('.career-map-inspector-heading').innerText(),/Главный планировщик/);
    assert.equal(await last.getAttribute('aria-pressed'),'true');
    assert.equal(await phone.locator('.career-map-inspector-heading').evaluate(n=>document.activeElement===n),true);
    const targets=await phone.locator('.career-map-node,.career-map-jump,.career-map-back,.career-map-back-to-graph')
      .evaluateAll(nodes=>nodes.map(n=>({h:n.getBoundingClientRect().height,w:n.getBoundingClientRect().width})));
    assert.ok(targets.every(({h,w})=>h>=44&&w>=44),
      'All map targets must be 44+ CSS px: '+width+'x'+height+' '+JSON.stringify(targets));
    assert.equal(await phone.locator('.career-map-track').last().isVisible(),true);
    assert.equal(await phone.evaluate(node=>node.scrollWidth<=node.clientWidth+1),
      true,'Phone cannot cause horizontal viewport overflow');
    // The alternative stays present and may use the existing guarded command.
    if(width===390){
      await phone.locator('[data-node-id="infrastructure-5"]').tap();
      if(await phone.locator('.career-map-choose').count()!==1){
        const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
        const roles=await phone.locator('.career-map-inspector-status').innerText();
        throw new Error('Q5 transfer guard unavailable in browser: '+
          JSON.stringify({level:saved.careerSystem.byResident.alex.level,
            currentShift:saved.careerSystem.byResident.alex.currentShift?.phase,
            specialization:saved.careerSystem.byResident.alex.specialization,
            workedShifts:saved.careerSystem.byResident.alex.workedShifts,roles}));
      }
      await phone.locator('.career-map-choose').tap();
      const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
      assert.equal(saved.careerSystem.byResident.alex.specialization.id,'infrastructure');
      assert.equal(saved.careerSystem.byResident.alex.level,6);
      assert.equal(saved.careerSystem.byResident.mira.level,0);
      assert.equal(saved.shop.credits,startingCredits);
      assert.equal(await phone.locator('.career-map-node[aria-current="step"]').count(),1);
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
      assert.equal((await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY))
        .careerSystem.byResident.alex.specialization.id,'infrastructure');
      await page.locator('#career-phone-toggle').tap();
    }else{
      assert.equal((await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY))
        .careerSystem.byResident.alex.specialization.id,'logistics');
    }
    await page.locator('#career-phone-panel .career-phone-x').tap();
    assert.equal(await page.locator('#career-phone-panel').isVisible(),false);
    assert.equal(errors.length,0,errors.join('\n'));
    await context.close();
    console.log('Q5 PlayCanvas/WebGL + two-branch DOM '+width+'x'+height+' PASS');
  }
}finally{await browser.close();}
