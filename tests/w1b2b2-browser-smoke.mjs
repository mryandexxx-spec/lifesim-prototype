/** W1-B.2b.2 — genuine 390x844 touch PlayCanvas/WebGL interviews for new professions. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {submitCareerApplication,INTERVIEW_QUESTIONS_BY_CAREER} from '../src/career-recruitment.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const errors=[];
const read=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),SAVE_KEY);
const ready=async page=>page.locator('#loading').waitFor({state:'hidden',timeout:45000});
async function launch(seed){
  const ctx=await browser.newContext({viewport:{width:390,height:844},
    deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await ctx.addInitScript(({key,seed,tour})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));
    localStorage.setItem(tour,'done');
  },{key:SAVE_KEY,seed,tour:UI_TOUR_STORAGE_KEY});
  const page=await ctx.newPage();
  page.on('pageerror',error=>errors.push('JS '+error.stack));
  page.on('crash',()=>errors.push('CRASH'));
  page.on('requestfailed',req=>{
    if(req.url().includes('/src/')||req.url().includes('/vendor/'))
      errors.push('REQ '+req.url()+' '+req.failure()?.errorText);
  });
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await ready(page);
  return {ctx,page};
}
try{
  for(const career of ['art-studio','business-center','civic-service']){
    const seed=newHousehold('2026-11-18');
    seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
    const startingCredits=seed.shop.credits;
    assert.equal(submitCareerApplication(seed,'alex',career).ok,true);
    if(career==='art-studio')
      assert.equal(submitCareerApplication(seed,'mira','kitchen-studio').ok,true);
    seed.minutes=seed.recruitmentSystem.byResident.alex.replyDueAt-2;
    seed.otherSim.minutes=seed.minutes;
    const {ctx,page}=await launch(seed);
    await page.locator('#career-phone-toggle').tap();
    let panel=page.locator('#career-phone-panel');
    await panel.getByRole('button',{name:'Начать собеседование'}).waitFor({timeout:30000});
    await panel.getByRole('button',{name:'Начать собеседование'}).tap();
    assert.ok(await panel.getByText(/Вопрос 1 из 3/).isVisible());
    const questions=INTERVIEW_QUESTIONS_BY_CAREER[career];
    await panel.getByRole('button',{name:questions[0].answers[0].text}).tap();
    let saved=await read(page);
    assert.deepEqual(saved.recruitmentSystem.byResident.alex.interview.answers,[questions[0].answers[0].id]);
    if(career==='art-studio'){
      await page.screenshot({path:'w1b2b2-art-iphone.png'});
      await page.reload({waitUntil:'domcontentloaded'});
      await ready(page);
      await page.locator('#career-phone-toggle').tap();
      panel=page.locator('#career-phone-panel');
    }
    assert.ok(await panel.getByText(/Вопрос 2 из 3/).isVisible());
    await panel.getByRole('button',{name:questions[1].answers[0].text}).tap();
    assert.ok(await panel.getByText(/Вопрос 3 из 3/).isVisible());
    await panel.getByRole('button',{name:questions[2].answers[0].text}).tap();
    assert.ok(await panel.getByText(/Собеседование окончено/).isVisible());
    saved=await read(page);
    assert.equal(saved.recruitmentSystem.byResident.alex.phase,'waiting_decision');
    assert.equal(saved.recruitmentSystem.byResident.alex.interview.answers.length,3);
    assert.equal(saved.careerSystem.byResident.alex,null);
    await panel.locator('.career-phone-x').tap();
    await page.locator('#speed-btn').tap();
    await page.waitForFunction(key=>{
      const s=JSON.parse(localStorage.getItem(key)||'null');
      return ['offer_ready','rejected'].includes(s?.recruitmentSystem?.byResident?.alex?.phase);
    },SAVE_KEY,{timeout:120000});
    await page.locator('#career-phone-toggle').tap();
    panel=page.locator('#career-phone-panel');
    assert.ok(await panel.getByText(/Ответы:/).isVisible());
    assert.ok(await panel.getByText(/Настроение на собеседовании/).isVisible());
    assert.ok(await panel.getByText(/характера|подход|самообладание|практичность/i).count()>0);
    const status=(await read(page)).recruitmentSystem.byResident.alex.phase;
    if(status==='offer_ready'){
      await panel.getByRole('button',{name:'Подписать договор'}).tap();
      assert.equal((await read(page)).careerSystem.byResident.alex.careerId,career);
    }else{
      await panel.getByRole('button',{name:'Вернуться к поиску'}).tap();
      assert.equal((await read(page)).careerSystem.byResident.alex,null);
    }
    await panel.locator('.career-phone-x').tap();
    if(career==='art-studio'){
      await page.locator('#pick-mira').tap();
      await page.locator('#career-phone-toggle').tap();
      const mira=page.locator('#career-phone-panel');
      assert.ok(await mira.getByText(/Кулинарная мастерская/).isVisible());
      assert.ok(await mira.getByText(/навык кулинарии/).isVisible());
      await mira.getByRole('button',{name:'Подписать договор'}).tap();
      assert.equal((await read(page)).careerSystem.byResident.mira.careerId,'kitchen-studio');
      await page.screenshot({path:'w1b2b2-kitchen-iphone.png'});
    }else{
      await page.screenshot({path:'w1b2b2-'+career+'-iphone.png'});
    }
    const settled=await read(page);
    assert.equal(settled.shop.credits,startingCredits,'Hiring must not pay salary');
    await page.reload({waitUntil:'domcontentloaded'});
    await ready(page);
    const reloaded=await read(page);
    assert.equal(reloaded.shop.credits,startingCredits);
    assert.equal(reloaded.careerSystem.byResident.alex?.careerId,
      settled.careerSystem.byResident.alex?.careerId);
    assert.equal(reloaded.recruitmentSystem.byResident.alex?.phase,
      settled.recruitmentSystem.byResident.alex?.phase);
    await ctx.close();
    console.log('W1-B.2b.2 390x844 PlayCanvas/WebGL '+career+': 3 touch answers, result, reload, no wages PASS');
  }
  assert.deepEqual(errors,[]);
  console.log('W1-B.2b.2 touch browser: all three new interviews, resumed art, independent Mira kitchen PASS');
}finally{await browser.close();}
