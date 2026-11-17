/** W1-B.2a real Chromium PlayCanvas/WebGL at 390×844: resident job phone. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const seed=newHousehold('2026-11-17');
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const errors=[];
try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,
    hasTouch:true,isMobile:true});
  await context.addInitScript(({key,record,tourKey})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
    localStorage.setItem(tourKey,'done');
  },{key:SAVE_KEY,record:seed,tourKey:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push('PAGE '+e.stack));
  page.on('crash',()=>errors.push('CRASH'));
  page.on('requestfailed',r=>{
    if(r.url().includes('/src/')||r.url().includes('/vendor/'))
      errors.push('REQUEST '+r.url()+' '+r.failure()?.errorText);
  });
  const boot=async()=>{
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    try{await page.locator('#loading').waitFor({state:'hidden',timeout:30000});}
    catch(error){
      console.error('W1-B.2a boot did not finish; loading text:',
        await page.locator('#loading').innerText());
      console.error('W1-B.2a page/request errors:',JSON.stringify(errors));
      console.error('W1-B.2a DOM state:',await page.evaluate(()=>({
        title:document.title,
        loadingHidden:document.querySelector('#loading')?.hidden,
        html:document.querySelector('#loading')?.outerHTML.slice(0,1200),
        smartphone:!!document.querySelector('#career-phone-panel'),
        canvas:!!document.querySelector('#game-canvas')
      })));
      throw error;
    }
  };
  const state=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),SAVE_KEY);
  await boot();
  await page.locator('#pause-btn').click();
  const initial=await state();
  assert.equal(initial.careerSystem.byResident.alex,null);
  assert.equal(initial.careerSystem.byResident.mira,null);
  await page.locator('#career-phone-toggle').click();
  const phone=page.locator('#career-phone-panel');
  assert.ok(await phone.isVisible());
  assert.equal(await phone.getAttribute('aria-label'),'Смартфон: работа Блин’С');
  assert.equal(await phone.getByRole('button',{name:/^Вакансия /}).count(),6);
  await phone.getByRole('button',{name:/Вакансия Арт-студия/}).click();
  assert.ok(await phone.getByText('Ассистент галереи').isVisible());
  assert.ok(await phone.getByText(/Первая смена:/).isVisible());
  assert.equal((await state()).careerSystem.byResident.alex,null,'Preview never hires');
  await phone.getByRole('button',{name:'Получить предложение'}).click();
  assert.equal((await state()).careerSystem.byResident.alex,null,'Offer page never hires');
  await phone.getByRole('button',{name:'Подписать договор'}).click();
  const hired=await state();
  assert.equal(hired.careerSystem.byResident.alex.careerId,'art-studio');
  assert.equal(hired.careerSystem.byResident.mira,null);
  assert.equal(hired.shop.credits,initial.shop.credits,'No artificial wages');
  assert.ok(await phone.getByText(/Следующая смена:/).isVisible());
  await page.screenshot({path:'w1b2a-phone-smoke.png'});
  await phone.locator('.career-phone-x').click();
  assert.equal(await phone.isVisible(),false);
  await page.locator('#pick-mira').click();
  await page.locator('#career-phone-toggle').click();
  assert.equal(await phone.getByRole('button',{name:/^Вакансия /}).count(),6);
  await phone.getByRole('button',{name:/Вакансия Общественная служба/}).click();
  assert.ok(await phone.getByText('Часы: 20:00–04:00').isVisible());
  await phone.getByRole('button',{name:'Получить предложение'}).click();
  await phone.getByRole('button',{name:'Подписать договор'}).click();
  const dual=await state();
  assert.equal(dual.careerSystem.byResident.mira.careerId,'civic-service');
  assert.equal(dual.careerSystem.byResident.alex.careerId,'art-studio');
  assert.notEqual(dual.careerSystem.byResident.alex.employmentId,
    dual.careerSystem.byResident.mira.employmentId);
  assert.equal(dual.shop.credits,initial.shop.credits);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:30000});
  await page.locator('#career-phone-toggle').click();
  assert.ok(await page.locator('#career-phone-panel').getByText(/Результативность:/).isVisible());
  const restored=await state();
  assert.equal(restored.careerSystem.byResident.alex.careerId,'art-studio');
  assert.equal(restored.careerSystem.byResident.mira.careerId,'civic-service');
  assert.equal(restored.shop.credits,initial.shop.credits);
  await page.locator('#career-phone-panel .career-phone-x').click();
  await page.locator('#calendar-anchor-toggle').click();
  assert.ok(await page.locator('#lc-agenda').getByText(/Работа: Арт-студия/).isVisible(),
    'The existing game calendar shows the genuine accepted career shift');
  await page.locator('#lc-close').click();
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('W1-B.2a Chromium WebGL 390x844: job phone, 6 vacancies, explicit contract, Mira, reload, no wages passed');
}finally{await browser.close();}
