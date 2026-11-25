/** W1-B.2a — accessible touch-first in-game smartphone and authentic job feed.
 * It is presentation only: game state changes solely through explicit contract actions.
 */
import {careerVacancies,leaveCareer,describeCareerShift} from './career-job-board.js';
import {disciplineStatus} from './career-discipline.js';
import {careerDefinition} from './career-catalog.js';
import {nextCareerShift} from './career-scheduler.js';
import {calendarAt} from './calendar-core.js';
import {careerScheduleAtDay} from './career-rank-schedules.js';
import {promotionReadiness,promoteCareer} from './career-progression.js';
import {professionalGoalsView} from './career-goals.js';
import {careerRankForContract,specializationReadiness,chooseCareerSpecialization} from './career-specializations.js';
import {seniorTrack} from './career-seniority.js';
import {renderCareerMap} from './career-map-ui.js';
import {phoneWorkLanding} from './ux06-phone-state.js';
import {residentWorkStatus,requestCareerDeparture,skipCareerShift,clockAt,selectCareerWorkMode} from './career-work.js';
import {WORK_MODES,WORK_MODE_IDS,cleanWorkMode,workNeedsReport} from './career-work-needs.js';

import {createFinancePhoneUI} from './finance-phone-ui.js';
import {markNotificationsRead,unreadNotifications,notificationIncidentCurrent} from './notification-history.js';
import {PHONE_APPS,phoneAppRoute} from './phone-app-registry.js';
import {sportsPhoneView} from './sports-phone-model.js';
import {paintSportsTv} from './sports-tv.js';
import {sportsCrest} from './sports-identity.js';
import {phoneContactStatus,CALL_DURATION,CALL_COOLDOWN} from './phone-calls.js';
import {READY_MEAL_IDS,readyMeal} from './ready-meal-catalog.js';
import {quoteReadyMeal} from './ready-food.js';
import {KITCHEN_RESTOCK_LABELS,quotePantryDelivery} from './kitchen-market.js';
import {homeMarketListing,quoteHomeDelivery} from './marketplace-home.js';
import {upcomingCareerTimeOff,bookCareerTimeOff,cancelCareerTimeOff,
  claimPortableCareerLeave} from './career-timeoff.js';
import {payHouseholdBill} from './household-bills.js';
import {workScenario,decideWorkIncident,workIncidentChoiceDescription,pendingWorkIncident,workStoryFollowUp} from './career-incidents.js';
import {jobSatisfaction,workLoadLabel,workLifeConflict} from './career-worklife.js';
import {resolveWorkLifeConflict} from './career-worklife-conflict.js';
import {MEMORY_TEXT} from './psychology.js';
import {residentIdsForSimulation} from './resident-activity-runtime.js';
import {RECRUITMENT_CAREERS,INTERVIEW_QUESTIONS_BY_CAREER,CAREER_SKILL_LABELS,submitCareerApplication,
  startCareerInterview,answerCareerInterview,markRecruitmentRead,
  finishRecruitmentApplication,interviewScore,recruitmentRetry} from './career-recruitment.js';

const LEGACY_NAMES={alex:'Алекс',mira:'Мира'};
function element(tag,className,text){
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(text!==undefined)el.textContent=text;
  return el;
}
function action(label,callback,kind=''){
  const el=element('button','career-phone-action '+kind,label);
  el.type='button';el.addEventListener('click',callback);
  return el;
}
export function createCareerPhoneUI({host,trigger,financeTrigger=null,getRoot,setCareerSystem,
  save,notify,onFundsChanged=()=>{},onOpenChange=()=>{},onIncidentChanged=()=>{},
   onBuyReadyMeal=()=>({ok:false,reason:'unavailable'}),
  onBuyPantryDelivery=()=>({ok:false,reason:'unavailable'}),
  onBuyHomeDelivery=()=>({ok:false,reason:'unavailable'}),
  onStartCall=()=>({ok:false,reason:'unavailable'}),
  onCancelCall=()=>({ok:false,reason:'unavailable'}),
  onSelectSportsClub=()=>({ok:false,reason:'unavailable'}),
  onReadSportsNews=()=>({ok:false,reason:'unavailable'}),
  onWatchSportsMatch=()=>({ok:false,reason:'unavailable'}),
  onInviteSportsMatch=()=>({ok:false,reason:'unavailable'}),
  selectResident=()=>false,getSelectedResident=root=>root?.selectedSim,
  beforeOpen=()=>{},canOpen=()=>true}){
  const NAMES=new Proxy(LEGACY_NAMES,{get(names,id){
    if(typeof id!=='string')return undefined;
    if(Object.hasOwn(names,id))return names[id];
    const root=getRoot();
    if(!residentIdsForSimulation(root).includes(id))return undefined;
    return root.population?.residentsById?.[id]?.identity?.firstName||undefined;
  }});
  const overlay=element('section','career-phone-overlay');
  overlay.id='career-phone-panel';overlay.hidden=true;
  overlay.setAttribute('aria-label','Смартфон: работа Блин’С');
  const shade=element('button','career-phone-shade');
  shade.type='button';shade.setAttribute('aria-label','Закрыть смартфон');
  const frame=element('div','career-phone-frame');
  frame.setAttribute('role','dialog');frame.setAttribute('aria-modal','true');
  frame.setAttribute('aria-labelledby','career-phone-title');
  frame.tabIndex=-1;
  const header=element('header','career-phone-header');
  const heading=element('div','career-phone-heading');
  const kicker=element('span','career-phone-kicker','ТЕЛЕФОН · БЛИН’С');
  const title=element('strong','career-phone-title','Работа Блин’С');
  title.id='career-phone-title';
  heading.append(kicker,title);
  const closeButton=action('×',()=>close(),'career-phone-x');
  closeButton.setAttribute('aria-label','Закрыть смартфон');
  header.append(heading,closeButton);
  const body=element('div','career-phone-body');
  const appTabs=element('nav','career-phone-apps');
  appTabs.setAttribute('aria-label','Приложения смартфона');
  for(const [id,label] of [['work','Работа'],['finance','Финансы'],['food','Маркет']]){
    const tab=action(label,()=>{
      const root=personRoot();if(!root)return;
      if(id==='finance'&&root.recruitmentSystem?.byResident?.[who]?.phase==='interview_active'){
        notify('Сначала ответь на вопросы собеседования');return;
      }
      app=id;render();
    },'career-phone-app-tab');
    tab.dataset.app=id;appTabs.append(tab);
  }
  const incidentNotice=element('div','career-phone-incident-banner-slot');
  const routeBar=element('nav','phone-platform-bottom');
  routeBar.setAttribute('aria-label','Навигация по телефону');
  const backButton=action('‹ Назад',()=>{app='home';render();},'phone-platform-back');
  const homeButton=action('⌂ Главный экран',()=>{app='home';render();},'phone-platform-home');
  routeBar.append(backButton,homeButton);
  frame.append(header,appTabs,incidentNotice,body,routeBar);
  overlay.append(shade,frame);host.append(overlay);
  const financeUI=createFinancePhoneUI({body,payBill:root=>{
    const payment=payHouseholdBill(root);
    if(!payment.ok)return payment;
    root.shop=payment.shop;
    root.financialHistory=payment.financialHistory;
    root.householdBills=payment.householdBills;
    save(true);onFundsChanged();
    notify('🧾 Семейный счёт оплачен · −'+payment.amount+' кр.');
    return payment;
  }});
  let app='home',sportsTab='club',streamInterval=null,sportsSignature=null;
  let who=null,view='list',chosen=null,lastFocus=null,lastInterviewFeedback='';
  let section='vacancies',historyId=null;
  const contexts={alex:null,mira:null};
  const opened=()=>!overlay.hidden;
  function close({focus=true}={}){
    if(!opened())return;
    if(streamInterval!==null){clearInterval(streamInterval);streamInterval=null;}
    sportsSignature=null;
    overlay.hidden=true;trigger.setAttribute('aria-expanded','false');
    financeTrigger?.setAttribute('aria-expanded','false');
    if(who)contexts[who]={section,view,chosen,historyId,scrollTop:body.scrollTop};
    onOpenChange(null);
    who=null;lastInterviewFeedback='';
    if(focus)(lastFocus?.isConnected?lastFocus:trigger).focus({preventScroll:true});
  }
  shade.addEventListener('click',()=>close());
  document.addEventListener('keydown',event=>{
    if(!opened())return;
    if(event.key==='Escape'){event.preventDefault();close();}
    if(event.key==='Tab'){
      // Keep keyboard focus inside the small modal until it is dismissed.
      const items=[...frame.querySelectorAll('button:not([disabled])')];
      if(!items.length)return;
      const first=items[0],last=items.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  function personRoot(){
    const root=getRoot();
    if(!root||getSelectedResident(root)!==who||
      !residentIdsForSimulation(root).includes(who)){close({focus:false});return null;}
    return root;
  }
  function top(text){
    body.replaceChildren();
    body.append(element('p','career-phone-person',text));
  }
  function renderPendingNotice(root){
    incidentNotice.replaceChildren();
    const ids=residentIdsForSimulation(root).filter(id=>pendingWorkIncident(root,id));
    if(!ids.length)return;
    const id=ids.includes(who)?who:ids[0];
    const contract=root.careerSystem.byResident[id];
    const scenario=workScenario(contract.careerId,contract.currentShift.incident.scenarioId||'legacy');
    const label=app==='finance'?(scenario?.title||'Рабочая ситуация'):'Рабочая ситуация';
    const card=element('section','career-phone-incident-banner');
    card.setAttribute('aria-label','Требует решения рабочая ситуация');
    card.append(element('strong',null,'💼 '+ids.length+' '+(ids.length===1?'решение':'решения')+' до конца смены'));
    card.append(element('span',null,NAMES[id]+' · '+label+
      ' · до '+clockAt(contract.currentShift.end)));
    card.append(action('Решить · '+NAMES[id],()=>openIncident(id),'career-phone-primary career-incident-open'));
    // Both pending residents are reachable independently; just opening a card
    // never changes the stored incident choice or the game clock.
    for(const other of ids.filter(candidate=>candidate!==id)){
      const c=root.careerSystem.byResident[other];
      const detail=workScenario(c.careerId,c.currentShift.incident.scenarioId||'legacy');
      card.append(element('span','career-phone-incident-other-label',
        NAMES[other]+' · '+(detail?.title||'Рабочая ситуация')+
        ' · до '+clockAt(c.currentShift.end)));
      card.append(action('Решить · '+NAMES[other],()=>openIncident(other),
        'career-incident-other'));
    }
    incidentNotice.append(card);
  }
  function renderEmployed(root){
    const current=root.careerSystem?.byResident?.[who];
    const career=careerDefinition(current?.careerId);
    if(!career)return;
    top('💼 '+NAMES[who]+' · трудовой договор');
    body.append(element('h2','career-phone-section-title',career.title));
    body.append(element('p','career-phone-muted',careerRankForContract(current)?.title||'Должность'));
    const shift=nextCareerShift(root.calendar,current,root.minutes);
    const status=residentWorkStatus(root,who);
    const active=current.currentShift;
    const landing=phoneWorkLanding({residentName:NAMES[who],contract:current,
      statusLabel:status.label,shiftLabel:describeCareerShift(shift),
      pendingIncident:Boolean(pendingWorkIncident(root,who)),
      canDepart:active?.phase==='pending'&&root.minutes>=active.start-15});
    const hero=element('section','career-phone-hero');
    hero.setAttribute('aria-label','Сводка работы · '+NAMES[who]);
    hero.append(element('strong','career-phone-hero-headline',landing.headline));
    hero.append(element('p','career-phone-hero-description',landing.description));
    hero.append(element('p','career-phone-hero-rate',
      (careerRankForContract(current)?.title||'Должность')+' · '+
      careerRankForContract(current)?.hourlyCredits+' кр./час'));
    hero.append(action(landing.actionLabel,()=>{
      if(landing.action==='incident'){openIncident(who);return;}
      if(landing.action==='depart'){
        const live=personRoot();if(!live)return;
        const result=requestCareerDeparture(live,who,live.minutes);
        if(!result.ok){notify(result.reason);return;}
        save(true);notify(NAMES[who]+' идёт к выходу'+(result.canceledSocial?' · общение отменено ('+result.canceledSocial+')':''));render();return;
      }
      section='map';render();body.querySelector('#career-map-title')?.focus({preventScroll:true});
    },'career-phone-primary career-phone-hero-main'));
    const shortcuts=element('nav','career-phone-shortcuts');
    shortcuts.setAttribute('aria-label','Быстрые разделы работы');
    for(const [id,label] of [['map','Карта'],['contract','Договор'],
      ['leave','Отпуск'],['worklog','Журнал']]){
      const link=action(label,()=>{
        if(id==='map'||id==='worklog'){
          section=id;render();
          if(id==='map')body.querySelector('#career-map-title')?.focus({preventScroll:true});
          return;
        }
        const target=body.querySelector(id==='contract'?'#career-contract-facts':'#career-leave-details');
        if(target?.tagName==='DETAILS')target.open=true;
        target?.scrollIntoView({block:'start'});
        target?.focus({preventScroll:true});
      },'career-phone-shortcut');
      link.dataset.target=id;shortcuts.append(link);
    }
    hero.append(shortcuts);body.append(hero);
    const facts=element('div','career-phone-facts');
    facts.id='career-contract-facts';facts.tabIndex=-1;
    facts.append(element('span',null,'Ставка: '+careerRankForContract(current)?.hourlyCredits+' кр./час'));
    facts.append(element('span',null,'Следующая смена: '+describeCareerShift(shift)));
    const week=careerScheduleAtDay(current,shift?.dayIndex??Math.floor(root.minutes/1440));
    if(week){
      const hours=Math.round(week.duration*week.weekdays.length/60);
      const rate=careerRankForContract(current)?.hourlyCredits||0;
      const days=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
      facts.append(element('span',null,'График: '+week.weekdays.map(day=>days[day]).join(' · ')+
        ' · '+clockAt(week.startMinute)+'–'+clockAt(week.startMinute+week.duration)+
        (week.startMinute+week.duration>=1440?' (+1 день)':'')+
        ' · '+hours+' ч/нед.'));
      facts.append(element('span',null,'Ориентир полной недели: '+
        Math.round(rate*week.duration*week.weekdays.length/60)+' кр.')); 
    }
    const epoch=current.shiftSchedule?.effectiveDayIndex;
    if(Number.isSafeInteger(epoch)&&epoch*1440>root.minutes)
      facts.append(element('span','career-phone-muted',
        'Новый график вступит в силу '+calendarAt(root.calendar,epoch*1440).iso+
        ' (после сохранённых отпусков и старых смен).'));
    facts.append(element('span',null,'Статус: '+status.label));
    facts.append(element('span',null,'Баланс семьи: '+root.shop.credits+' кр.'));
    facts.append(element('span',null,'Результативность: '+current.performance+'/100'));
    facts.append(element('span',null,'Отработано смен: '+(current.workedShifts||0)+
      ' · на должности: '+(current.rankShifts||0)));
    facts.append(element('span',null,'Опозданий: '+(current.lateShifts||0)+
      ' · пропусков: '+(current.missedShifts||0)));
    if(current.lastShift?.incident){
      const outcome=workScenario(current.careerId,
        current.lastShift.incident.scenarioId||'legacy')?.options.find(
          option=>option.id===current.lastShift.incident.choiceId);
      if(outcome)facts.append(element('span',null,
        'Рабочая ситуация: '+(current.lastShift.incident.auto?'автономно · ':'твой выбор · ')+
        outcome.feedback+' · рейтинг '+
        (current.lastShift.incident.performanceDelta>=0?'+':'')+
        current.lastShift.incident.performanceDelta));
    }
    if(current.lastShift)facts.append(element('span',null,'Прошлая смена: '+
      (current.lastShift.outcome==='worked'?'отработано':'пропущено')+
      ' · +'+current.lastShift.salary+' кр.'+
      (current.lastShift.grade?' · '+current.lastShift.grade:'')+
      (Number.isInteger(current.lastShift.performanceDelta)?
        ' · результат '+(current.lastShift.performanceDelta>=0?'+':'')+
          current.lastShift.performanceDelta:'')+
      (current.lastShift.lateMinutes?' · опоздание '+current.lastShift.lateMinutes+' мин.':'')));

    const discipline=disciplineStatus(current.discipline);
    const disciplineName={clear:'В порядке',warning:'Предупреждение',
      final:'Последнее предупреждение',dismissal:'Решение об увольнении'}[discipline.stage];
    facts.append(element('span','career-phone-discipline-status',
      'Дисциплина: '+disciplineName+' · риск '+discipline.risk+'/12'));
    body.append(facts);
    body.append(action('🗺 Карьерная карта · все 8 уровней и обе ветки',()=>{
      section='map';render();
      body.querySelector('#career-map-title')?.focus({preventScroll:true});
    },'career-phone-primary career-map-open'));
    const life=element('details','career-phone-worklife');
    const satisfaction=jobSatisfaction(current,root.minutes);
    life.append(element('summary','career-phone-notice',
      '💛 Баланс работы и жизни · '+satisfaction+'/100'));
    life.append(element('p','career-phone-muted',
      'Удовлетворённость: '+satisfaction+'/100. Оценка последних пяти смен, '+ 
      'результативность, повышение и дисциплина. Влияние на настроение — до ±5.'));
    if(current.lastShift){
      const last=current.lastShift,report=last.workReport;
      life.append(element('p','career-phone-muted',
        'Последняя смена: '+(last.grade||last.outcome)+
        ' · нагрузка '+workLoadLabel(report?.strain||0)+
        (report?' ('+Math.round(report.strain)+' / 100)':' (нет отчёта)')));
    }
    const feeling=current.workLife?.lastFeeling;
    if(feeling&&MEMORY_TEXT[feeling])
      life.append(element('p','career-phone-notice',MEMORY_TEXT[feeling]));
    life.append(element('p','career-phone-muted',
      'Восстановление: сон при усталости, отдых, полноценное питание и настоящее общение. '+
      'Режим «Беречь силы» уменьшает будущую нагрузку.'));
    body.append(life);
    const conflict=workLifeConflict(root,who);
    if(conflict){
      const card=element('section','career-phone-worklife-conflict');
      card.append(element('h3','career-phone-section-title','⚖️ Работа или личные дела?'));
      card.append(element('p','career-phone-notice',
        conflict.activeType==='shared'?
        'Совместное занятие пересекается с выходом на смену.':
        'Твоё текущее домашнее занятие пересекается с выходом на смену.'));
      card.append(element('p','career-phone-muted',
        conflict.lateMinutes>=30?'Уже опаздывает на '+conflict.lateMinutes+
        ' мин.; дисциплинарные правила W3-C сохраняются.':
        'Если закончить дело, возможно опоздание. Ручная очередь не исчезнет.'));
      for(const [kind,label] of [['leave','Выйти на работу'],['finish','Закончить дело']]){
        card.append(action(label,()=>{
          const live=personRoot();if(!live)return;
          const result=resolveWorkLifeConflict(live,who,kind);
          if(!result.ok){notify(result.reason);render();return;}
          save(true);
          notify(kind==='leave'?'Идёт на работу. Очередь сохранена.':'Продолжает своё занятие');
          render();
        },kind==='leave'?'career-phone-primary':'career-phone-secondary'));
      }
      if(conflict.canTimeOff){
        for(const type of ['unpaid','paid']){
          if(type==='paid'&&(current.timeOff?.balance||0)<1)continue;
          card.append(action(type==='paid'?'Оформить оплачиваемый отпуск':'Оформить отгул',()=>{
            const live=personRoot();if(!live)return;
            const result=resolveWorkLifeConflict(live,who,'timeoff',{leaveType:type});
            if(!result.ok){notify(result.reason);render();return;}
            save(true);notify('Законный отдых оформлен без прогула');render();
          },'career-phone-secondary'));
        }
      }
      body.append(card);
    }
    const disciplineDetails=element('details','career-phone-discipline');
    disciplineDetails.append(element('summary','career-phone-notice',
      '⚖️ Трудовая дисциплина · причины и восстановление'));
    disciplineDetails.append(element('p','career-phone-muted',
      'За последние 10 учтённых смен: опоздание до 29 мин. — 0, 30–89 — 1, '+
      'от 90 мин. — 2, неуважительный пропуск — 2. Предупреждение при 4, '+
      'последнее при 8, увольнение от 12 после последнего предупреждения.'));
    disciplineDetails.append(element('p','career-phone-muted',
      'Каждые две хорошие отработанные смены снижают риск на 1. '+
      'Отпуска и праздничные выходные не считаются нарушениями.'));
    const entries=current.discipline?.entries||[];
    if(!entries.length)disciplineDetails.append(element('p','career-phone-muted',
      'Новых учтённых смен пока нет. Прошлые опоздания и прогулы не пересчитываются.'));
    for(const item of [...entries].reverse()){
      const name=item.outcome==='missed'?'Пропущенная смена':
        item.lateMinutes>=30?'Опоздание '+item.lateMinutes+' мин.':
        item.lateMinutes?'Отработано · '+item.lateMinutes+' мин. опоздания':'Смена отработана вовремя';
      disciplineDetails.append(element('p','career-phone-muted',
        name+' · '+(item.points?'+'+item.points:'0')+
        ' балл. · '+gameDueLabel(root,item.at)));
    }
    body.append(disciplineDetails);
    const currentMode=cleanWorkMode(active?.workMode??current.workMode);
    const modeDetails=element('details','career-work-modes');
    modeDetails.open=active?.phase==='working';
    modeDetails.append(element('summary','career-phone-notice',
      '⚙️ Режим работы · '+WORK_MODES[currentMode].label));
    modeDetails.append(element('p','career-phone-muted',
      'Режим влияет на фактически отработанные минуты. Переключение не даёт мгновенных бонусов.'));
    for(const mode of WORK_MODE_IDS){
      const spec=WORK_MODES[mode];
      const button=action((mode===currentMode?'✓ ':'')+spec.label,()=>{
        const live=personRoot();if(!live)return;
        const result=selectCareerWorkMode(live,who,mode);
        if(!result.ok){notify(result.reason);return;}
        save(true);notify('Режим работы: '+spec.label);render();
      },'career-phone-secondary career-work-mode');
      button.disabled=mode===currentMode||
        ['departing','returning'].includes(active?.phase);
      button.setAttribute('aria-pressed',String(mode===currentMode));
      modeDetails.append(button,element('p','career-phone-muted',spec.description));
    }
    const report=workNeedsReport(active);
    if(active?.phase==='working'){
      const sim=who==='mira'?root.otherSim:root;
      modeDetails.append(element('p','career-phone-notice',
        'На работе: голод '+Math.round(sim.needs.hunger)+
        ' · туалет '+Math.round(sim.needs.bladder)+
        ' · общение '+Math.round(sim.needs.social)));
      modeDetails.append(element('p','career-phone-muted',
        'Обед: '+(report.meal?'был':'ещё нет')+
        ' · туалет: '+report.toilet+
        ' · разговоры: '+report.socialMinutes+' мин.'));
    }
    if(current.lastShift?.outcome==='worked'&&current.lastShift.workReport){
      const r=current.lastShift.workReport;
      modeDetails.append(element('p','career-phone-muted',
        'Итог прошлой смены: обед '+(r.meal?'✓':'—')+
        ' · туалет '+r.toilet+' · разговоры '+r.socialMinutes+' мин.'));
    }
    body.append(modeDetails);
    body.append(element('h3','career-phone-section-title','🏖 Отдых от работы'));
    const leave=current.timeOff||{balance:0,progress:0};
    body.append(element('p','career-phone-muted',
      'Оплачиваемых дней: '+leave.balance+'/3 · до следующего: '+
      (5-leave.progress)+' отработанных смен. Отгул без оплаты не считается прогулом.'));
    const reserve=root.careerSystem?.portableLeave?.[who]||0;
    if(reserve>0){
      body.append(element('p','career-phone-muted',
        'Заработанные дни от прежней работы в резерве: '+reserve));
      if(leave.balance<3)body.append(action('Перенести отпускные дни из резерва',()=>{
        const live=personRoot();if(!live)return;
        const result=claimPortableCareerLeave(live,who);
        if(!result.ok){notify(result.reason);render();return;}
        save(true);notify('Перенесено оплачиваемых дней: '+result.count);render();
      },'career-phone-secondary'));
    }
    const leaveDetails=element('details','career-phone-leave');
    leaveDetails.id='career-leave-details';leaveDetails.tabIndex=-1;
    leaveDetails.append(element('summary','career-phone-notice',
      'Выбрать дату отдыха (ближайшие смены)'));
    const dates=upcomingCareerTimeOff(root,who,6);
    if(!dates.length)leaveDetails.append(element('p','career-phone-muted',
      'В ближайшие игровые дни доступных смен нет.'));
    for(const {shift:planned,booking} of dates){
      leaveDetails.append(element('p','career-phone-muted',planned.iso+' · '+
        clockAt(planned.start)+'–'+clockAt(planned.end)+
        (booking?' · '+(booking.type==='paid'?'Оплачиваемый отпуск':'Отгул'):' · Рабочая смена')));
      if(booking){
        if(!booking.settled)leaveDetails.append(action('Отменить отдых '+planned.iso,()=>{
          const live=personRoot();if(!live)return;
          const result=cancelCareerTimeOff(live,who,planned.id);
          if(!result.ok){notify(result.reason);return;}
          save(true);notify('Отдых отменён');render();
        },'career-phone-secondary'));
        continue;
      }
      for(const kind of ['paid','unpaid']){
        if(kind==='paid'&&leave.balance===0)continue;
        const label=kind==='paid'?'Оплачиваемый отпуск':'Неоплачиваемый отгул';
        leaveDetails.append(action(label+' · '+planned.iso,()=>{
          const live=personRoot();if(!live)return;
          if(!window.confirm(label+' на смену '+planned.iso+
            '? Прогул не засчитывается.'))return;
          const result=bookCareerTimeOff(live,who,planned.id,kind);
          if(!result.ok){notify(result.reason);render();return;}
          save(true);notify(NAMES[who]+': '+label.toLowerCase()+' назначен');render();
        },'career-phone-secondary'));
      }
    }
    body.append(leaveDetails);
    // Work events stay within the existing job screen, even after reload.
    const incident=active?.incident,scenario=workScenario(current.careerId,incident?.scenarioId||'legacy');
    if(active?.phase==='working'&&incident&&scenario){
      const heading=element('h3','career-phone-section-title','📩 Ситуация на смене');
      if(incident.choiceId===null){
        heading.id='career-pending-incident-title';heading.tabIndex=-1;
      }
      body.append(heading);
      if(scenario.trackId){
        const track=specializationDefinition(current.careerId,scenario.trackId);
        body.append(element('p','career-phone-muted',
          'История специализации · '+(track?.title||'Профильная задача')+
          ' · ступени 6–8'+(workStoryFollowUp(root,who,scenario)?
            ' · продолжение предыдущего решения':'')));
      }else if(Number.isInteger(scenario.minRank)&&Number.isInteger(scenario.maxRank)){
        body.append(element('p','career-phone-muted',
          (scenario.minRank>=5?'История старшей должности':'История начала карьеры')+
          ' · ступени '+(scenario.minRank+1)+'–'+(scenario.maxRank+1)));
      }
      body.append(element('p','career-phone-notice',scenario.title+' · '+scenario.text));
      if(incident.choiceId===null){
        body.append(element('p','career-phone-muted',
          'Можно закрыть смартфон и вернуться. Если смена закончится, персонаж решит сам.'));
        for(const option of scenario.options){
          const button=action(option.text,()=>{
            const live=personRoot();if(!live)return;
            const result=decideWorkIncident(live,who,option.id);
            if(!result.ok){notify(result.reason);render();return;}
            save(true);onIncidentChanged();
            notify(NAMES[who]+': '+result.feedback+
              (result.badges?.length?' · достижение: '+result.badges.join(', '):''));render();
          },'career-phone-secondary career-work-option');
          button.append(element('small','career-work-option-effect',
            workIncidentChoiceDescription(root,who,option)));
          body.append(button);
        }
        body.append(action('Позже · оставить решение до конца смены',
          ()=>close(),'career-phone-secondary career-incident-later'));
      }else{
        const chosen=scenario.options.find(o=>o.id===incident.choiceId);
        body.append(element('p','career-phone-notice',
          (incident.auto?'Решил самостоятельно: ':'Твой выбор: ')+(chosen?.text||'')+
          ' · '+(chosen?.feedback||'')+' · рейтинг '+
          (incident.performanceDelta>=0?'+':'')+incident.performanceDelta));
      }
    }
    // W2-A.2: compact, accessible, native scrolling professional recognition.
    // View only: this section never simulates work, grants credits or changes promotion.
    const achievements=professionalGoalsView(root,who);
    if(achievements){
      const details=element('details','career-professional-goals');
      const summary=element('summary','career-professional-summary',
        '🎯 Профессиональные цели · '+achievements.earned+' из 2');
      details.append(summary);
      details.append(element('p','career-phone-muted',
        'Необязательные профессиональные достижения. На повышение и зарплату не влияют.'));
      const currentGoal=achievements.current;
      if(currentGoal){
        const card=element('div','career-professional-card');
        card.append(element('strong',null,currentGoal.title));
        card.append(element('p','career-phone-muted',currentGoal.description));
        const progress=element('div','career-professional-progress');
        progress.append(element('span',null,'Завершённые смены в профессии'));
        progress.append(element('strong',null,
          currentGoal.shifts+' / '+currentGoal.requiredShifts));
        card.append(progress);
        const bar=element('progress','career-professional-bar');
        bar.max=currentGoal.requiredShifts;
        bar.value=Math.min(currentGoal.shifts,currentGoal.requiredShifts);
        bar.setAttribute('aria-label','Смены для цели '+currentGoal.title);
        card.append(bar);
        card.append(element('p','career-professional-condition',
          (currentGoal.sceneMet?'✓ ':'○ ')+
          'Успешное решение тематической рабочей ситуации'));
        if(currentGoal.skill){
          const skillName={cooking:'Кулинария',painting:'Живопись',
            literature:'Литературная эрудиция'}[currentGoal.skill];
          card.append(element('p','career-professional-condition',
            (currentGoal.skillMet?'✓ ':'○ ')+skillName+': '+
            currentGoal.currentSkill+' / '+currentGoal.skillLevel));
        }
        details.append(card);
      }else{
        details.append(element('p','career-phone-notice',
          'Все профессиональные достижения этой профессии получены!'));
      }
      if(achievements.completed.length){
        details.append(element('strong','career-professional-caption','Профессиональное признание'));
        const list=element('ul','career-professional-awards');
        for(const goal of achievements.completed)
          list.append(element('li',null,'🏅 '+goal.title));
        details.append(list);
      }
      body.append(details);
    }

    // W2-A.3: specialization belongs to the existing in-game smartphone.
    const branch=specializationReadiness(root,who);
    if(branch){
      const details=element('details','career-specialization');
      details.open=branch.unlocked&&current.level<=5;
      details.append(element('summary','career-specialization-summary',
        '🧭 Специализация · '+(branch.selected?.title||'выбери направление')));
      details.append(element('p','career-phone-muted',branch.unlocked?
        'Специализация определяет следующую должность и профильную задачу. Смена направления не сбрасывает должность, деньги или достижения.':
        'Два направления откроются после пятой карьерной ступени.'));
      if(branch.selected){
        details.append(element('p','career-phone-notice',
          'Текущий путь: '+branch.selected.title+' · '+branch.selected.description));
        if(!branch.atTop){
          const list=element('ul','career-specialization-requirements');
          for(const item of branch.requirements)list.append(element('li',null,
            (item.met?'✓ ':'○ ')+item.label+': '+item.current+' / '+item.target));
          details.append(list);
        }
      }
      for(const track of branch.tracks){
        const card=element('div','career-specialization-card');
        card.append(element('strong',null,track.title));
        card.append(element('p','career-phone-muted',track.description));
        card.append(element('p','career-phone-muted',
          '6-я должность: '+track.rank.title+' · '+track.rank.hourlyCredits+' кр./ч'));
        const nextRoles=seniorTrack(career.id,track.id)?.ranks||[];
        for(const role of nextRoles)card.append(element('small','career-specialization-senior',
          (role.index+1)+'-я должность: '+role.title+' · '+role.hourlyCredits+' кр./ч'));
        const rule=track.requirements;
        card.append(element('small','career-specialization-gate',
          'Нужно: '+rule.shifts+' смен на 5-й ступени, рейтинг '+
          rule.performance+(rule.skill?', навык '+
            ({cooking:'Кулинария',painting:'Живопись',literature:'Литература'})[rule.skill]+
            ' '+rule.level:'')+' и успешная профильная ситуация'));
        if(branch.selected?.id===track.id){
          card.append(element('small','career-specialization-chosen','✓ Выбранный путь'));
        }else if(branch.unlocked){
          const button=action(branch.selected?'Перейти в «'+track.title+'»':
            'Выбрать «'+track.title+'»',()=>{
            const live=personRoot();if(!live)return;
            const currentBranch=specializationReadiness(live,who);
            if(!currentBranch?.canSwitch){
              notify('Для перевода нужны две завершённые смены после выбора.');
              render();return;
            }
            if(!window.confirm('Выбрать «'+track.title+
              '»? Уже заработанные деньги и карьерный уровень сохраняются.'))return;
            const result=chooseCareerSpecialization(live,who,track.id);
            if(!result.ok){notify(result.reason);render();return;}
            save(true);notify(NAMES[who]+': выбран путь «'+track.title+'»');
            render();
          },'career-phone-secondary career-specialization-select');
          button.disabled=!branch.canSwitch;
          card.append(button);
          if(!branch.canSwitch)card.append(element('small','career-phone-muted',
            'Для перевода нужно 2 завершённые смены: '+branch.since+' / 2'));
        }
        details.append(card);
      }
      body.append(details);
    }
    // The career route is presentation-only; stable catalog rank IDs drive it.
    const seniorRoles=branch?.selected?seniorTrack(career.id,branch.selected.id)?.ranks||[]:[];
    const ranks=[...career.ranks,...(branch?.selected?[branch.selected.rank,...seniorRoles]:[])];
    const ladderDetails=element('details','career-ladder-details');
    ladderDetails.open=current.level<5;
    ladderDetails.append(element('summary','career-ladder-summary',
      'Карьерный путь · '+(current.level+1)+' из '+ranks.length+' · показать ступени'));
    const ladder=element('ol','career-ladder');
    ranks.forEach((rank,index)=>{
      const status=index<current.level?'passed':index===current.level?'current':'future';
      const item=element('li','career-ladder-step career-ladder-'+status);
      item.append(element('span','career-ladder-marker',
        index<current.level?'✓':index===current.level?'●':'○'));
      const content=element('div','career-ladder-detail');
      content.append(element('strong',null,(index+1)+'. '+rank.title));
      content.append(element('small',null,rank.hourlyCredits+' кр./час'+
        (index===current.level?' · текущая должность':'')));
      item.append(content);ladder.append(item);
    });
    ladderDetails.append(ladder);body.append(ladderDetails);
    body.append(action('📖 История рабочих ситуаций',()=>{
      section='worklog';render();
    },'career-phone-secondary'));
    const growth=promotionReadiness(root,who);
    if(growth?.maxLevel){
      body.append(element('p','career-phone-notice','Высшая должность этой карьерной ветки достигнута.'));
    }else if(growth?.needsSpecialization){
      body.append(element('p','career-phone-notice',
        'Для следующего повышения сначала выбери специализацию.'));
    }else if(growth){
      const next=careerRankForContract({...current,level:current.level+1});
      body.append(element('h3','career-phone-subtitle',
        'Повышение: '+growth.rank+' · следующая цель'));
      body.append(element('p','career-phone-notice',
        'Новая ставка: '+next.hourlyCredits+' кр./час · +'+
        (next.hourlyCredits-careerRankForContract(current).hourlyCredits)+' кр./час к текущей'));
      const requirements=element('div','career-goal-requirements');
      const missing=[];
      for(const req of growth.requirements){
        const label=req.label==='Результативность'?'Рейтинг для повышения':req.label;
        const remaining=Math.max(0,req.target-(Number(req.current)||0));
        const row=element('div','career-goal-requirement'+(req.met?' career-goal-met':''));
        const header=element('div','career-goal-header');
        header.append(element('strong',null,(req.met?'✓ ':'○ ')+label));
        header.append(element('span',null,req.current+' / '+req.target));
        row.append(header);
        const progress=element('progress','career-goal-progress');
        progress.max=Math.max(1,req.target);
        progress.value=Math.min(progress.max,Math.max(0,Number(req.current)||0));
        progress.setAttribute('aria-label',label+': '+req.current+' из '+req.target);
        row.append(progress);
        row.append(element('small',null,req.met?'Условие выполнено':
          'Осталось: '+remaining));
        if(!req.met)missing.push(label.toLowerCase()+' (ещё '+remaining+')');
        requirements.append(row);
      }
      body.append(requirements);
      if(growth.ready){
        if(active)body.append(element('p','career-phone-notice',
          'Условия выполнены. Повышение доступно после возвращения со смены.'));
        else body.append(action('Получить повышение',()=>{
          const live=personRoot();if(!live)return;
          const result=promoteCareer(live,who);
          if(!result.ok){notify(result.reason);render();return;}
          save(true);notify(NAMES[who]+': повышение · '+result.rank+
            ' · новая ставка '+result.rate+' кр./час');
          render();
        },'career-phone-primary'));
      }else{
        body.append(element('p','career-phone-muted',
          'Пока недоступно: '+missing.join('; ')+'. Учитываются завершённые смены, результативность и настоящие навыки.'));
      }
    }
    if(active?.phase==='pending'&&root.minutes>=active.start-15){
      body.append(action('Отправиться на работу',()=>{
        const live=personRoot();if(!live)return;
        const result=requestCareerDeparture(live,who,live.minutes);
        if(!result.ok){notify(result.reason);return;}
        save(true);notify(NAMES[who]+' идёт к выходу'+(result.canceledSocial?' · общение отменено ('+result.canceledSocial+')':''));render();
      },'career-phone-primary'));
    }
    if(['pending','departing'].includes(active?.phase)&&root.minutes>=active.start-15){
      body.append(action('Пропустить эту смену',()=>{
        if(!window.confirm('Пропустить смену? Зарплата за неё будет 0 кр.'))return;
        const live=personRoot();if(!live)return;
        if(skipCareerShift(live,who)){
          save(true);notify(NAMES[who]+': смена пропущена');render();
        }
      },'career-phone-secondary'));
    }
    if(active?.phase==='working')
      body.append(element('p','career-phone-notice',
        'Житель находится вне участка. До '+clockAt(active.end)+
        ' домашние действия недоступны. Выплата придёт в конце смены.'));
    else body.append(element('p','career-phone-notice',
      'Смены проходят по игровому календарю. Автоматический выход включён; занятое ручное действие не прерывается.'));
    body.append(action('Уволиться',()=>{
      if(!window.confirm('Расторгнуть договор с '+career.title+'?'))return;
      const result=leaveCareer(getRoot(),who);
      if(!result.ok){notify(result.reason);return;}
      setCareerSystem(result.careerSystem);save(true);notify('Договор расторгнут');
      view='list';chosen=null;render();
    },'career-phone-secondary'));
  }
  function gameDueLabel(root,minute){
    if(!Number.isFinite(minute))return '—';
    const d=calendarAt(root.calendar,minute);
    return d.iso+' · '+d.time;
  }
  function renderInterviewFactors(app){
    const i=app.interview,bank=INTERVIEW_QUESTIONS_BY_CAREER[app.careerId];
    if(!i||!bank)return;
    const score=interviewScore(app);
    const low=bank.reduce((sum,q)=>sum+Math.min(...q.answers.map(a=>a.score)),0);
    const high=bank.reduce((sum,q)=>sum+Math.max(...q.answers.map(a=>a.score)),0);
    const strength=high>low?(score-low)/(high-low):.5;
    const facts=element('div','career-phone-facts');
    facts.append(element('span',null,'Ответы: '+(strength>=.7?'Убедительные':strength>=.4?'Смешанные':'Спорные решения')));
    if(CAREER_SKILL_LABELS[app.careerId])facts.append(element('span',null,
      CAREER_SKILL_LABELS[app.careerId]+': уровень '+i.skill+
      (i.skill>=2?' · помог':' · можно развить')));
    facts.append(element('span',null,'Настроение на собеседовании: '+i.mood+'/100'+
      (i.mood>=67?' · поддержало':i.mood<45?' · снизило уверенность':' · без сильного эффекта')));
    const focus={editorial:'Собранность и устойчивость',
      'art-studio':'Творческий и практичный подход',
      'business-center':'Организованность и практичность',
      'civic-service':'Эмпатия и самообладание'};
    facts.append(element('span',null,(focus[app.careerId]||'Особенности характера')+': '+
      (i.traitBoost>0?'помогли':i.traitBoost<0?'потребовали усилий':'нейтральны')));
    body.append(facts);
    body.append(element('p','career-phone-muted',
      app.phase==='rejected'||app.outcome==='rejected'
        ?'Почему отказали: ответы, состояние и характер повлияли на шансы, но конкуренция сохраняется. Перед новой попыткой можно улучшить спорные решения, настроение и настоящий профильный навык.'
        :'Работодатель учёл решения, характер и опыт. Даже убедительное интервью не гарантирует приглашение.'));
    if(i.answers.length===3&&app.phase!=='waiting_decision') {
      body.append(element('p','career-phone-muted','Подробные ответы доступны в истории после завершения отклика.'));
    }
  }
  function renderRecruitment(root){
    const app=root.recruitmentSystem?.byResident?.[who];
    if(!app)return render();
    top('📨 '+NAMES[who]+' · МОЙ ОТКЛИК');
    const landing=phoneWorkLanding({residentName:NAMES[who],recruitment:app});
    body.append(element('p','career-phone-hero-inline',landing.headline));
    body.append(element('p','career-phone-muted','Отправлен: '+gameDueLabel(root,app.appliedAt)));
    body.append(element('h2','career-phone-section-title',
      careerDefinition(app.careerId)?.title||'Работа'));
    const labels={
      waiting_reply:'Резюме отправлено. Работодатель рассматривает заявку.',
      interview_invited:'Приглашение на собеседование получено!',
      interview_active:'Собеседование · выбери ответ',
      waiting_decision:'Собеседование окончено. Работодатель принимает решение.',
      offer_ready:'Предложение работы получено!',
      rejected:'Работодатель отказал. Можно попробовать другой путь.'
    };
    body.append(element('p','career-phone-notice',labels[app.phase]||'Статус отклика'));
    if(app.phase==='waiting_reply'||app.phase==='waiting_decision'){
      body.append(element('p','career-phone-muted','Ожидаемый ответ: '+
        gameDueLabel(root,app.phase==='waiting_reply'?app.replyDueAt:app.decisionDueAt)+
        '. Время идёт только вместе с игрой.'));
    }
    if(app.phase==='interview_invited'){
      body.append(element('p','career-phone-muted',
        'Три профессиональные ситуации. Ответы, характер и настроение влияют на решение работодателя.'+
        (CAREER_SKILL_LABELS[app.careerId]?' Учитывается реальный навык: '+CAREER_SKILL_LABELS[app.careerId]+'.':'')));
      body.append(action('Начать собеседование',()=>{
        const live=personRoot();if(!live)return;
        const result=startCareerInterview(live,who);
        if(!result.ok){notify(result.reason);render();return;}
        lastInterviewFeedback='';save(true);render();
      },'career-phone-primary'));
    }
    if(app.phase==='interview_active'){
      const index=app.interview?.answers?.length||0;
      const question=INTERVIEW_QUESTIONS_BY_CAREER[app.careerId]?.[index];
      body.append(element('p','career-phone-muted','Вопрос '+(index+1)+' из 3 · игровое время остановлено, пока открыт экран ответа.'));
      const preceding=index>0?INTERVIEW_QUESTIONS_BY_CAREER[app.careerId]?.[index-1]
        ?.answers.find(a=>a.id===app.interview.answers[index-1])?.feedback:null;
      if(lastInterviewFeedback||preceding)
        body.append(element('p','career-phone-notice',lastInterviewFeedback||preceding));
      body.append(element('h3','career-phone-section-title',question.text));
      for(const option of question.answers){
        body.append(action(option.text,()=>{
          const live=personRoot();if(!live)return;
          const result=answerCareerInterview(live,who,option.id);
          if(!result.ok){notify(result.reason);render();return;}
          lastInterviewFeedback=result.feedback;
          save(true);render();
        },'career-phone-secondary'));
      }
    }
    if(['offer_ready','rejected'].includes(app.phase)&&app.interview)
      renderInterviewFactors(app);
    if(app.phase==='offer_ready'){
      if(app.careerId==='kitchen-studio')body.append(element('p','career-phone-notice',
        'Мастерская оценила ваш реальный навык кулинарии: уровень '+(app.kitchenSkill||0)+
        '. '+(app.kitchenSkill>=2?'Подготовка пригодится на кухне.':
          'Для начальной должности предусмотрено обучение на сменах.')));
      body.append(element('p','career-phone-muted',
        'Вакансия подтверждена работодателем. Смены начнутся после подписания договора. Зарплата начисляется в конце фактически отработанной смены.'));
      body.append(action('Подписать договор',()=>{
        const live=personRoot();if(!live)return;
        const result=finishRecruitmentApplication(live,who,'accept');
        if(!result.ok){notify(result.reason);render();return;}
        setCareerSystem(live.careerSystem);save(true);
        notify(NAMES[who]+': подписан договор · '+careerDefinition(result.contract.careerId).title);
        lastInterviewFeedback='';section='vacancies';render();
      },'career-phone-primary'));
      body.append(action('Отклонить предложение',()=>{
        const live=personRoot();if(!live)return;
        const result=finishRecruitmentApplication(live,who,'dismiss');
        if(!result.ok){notify(result.reason);return;}
        save(true);section='vacancies';view='list';lastInterviewFeedback='';render();
      },'career-phone-secondary'));
    }
    if(app.phase==='rejected'){
      const retry=recruitmentRetry(root,who,app.careerId);
      if(retry.blocked)body.append(element('p','career-phone-muted',
        'Повторно в эту организацию: '+gameDueLabel(root,retry.retryAt)+
        '. Другие вакансии доступны после закрытия заявки.'));
      body.append(action('Вернуться к поиску',()=>{
        const live=personRoot();if(!live)return;
        const result=finishRecruitmentApplication(live,who,'dismiss');
        if(!result.ok){notify(result.reason);return;}
        save(true);section='vacancies';view='list';lastInterviewFeedback='';render();
      },'career-phone-primary'));
    }
    if(markRecruitmentRead(root,who))save(true);
  }
  function renderOffer(root){
    const offer=careerVacancies(root,who).find(x=>x.id===chosen);
    if(!offer){chosen=null;view='list';return render();}
    top(NAMES[who]+' · '+(view==='contract'?'ПРЕДЛОЖЕНИЕ':'ВАКАНСИЯ'));
    body.append(action('‹ К списку вакансий',()=>{view='list';render();},'career-phone-back'));
    body.append(element('h2','career-phone-section-title',offer.title));
    body.append(element('p','career-phone-muted',offer.description));
    const facts=element('div','career-phone-facts');
    for(const label of [
      'Доступная должность: '+offer.rank,
      'Ставка: '+offer.hourlyCredits+' кредитов/час',
      'Одна смена: до '+offer.shiftCredits+' кредитов за полный рабочий день',
      'Рабочие дни: '+offer.workdays,
      'Часы: '+offer.hours,
      'Первая смена: '+offer.firstShiftLabel
    ])facts.append(element('span',null,label));
    body.append(facts);
    if(view!=='details'||!RECRUITMENT_CAREERS.includes(chosen))return;
    const retry=recruitmentRetry(root,who,chosen);
    if(retry.blocked){
      body.append(element('p','career-phone-notice',
        'После отказа повторный отклик доступен '+gameDueLabel(root,retry.retryAt)+
        '. Осталось '+Math.ceil(retry.remaining/60)+' игровых ч. Другие вакансии открыты.'));
      return;
    }
    if(root.recruitmentSystem?.byResident?.[who]){
      body.append(element('p','career-phone-notice','Завершите текущий отклик в разделе «Мои отклики».'));
      body.append(action('Мои отклики',()=>{section='applications';render();},'career-phone-primary'));
      return;
    }
    body.append(element('p','career-phone-notice',
      'Сначала отправь отклик. Работодатель ответит через несколько игровых часов.'));
    body.append(action('Отправить отклик',()=>{
      const live=personRoot();if(!live)return;
      const result=submitCareerApplication(live,who,chosen);
      if(!result.ok){notify(result.reason);render();return;}
      save(true);notify(NAMES[who]+': отклик отправлен · '+offer.title);
      section='applications';view='list';render();
    },'career-phone-primary'));
  }
  function renderMap(root){
    top('🗺 '+NAMES[who]+' · вся карьерная лестница');
    const view=renderCareerMap({root,residentId:who,
      onBack:()=>{section='vacancies';render();},
      onChooseTrack:trackId=>{
        const live=personRoot();if(!live)return;
        const progress=specializationReadiness(live,who);
        if(!progress?.canSwitch){
          notify('Смена направления сейчас недоступна');render();return;
        }
        const target=progress.tracks.find(t=>t.id===trackId);
        if(!target||!window.confirm('Выбрать «'+target.title+
          '»? Уровень и заработанные деньги сохранятся.'))return;
        const result=chooseCareerSpecialization(live,who,trackId);
        if(!result.ok){notify(result.reason);render();return;}
        save(true);notify(NAMES[who]+': выбрано направление «'+target.title+'»');
        section='map';render();
        body.querySelector('#career-map-title')?.focus({preventScroll:true});
      }});
    if(view)body.append(view);
    else body.append(element('p','career-phone-notice','Нет действующей карьеры'));
  }
  function renderList(root){
    top('📱 '+NAMES[who]+' · открытые вакансии');
    const landing=phoneWorkLanding({residentName:NAMES[who]});
    const hero=element('section','career-phone-hero career-phone-looking');
    hero.setAttribute('aria-label','Поиск работы · '+NAMES[who]);
    hero.append(element('strong','career-phone-hero-headline',landing.headline));
    hero.append(element('p','career-phone-hero-description',landing.description));
    body.append(hero);
    const ended=root.careerSystem?.endedContracts?.[who]||[];
    if(ended.length){
      const last=ended.at(-1);
      body.append(element('p','career-phone-notice',
        'Последняя работа: '+(careerDefinition(last.careerId)?.title||'Профессия')+
        ' · '+(last.reason==='dismissed'?'увольнение работодателем':'добровольный уход')+
        ' · '+(last.level+1)+'-я ступень. Заработанный опыт сохранён.'));
    }
    body.append(element('h2','career-phone-section-title','Выбери направление'));
    body.append(element('p','career-phone-muted',
      'Шесть городских направлений. Каждая вакансия ведёт к настоящему договору и расписанию.'));
    const list=element('div','career-phone-list');
    for(const offer of careerVacancies(root,who)){
      const card=action('',()=>{chosen=offer.id;view='details';render();},'career-phone-card');
      card.replaceChildren();
      card.append(element('strong',null,offer.title));
      card.append(element('span',null,offer.rank+' · '+offer.hourlyCredits+' кр./час'));
      card.append(element('small',null,offer.workdays+' · '+offer.hours));
      const retry=recruitmentRetry(root,who,offer.id);
      if(retry.blocked)card.append(element('small','career-phone-cooldown',
        'Повторный отклик: '+gameDueLabel(root,retry.retryAt)));
      if(offer.disciplineBlocked)card.append(element('small','career-phone-cooldown',
        'После увольнения доступно: '+gameDueLabel(root,offer.disciplineRetryAt)));
      card.setAttribute('aria-label','Вакансия '+offer.title+', '+offer.rank+', '+offer.hourlyCredits+' кредитов в час');
      list.append(card);
    }
    body.append(list);
  }
  const HISTORY_LABELS={hired:'Подписанный договор',
    rejected:'Отказ работодателя',declined:'Предложение отклонено'};
  function renderHistory(root){
    const entries=root.recruitmentSystem?.history?.[who]??[];
    top('🗂 '+NAMES[who]+' · ИСТОРИЯ');
    const selected=entries.find(item=>item.id===historyId);
    if(selected){
      body.append(action('‹ Ко всей истории',()=>{historyId=null;render();},'career-phone-back'));
      body.append(element('h2','career-phone-section-title',careerDefinition(selected.careerId)?.title||'Вакансия'));
      body.append(element('p','career-phone-muted','Профессия: '+
        (careerDefinition(selected.careerId)?.ranks[0]?.title||'Начальная должность')));
      body.append(element('p','career-phone-notice',HISTORY_LABELS[selected.outcome]));
      const facts=element('div','career-phone-facts');
      facts.append(element('span',null,'Отклик: '+(selected.appliedAt===undefined?'не сохранена в старой записи':gameDueLabel(root,selected.appliedAt))));
      facts.append(element('span',null,'Результат: '+gameDueLabel(root,selected.at)));
      body.append(facts);
      if(selected.interview)renderHistoryInterview(selected);
      else if(Number.isInteger(selected.kitchenSkill))
        body.append(element('p','career-phone-muted','Навык кулинарии при отклике: '+selected.kitchenSkill));
      else body.append(element('p','career-phone-muted',
        'Собеседования не было или детали не сохранялись в прежней версии.'));
      const retry=recruitmentRetry(root,who,selected.careerId);
      if(selected.outcome==='rejected'&&retry.blocked)
        body.append(element('p','career-phone-notice','Следующая попытка: '+gameDueLabel(root,retry.retryAt)));
      return;
    }
    body.append(action('📖 История рабочих ситуаций',()=>{
      section='worklog';render();
    },'career-phone-secondary'));
    const contracts=root.careerSystem?.endedContracts?.[who]||[];
    if(contracts.length){
      body.append(element('h2','career-phone-section-title','История трудоустройства'));
      for(const ended of [...contracts].reverse()){
        const target=careerDefinition(ended.careerId);
        body.append(element('p','career-phone-muted',
          (target?.title||'Профессия')+' · '+(ended.level+1)+'-я ступень · '+
          (ended.reason==='dismissed'?'Увольнение за нарушения':'Добровольный уход')+
          ' · '+gameDueLabel(root,ended.at)));
      }
    }
    body.append(element('h2','career-phone-section-title','Завершённые отклики'));
    if(!entries.length){
      body.append(element('p','career-phone-muted','История появится после решения по отклику.'));
      return;
    }
    const list=element('div','career-phone-list');
    for(const entry of [...entries].reverse()){
      const card=action('',()=>{historyId=entry.id;render();},'career-phone-card');
      card.replaceChildren();
      card.append(element('strong',null,careerDefinition(entry.careerId)?.title||'Вакансия'));
      card.append(element('span',null,HISTORY_LABELS[entry.outcome]));
      card.append(element('small',null,'Профессия: '+
        (careerDefinition(entry.careerId)?.ranks[0]?.title||'Начальная должность')));
      card.append(element('small',null,'Отклик: '+(entry.appliedAt===undefined?'дата не сохранена':gameDueLabel(root,entry.appliedAt))));
      card.setAttribute('aria-label','История '+(careerDefinition(entry.careerId)?.title||'Вакансия')+
        ': '+HISTORY_LABELS[entry.outcome]);
      list.append(card);
    }
    body.append(list);
  }
  function renderWorklog(root){
    top('📖 '+NAMES[who]+' · ИСТОРИЯ РАБОЧИХ СИТУАЦИЙ');
    body.append(action('‹ Назад',()=>{
      section=root.careerSystem?.byResident?.[who]?'vacancies':'history';render();
    },'career-phone-back'));
    body.append(element('h2','career-phone-section-title','Решения на сменах'));
    body.append(element('p','career-phone-muted',
      'Последние 12 ситуаций. Это отдельная история решений, не история собеседований или начислений зарплаты.'));
    const entries=root.careerSystem?.incidentHistory?.[who]||[];
    if(!entries.length){
      body.append(element('p','career-phone-notice',
        'История появится после первого решения на рабочей смене. Старые ситуации не пересчитываются.'));
      return;
    }
    const list=element('div','career-phone-list');
    for(const record of [...entries].reverse()){
      const scenario=workScenario(record.careerId,record.scenarioId);
      const option=scenario?.options.find(o=>o.id===record.choiceId);
      if(!scenario||!option)continue;
      const card=element('article','career-phone-answer career-work-story');
      card.append(element('strong',null,scenario.title));
      if(scenario.trackId)card.append(element('small',null,
        'Специализация · '+(specializationDefinition(record.careerId,scenario.trackId)?.title||'')));
      card.append(element('small',null,(careerDefinition(record.careerId)?.title||'Работа')+
        ' · '+gameDueLabel(root,record.at)+
        ' · '+(record.auto?'Решил самостоятельно':'Выбор игрока')));
      card.append(element('p',null,scenario.text));
      card.append(element('p',null,'Решение: '+option.text));
      card.append(element('small',null,'Итог: '+option.feedback));
      card.append(element('small',null,'Карьера: рейтинг '+
        (record.performanceDelta>=0?'+':'')+record.performanceDelta+
        ' · после решения '+record.performanceAfter+'/100'));
      card.append(element('small',null,'Потребности: энергия '+
        (record.energyDelta>=0?'+':'')+record.energyDelta+
        ' · досуг '+(record.funDelta>=0?'+':'')+record.funDelta));
      list.append(card);
    }
    body.append(list);
  }
  function renderApplications(root){
    if(root.recruitmentSystem?.byResident?.[who])return renderRecruitment(root);
    top('📨 '+NAMES[who]+' · МОИ ОТКЛИКИ');
    body.append(element('h2','career-phone-section-title','Активных откликов нет'));
    body.append(element('p','career-phone-muted','Завершённые отклики находятся в «Истории».'));
    body.append(action('Посмотреть вакансии',()=>{section='vacancies';view='list';render();},'career-phone-primary'));
  }
  function renderHistoryInterview(app){
    const bank=INTERVIEW_QUESTIONS_BY_CAREER[app.careerId];
    if(!bank||!app.interview||app.interview.answers.length!==3)return;
    renderInterviewFactors(app);
    body.append(element('h3','career-phone-subtitle','Решения на собеседовании'));
    for(let index=0;index<3;index++){
      const answer=bank[index].answers.find(a=>a.id===app.interview.answers[index]);
      if(!answer)continue;
      const row=element('div','career-phone-answer');
      row.append(element('strong',null,(index+1)+'. '+bank[index].text));
      row.append(element('p',null,'Ваш ответ: '+answer.text));
      row.append(element('small',null,answer.feedback));
      body.append(row);
    }
  }
  /** FOOD-R1: the existing smartphone has a third app, not a separate overlay.
   * This view reads only the canonical kitchen and shared wallet.
   */
  function renderReadyFood(root){
    top('🛒 '+NAMES[who]+' · БЛИН’СТАВКА · МАРКЕТПЛЕЙС');
    body.append(element('h2','career-phone-section-title','Продукты с доставкой'));
    body.append(element('p','career-phone-muted',
      'Продукты поступают в общий холодильник через 18 игровых минут. '+
      'Стоимость списывается только после подтверждения заказа.'));
    const groceryPending=root.kitchen.pantryDeliveries||[];
    if(groceryPending.length){
      const orders=element('section','career-phone-facts');
      orders.append(element('strong',null,'Продукты в пути · '+groceryPending.length));
      for(const order of groceryPending){
        orders.append(element('span',null,
          (KITCHEN_RESTOCK_LABELS[order.ingredientId]||'Продукты')+
          ' · '+order.units+' шт. · осталось '+
          Math.max(0,Math.ceil(order.dueAt-root.minutes))+' игровых мин.'));
      }
      body.append(orders);
    }
    const groceries=element('div','career-phone-list');
    for(const id of Object.keys(KITCHEN_RESTOCK_LABELS)){
      const q=quotePantryDelivery(root,id);
      const item=element('article','career-phone-card');
      const pack=q.ok?q:null;
      item.append(element('strong',null,KITCHEN_RESTOCK_LABELS[id]));
      item.append(element('small',null,'В наличии: '+root.kitchen.pantry[id]+
        '/30 · упаковка: '+(pack?.units|| (id==='meat'||id==='chicken'?3:5))+' шт.'));
      const reason={'insufficient-credits':'Недостаточно средств',
        'pantry-full':'Холодильник заполнен','missing-fridge':'Нет холодильника',
        'delivery-limit':'Слишком много заказов'};
      const buy=action(q.ok?'🛒 Заказать · '+q.price+' кр.':
        (reason[q.reason]||'Заказ недоступен'),()=>{
          const live=personRoot();if(!live)return;
          const fresh=quotePantryDelivery(live,id);
          if(!fresh.ok){notify('Условия заказа изменились');render();return;}
          if(!window.confirm('Заказать «'+fresh.label+'» · '+fresh.units+
            ' шт. за '+fresh.price+' кр.? Доставка через 18 игровых минут.'))return;
          const result=onBuyPantryDelivery(id,who);
          if(!result.ok){notify(result.reason==='save-failed'?
            'Не удалось сохранить заказ · списания нет':'Заказ не оплачен');render();return;}
          notify('🛒 Заказ оформлен · '+result.price+' кр. · 18 игровых минут');
          render();
        },'career-phone-primary');
      buy.disabled=!q.ok;
      item.append(buy);groceries.append(item);
    }
    body.append(groceries);
    const furnitureOffers=homeMarketListing();
    const furniture=element('details','career-phone-worklife');
    const summary=element('summary','career-phone-notice',
      '🛋 Мебель и декор · '+furnitureOffers.length+' товаров');
    furniture.append(summary);
    furniture.append(element('p','career-phone-muted',
      'Оплата при заказе · доставка через 18 игровых минут на склад мебели. '+
      'Разместить покупку можно в редакторе дома → Склад. '+
      'Товары берутся из существующего игрового каталога.'));
    const transit=root.homeMarket?.orders||[];
    if(transit.length){
      const orders=element('section','career-phone-facts');
      orders.append(element('strong',null,'Мебель в пути · '+transit.length));
      for(const order of transit){
        const item=furnitureOffers.find(x=>x.itemId===order.itemId);
        orders.append(element('span',null,(item?.name||'Мебель')+
          ' · осталось '+Math.max(0,Math.ceil(order.dueAt-root.minutes))+
          ' игровых мин.'));
      }
      furniture.append(orders);
    }
    const search=element('input','career-phone-market-search');
    search.type='search';search.placeholder='Поиск мебели и декора';
    search.setAttribute('aria-label','Поиск товаров Блин’Ставки');
    search.autocomplete='off';
    const products=element('div','career-phone-list');
    function paintFurniture(query=''){
      products.replaceChildren();
      const needle=query.trim().toLocaleLowerCase('ru');
      const matches=furnitureOffers.filter(x=>
        (x.name+' '+(x.category||'')).toLocaleLowerCase('ru').includes(needle));
      if(!matches.length)products.append(element('p','career-phone-muted','Ничего не найдено'));
      for(const offer of matches.slice(0,24)){
        const q=quoteHomeDelivery(root,offer.itemId);
        const card=element('article','career-phone-card');
        card.append(element('strong',null,offer.name),
          element('small',null,offer.price+' кр. · '+(offer.category||'Мебель')));
        const reasons={'insufficient-credits':'Недостаточно средств',
          'storage-full':'Склад заполнен','duplicate-instance':'Ошибка склада'};
        const buy=action(q.ok?'🛒 Заказать · '+offer.price+' кр.':
          (reasons[q.reason]||'Заказ недоступен'),()=>{
            const live=personRoot();if(!live)return;
            const fresh=quoteHomeDelivery(live,offer.itemId);
            if(!fresh.ok){notify('Условия заказа изменились');render();return;}
            if(!window.confirm('«'+offer.name+'» за '+fresh.price+
              ' кр.? Доставка на склад через 18 игровых минут.'))return;
            const result=onBuyHomeDelivery(offer.itemId,who);
            if(!result.ok){notify(result.reason==='save-failed'?
              'Не удалось сохранить заказ · списания нет':'Заказ не оплачен');render();return;}
            notify('🛋 Мебель заказана · '+result.price+' кр. · 18 игровых минут');
            render();
          },'career-phone-primary');
        buy.disabled=!q.ok;
        card.append(buy);products.append(card);
      }
      if(matches.length>24)products.append(element('p','career-phone-muted',
        'Показаны первые 24 товара. Уточни поиск.'));
    }
    search.addEventListener('input',()=>paintFurniture(search.value));
    furniture.append(search,products);
    paintFurniture();
    body.append(furniture);
    body.append(element('p','career-phone-muted',
      'Садовые предметы пока покупаются в режиме строительства: '+
      'для них нет безопасной доставки на мебельный склад.'));
    body.append(element('h2','career-phone-section-title','Готовые блюда'));

    body.append(element('p','career-phone-muted',
      'Семья: '+root.shop.credits+' кр. · В холодильнике: '+
      root.kitchen.prepared.reduce((n,x)=>n+x.portions,0)+
      '/12 порций · Заказы: '+root.kitchen.deliveries.length+
      '. Доставка через 18 игровых минут; на паузе ожидание не идёт.'));
    const pending=root.kitchen.deliveries;
    if(pending.length){
      const orders=element('section','career-phone-facts');
      orders.setAttribute('aria-label','Оплаченные заказы в пути');
      orders.append(element('strong',null,'В пути · '+pending.length));
      for(const order of pending){
        const meal=readyMeal(order.recipeId);
        orders.append(element('span',null,(meal?.label||'Заказ')+
          ' · осталось '+Math.max(0,Math.ceil(order.dueAt-root.minutes))+
          ' игровых мин.'));
      }
      body.append(orders);
    }
    const list=element('div','career-phone-list');
    for(const id of READY_MEAL_IDS){
      const meal=readyMeal(id),q=quoteReadyMeal(root,id,'phone');
      const item=element('article','career-phone-card ready-food-card');
      item.append(element('strong',null,meal.label));
      item.append(element('small',null,'Сытость ×'+meal.hungerFactor.toFixed(2)+
        ' · холодильник '+meal.fridgePrice+' кр. · доставка '+meal.deliveryPrice+' кр.'));
      const labels={'insufficient-credits':'Недостаточно средств',
        'storage-full':'Холодильник заполнен',
        'missing-fridge':'Холодильник недоступен'};
      const buy=action(q.ok?'🛵 Заказать · '+meal.deliveryPrice+' кр.':
        (labels[q.reason]||'Заказ недоступен'),()=>{
          const live=personRoot();if(!live)return;
          const fresh=quoteReadyMeal(live,id,'phone');
          if(!fresh.ok){notify('Заказ недоступен: баланс или место изменились');render();return;}
          if(!window.confirm('Доставка «'+meal.label+'» за '+fresh.price+
            ' кр.? Прибытие через 18 игровых минут.'))return;
          const result=onBuyReadyMeal(id,'phone',who);
          if(!result.ok){notify(result.reason==='save-failed'?
            'Не удалось сохранить заказ · списания нет':'Заказ не оплачен');render();return;}
          notify('🛵 Оплачено '+result.price+' кр. · доставка через 18 игровых минут');
          render();
        },'career-phone-primary ready-food-buy');
      buy.disabled=!q.ok;
      item.append(buy);list.append(item);
    }
    body.append(list);
    body.append(element('p','career-phone-muted',
      'Прибытие автоматически добавит порцию в общий холодильник. '+
      'Чтобы поесть, выбери «Взять готовое» или обычный обед за столом. '+
      'Приготовленная дома еда дешевле и развивает навык.'));
  }
  function renderPhoneHome(root){
    body.replaceChildren();
    const welcome=element('section','phone-platform-welcome');
    welcome.append(element('p',null,'ТЕЛЕФОН · '+NAMES[who]),
      element('strong',null,'Что хочешь сделать?'));
    body.append(welcome);
    const grid=element('div','phone-platform-grid');
    grid.setAttribute('aria-label','Приложения телефона');
    for(const item of PHONE_APPS){
      const button=action('',()=>{app=item.id;render();},'phone-platform-tile');
      button.dataset.phoneApp=item.id;
      button.setAttribute('aria-label','Открыть '+item.label);
      button.append(element('span','phone-platform-icon',item.icon),
        element('strong',null,item.label),
        element('small',null,item.caption));
      if(item.id==='notifications'){
        const count=unreadNotifications(root.notificationHistory);
        if(count)button.append(element('small','pf-notice-count','Новых: '+count));
      }
      grid.append(button);
    }
    body.append(grid);
    body.append(element('p','career-phone-muted',
      'Алекс и Мира пользуются одним игровым временем. Работа, покупки и деньги — настоящие данные семьи.'));
  }
  function renderNotifications(root){
    body.replaceChildren();
    const history=root.notificationHistory;
    const count=unreadNotifications(history);
    const header=element('section','career-phone-card');
    header.append(element('strong',null,'Журнал семьи · '+count+' новых'),
      element('small',null,'Последние 100 уведомлений · игровое время'));
    const mark=id=>{
      if(markNotificationsRead(history,id))save(true);
      render({preserveScroll:true});
    };
    const all=action('Прочитать все',()=>mark(null));
    all.disabled=count===0;header.append(all);body.append(header);
    const labels={general:'Игра',work:'Работа',calendar:'Календарь',finance:'Финансы',delivery:'Доставка'};
    for(const entry of (history?.entries??[]).slice().reverse()){
      const card=element('section','career-phone-card pf-notice-card'+(entry.read?'':' pf-notice-unread'));
      const date=calendarAt(root.calendar,entry.at);
      card.append(element('small',null,labels[entry.category]+' · '+date.iso+
        ' · '+date.time+(entry.read?'':' · Новое')),
        element('p','pf-notice-message',entry.message+(entry.repeat>1?' (×'+entry.repeat+')':'')));
      if(!entry.read)card.append(action('Отметить прочитанным',()=>mark(entry.id)));
      if(notificationIncidentCurrent(entry,pendingWorkIncident(root,entry.incidentResidentId))){
        card.append(action('Решить',()=>{
          if(notificationIncidentCurrent(entry,pendingWorkIncident(getRoot(),entry.incidentResidentId))){
            if(openIncident(entry.incidentResidentId)&&markNotificationsRead(history,entry.id))save(true);
          }else render({preserveScroll:true});
        },'career-phone-primary'));
      }
      body.append(card);
    }
    if(!history?.entries?.length)body.append(element('p','career-phone-muted','Уведомлений пока нет.'));
  }
  function renderPhoneCalls(root){
    body.replaceChildren();
    const recipient=who==='alex'?'mira':'alex';
    const name=NAMES[recipient],status=phoneContactStatus(root,recipient);
    const active=root.phoneCalls?.active;
    body.append(element('p','career-phone-person','☎ '+NAMES[who]+' · ЗВОНКИ'),
      element('h2','career-phone-section-title','Контакты'));
    const card=element('section','phone-platform-contact');
    card.append(element('strong',null,name),
      element('span','phone-platform-call-status',active?'Идёт разговор':status.label));
    if(active){
      card.append(element('p','career-phone-muted',
        'Разговор идёт · осталось '+Math.max(0,Math.ceil(active.endAt-root.minutes))+
        ' игровых мин. · кнопка закрытия телефона не прерывает звонок.'));
      card.append(action('Завершить без бонуса',()=>{
        const result=onCancelCall();
        notify(result.ok?'Звонок завершён без награды':'Завершить звонок не удалось');
        render();
      },'career-phone-secondary phone-call-cancel'));
    }else{
      const own=phoneContactStatus(root,who);
      const cooldown=root.phoneCalls?.lastCompletedAt===null?0:
        Math.max(0,Math.ceil(CALL_COOLDOWN-
          (root.minutes-root.phoneCalls.lastCompletedAt)));
      const disabled=root.paused||!own.ok||!status.ok||cooldown>0;
      const label=cooldown>0?'Повторный звонок через '+cooldown+' мин.':
        root.paused?'Сними паузу для звонка':
        !own.ok?'Нельзя позвонить: '+own.label:
        !status.ok?'Контакт недоступен: '+status.label:
        '☎ Позвонить · '+CALL_DURATION+' игровых мин.';
      const button=action(label,()=>{
        const result=onStartCall(who,recipient);
        const messages={busy:'Собеседник занят',
          'mandatory-choice':'Сначала реши обязательный вопрос',
          departing:'Персонаж выходит на работу',returning:'Персонаж возвращается домой',
          paused:'Сними паузу',cooldown:'Повторный звонок пока недоступен',
          'save-failed':'Не удалось сохранить звонок'};
        notify(result.ok?'☎ Разговор начат на '+CALL_DURATION+' игровых минут':
          messages[result.reason]||'Соединение недоступно');
        render();
      },'career-phone-primary phone-call-start');
      button.disabled=disabled;
      card.append(button);
    }
    body.append(card);
    body.append(element('p','career-phone-muted',
      'Звонок работает дистанционно, в том числе во время смены. '+
      'За завершённый разговор: общение +6 обоим, отношения +1. Перерыв '+CALL_COOLDOWN+
      ' игровых минут. Рабочая зарплата и очередь действий не меняются.'));
  }

  /** Refresh the visible sports app from the canonical game clock. Rebuild
   * only at fixture/TV availability boundaries; otherwise preserve focus,
   * scroll and the same Canvas2D element. No game-state writes or second clock.
   */
  const sportsKey=model=>model?JSON.stringify([model.seasonId,model.live?.matchId??null,
    model.watch?.tvId??null,model.upcoming[0]?.matchId??null]):null;
  function refreshSportsPhone(){
    if(!opened()||app!=='sports'||document.hidden)return;
    const root=personRoot();if(!root)return;
    const model=sportsPhoneView(root,who);
    if(sportsKey(model)!==sportsSignature){render({preserveScroll:true});return;}
    if(!model)return;
    if(model.live){
      const label=body.querySelector('.sports-phone-live>strong');
      const score=body.querySelector('.sports-phone-score');
      if(label)label.textContent='🔴 ИДЁТ МАТЧ · '+Math.floor(model.live.minute)+"′";
      if(score)score.textContent=model.live.home+' '+model.live.score.join(' : ')+' '+model.live.away;
    }
    refreshMobileBroadcast(model);
  }
  function refreshMobileBroadcast(model){
    if(!opened()||app!=='sports'||sportsTab!=='stream'||!model)return;
    const canvas=body.querySelector('.sports-phone-stream-canvas');
    if(!canvas)return;
    const status=body.querySelector('.sports-phone-stream-status');
    const ctx=canvas.getContext('2d'),frame=model.broadcast;
    if(!ctx){
      if(status)status.textContent='Не удалось открыть изображение эфира';
      return;
    }
    if(!frame){
      ctx.fillStyle='#102923';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle='#f2f5e8';ctx.font='22px sans-serif';ctx.textAlign='center';
      ctx.fillText('Нет матча в эфире',canvas.width/2,canvas.height/2);
      const next=model.upcoming[0];
      if(status)status.textContent=next?'Следующий эфир — '+next.iso+' · '+next.time+
        ' · '+next.home+' — '+next.away+' · игровое время':'Нет матчей в расписании · межсезонье';
      return;
    }
    const minute=Math.floor(frame.minute);
    paintSportsTv(ctx,{...frame,minute},canvas.width,canvas.height);
    if(status)status.textContent='🔴 Прямой игровой эфир · '+minute+"′"+
      ' · '+frame.home.short+' '+frame.score.join(':')+' '+frame.away.short+
      (model.paused?' · игра на паузе':'');
  }
  /** Approved fifth application: pure projection backed by one canonical league. */
  function renderPhoneSports(root){
    const model=sportsPhoneView(root,who);
    sportsSignature=sportsKey(model);
    if(!model){top('⚽ Лига Блин’С пока недоступна');return null;}
    top('⚽ '+NAMES[who]+' · ЛИГА БЛИН’С');
    body.append(element('h2','career-phone-section-title','Блин’С Спорт'));
    const header=element('section','career-phone-facts sports-phone-summary');
    header.append(element('strong',null,'Сезон '+(model.seasonId+1)),
      element('span',null,model.teams.length+' клубов · '+model.rounds+' туров · игровое время'));
    body.append(header);
    const tabs=element('nav','sports-phone-tabs');
    tabs.setAttribute('aria-label','Разделы Блин’С Спорт');
    for(const [id,label] of [['club','Мой клуб'],['matches','Матчи'],['table','Таблица'],['stream','Эфир']]){
      const button=action(label,()=>{sportsTab=id;render();},'sports-phone-tab');
      button.setAttribute('aria-pressed',String(sportsTab===id));
      button.dataset.sportsTab=id;
      if(sportsTab===id)button.classList.add('sports-phone-tab-active');
      tabs.append(button);
    }
    body.append(tabs);
    // The broadcast is the primary content, not buried below TV/club actions.
    if(sportsTab==='stream'){
      const card=element('section','career-phone-card sports-phone-stream');
      card.append(element('strong',null,'📱 Оригинальная трансляция'));
      const canvas=element('canvas','sports-phone-stream-canvas');
      canvas.width=512;canvas.height=312;
      canvas.setAttribute('role','img');
      canvas.setAttribute('aria-label','Поле и текущий счёт игрового матча');
      card.append(canvas,element('p','sports-phone-stream-status','Ожидание игрового эфира'));
      card.append(element('small',null,
        'События и счёт из Лиги Блин’С. Смотреть можно без телевизора; '+
        'просмотр на телефоне не даёт дополнительных бонусов.'));
      body.append(card);
    }
    if(model.live){
      const card=element('section','career-phone-card sports-phone-live');
      card.append(element('strong',null,'🔴 ИДЁТ МАТЧ · '+Math.floor(model.live.minute)+"′"));
      card.append(element('p','sports-phone-score',
        model.live.home+' '+model.live.score.join(' : ')+' '+model.live.away));
      card.append(element('small',null,'Играется по календарю Блин’С, не в реальном времени'));
      if(sportsTab!=='stream')card.append(action('📱 Смотреть на телефоне',()=>{
        sportsTab='stream';render();
      },'career-phone-secondary sports-watch-mobile'));
      if(model.personalSupported){
      const watch=action(model.watch?'📺 Смотреть матч':'Матч в эфире · телевизор недоступен',()=>{
        const live=personRoot();if(!live)return;
        const current=sportsPhoneView(live,who);
        if(!current?.watch){notify('Трансляция закончилась или телевизор недоступен');render();return;}
        const result=onWatchSportsMatch(who,current.watch.tvId);
        notify(result.ok?'📺 Просмотр матча добавлен в очередь':
          'Нельзя запланировать просмотр: проверь работу, очередь и телевизор');
        if(result.ok)close({focus:false});else render();
      },'career-phone-primary sports-watch-match');
      watch.disabled=!model.watch;
      card.append(watch);
      const invite=action('👥 Пригласить смотреть матч вместе',()=>{
        const live=personRoot();if(!live)return;
        const current=sportsPhoneView(live,who);
        if(!current?.watch){notify('Матч или телевизор недоступны');render();return;}
        const result=onInviteSportsMatch(who,current.watch.tvId,current.watch.matchId);
        notify(result.ok?'👥 Совместный просмотр добавлен в очередь':
          'Нельзя пригласить сейчас: проверь работу, действия и телевизор');
        if(result.ok)close({focus:false});else render();
      },'career-phone-secondary sports-watch-together');
      invite.disabled=!model.watch;
      card.append(invite);
      }else card.append(element('small',null,'Доступен просмотр общего игрового эфира.'));
      body.append(card);
    }
    if(model.unread.length){
      const card=element('section','career-phone-card sports-phone-news');
      card.append(element('strong',null,'⚽ Новости любимого клуба · '+model.unread.length));
      const recent=model.unread[0];
      card.append(element('p',null,recent.home+' '+recent.score.join(':')+' '+recent.away));
      card.append(action('Узнать результат',()=>{
        const result=onReadSportsNews(who,recent.matchId);
        const messages={'no-new-match':'Новость уже прочитана',
          'unavailable':'Нельзя читать новости сейчас','save-failed':'Не удалось сохранить реакцию'};
        notify(result.ok?'⚽ '+(result.emotion==='sports.win'?'Победа вдохновляет!':
          result.emotion==='sports.loss'?'Немного досадно проиграть':'Ничья · всё впереди'):
          messages[result.reason]||'Новость недоступна');
        render();
      },'career-phone-primary sports-news-read'));
      body.append(card);
    }
    if(sportsTab==='stream'){
      // Broadcast already inserted above the live-match controls.
    }else if(sportsTab==='club'&&!model.personalSupported){
      const card=element('section','career-phone-card sports-phone-club');
      card.append(element('strong',null,'Мой клуб'),
        element('p',null,'Для этого жителя пока доступны эфир, календарь и таблица. Личное фанатство ещё недоступно.'));
      body.append(card);
    }else if(sportsTab==='club'){
      const card=element('section','career-phone-card sports-phone-club');
      card.append(element('strong',null,'Мой клуб'));
      if(model.crest){
        const badge=element('div','sports-phone-personal-crest');
        badge.style.borderColor=model.crest.color;
        const shield=element('span','sports-phone-crest sports-phone-avatar',model.crest.symbol);
        shield.style.backgroundColor=model.crest.color;
        shield.setAttribute('role','img');
        shield.setAttribute('aria-label','Символ клуба '+model.crest.name);
        badge.append(shield,element('strong',null,NAMES[who]+' · '+model.crest.name));
        card.append(badge);
      }
      card.append(element('p',null,model.favorite
        ?'⚑ '+model.favorite.name+' · интерес к футболу '+model.fanIntensity+'/100'
        :'Клуб не выбран. Алекс и Мира могут поддерживать разные команды.'));
      if(!model.canChangeClub)card.append(element('small',null,
        'Изменить команду можно через '+model.changeCooldown+' игровых мин.'));
      const grid=element('div','sports-phone-clubs');
      for(const team of model.teams){
        const chosen=team.id===model.favoriteTeamId;
        const button=action((chosen?'✓ ':'')+team.name,()=>{
          if(chosen)return;
          const result=onSelectSportsClub(who,team.id);
          notify(result.ok?'⚽ Теперь любимый клуб: '+team.name:
            result.reason==='cooldown'?'Выбор клуба пока на паузе':
            'Выбор команды не сохранился');
          render();
        },'sports-phone-team');
        button.dataset.sportsTeam=team.id;
        button.style.borderLeftColor=team.color;
        const crest=sportsCrest(team.id);
        if(crest){
          const shield=element('span','sports-phone-crest',crest.symbol);
          shield.style.backgroundColor=crest.color;
          shield.setAttribute('aria-hidden','true');
          button.prepend(shield);
        }
        button.disabled=chosen||!model.canChangeClub;
        grid.append(button);
      }
      card.append(grid);
      if(model.sharedMemories.length){
        const past=element('section','sports-phone-shared-memories');
        past.append(element('strong',null,'👥 Совместные просмотры'));
        for(const memory of model.sharedMemories.slice(0,3))
          past.append(element('small',null,'⚽ '+memory.matchTitle+
            ' · вместе '+memory.watchedMinutes+' игровых мин.'));
        card.append(past);
      }
      if(model.nextFavorite){
        const m=model.nextFavorite;
        card.append(element('small',null,
          'Следующая игра клуба: '+m.iso+' · '+m.time+' · '+m.home+' — '+m.away));
      }
      body.append(card);
      if(model.seasonHistory.length){
        const last=model.seasonHistory[0];
        const champion=model.teams.find(t=>t.id===last.championId);
        body.append(element('p','career-phone-muted',
          'Чемпион предыдущего сезона: '+(champion?.name||'—')));
      }
    }else if(sportsTab==='matches'){
      const list=element('section','sports-phone-match-list');
      list.append(element('strong',null,'Ближайшие матчи'));
      if(!model.upcoming.length)list.append(element('small',null,'Межсезонье · новый сезон скоро'));
      for(const match of model.upcoming){
        const card=element('div','sports-phone-match');
        card.append(element('strong',null,match.home+' — '+match.away),
          element('small',null,match.iso+' · '+match.time+' · игровое время'));
        list.append(card);
      }
      list.append(element('strong',null,'Результаты'));
      if(!model.results.length)list.append(element('small',null,'Матчи ещё не завершены'));
      for(const match of model.results){
        const card=element('div','sports-phone-match');
        card.append(element('strong',null,match.home+' '+match.score.join(':')+' '+match.away),
          element('small',null,match.iso+' · завершён'));
        list.append(card);
      }
      body.append(list);
    }else{
      const table=element('section','career-phone-card sports-phone-standings');
      table.append(element('strong',null,'Турнирная таблица'));
      table.append(element('small',null,'И · В · Н · П · разница · очки'));
      for(const team of model.table){
        const row=element('div','sports-phone-table-row');
        row.append(element('span',null,team.place+'. '+team.teamName),
          element('strong',null,team.played+' · '+team.wins+' · '+team.draws+
            ' · '+team.losses+' · '+(team.for-team.against)+' · '+team.points));
        table.append(row);
      }
      body.append(table);
    }
    body.append(element('p','career-phone-muted',
      'Матчи рассчитываются офлайн. Ставок, внешних трансляций и двойных бонусов досуга нет.'));
    return model;
  }

  function render({preserveScroll=false}={}){
    if(!opened())return;
    const root=personRoot();if(!root)return;
    renderPendingNotice(root);
    const oldScroll=body.scrollTop;
    if(root.recruitmentSystem?.byResident?.[who]?.phase==='interview_active')app='work';
    title.textContent=app==='home'?'Главный экран':
      app==='notifications'?'Уведомления':
      app==='calls'?'Звонки · '+NAMES[who]:
      app==='finance'?'Финансы · Семья':
      app==='food'?'Доставка · Блин’С':
      app==='sports'?'Блин’С Спорт':'Работа · '+NAMES[who];
    overlay.setAttribute('aria-label',app==='home'?'Смартфон: главный экран':
      app==='notifications'?'Смартфон: уведомления':
      app==='calls'?'Смартфон: звонки':
      app==='finance'?'Смартфон: финансы семьи':
      app==='food'?'Смартфон: доставка готовой еды':
      app==='sports'?'Смартфон: Блин’С Спорт':'Смартфон: работа Блин’С');
    appTabs.hidden=app==='home'||app==='calls'||app==='sports'||app==='notifications';
    routeBar.hidden=app==='home';
    for(const b of appTabs.querySelectorAll('button')){
      const selected=b.dataset.app===app;
      b.textContent=b.dataset.app==='finance'?'Финансы · Семья':
        b.dataset.app==='food'?'🛵 Доставка':'Работа · '+NAMES[who];
      b.setAttribute('aria-pressed',String(selected));
      b.classList.toggle('career-phone-app-active',selected);
    }
    if(app==='home'){
      renderPhoneHome(root);body.scrollTop=0;return;
    }
    if(app==='notifications'){
      renderNotifications(root);body.scrollTop=preserveScroll?oldScroll:0;return;
    }
    if(app==='calls'){
      renderPhoneCalls(root);body.scrollTop=preserveScroll?oldScroll:0;return;
    }
    if(app==='sports'){
      const model=renderPhoneSports(root);body.scrollTop=preserveScroll?oldScroll:0;
      refreshMobileBroadcast(model);return;
    }
    if(app==='finance'){
      financeUI.render(root);
      body.scrollTop=preserveScroll?oldScroll:0;
      return;
    }
    if(app==='food'){
      renderReadyFood(root);
      body.scrollTop=preserveScroll?oldScroll:0;
      return;
    }
    if(section==='map'&&root.careerSystem?.byResident?.[who])renderMap(root);
    else if(section==='worklog')renderWorklog(root);
    else if(section==='history')renderHistory(root);
    else if(section==='applications')renderApplications(root);
    else if(root.careerSystem?.byResident?.[who])renderEmployed(root);
    else if(view==='details'||view==='contract')renderOffer(root);
    else renderList(root);
    const nav=element('nav','career-phone-tabs');
    nav.setAttribute('aria-label','Разделы смартфона');
    const unread=Boolean(root.recruitmentSystem?.byResident?.[who]?.unread);
    const hasContract=!!root.careerSystem?.byResident?.[who];
    if(hasContract)nav.classList.add('career-phone-tabs-map');
    const sections=[['vacancies',hasContract?'Моя работа':'Вакансии'],
      ['applications','Мои отклики'],['history','История']];
    if(hasContract)sections.push(['map','Карта']);
    for(const [id,label] of sections){
      const button=action(label+(id==='applications'&&unread?' ●':''),()=>{
        section=id;historyId=null;if(id==='vacancies')view='list';render();
      },'career-phone-tab'+(section===id?' career-phone-tab-active':'')+
        (id==='map'?' career-phone-map-tab':''));
      button.setAttribute('aria-pressed',String(section===id));
      if(id==='applications'&&unread)button.setAttribute('aria-label','Мои отклики: непрочитанный ответ');
      nav.append(button);
    }
    body.insertBefore(nav,body.children[1]??null);
    body.scrollTop=preserveScroll?oldScroll:0;
  }
  function open(target='work'){
    if(opened()){
      if(target==='home'){app='home';render();return;}
      if(phoneAppRoute(target)!==app){app=phoneAppRoute(target);render();return;}
      close();return;
    }
    if(!canOpen()){notify('Сначала заверши текущий режим или обязательный диалог');return;}
    const root=getRoot();
    const selected=getSelectedResident(root);
    if(!NAMES[selected]||!residentIdsForSimulation(root).includes(selected))return;
    beforeOpen();
    who=selected;
    app=phoneAppRoute(target);
    // Restore the same resident's screen on close/open. A live recruitment
    // interview must still use its canonical application view on first open.
    const remembered=contexts[who];
    const defaultSection=!root.careerSystem?.byResident?.[who]&&
      root.recruitmentSystem?.byResident?.[who]?'applications':'vacancies';
    section=remembered?.section??defaultSection;
    view=remembered?.view??'list';chosen=remembered?.chosen??null;
    historyId=remembered?.historyId??null;
    lastFocus=document.activeElement;
    overlay.hidden=false;trigger.setAttribute('aria-expanded','true');
    financeTrigger?.setAttribute('aria-expanded','true');
    render();
    if(streamInterval===null)streamInterval=setInterval(refreshSportsPhone,400);
    if(remembered)body.scrollTop=remembered.scrollTop??0;
    onOpenChange(who);closeButton.focus({preventScroll:true});
  }
  function openIncident(residentId){
    if(!pendingWorkIncident(getRoot(),residentId))return false;
    if(!canOpen()){
      notify('Сначала заверши текущий редактор или обязательный диалог');
      return false;
    }
    const root=getRoot();
    if(getSelectedResident(root)!==residentId&&!selectResident(residentId))return false;
    if(opened()){
      if(who!==residentId&&who)
        contexts[who]={section,view,chosen,historyId,scrollTop:body.scrollTop};
      who=residentId;
      onOpenChange(who);
    }else{
      open('work');
    }
    if(!opened()||getSelectedResident(getRoot())!==residentId)return false;
    app='work';section='vacancies';view='list';chosen=null;historyId=null;
    render();
    const heading=body.querySelector('#career-pending-incident-title');
    if(!heading)return false;
    heading.scrollIntoView({block:'start'});
    heading.focus({preventScroll:true});
    return true;
  }
  trigger.addEventListener('click',()=>open('home'));
  financeTrigger?.addEventListener('click',()=>open('finance'));
  return {open:()=>open('home'),openWork:()=>open('work'),
    openFinance:()=>open('finance'),openIncident,close,
    refreshNotifications:()=>{if(opened()&&(app==='home'||app==='notifications'))render({preserveScroll:true});},
    refresh:()=>render({preserveScroll:true}),isOpen:opened,
    interviewNeedsDecision:()=>opened()&&
      getRoot()?.recruitmentSystem?.byResident?.[who]?.phase==='interview_active'};
}
