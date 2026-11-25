/** CAS-01.7 real WebGL, four-person HUD and touch iPhone smoke. */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold,loadHousehold,getActor} from '../src/household.js';
import {startConversation,arriveSocial} from '../src/relationships.js';
import {isWalkable,isClearLine} from '../src/navigation.js';
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
  // loadGame intentionally resumes (paused is not persisted), even if the
  // serialized seed was paused. Pause the ACTUAL running browser before
  // enqueueing; otherwise the dispatcher can consume the first invitation.
  await page.locator('#pause-btn').tap();
  assert.equal(await page.locator('#pause-btn').getAttribute('aria-label'),'Продолжить');
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
    const partnerPendingBefore=JSON.parse(
      await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY)
    ).actionQueues.byResident[partner].length;

    if(initiator==='alex'&&width===390){
      // Actual 3D world hit-test, not a synthetic menu event. Allow the
      // animated focus camera to settle before choosing a projected upper body.
      await page.waitForTimeout(850);
      let sceneTap=null;
      const sceneProbes=[];
      for(const heightY of [1.45,1.85,1.0]){
        const tap=await page.evaluate(async ({name,heightY})=>{
          const {Application,Vec3}=await import('playcanvas');
          const app=Application.getApplication();
          const avatar=app.root.findByName(name);
          const camera=app.root.findComponents('camera').find(c=>c.enabled);
          if(!avatar||!camera)throw Error('Missing resident mesh/camera: '+name);
          const p=camera.worldToScreen(avatar.getPosition().clone().add(new Vec3(0,heightY,0)));
          return {x:Math.round(p.x),y:Math.round(p.y)};
        },{name:partner==='mira'?'Мира':'Алекс',heightY});
        if(tap.x<0||tap.x>=width||tap.y<0||tap.y>=height)continue;
        await page.touchscreen.tap(tap.x,tap.y);
        sceneTap={...tap,heightY};
        const point=await page.evaluate(({x,y})=>{
          const element=document.elementFromPoint(x,y);
          const c=document.querySelector('#game-canvas').getBoundingClientRect();
          return {topTag:element?.tagName,topId:element?.id,
            topClass:typeof element?.className==='string'?element.className.slice(0,80):'',
            canvasRect:{x:c.x,y:c.y,width:c.width,height:c.height},
            socialVisible:!document.getElementById('social-context').hidden,
            selectedResident:document.querySelector('#dashboard .resident-switch button[aria-pressed="true"]')?.id};
        },tap);
        sceneProbes.push({...sceneTap,...point});
        if(await page.locator('#social-context').isVisible())break;
      }
      if(!await page.locator('#social-context').isVisible()){
        await page.screenshot({path:'artifacts/cas-01-7/scene-tap-failure-'+width+'.png'});
        console.error('QSK-01 real 3D touch diagnostics:',JSON.stringify(sceneProbes));
      }
      assert.equal(await page.locator('#social-context').isVisible(),true,
        '3D touch must open resident context for '+initiator+' -> '+partner+
        ' viewport '+width+'x'+height+' probes '+JSON.stringify(sceneProbes));
      await page.locator('#conversation-btn').tap();
    }else{
      // The compact 320px camera can place a resident under room geometry
      // or the HUD. Exercise touch confirmation/FIFO for both directions at
      // 320px; the 390px case also exercises the true scene hit-test.
      await page.evaluate(()=>document.getElementById('conversation-btn').click());
    }
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
    assert.equal(stage.menu.hidden,false,
      initiator+' social options must remain open after choosing Talk: '+JSON.stringify(stage));
    assert.equal(stage.confirm?.parentHidden??null,null,
      'two-step confirmation must be reachable after actual 3D+touch navigation');
    // Touch inside the modal must not be mistaken for a document outside-click.
    await page.locator('#social-menu-title').tap();
    assert.equal(await page.locator('#social-menu-panel').isVisible(),true,
      'touching inside the social modal must not dismiss confirmation');
    const actorPendingBefore=JSON.parse(
      await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY)
    ).actionQueues.byResident[initiator].length;
    await page.locator('#social-menu-options button').filter({hasText:'В очередь · Поговорить'}).tap();
    const live=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
    assert.ok(live.actionQueues.byResident[initiator].some(task=>
      task.type==='social'&&task.targetId===partner&&task.actionId==='talk'),
      initiator+' must enqueue social talk for '+partner+' after touch confirmation');
    assert.equal(live.actionQueues.byResident[initiator].length,actorPendingBefore+1,
      'one confirmed tap creates exactly one action, without double enqueue');
    assert.equal(live.actionQueues.byResident[partner].length,partnerPendingBefore,
      'social invitation must not add an extra task to the partner queue');
    assert.equal(await page.locator('#social-menu-panel').isHidden(),true,
      'successful confirmation dismisses the optional social panel');
  }
  // Schema-v1 round-trip. A full page reload deliberately does NOT persist
  // manual pause (loadGame resumes simulation), so queued talks could start
  // while WebGL boots; validate persistence before advancing game time.
  const persisted=loadHousehold(copy(JSON.parse(
    await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY))));
  assert.ok(persisted.actionQueues.byResident.alex.some(t=>t.type==='social'&&t.targetId==='mira'));
  assert.ok(persisted.actionQueues.byResident.mira.some(t=>t.type==='social'&&t.targetId==='alex'));
  // Restore the original CAS-01.7 baseline actor for the extra-resident HUD checks.
  await page.locator('#pick-alex').tap();
  await page.locator('#pick-resident_3').tap();
  assert.equal(await page.locator('#resident-name').innerText(),'Вера');
  await page.locator('#cas-resident-details').waitFor({state:'visible'});
  // PF-01: actual four-person HUD at 320/390, selected resident's full schedule.
  const careerLine=page.locator('#career-work-hud');
  await careerLine.waitFor({state:'visible'});
  assert.match(await careerLine.innerText(),/\d{2}:\d{2}–\d{2}:\d{2}/);
  const assertCareerFits=async()=>{
    const fit=await careerLine.evaluate(el=>{
      const r=el.getBoundingClientRect(),hud=el.parentElement.getBoundingClientRect();
      return {direct:el.parentElement.id==='dashboard',fits:r.left>=hud.left&&r.right<=hud.right&&r.top>=hud.top&&r.bottom<=hud.bottom,
        width:r.width,scroll:el.scrollWidth,client:el.clientWidth,scrollH:el.scrollHeight,clientH:el.clientHeight};
    });
    assert.ok(fit.direct&&fit.fits&&fit.width>width*.8&&fit.scroll<=fit.client+1&&fit.scrollH<=fit.clientH+1,JSON.stringify(fit));
  };
  await assertCareerFits();
  const priorCollapsed=await page.locator('#dashboard').getAttribute('data-collapsed');
  await page.locator('#hud-toggle').tap();await assertCareerFits();
  await page.locator('#hud-toggle').tap();
  assert.equal(await page.locator('#dashboard').getAttribute('data-collapsed'),priorCollapsed);
  await page.locator('#career-phone-toggle').tap();
  await page.locator('#career-phone-panel [data-phone-app="work"]').tap();
  assert.match(await page.locator('#career-phone-panel').innerText(),/Вера/);
  await page.locator('.career-phone-x').tap();
  await page.locator('#pick-resident_4').tap();
  assert.equal(await page.locator('#resident-name').innerText(),'Игорь');
  assert.equal(await page.locator('#career-work-hud').isVisible(),false,'no schedule from previous selected resident');
  await page.screenshot({path:'artifacts/cas-01-7/four-'+width+'.png'});
  const saved=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
  assert.equal(saved.version,1);
  assert.equal(saved.selectedSim,'alex','extra HUD selection leaves legacy actor untouched');
  assert.equal(saved.population.residentsById.resident_3.identity.firstName,'Вера');
  assert.equal(saved.shop.credits,balance,'no second wallet or phantom salary');
  // A real browser reload must preserve v1 population and wallet even if
  // pending social heads begin executing as loadGame resumes the simulation.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
  assert.equal(await page.locator('#dashboard .resident-switch button').count(),4);
  const afterReload=JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
  assert.equal(afterReload.version,1);
  assert.equal(afterReload.shop.credits,balance);
  assert.equal(afterReload.population.residentsById.resident_3.identity.firstName,'Вера');
  assert.equal(afterReload.population.residentsById.resident_4.identity.firstName,'Игорь');
  assert.ok(afterReload.actionQueues.nextSeq>=saved.actionQueues.nextSeq,
    'reload cannot roll back personal FIFO sequence counter');
  assert.deepEqual(errors,[],width+'x'+height+' JS errors');
  await context.close();
 }

 // PF-10/A: real required-choice UI, not a fake DOM, at both iPhone sizes.
 for(const [width,height] of [[390,844],[320,568]])for(const extra of [false,true]){
  const state=loadHousehold(copy(root));state.autonomy.enabled=false;
  const a=extra?'resident_3':'alex',b=extra?'resident_4':'mira';
  const first=getActor(state,a),second=getActor(state,b);
  first.skills.xpById.charisma=485;second.skills.xpById.charisma=1360;
  let placed=false;
  for(let x=-4;x<=3&&!placed;x+=.5)for(let z=-3;z<=3&&!placed;z+=.5){
   const p={x,z},q={x:x+1.05,z};
   if(!isWalkable(p.x,p.z,state.world)||!isWalkable(q.x,q.z,state.world)||!isClearLine(p,q,state.world))continue;
   if(['alex','mira','resident_3','resident_4'].filter(id=>id!==a&&id!==b).some(id=>
    [p,q].some(point=>Math.hypot(point.x-getActor(state,id).position.x,point.z-getActor(state,id).position.z)<1.2)))continue;
   first.position=p;second.position=q;placed=true;
  }
  assert.ok(placed,'physical conversation location');
  if(!extra){assert.ok(startConversation(state,a,first.position,'daily'));assert.ok(arriveSocial(state));}
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block'});
  await context.addInitScript(({key,record,tour})=>{
   if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
   localStorage.setItem(tour,'done');
  },{key:SAVE_KEY,record:state,tour:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('WebGL crashed'));
  await page.goto('http://127.0.0.1:8765/?pf-10a=qa',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
  const stored=async()=>JSON.parse(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY));
  if(extra){
   await page.locator('#pick-resident_3').tap();
   const details=page.locator('#cas-resident-details');
   await details.waitFor({state:'visible'});
   await details.locator('select[aria-label="Собеседник"]').selectOption('resident_4');
   await details.locator('select[aria-label="Тема беседы"]').selectOption('daily');
   await details.getByRole('button',{name:'В очередь · беседа',exact:true}).tap();
  }
  const panel=page.locator('#conversation-panel');
  await panel.waitFor({state:'visible',timeout:30000});
  assert.equal(await panel.getAttribute('aria-modal'),'true');
  assert.match(await page.locator('#conversation-subtitle').innerText(),extra?/Вера.*Игорь/:/Алекс.*Мира/);
  const choices=page.locator('#conversation-options');
  const locked=choices.getByRole('button',{name:/Вдохновить на перемены.*Харизма 9/});
  assert.equal(await locked.isDisabled(),true);
  const permitted=choices.getByRole('button',{name:'Помочь взглянуть иначе',exact:true});
  assert.equal(await permitted.isEnabled(),true);
  await page.screenshot({path:'artifacts/cas-01-7/pf-10a-'+(extra?'extra':'legacy')+'-'+width+'.png'});
  await permitted.tap();
  let saved=await stored();
  const action=()=>saved.socialAction||saved.additionalSocial;
  assert.equal(action().conversation.turns[0].id,'daily.reframe');
  assert.equal(action().conversation.turns.length,1);
  const minute=saved.minutes,seq=saved.socialGraph.nextSeq;
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
  await panel.waitFor({state:'visible',timeout:30000});
  assert.match(await page.locator('#conversation-lines').innerText(),/Что из сегодняшнего дня/);
  await choices.getByRole('button',{name:'Продолжить беседу',exact:true}).tap();
  saved=await stored();
  assert.equal(saved.minutes,minute,'mandatory choice freezes simulation over reload');
  await choices.getByRole('button',{name:'Завершить разговор',exact:true}).tap();
  saved=await stored();
  assert.equal(saved.socialAction,null);
  assert.equal(saved.additionalSocial,null);
  assert.equal(saved.socialGraph.nextSeq,seq+1);
  assert.equal(saved.version,1);
  assert.deepEqual(errors,[],width+'x'+height+' '+a+' JS errors');
  await context.close();
 }
 console.log('PF-10/A real mobile legacy + addressed topic picker, locked choices, reply, clock, v1 reload, exactly-one receipt PASS');
 console.log('CAS-01.7 WebGL HUD, scene, career, touch 390x844/320x568 PASS; physical Safari QA deferred');
}finally{await browser.close();}
