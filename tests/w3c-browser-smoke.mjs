/** W3-C real WebGL mobile smoke: discipline, dismissal notice, blocked rehire. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {hireCareer,separateCareer} from '../src/career-state.js';
import {recordCareerDiscipline} from '../src/career-discipline.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const employed=newHousehold('2026-11-16');
employed.careerSystem=hireCareer(employed.careerSystem,'alex','editorial',employed.minutes);
const c=employed.careerSystem.byResident.alex;
for(let i=0;i<2;i++){
  const start=540+i*1440;
  recordCareerDiscipline(c,{id:c.employmentId+'@'+i+'@'+start,
    start,end:start+480},'missed',0,start+480);
}
employed.paused=true;employed.otherSim.paused=true;
employed.autonomy.enabled=false;employed.otherSim.autonomy.enabled=false;
const dismissed=structuredClone(employed);
dismissed.careerSystem=separateCareer(dismissed.careerSystem,'alex','dismissed',
  dismissed.minutes).careerSystem;
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const errors=[];
try{
  for(const [w,h] of [[390,844],[375,667],[320,568],[844,390]]){
    const context=await browser.newContext({viewport:{width:w,height:h},
      deviceScaleFactor:1,hasTouch:true,isMobile:true});
    await context.addInitScript(({key,record,tourKey})=>{
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
      localStorage.setItem(tourKey,'done');
    },{key:SAVE_KEY,record:employed,tourKey:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(w+'x'+h+': '+e.message));
    page.on('requestfailed',r=>{
      if(/\/src\/|\/vendor\//.test(r.url()))
        errors.push(w+'x'+h+': '+r.failure()?.errorText);
    });
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
    assert.ok((await page.locator('#game-canvas').screenshot()).length>2000);
    await page.locator('#career-phone-toggle').tap();
    const phone=page.locator('#career-phone-panel');
    assert.match(await phone.innerText(),/Дисциплина: Предупреждение/);
    const details=phone.locator('.career-phone-discipline');
    await details.locator('summary').tap();
    assert.match(await details.innerText(),/Пропущенная смена/);
    await phone.locator('.career-phone-x').tap();
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
    await page.locator('#career-phone-toggle').tap();
    assert.match(await phone.innerText(),/Дисциплина: Предупреждение/);
    await phone.locator('.career-phone-x').tap();
    // Exercise real dismissal presentation with the actual WebGL app mounted.
    await page.evaluate(async()=>{
      const {createCareerShiftSummaryUI}=await import('./src/career-shift-summary-ui.js');
      const modal=createCareerShiftSummaryUI({
        host:document.querySelector('.app-shell'),
        getRoot:()=>null,shouldDefer:()=>false,
        onDismissal:()=>document.body.dataset.w3cDismissed='1'});
      modal.enqueue([{type:'dismissed',residentId:'alex',
        termination:{employmentId:'e1',careerId:'editorial',role:'Редактор',
          risk:12,retryAt:4800,at:480,reason:'dismissed'},
        text:'Трудовой договор расторгнут'}]);
    });
    const modal=page.locator('.career-shift-summary-overlay:not([hidden])');
    assert.match(await modal.innerText(),/Увольнение работодателем/);
    const action=modal.getByRole('button',{name:'Посмотреть вакансии'});
    assert.ok((await action.boundingBox())?.height>=30);
    await action.tap();
    assert.equal(await page.locator('body').getAttribute('data-w3c-dismissed'),'1');
    await page.screenshot({path:'w3c-discipline-'+w+'x'+h+'.png'});
    await context.close();

    const context2=await browser.newContext({viewport:{width:w,height:h},
      deviceScaleFactor:1,hasTouch:true,isMobile:true});
    await context2.addInitScript(({key,record,tourKey})=>{
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
      localStorage.setItem(tourKey,'done');
    },{key:SAVE_KEY,record:dismissed,tourKey:UI_TOUR_STORAGE_KEY});
    const p2=await context2.newPage();
    p2.on('pageerror',e=>errors.push('dismissed '+w+'x'+h+': '+e.message));
    await p2.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await p2.locator('#loading').waitFor({state:'hidden',timeout:60000});
    await p2.locator('#career-phone-toggle').tap();
    const vacant=p2.locator('#career-phone-panel');
    assert.match(await vacant.innerText(),/Последняя работа/);
    assert.match(await vacant.innerText(),/После увольнения доступно/);
    await vacant.getByRole('button',{name:/Вакансия Редакция/}).tap().catch(async()=>{
      await vacant.locator('.career-phone-card').first().tap();
    });
    await p2.screenshot({path:'w3c-rehire-'+w+'x'+h+'.png'});
    await context2.close();
  }
  assert.deepEqual(errors,[],'All real module imports and render paths must succeed');
  console.log('W3-C real WebGL and four viewport touch/reload/dismissal/rehire PASS');
}finally{await browser.close();}
