/** W1-B.3a: canonical game-minute rabbit-hole attendance and idempotent payroll.
 * This module is pure gameplay data: no renderer, browser time, or DOM.
 * The household root owns the sole clock and authoritative shop credits.
 */
import {nextCareerShift} from './career-scheduler.js';
import {CAREER_RESIDENT_IDS} from './career-state.js';
import {SHOP_MAX_CREDITS} from './furniture-shop.js';
import {recordFinanceChange} from './finance-ledger.js';
import {careerReadiness,recordCompletedCareerShift,recordMissedCareerShift,promotionReadiness} from './career-progression.js';
import {startWorkIncident,automaticWorkIncident} from './career-incidents.js';
import {recordProfessionalShift} from './career-goals.js';
import {creditCareerPaidLeave,careerTimeOffForShift,settleCareerTimeOff} from './career-timeoff.js';
import {WORK_MODES,cleanWorkMode,newWorkNeeds,progressWorkNeeds,workNeedsReport} from './career-work-needs.js';

const NAMES={alex:'Алекс',mira:'Мира'};
const ACTIVE=new Set(['departing','working','returning']);
const CASH_LIMIT=SHOP_MAX_CREDITS;
const validMinute=n=>Number.isFinite(n)&&n>=0;
const actorFor=(root,id)=>id==='mira'?root?.otherSim:root;

export function residentWorkPhase(root,id){
  return root?.careerSystem?.byResident?.[id]?.currentShift?.phase||null;
}
export function residentUnavailableForHome(root,id){
  return ACTIVE.has(residentWorkPhase(root,id));
}
export function residentAwayAtWork(root,id){
  return ['working','returning'].includes(residentWorkPhase(root,id));
}
function shiftSnapshot(shift,mode='normal'){
  return {id:shift.id,employmentId:shift.employmentId,careerId:shift.careerId,
    start:shift.start,end:shift.end,hourlyCredits:shift.hourlyCredits,
    phase:'pending',warn60:false,warn15:false,departedAt:null,readiness:null,
    workMode:cleanWorkMode(mode)};
}
function emit(messages,id,type,text){
  messages.push({residentId:id,type,text:NAMES[id]+': '+text});
}
function finalizeMissed(contract,at){
  const shift=contract.currentShift;
  const result=recordMissedCareerShift(contract);
  contract.lastShift={id:shift.id,start:shift.start,end:shift.end,
    outcome:'missed',salary:0,workedMinutes:0,lateMinutes:0,finishedAt:at,
    grade:result.grade,performanceDelta:result.delta};
  contract.currentShift=null;
}
function settle(root,contract,id,at){
  const shift=contract.currentShift;
  const ledger=root.careerSystem.settlementIds;
  const already=ledger.includes(shift.id);
  const worked=Math.max(0,Math.min(shift.end,at)-Math.max(shift.start,shift.departedAt));
  const gross=Math.max(0,Math.round(worked*shift.hourlyCredits/60));
  // Never mint a second payment for the same immutable employment/day/shift ID.
  const salary=already?0:Math.min(gross,Math.max(0,CASH_LIMIT-root.shop.credits));
  const lateMinutes=Math.max(0,Math.round(shift.departedAt-shift.start));
  let result=null;
  let badges=[];
  if(!already){
    const payment=recordFinanceChange(root,
      {...root.shop,credits:root.shop.credits+salary},
      {kind:'salary',sourceId:shift.id,actorId:id,atGameMinute:at,
        receiptId:'salary:'+shift.id});
    if(!payment.ok)return {salary:0,result:null,badges:[],failed:true};
    root.shop=payment.shop;
    root.financialHistory=payment.financialHistory;
    ledger.push(shift.id);
    if(ledger.length>256)ledger.splice(0,ledger.length-256);
    // Salary, performance, fatigue and receipt belong to ONE saved snapshot.
    result=recordCompletedCareerShift(contract,actorFor(root,id),shift,worked,lateMinutes);
    creditCareerPaidLeave(contract);
    badges=recordProfessionalShift(root,id,shift);
  }
  contract.lastShift={id:shift.id,start:shift.start,end:shift.end,
    workMode:cleanWorkMode(shift.workMode),workReport:workNeedsReport(shift),
    outcome:'worked',salary:already?0:salary,
    workedMinutes:Math.round(worked),lateMinutes,finishedAt:at,
    grade:result?.grade??null,performanceDelta:result?.delta??null,
    incident:shift.incident?.choiceId?{
      scenarioId:shift.incident.scenarioId||'legacy',choiceId:shift.incident.choiceId,
      auto:shift.incident.auto,performanceDelta:shift.incident.performanceDelta}:null};
  shift.phase='returning';
  return {salary,result,badges};
}
/** One canonical sweep. Call just once per active household tick BEFORE ticking
 * individual actors; after this, root.minutes and otherSim.minutes advance once.
 * Every returned transition is persisted by the game loop in the same save.
 */
export function progressCareerWork(root,before,after){
  if(!root||root.paused||!validMinute(before)||!validMinute(after)||
     after<=before||!root.calendar||!root.careerSystem||!root.shop)return [];
  const messages=[];
  for(const id of CAREER_RESIDENT_IDS){
    const contract=root.careerSystem.byResident?.[id];
    const actor=actorFor(root,id);
    if(!contract||!actor)continue;
    for(const leave of settleCareerTimeOff(root,id,after))
      emit(messages,id,leave.type,leave.text);
    let shift=contract.currentShift;
    if(!shift){
      const planned=nextCareerShift(root.calendar,contract,Math.max(0,before-.001));
      if(!planned||careerTimeOffForShift(contract,planned.id)||
        after<planned.start-60||contract.lastShift?.id===planned.id||
        root.careerSystem.settlementIds.includes(planned.id))continue;
      shift=contract.currentShift=shiftSnapshot(planned,contract.workMode);
    }
    if(shift.phase==='returning')continue;
    if(shift.phase==='working'){
      if(startWorkIncident(root,id,after)&&after<shift.end)
        emit(messages,id,'incident','новая ситуация на работе · открой смартфон, чтобы выбрать решение');
      if(after>=shift.end){
        automaticWorkIncident(root,id);
        const {salary,result,badges,failed}=settle(root,contract,id,shift.end);
        if(failed)continue; // Never mark a shift paid without an atomic wallet receipt.
        const growth=result?' · '+result.grade+' · результативность '+contract.performance+'/100':'';
        const ready=promotionReadiness(root,id);
        actor.event='Смена завершена · заработано '+salary+' кр.'+growth;
        emit(messages,id,'salary','смена окончена, начислено '+salary+' кр.'+growth+
          (ready?.ready?' · условия повышения выполнены':'')+
          (badges.length?' · достижение: '+badges.join(', '):'')+'. Возвращается домой');
      }
      continue;
    }
    if(shift.phase==='pending'){
      if(!shift.warn60&&after>=shift.start-60&&after<shift.start){
        shift.warn60=true;
        emit(messages,id,'reminder','до смены около часа');
      }
      if(!shift.warn15&&after>=shift.start-15&&after<shift.start){
        shift.warn15=true;
        emit(messages,id,'reminder','через 15 минут работа · можно отправиться раньше или пропустить');
      }
    }
    if(after>=shift.end){
      finalizeMissed(contract,shift.end);
      emit(messages,id,'missed','смена пропущена, зарплата 0 кр.');
      continue;
    }
    // Waiting for an active MANUAL action is deliberate; never silently delete
    // player FIFO instructions. Automatic tasks can be interrupted for work.
    if(shift.phase==='pending'&&after>=shift.start){
      if(actor.action?.automatic){
        actor.action=null;actor.activitySession=null;
      }
      if(!actor.action&&!root.socialAction){
        shift.phase='departing';
        actor.event='Собирается на работу';
        emit(messages,id,'depart','выходит на работу');
      }else if(before<shift.start){
        emit(messages,id,'late','рабочая смена началась, заверши домашнее действие, чтобы выйти');
      }
    }
  }
  return messages;
}
/** Explicit departure is usable up to 15 game minutes before scheduled start. */
export function requestCareerDeparture(root,id,at=root?.minutes){
  const contract=root?.careerSystem?.byResident?.[id],shift=contract?.currentShift;
  const actor=actorFor(root,id);
  if(!shift||shift.phase!=='pending'||!validMinute(at)||
    at<shift.start-15||at>=shift.end||!actor||actor.action||root.socialAction)
    return {ok:false,reason:'Сначала заверши текущее действие или дождись начала смены'};
  shift.phase='departing';
  actor.event='Идёт к выходу на работу';
  return {ok:true};
}
export function arriveCareerPortal(root,id,at=root?.minutes){
  const shift=root?.careerSystem?.byResident?.[id]?.currentShift;
  if(!shift||shift.phase!=='departing'||!validMinute(at))return false;
  if(at>=shift.end)return false;
  shift.departedAt=Math.max(shift.start,at);
  const actor=actorFor(root,id);
  shift.readiness=careerReadiness(actor);
  shift.phase='working';
  shift.workMode=cleanWorkMode(shift.workMode);
  shift.workNeeds=newWorkNeeds(shift.departedAt);
  if(actor){actor.action=null;actor.activitySession=null;actor.event='На работе до '+clockAt(shift.end);}
  return true;
}
/** Selecting an option never grants an immediate need, skill or performance reward.
 * A running shift changes prospectively; its completed minute accounting is immutable.
 */
export function selectCareerWorkMode(root,id,mode){
  if(!Object.hasOwn(WORK_MODES,mode))return {ok:false,reason:'Неизвестный режим работы'};
  const contract=root?.careerSystem?.byResident?.[id];
  if(!contract)return {ok:false,reason:'Нет трудового договора'};
  const shift=contract.currentShift;
  if(shift?.phase==='working'){
    progressWorkNeeds(root,root.minutes,root.minutes);
    shift.workMode=mode;
  }else if(shift?.phase==='returning'){
    return {ok:false,reason:'Дождись возвращения домой'};
  }else if(shift?.phase==='departing'){
    return {ok:false,reason:'Смена уже начинается'};
  }else if(shift?.phase==='pending')shift.workMode=mode;
  contract.workMode=mode;
  return {ok:true};
}
export function finishCareerReturn(root,id){
  const contract=root?.careerSystem?.byResident?.[id];
  if(contract?.currentShift?.phase!=='returning')return false;
  contract.currentShift=null;
  const actor=actorFor(root,id);
  if(actor){actor.action=null;actor.event='Вернулся домой с работы';}
  return true;
}
export function skipCareerShift(root,id){
  const contract=root?.careerSystem?.byResident?.[id],shift=contract?.currentShift;
  if(!shift||!['pending','departing'].includes(shift.phase))return false;
  finalizeMissed(contract,root.minutes);
  const actor=actorFor(root,id);
  if(actor)actor.event='Остался дома · смена пропущена';
  return true;
}
export function canResignNow(root,id){
  return !residentUnavailableForHome(root,id);
}
export function clockAt(minute){
  if(!validMinute(minute))return '—';
  return String(Math.floor(minute/60)%24).padStart(2,'0')+':'+
    String(Math.floor(minute)%60).padStart(2,'0');
}
export function residentWorkStatus(root,id){
  const contract=root?.careerSystem?.byResident?.[id];
  if(!contract)return null;
  const shift=contract.currentShift,at=root.minutes;
  if(shift?.phase==='working'){
    const earned=Math.round(Math.max(0,Math.min(at,shift.end)-shift.departedAt)*
      shift.hourlyCredits/60);
    return {phase:'working',label:'На работе · '+WORK_MODES[cleanWorkMode(shift.workMode)].label+' · до '+clockAt(shift.end)+' · заработано '+earned+' кр.',
      end:shift.end,earned};
  }
  if(shift?.phase==='departing')
    return {phase:'departing',label:'Идёт к выходу · смена до '+clockAt(shift.end),end:shift.end};
  if(shift?.phase==='returning')
    return {phase:'returning',label:'Возвращается домой · смена окончена',end:shift.end};
  if(shift?.phase==='pending')
    return {phase:'pending',label:'Смена '+clockAt(shift.start)+'–'+clockAt(shift.end)+
      (at>=shift.start?' · опаздывает':' · скоро') ,end:shift.end};
  const planned=nextCareerShift(root.calendar,contract,Math.max(0,at));
  const leave=planned&&careerTimeOffForShift(contract,planned.id);
  return {phase:'idle',label:leave?
    (leave.type==='paid'?'Оплачиваемый отпуск':'Отгул')+' · '+clockAt(leave.start)+'–'+clockAt(leave.end):
    'Ожидает: '+(planned
    ?planned.iso+' '+clockAt(planned.start)+'–'+clockAt(planned.end):'не назначена'),
    end:planned?.end??null};
}
