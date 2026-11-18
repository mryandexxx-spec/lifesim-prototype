/** W1-B.2b.3: 390x844 real PlayCanvas/WebGL, touch tabs/history and Safari reload. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {submitCareerApplication,startCareerInterview,answerCareerInterview,
  progressCareerRecruitment,finishRecruitmentApplication,INTERVIEW_QUESTIONS_BY_CAREER}
  from '../src/career-recruitment.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
function advance(root,to){
  const before=root.minutes;root.minutes=to;root.otherSim.minutes=to;
  progressCareerRecruitment(root,before,to);
}
function rejectedSeed(){
  for(let seed=1;seed<120;seed++){
    const root=newHousehold('2026-11-18');
    root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
    root.recruitmentSystem.nextApplicationId=seed;
    assert.equal(submitCareerApplication(root,'alex','editorial').ok,true);
    const app=root.recruitmentSystem.byResident.alex;
    advance(root,app.replyDueAt);
    startCareerInterview(root,'alex');
    for(const q of INTERVIEW_QUESTIONS_BY_CAREER.editorial)
      answerCareerInterview(root,'alex',q.answers[2].id);
    advance(root,app.decisionDueAt);
    if(app.phase==='rejected'){
      finishRecruitmentApplication(root,'alex','dismiss');
      assert.equal(submitCareerApplication(root,'mira','kitchen-studio').ok,true);
      advance(root,root.recruitmentSystem.byResident.mira.replyDueAt);
      return root;
    }
  }
  throw new Error('No rejection seed');
}
const seed=rejectedSeed(),errors=[];
const money=seed.shop.credits;
const context=await browser.newContext({viewport:{width:390,height:844},
  deviceScaleFactor:1,isMobile:true,hasTouch:true});
await context.addInitScript(({key,root,tour})=>{
  if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(root));
  localStorage.setItem(tour,'done');
},{key:SAVE_KEY,root:seed,tour:UI_TOUR_STORAGE_KEY});
const page=await context.newPage();
page.on('pageerror',err=>errors.push('JS '+err.stack));
page.on('crash',()=>errors.push('CRASH'));
page.on('requestfailed',req=>{
  if(req.url().includes('/src/')||req.url().includes('/vendor/'))
    errors.push('REQ '+req.url()+' '+req.failure()?.errorText);
});
const saved=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),SAVE_KEY);
const ready=()=>page.locator('#loading').waitFor({state:'hidden',timeout:45000});
try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await ready();
  await page.locator('#career-phone-toggle').tap();
  const phone=page.locator('#career-phone-panel');
  assert.equal(await phone.getByRole('button',{name:'Вакансии',exact:true}).count(),1);
  assert.equal(await phone.getByRole('button',{name:'История',exact:true}).count(),1);
  assert.ok(await phone.getByText(/Повторный отклик:/).count()>0);
  await phone.getByRole('button',{name:'История',exact:true}).tap();
  await phone.getByRole('button',{name:/История Редакция/}).tap();
  assert.ok(await phone.getByText(/Отказ работодателя/).isVisible());
  assert.ok(await phone.getByText('Профессия: Стажёр редакции').count()>0);
  assert.ok(await phone.getByText(/Решения на собеседовании/).isVisible());
  assert.equal(await phone.getByText(/Ваш ответ:/).count(),3);
  assert.ok(await phone.getByText(/Следующая попытка:/).isVisible());
  // A real touch drag should scroll only the inner panel, not zoom the page.
  const body=phone.locator('.career-phone-body');
  const session=await context.newCDPSession(page);
  const rect=await body.boundingBox();
  const x=Math.round(rect.x+rect.width/2),y=Math.round(rect.y+rect.height-50);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=6;i++){
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*38}]});
    await page.waitForTimeout(35);
  }
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok(await body.evaluate(el=>el.scrollTop)>0,'History touch scroll');
  await page.screenshot({path:'w1b2b3-history-iphone.png'});
  await phone.locator('.career-phone-x').tap();
  await page.locator('#career-phone-toggle').tap();
  assert.ok(await phone.getByText(/Решения на собеседовании/).isVisible(),
    'Same resident phone context survives close/open');
  await phone.getByRole('button',{name:'Вакансии',exact:true}).tap();
  // Two actual taps must not cause Safari-sized viewport zoom.
  await page.touchscreen.tap(180,250);
  await page.touchscreen.tap(180,250);
  const scale=await page.evaluate(()=>visualViewport?.scale??1);
  assert.equal(scale,1);
  await phone.locator('.career-phone-x').tap();
  await page.reload({waitUntil:'domcontentloaded'});
  await ready();
  await page.locator('#career-phone-toggle').tap();
  await phone.getByRole('button',{name:'История',exact:true}).tap();
  await phone.getByRole('button',{name:/История Редакция/}).tap();
  assert.equal(await phone.getByText(/Ваш ответ:/).count(),3);
  await page.screenshot({path:'w1b2b3-history-reloaded-iphone.png'});
  await phone.locator('.career-phone-x').tap();
  await page.locator('#pick-mira').tap();
  await page.locator('#career-phone-toggle').tap();
  assert.ok(await phone.getByText('Предложение работы получено!').isVisible());
  await phone.getByRole('button',{name:'Подписать договор'}).tap();
  assert.equal((await saved()).careerSystem.byResident.mira.careerId,'kitchen-studio');
  await phone.getByRole('button',{name:'История',exact:true}).tap();
  assert.ok(await phone.getByRole('button',{name:/История Кулинарная мастерская/}).isVisible());
  assert.equal((await saved()).shop.credits,money,'No free payroll on hiring');
  assert.deepEqual(errors,[]);
  console.log('W1-B.2b.3 real 390x844 PlayCanvas/WebGL touch tabs, inner scroll, reload, retry labels, dual resident history PASS');
}finally{
  await context.close();await browser.close();
}
