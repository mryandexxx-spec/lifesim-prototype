/** W1-B.2a — accessible touch-first in-game smartphone and authentic job feed.
 * It is presentation only: game state changes solely through explicit contract actions.
 */
import {careerVacancies,leaveCareer,describeCareerShift} from './career-job-board.js';
import {careerDefinition} from './career-catalog.js';
import {nextCareerShift} from './career-scheduler.js';
import {promotionReadiness,promoteCareer} from './career-progression.js';
import {residentWorkStatus,requestCareerDeparture,skipCareerShift,clockAt} from './career-work.js';
import {calendarAt} from './calendar-core.js';
import {WORK_INCIDENTS,decideWorkIncident,workIncidentChoiceDescription} from './career-incidents.js';
import {RECRUITMENT_CAREERS,INTERVIEW_QUESTIONS_BY_CAREER,CAREER_SKILL_LABELS,submitCareerApplication,
  startCareerInterview,answerCareerInterview,markRecruitmentRead,
  finishRecruitmentApplication,interviewScore,recruitmentRetry} from './career-recruitment.js';

const NAMES={alex:'Алекс',mira:'Мира'};
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
export function createCareerPhoneUI({host,trigger,getRoot,setCareerSystem,
  save,notify,onOpenChange=()=>{},beforeOpen=()=>{},canOpen=()=>true}){
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
  const kicker=element('span','career-phone-kicker','СМАРТФОН · БЛИН’С');
  const title=element('strong','career-phone-title','Работа Блин’С');
  title.id='career-phone-title';
  heading.append(kicker,title);
  const closeButton=action('×',()=>close(),'career-phone-x');
  closeButton.setAttribute('aria-label','Закрыть смартфон');
  header.append(heading,closeButton);
  const body=element('div','career-phone-body');
  frame.append(header,body);overlay.append(shade,frame);host.append(overlay);
  let who=null,view='list',chosen=null,lastFocus=null,lastInterviewFeedback='';
  let section='vacancies',historyId=null;
  const contexts={alex:null,mira:null};
  const opened=()=>!overlay.hidden;
  function close({focus=true}={}){
    if(!opened())return;
    overlay.hidden=true;trigger.setAttribute('aria-expanded','false');
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
    if(!root||root.selectedSim!==who){close({focus:false});return null;}
    return root;
  }
  function top(text){
    body.replaceChildren();
    body.append(element('p','career-phone-person',text));
  }
  function renderEmployed(root){
    const current=root.careerSystem?.byResident?.[who];
    const career=careerDefinition(current?.careerId);
    if(!career)return;
    top('💼 '+NAMES[who]+' · трудовой договор');
    body.append(element('h2','career-phone-section-title',career.title));
    body.append(element('p','career-phone-muted',career.ranks[current.level]?.title||'Должность'));
    const shift=nextCareerShift(root.calendar,current,root.minutes);
    const status=residentWorkStatus(root,who);
    const active=current.currentShift;
    const facts=element('div','career-phone-facts');
    facts.append(element('span',null,'Ставка: '+career.ranks[current.level]?.hourlyCredits+' кр./час'));
    facts.append(element('span',null,'Следующая смена: '+describeCareerShift(shift)));
    facts.append(element('span',null,'Статус: '+status.label));
    facts.append(element('span',null,'Баланс семьи: '+root.shop.credits+' кр.'));
    facts.append(element('span',null,'Результативность: '+current.performance+'/100'));
    facts.append(element('span',null,'Отработано смен: '+(current.workedShifts||0)+
      ' · на должности: '+(current.rankShifts||0)));
    facts.append(element('span',null,'Опозданий: '+(current.lateShifts||0)+
      ' · пропусков: '+(current.missedShifts||0)));
    if(current.lastShift?.incident){
      const outcome=WORK_INCIDENTS[current.careerId]?.options.find(
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

    body.append(facts);
    // Work events stay within the existing job screen, even after reload.
    const incident=active?.incident,scenario=WORK_INCIDENTS[current.careerId];
    if(active?.phase==='working'&&incident&&scenario){
      body.append(element('h3','career-phone-section-title','📩 Ситуация на смене'));
      body.append(element('p','career-phone-notice',scenario.title+' · '+scenario.text));
      if(incident.choiceId===null){
        body.append(element('p','career-phone-muted',
          'Можно закрыть смартфон и вернуться. Если смена закончится, персонаж решит сам.'));
        for(const option of scenario.options){
          const button=action(option.text,()=>{
            const live=personRoot();if(!live)return;
            const result=decideWorkIncident(live,who,option.id);
            if(!result.ok){notify(result.reason);render();return;}
            save(true);notify(NAMES[who]+': '+result.feedback);render();
          },'career-phone-secondary career-work-option');
          button.append(element('small','career-work-option-effect',
            workIncidentChoiceDescription(root,who,option)));
          body.append(button);
        }
      }else{
        const chosen=scenario.options.find(o=>o.id===incident.choiceId);
        body.append(element('p','career-phone-notice',
          (incident.auto?'Решил самостоятельно: ':'Твой выбор: ')+(chosen?.text||'')+
          ' · '+(chosen?.feedback||'')+' · рейтинг '+
          (incident.performanceDelta>=0?'+':'')+incident.performanceDelta));
      }
    }
    const growth=promotionReadiness(root,who);
    if(growth?.maxLevel){
      body.append(element('p','career-phone-notice','Высшая должность этой карьерной ветки достигнута.'));
    }else if(growth){
      body.append(element('h3','career-phone-section-title','Повышение: '+growth.rank));
      const requirements=element('div','career-phone-facts');
      for(const req of growth.requirements){
        requirements.append(element('span',null,(req.met?'✓ ':'○ ')+(req.label==='Результативность'?'Рейтинг для повышения':req.label)+
          ': '+req.current+' / '+req.target));
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
          'Выполняй реальные смены и развивай навыки дома, чтобы открыть следующую должность.'));
      }
    }
    if(active?.phase==='pending'&&root.minutes>=active.start-15){
      body.append(action('Отправиться на работу',()=>{
        const live=personRoot();if(!live)return;
        const result=requestCareerDeparture(live,who,live.minutes);
        if(!result.ok){notify(result.reason);return;}
        save(true);notify(NAMES[who]+' идёт к выходу');render();
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
      'Стартовая должность: '+offer.rank,
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
  function renderList(root){
    top('📱 '+NAMES[who]+' · открытые вакансии');
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
  function render({preserveScroll=false}={}){
    if(!opened())return;
    const root=personRoot();if(!root)return;
    const oldScroll=body.scrollTop;
    if(section==='history')renderHistory(root);
    else if(section==='applications')renderApplications(root);
    else if(root.careerSystem?.byResident?.[who])renderEmployed(root);
    else if(view==='details'||view==='contract')renderOffer(root);
    else renderList(root);
    const nav=element('nav','career-phone-tabs');
    nav.setAttribute('aria-label','Разделы смартфона');
    const unread=Boolean(root.recruitmentSystem?.byResident?.[who]?.unread);
    for(const [id,label] of [['vacancies','Вакансии'],['applications','Мои отклики'],['history','История']]){
      const button=action(label+(id==='applications'&&unread?' ●':''),()=>{
        section=id;historyId=null;if(id==='vacancies')view='list';render();
      },'career-phone-tab'+(section===id?' career-phone-tab-active':''));
      button.setAttribute('aria-pressed',String(section===id));
      if(id==='applications'&&unread)button.setAttribute('aria-label','Мои отклики: непрочитанный ответ');
      nav.append(button);
    }
    body.insertBefore(nav,body.children[1]??null);
    body.scrollTop=preserveScroll?oldScroll:0;
  }
  function open(){
    if(opened()){close();return;}
    if(!canOpen()){notify('Сначала заверши текущий режим или обязательный диалог');return;}
    const root=getRoot();
    if(!NAMES[root?.selectedSim])return;
    beforeOpen();
    who=root.selectedSim;
    const remembered=contexts[who];
    section=remembered?.section||(root.recruitmentSystem?.byResident?.[who]?'applications':'vacancies');
    view=remembered?.view||'list';chosen=remembered?.chosen??null;
    historyId=remembered?.historyId??null;
    lastFocus=document.activeElement;
    overlay.hidden=false;trigger.setAttribute('aria-expanded','true');
    render();if(remembered)body.scrollTop=remembered.scrollTop||0;
    onOpenChange(who);closeButton.focus({preventScroll:true});
  }
  trigger.addEventListener('click',open);
  return {open,close,refresh:()=>render({preserveScroll:true}),isOpen:opened,
    interviewNeedsDecision:()=>opened()&&
      getRoot()?.recruitmentSystem?.byResident?.[who]?.phase==='interview_active'};
}
