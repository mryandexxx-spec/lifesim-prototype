/** CAS-01.7 real WebGL, four-person HUD and touch iPhone smoke. */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold,loadHousehold} from '../src/household.js';
import {newGame,SAVE_KEY} from '../src/simulation.js';
import {acceptCareerOffer} from '../src/career-job-board.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const copy=x=>JSON.parse(JSON.stringify(x));
const make=(id,firstName,x,z)=>{
 const actor=newGame();actor.position={x,z};
 return {id,identity:{firstName,lastName:'Тест',lifeStage:'adult'},actor};
};
const root=newHousehold('2026-11-23');root.paused=true;root.autonomy.enabled=false;
root.population={schema:1,nextResidentSerial:5,
 residentsById:{resident_3:make('resident_3','Вера',1.2,1.2),resident_4:make('resident_4','Игорь',2.1,1.2)},
 linksByResident:{alex:{familyId:'family_1',dwellingId:'dwelling_1'},mira:{familyId:'family_1',dwellingId:'dwelling_1'},
 resident_3:{familyId:'family_2',dwellingId:'dwelling_1'},resident_4:{familyId:'family_3',dwellingId:'dwelling_1'}},kinship:[]};
const seed=loadHousehold(copy(root));
const offer=acceptCareerOffer(seed,'resident_3','editorial');
assert.equal(offer.ok,true,offer.reason);seed.careerSystem=offer.careerSystem;
const balance=seed.shop.credits;
mkdirSync('artifacts/cas-01-7',{recursive:true});
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 for(const [width,height] of [[390,844],[320,568]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block'});
  await context.addInitScript(({key,record,tour})=>{
   if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
   localStorage.setItem(tour,'done');
  },{key:SAVE_KEY,record:seed,tour:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('crash',()=>errors.push('WebGL crashed'));
  await page.goto('http://127.0.0.1:8765/?cas-01-7=qa',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
  assert.ok((await page.locator('#game-canvas').screenshot()).length>2000);
  assert.equal(await page.locator('#dashboard .resident-switch button').count(),4);
  const figures=await page.evaluate(async()=>{
   const {Application}=await import('playcanvas');
   const app=Application.getApplication();
   return ['resident_3','resident_4'].map(id=>app.root.findByName('CAS resident '+id)?.enabled);
  });
  assert.deepEqual(figures,[true,true],'both saved residents have visible scene stand-ins');
  const targets=await page.evaluate(()=>[...document.querySelectorAll('#dashboard .resident-switch button')].map(el=>{
   const b=el.getBoundingClientRect();
   return {name:el.id,width:b.width,height:b.height,inside:b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight};
  }));
  assert.ok(targets.every(x=>x.width>=43.5&&x.height>=43.5&&x.inside),
   '44px iPhone-safe selection without clipped targets: '+JSON.stringify(targets));
  // SOCIAL-QUEUE-R1: touch the real choice + two-step confirmation for
  // both original residents. The pause keeps commands in persistent FIFO.
  for(const [initiator,partner] of [['alex','mira'],['mira','alex']]){
    await page.locator('#pick-'+initiator).tap();

    // Actual 3D world hit-test, not a synthetic menu event.
    const tap=await page.evaluate(async name=>{
      const {Application,Vec3}=await import('playcanvas');
      const app=Application.getApplication();
      const avatar=app.root.findByName(name);
      const camera=app.root.findComponents('camera').find(c=>c.enabled);
      if(!avatar||!camera)throw Error('Missing real resident mesh or camera: '+name);
      const p=camera.worldToScreen(avatar.getPosition().clone().add(new Vec3(0,1.45,0)));
      return {x:Math.round(p.x),y:Math.round(p.y)};
    },partner==='mira'?'Мира':'Алекс');
    assert.ok(tap.x>=0&&tap.x<width&&tap.y>=0&&tap.y<height,
      'resident visible in canvas: '+JSON.stringify(tap));
    await page.touchscreen.tap(tap.x,tap.y);
    await page.locator('#social-context').waitFor({state:'visible',timeout:5000});
    await page.locator('#conversation-btn').tap();
    await page.locator('#social-menu-panel').waitFor({state:'visible'});
    await page.locator('#social-menu-options button').filter({hasText:'Поговорить'}).first().tap();
    const stage=await page.evaluate(()=>{
      const summary=id=>{
        const el=document.getElementById(id),r=el.getBoundingClientRect();
        const css=getComputedStyle(el);
        return {hidden:el.hidden,display:css.display,visibility:css.visibility,
          left:r.left,top:r.top,width:r.width,height:r.height,scrollTop:el.scrollTop};
      };
      const button=[...document.querySelectorAll('#social-menu-options button')]
        .find(e=>e.textContent.includes('В очередь · Поговорить'));
      return {context:summary('social-context'),menu:summary('social-menu-panel'),
        confirm:button?{parentHidden:button.closest('[hidden]')?.id||null,
          rect:button.getBoundingClientRect().toJSON()}:null};
    });
    console.log('SOCIAL-QUEUE-R1 stage '+initiator+' '+JSON.stringify(stage));
    await page.locator('#social-menu-options button').filter({hasText:'В очередь · Поговорить'}).tap();
    const live=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
    assert.ok(live.actionQueues.byResident[initiator].some(task=>
      task.type==='social'&&task.targetId===partner&&task.actionId==='talk'),
      initiator+' must enqueue social talk for '+partner+' after touch confirmation');
    assert.ok(live.actionQueues.byResident[partner].every(task=>task.targetId!==initiator),
      'social invitation cannot silently enqueue a second command for the partner');
    assert.equal(await page.locator('#social-menu-panel').isHidden(),true,
      'successful confirmation dismisses the optional social panel');
  }
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
  const persisted=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
  assert.ok(persisted.actionQueues.byResident.alex.some(t=>t.type==='social'&&t.targetId==='mira'));
  assert.ok(persisted.actionQueues.byResident.mira.some(t=>t.type==='social'&&t.targetId==='alex'));
  await page.locator('#pick-resident_3').tap();
  assert.equal(await page.locator('#resident-name').innerText(),'Вера');
  await page.locator('#cas-resident-details').waitFor({state:'visible'});
  await page.locator('#career-phone-toggle').tap();
  await page.locator('#career-phone-panel [data-phone-app="work"]').tap();
  assert.match(await page.locator('#career-phone-panel').innerText(),/Вера/);
  await page.locator('.career-phone-x').tap();
  await page.locator('#pick-resident_4').tap();
  assert.equal(await page.locator('#resident-name').innerText(),'Игорь');
  await page.screenshot({path:'artifacts/cas-01-7/four-'+width+'.png'});
  const saved=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
  assert.equal(saved.version,1);
  assert.equal(saved.selectedSim,'alex','extra HUD selection leaves legacy actor untouched');
  assert.equal(saved.population.residentsById.resident_3.identity.firstName,'Вера');
  assert.equal(saved.shop.credits,balance,'no second wallet or phantom salary');
  assert.deepEqual(errors,[],width+'x'+height+' JS errors');
  await context.close();
 }
 console.log('CAS-01.7 WebGL HUD, scene, career, touch 390x844/320x568 PASS; physical Safari QA deferred');
}finally{await browser.close();}
