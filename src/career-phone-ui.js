/** W1-B.2a — accessible touch-first in-game smartphone and authentic job feed.
 * It is presentation only: game state changes solely through explicit contract actions.
 */
import {careerVacancies,acceptCareerOffer,leaveCareer,describeCareerShift} from './career-job-board.js';
import {careerDefinition} from './career-catalog.js';
import {nextCareerShift} from './career-scheduler.js';
import {promotionReadiness,promoteCareer} from './career-progression.js';
import {residentWorkStatus,requestCareerDeparture,skipCareerShift,clockAt} from './career-work.js';

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
  let who=null,view='list',chosen=null,lastFocus=null;
  const opened=()=>!overlay.hidden;
  function close({focus=true}={}){
    if(!opened())return;
    overlay.hidden=true;trigger.setAttribute('aria-expanded','false');
    onOpenChange(null);
    who=null;view='list';chosen=null;
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
    if(current.lastShift)facts.append(element('span',null,'Прошлая смена: '+
      (current.lastShift.outcome==='worked'?'отработано':'пропущено')+
      ' · +'+current.lastShift.salary+' кр.'+
      (current.lastShift.grade?' · '+current.lastShift.grade:'')+
      (Number.isInteger(current.lastShift.performanceDelta)?
        ' · результат '+(current.lastShift.performanceDelta>=0?'+':'')+
          current.lastShift.performanceDelta:'')+
      (current.lastShift.lateMinutes?' · опоздание '+current.lastShift.lateMinutes+' мин.':'')));
    body.append(facts);
    const growth=promotionReadiness(root,who);
    if(growth?.maxLevel){
      body.append(element('p','career-phone-notice','Высшая должность этой карьерной ветки достигнута.'));
    }else if(growth){
      body.append(element('h3','career-phone-section-title','Повышение: '+growth.rank));
      const requirements=element('div','career-phone-facts');
      for(const req of growth.requirements){
        requirements.append(element('span',null,(req.met?'✓ ':'○ ')+req.label+
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
    if(view==='contract'){
      body.append(element('p','career-phone-notice',
        'Подписание закрепит эту работу за '+NAMES[who]+'. Первая смена рассчитана по игровому календарю. Зарплата начисляется в конце фактически отработанной смены.'));
      body.append(action('Подписать договор',()=>{
        const live=personRoot();if(!live)return;
        const result=acceptCareerOffer(live,who,chosen);
        if(!result.ok){notify(result.reason);render();return;}
        setCareerSystem(result.careerSystem);
        save(true);
        notify(NAMES[who]+': работа оформлена · '+offer.title);
        view='list';chosen=null;render();
      },'career-phone-primary'));
    }else{
      body.append(action('Получить предложение',()=>{view='contract';render();},'career-phone-primary'));
    }
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
      card.setAttribute('aria-label','Вакансия '+offer.title+', '+offer.rank+', '+offer.hourlyCredits+' кредитов в час');
      list.append(card);
    }
    body.append(list);
  }
  function render(){
    if(!opened())return;
    const root=personRoot();if(!root)return;
    if(root.careerSystem?.byResident?.[who])renderEmployed(root);
    else if(view==='details'||view==='contract')renderOffer(root);
    else renderList(root);
    body.scrollTop=0;
  }
  function open(){
    if(opened()){close();return;}
    if(!canOpen()){notify('Сначала заверши текущий режим или обязательный диалог');return;}
    const root=getRoot();
    if(!NAMES[root?.selectedSim])return;
    beforeOpen();
    who=root.selectedSim;view='list';chosen=null;
    lastFocus=document.activeElement;
    overlay.hidden=false;trigger.setAttribute('aria-expanded','true');
    render();onOpenChange(who);closeButton.focus({preventScroll:true});
  }
  trigger.addEventListener('click',open);
  return {open,close,refresh:render,isOpen:opened};
}
