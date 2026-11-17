/** W1-B.2b.1: real 390x844 PlayCanvas/WebGL smartphone recruitment browser regression. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {submitCareerApplication} from '../src/career-recruitment.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const errors=[];
const launch=async seed=>{
  const ctx=await browser.newContext({viewport:{width:390,height:844},
    deviceScaleFactor:1,hasTouch:true,isMobile:true});
  await ctx.addInitScript(({key,value,tour})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(value));
    localStorage.setItem(tour,'done');
  },{key:SAVE_KEY,value:seed,tour:UI_TOUR_STORAGE_KEY});
  const page=await ctx.newPage();
  page.on('pageerror',err=>errors.push('JS '+err.stack));
  page.on('crash',()=>errors.push('CRASH'));
  page.on('requestfailed',req=>{
    if(req.url().includes('/src/')||req.url().includes('/vendor/'))
      errors.push('REQ '+req.url()+' '+req.failure()?.errorText);
  });
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:45000});
  return {ctx,page};
};
const read=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),SAVE_KEY);
try{
  // Real touch: vacancy, send actual application; no immediate contract.
  const fresh=newHousehold('2026-11-18');
  fresh.autonomy.enabled=false;fresh.otherSim.autonomy.enabled=false;
  const first=await launch(fresh),screen=first.page;
  await screen.locator('#pause-btn').click();
  await screen.locator('#career-phone-toggle').click();
  const phone=screen.locator('#career-phone-panel');
  await phone.getByRole('button',{name:/Вакансия Редакция/}).click();
  assert.equal(await phone.getByRole('button',{name:'Получить предложение'}).count(),0);
  await phone.getByRole('button',{name:'Отправить отклик'}).click();
  let saved=await read(screen);
  assert.equal(saved.recruitmentSystem.byResident.alex.phase,'waiting_reply');
  assert.equal(saved.careerSystem.byResident.alex,null);
  assert.ok(await phone.getByText(/Резюме отправлено/).isVisible());
  await screen.screenshot({path:'w1b2b1-application-iphone.png'});
  await first.ctx.close();

  // Seed a realistic in-flight wait shortly before the answer, not a fake offer.
  const seed=newHousehold('2026-11-18');
  seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
  assert.equal(submitCareerApplication(seed,'alex','editorial').ok,true);
  assert.equal(submitCareerApplication(seed,'mira','city-services').ok,true);
  seed.minutes=seed.recruitmentSystem.byResident.alex.replyDueAt-2;
  seed.otherSim.minutes=seed.minutes;
  const second=await launch(seed),page=second.page;
  await page.locator('#career-phone-toggle').click();
  const panel=page.locator('#career-phone-panel');
  await panel.getByRole('button',{name:'Начать собеседование'}).waitFor({timeout:20000});
  await panel.getByRole('button',{name:'Начать собеседование'}).click();
  assert.ok(await panel.getByText(/Вопрос 1 из 3/).isVisible());
  await panel.getByRole('button',{name:/Сверю цитату/}).click();
  assert.equal((await read(page)).recruitmentSystem.byResident.alex.interview.answers.length,1);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:45000});
  await page.locator('#career-phone-toggle').click();
  const interview=page.locator('#career-phone-panel');
  assert.ok(await interview.getByText(/Вопрос 2 из 3/).isVisible());
  await interview.getByRole('button',{name:/Изучу несколько источников/}).click();
  await interview.getByRole('button',{name:/Поблагодарю и исправлю/}).click();
  assert.ok(await interview.getByText(/Собеседование окончено/).isVisible());
  saved=await read(page);
  assert.equal(saved.recruitmentSystem.byResident.alex.phase,'waiting_decision');
  assert.equal(saved.recruitmentSystem.byResident.alex.interview.answers.length,3);
  const startingCredits=saved.shop.credits;
  await interview.locator('.career-phone-x').click();
  await page.locator('#speed-btn').click();
  await page.waitForFunction(key=>{
    const s=JSON.parse(localStorage.getItem(key)||'null');
    return ['rejected','offer_ready'].includes(s?.recruitmentSystem?.byResident?.alex?.phase);
  },SAVE_KEY,{timeout:120000});
  await page.locator('#career-phone-toggle').click();
  const result=page.locator('#career-phone-panel');
  assert.ok(await result.getByText(/Литературная эрудиция: уровень/).isVisible());
  const outcome=(await read(page)).recruitmentSystem.byResident.alex.phase;
  if(outcome==='offer_ready'){
    await result.getByRole('button',{name:'Подписать договор'}).click();
    assert.equal((await read(page)).careerSystem.byResident.alex.careerId,'editorial');
  }else{
    await result.getByRole('button',{name:'Вернуться к поиску'}).click();
    assert.equal((await read(page)).careerSystem.byResident.alex,null);
  }
  assert.equal((await read(page)).shop.credits,startingCredits);
  await result.locator('.career-phone-x').click();
  await page.locator('#pick-mira').click();
  await page.locator('#career-phone-toggle').click();
  const miraPhone=page.locator('#career-phone-panel');
  assert.ok(await miraPhone.getByText('Предложение работы получено!').isVisible());
  await miraPhone.getByRole('button',{name:'Подписать договор'}).click();
  const after=await read(page);
  assert.equal(after.careerSystem.byResident.mira.careerId,'city-services');
  assert.equal(after.recruitmentSystem.byResident.mira,null);
  assert.equal(after.shop.credits,startingCredits);
  await page.screenshot({path:'w1b2b1-interview-iphone.png'});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:45000});
  const reloaded=await read(page);
  assert.equal(reloaded.careerSystem.byResident.mira.employmentId,
    after.careerSystem.byResident.mira.employmentId);
  assert.equal(reloaded.recruitmentSystem.byResident.mira,null);
  assert.equal(reloaded.shop.credits,startingCredits);
  assert.equal(errors.length,0,errors.join('\n'));
  await second.ctx.close();
  console.log('W1-B.2b.1 390x844 PlayCanvas/WebGL: apply, delayed replies, 3 decisions, mid-interview reload, offer/decline, Mira contract, no wages: PASS');
}finally{await browser.close();}
