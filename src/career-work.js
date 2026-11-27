/** W1-B.3a: canonical game-minute rabbit-hole attendance and idempotent payroll.
 * This module is pure gameplay data: no renderer, browser time, or DOM.
 * The household root owns the sole clock and authoritative shop credits.
 */
import {nextCareerShift} from './career-scheduler.js';
import {recordTaskOutcome} from './recurring-tasks.js';
import {CAREER_RESIDENT_IDS,separateCareer} from './career-state.js';
import {residentIdsForSimulation,savedAdditionalActor} from './resident-activity-runtime.js';
import {recordCareerDiscipline,DISCIPLINE_REHIRE_MINUTES} from './career-discipline.js';
import {recordWorkLifeShift,recordWorkFeeling,applyWorkMoodContext,noteWorkLifeConflict} from './career-worklife.js';
import {careerRankForContract} from './career-specializations.js';
import {SHOP_MAX_CREDITS} from './furniture-shop.js';
import {recordFinanceChange} from './finance-ledger.js';
import {careerReadiness,recordCompletedCareerShift,recordMissedCareerShift,promotionReadiness} from './career-progression.js';
import {advanceWorkIncident,automaticWorkIncident,recordIncidentOpportunity} from './career-incidents.js';
import {recordProfessionalShift} from './career-goals.js';
import {creditCareerPaidLeave,careerTimeOffForShift,settleCareerTimeOff} from './career-timeoff.js';
import {WORK_MODES,cleanWorkMode,newWorkNeeds,progressWorkNeeds,workNeedsReport} from './career-work-needs.js';
import {nearestWalkable,findPath} from './navigation.js';
import {enqueueAction,pendingActions,removeQueuedAction} from './action-queue.js';

const NAMES={alex:'Алекс',mira:'Мира'};
const ACTIVE=new Set(['departing','waiting','working','returning']);
const CASH_LIMIT=SHOP_MAX_CREDITS;
const validMinute=n=>Number.isFinite(n)&&n>=0;
const actorFor=(root,id)=>id==='alex'?root:id==='mira'?root?.otherSim:savedAdditionalActor(root,id);
const isExtra=id=>!CAREER_RESIDENT_IDS.includes(id);

export function residentWorkPhase(root,id){
  return root?.careerSystem?.byResident?.[id]?.currentShift?.phase||null;
}
export function residentUnavailableForHome(root,id){
  return ACTIVE.has(residentWorkPhase(root,id));
}
/** PF-11: work is a terminal invalidation for a pending conversation, not a
 * temporary resource wait. Preserve unrelated tasks and their sequence IDs. */
export function socialCommandBlockedByWork(root,id,command){
  return ['social','conversation','branch'].includes(command?.type)&&
    (residentUnavailableForHome(root,id)||residentUnavailableForHome(root,command.targetId));
}
export function cancelUnavailableSocialCommands(root){
  const messages=[];
  for(const id of Object.keys(root?.actionQueues?.byResident||{})){
    let count=0;
    for(const task of [...pendingActions(root.actionQueues,id)]){
      if(socialCommandBlockedByWork(root,id,task)&&
        removeQueuedAction(root.actionQueues,id,task.seq))count++;
    }
    if(count){
      const actor=actorFor(root,id);
      const message='Общение отменено: участник на работе или в дороге ('+count+')';
      if(actor&&!actor.action&&!residentUnavailableForHome(root,id)&&
        !root.socialAction&&![root.additionalSocial?.initiator,root.additionalSocial?.partner].includes(id))
        actor.event=message;
      messages.push({type:'social-canceled',residentId:id,count,
        text:(NAMES[id]||root.population?.residentsById?.[id]?.identity?.firstName||id)+': '+message});
    }
  }
  return messages;
}
export function residentAwayAtWork(root,id){
  return ['waiting','working','returning'].includes(residentWorkPhase(root,id));
}
/** Only the single household clock determines travel time. The route estimate
 * uses the same pure A* and 1.65 metres/s walking pace as game.js at 1x.
 * One screen second = three game minutes; keep 15 min of arrival buffer.
 */
export function careerDepartureLeadMinutes(root,id){
  if(!CAREER_RESIDENT_IDS.includes(id))return 60;
  const actor=actorFor(root,id);
  if(!actor?.position||!root?.world)return 60;
  const target=nearestWalkable({x:-.65,z:3.45},root.world);
  const points=findPath(actor.position,target,root.world);
  if(!Array.isArray(points))return 60;
  let distance=0,previous=actor.position;
  for(const point of points){
    distance+=Math.hypot(point.x-previous.x,point.z-previous.z);
    previous=point;
  }
  return Math.max(20,Math.min(60,Math.ceil(distance*3/1.65+15)));
}
/** Never erase an accepted manual task when a shift is due. Only ordinary,
 * replayable, non-atomic household tasks can move to the original FIFO tail.
 * Uninterruptible conversations, cooking and mandatory choices may be late.
 */
function deferOrdinaryWorkAction(root,id,actor){
  const a=actor.action;
  if(!a||a.automatic)return true;
  let request=null;
  if(['bed','sofa','seat','tv','fridge','shower','toilet','mirror','dresser','wardrobe','lamp'].includes(a.id)){
    request={type:'object',actionId:a.id,
      ...(a.targetInstanceId?{targetInstanceId:a.targetInstanceId}:{}),
      ...(a.id==='mirror'&&a.mirrorPractice===true?{mirrorPractice:true}:{}),
      ...(a.id==='tv'&&a.tvTalk===true?{tvTalk:true}:{})};
  }else if(['hobby','music','paint'].includes(a.id)&&a.targetInstanceId&&a.activityId){
    request={type:'activity',activityId:a.activityId,contentId:a.contentId,
      targetInstanceId:a.targetInstanceId,
      ...(a.inventoryItemId?{inventoryItemId:a.inventoryItemId}:{})};
  }else if(a.id==='bench'&&a.targetInstanceId){
    request={type:'outdoor',instanceId:a.targetInstanceId};
  }
  if(!request||!root.actionQueues||!enqueueAction(root.actionQueues,id,request))
    return false;
  actor.action=null;
  actor.activitySession=null;
  actor.event='Откладывает домашнее дело до возвращения с работы';
  return true;
}
function enterWorkingPhase(root,id,shift){
  const actor=actorFor(root,id);
  shift.phase='working';
  shift.departedAt=shift.start;
  shift.workMode=cleanWorkMode(shift.workMode);
  shift.workNeeds=newWorkNeeds(shift.start);
  if(actor)actor.event='На работе до '+clockAt(shift.end);
}
function shiftSnapshot(shift,mode='normal'){
  return {id:shift.id,employmentId:shift.employmentId,careerId:shift.careerId,
    start:shift.start,end:shift.end,hourlyCredits:shift.hourlyCredits,
    phase:'pending',warn60:false,warn15:false,departedAt:null,readiness:null,
    workMode:cleanWorkMode(mode)};
}
function emit(messages,id,type,text){
  messages.push({residentId:id,type,text:(NAMES[id]||id)+': '+text});
}
function disciplineNotices(messages,id,outcome){
  if(outcome?.transition==='warning')
    emit(messages,id,'discipline','письменное предупреждение · риск '+outcome.risk+
      '/8. Две хорошие смены снижают риск на 1');
  if(outcome?.transition==='final')
    emit(messages,id,'discipline','последнее предупреждение · риск '+outcome.risk+
      '/12. Следующее серьёзное нарушение грозит увольнением');
}
function finalizeMissed(root,contract,id,at){
  const shift=contract.currentShift;
  const result=recordMissedCareerShift(contract);
  contract.lastShift={id:shift.id,start:shift.start,end:shift.end,
    outcome:'missed',salary:0,workedMinutes:0,lateMinutes:0,finishedAt:at,
    grade:result.grade,performanceDelta:result.delta};
  const discipline=recordCareerDiscipline(contract,shift,'missed',0,at);
  recordWorkLifeShift(root,id,contract,shift,discipline);
  contract.currentShift=null;
  return discipline;
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
  let discipline=null;
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
    recordIncidentOpportunity(contract,shift);
    result=recordCompletedCareerShift(contract,actorFor(root,id),shift,worked,lateMinutes);
    creditCareerPaidLeave(contract);
    badges=recordProfessionalShift(root,id,shift);
    discipline=recordCareerDiscipline(contract,shift,'worked',lateMinutes,at);
    if(worked>0)recordTaskOutcome(root,id,'work','shift:'+shift.id,at);
  }
  contract.lastShift={id:shift.id,start:shift.start,end:shift.end,
    workMode:cleanWorkMode(shift.workMode),workReport:workNeedsReport(shift),
    outcome:'worked',salary:already?0:salary,
    workedMinutes:Math.round(worked),lateMinutes,finishedAt:at,
    grade:result?.grade??null,performanceDelta:result?.delta??null,
    incident:shift.incident?.choiceId?{
      scenarioId:shift.incident.scenarioId||'legacy',choiceId:shift.incident.choiceId,
      auto:shift.incident.auto,performanceDelta:shift.incident.performanceDelta}:null};
  if(!already)recordWorkLifeShift(root,id,contract,shift,discipline);
  shift.phase='returning';
  return {salary,result,badges,discipline};
}
/** One canonical sweep. Call just once per active household tick BEFORE ticking
 * individual actors; after this, root.minutes and otherSim.minutes advance once.
 * Every returned transition is persisted by the game loop in the same save.
 */
export function progressCareerWork(root,before,after){
  if(!root||root.paused||!validMinute(before)||!validMinute(after)||
     after<=before||!root.calendar||!root.careerSystem||!root.shop)return [];
  const messages=cancelUnavailableSocialCommands(root);
  for(const id of residentIdsForSimulation(root)){
    const contract=root.careerSystem.byResident?.[id];
    const actor=actorFor(root,id);
    if(!contract||!actor)continue;
    // The shift result was already emitted and saved on a previous tick.
    // Never delete the contract before the salary/missed summary can be queued.
    if(contract.discipline?.pendingDismissal&&!contract.currentShift){
      const role=careerRankForContract(contract)?.title||'Сотрудник';
      const finished=separateCareer(root.careerSystem,id,'dismissed',Math.floor(before));
      if(finished.ok){
        root.careerSystem=finished.careerSystem;
        recordWorkFeeling(root,id,'worklife.dismissal',before);
        applyWorkMoodContext(root);
        const archived=finished.archived;
        const retryAt=archived.at+DISCIPLINE_REHIRE_MINUTES;
        messages.push({type:'dismissed',residentId:id,
          termination:{...archived,role,retryAt},
          text:(NAMES[id]||id)+': трудовой договор расторгнут из-за повторяющихся нарушений. '+
            'Повторный отклик в эту профессию через 3 игровых дня'});
      }
      continue;
    }
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
    // Extra adults do not yet have 3D portal animations. Their attendance
    // uses the SAME contract, shift ID, payroll and root clock. Recheck manual
    // actions and addressed conversations; neither may be teleported away.
    if(isExtra(id)&&shift.phase==='pending'&&before<shift.end&&
       after>=shift.start-careerDepartureLeadMinutes(root,id)){
      if(actor.action?.automatic){actor.action=null;actor.activitySession=null;}
      else if(actor.action)deferOrdinaryWorkAction(root,id,actor);
      const engaged=[root.additionalSocial?.initiator,root.additionalSocial?.partner].includes(id);
      if(!actor.action&&!engaged&&!root.socialAction){
        shift.phase='departing';
        actor.event='Отправляется на работу';
      }
    }
    if(isExtra(id)&&shift.phase==='departing'){
      const arrival=Math.max(before,Math.min(after,shift.start));
      if(arrival<shift.end)arriveCareerPortal(root,id,arrival);
    }
    if(shift.phase==='waiting'){
      if(after<shift.start)continue;
      enterWorkingPhase(root,id,shift);
      emit(messages,id,'work-start','начал смену вовремя после раннего прибытия');
    }
    if(shift.phase==='returning'){
      // The extra actor has no rendered return path; retain one completed
      // shift snapshot, then release this person's home/FIFO on the next tick.
      if(isExtra(id))finishCareerReturn(root,id);
      continue;
    }
    if(shift.phase==='working'){
      if(isExtra(id))progressWorkNeeds(root,before,after);
      if(advanceWorkIncident(root,id,after))
        emit(messages,id,'incident','новая ситуация на работе · открой смартфон, чтобы выбрать решение');
      if(after>=shift.end){
        automaticWorkIncident(root,id);
        const {salary,result,badges,failed,discipline}=settle(root,contract,id,shift.end);
        if(failed)continue; // Never mark a shift paid without an atomic wallet receipt.
        const growth=result?' · '+result.grade+' · результативность '+contract.performance+'/100':'';
        const ready=promotionReadiness(root,id);
        actor.event='Смена завершена · заработано '+salary+' кр.'+growth;
        emit(messages,id,'salary','смена окончена, начислено '+salary+' кр.'+growth+
          (ready?.ready?' · условия повышения выполнены':'')+
          (badges.length?' · достижение: '+badges.join(', '):'')+'. Возвращается домой');
        disciplineNotices(messages,id,discipline);
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
        if(noteWorkLifeConflict(root,id,after))
          emit(messages,id,'worklife','работа скоро начнётся, а личное занятие ещё идёт · выбор в смартфоне');
        else emit(messages,id,'reminder',
          'через 15 минут работа · можно отправиться раньше или пропустить');
      }
    }
    if(after>=shift.end){
      const discipline=finalizeMissed(root,contract,id,shift.end);
      emit(messages,id,'missed','смена пропущена, зарплата 0 кр.');
      disciplineNotices(messages,id,discipline);
      continue;
    }
    // Approved 1A: leave ahead of time and safely defer ordinary personal
    // actions to the original persistent FIFO. Never cancel an atomic action,
    // a mandatory choice, or an active social session to fake punctuality.
    if(shift.phase==='pending'&&after>=shift.start-careerDepartureLeadMinutes(root,id)){
      if(actor.action?.automatic){
        actor.action=null;actor.activitySession=null;
      }else if(actor.action){
        deferOrdinaryWorkAction(root,id,actor);
      }
      if(!actor.action&&!root.socialAction){
        shift.phase='departing';
        actor.event='Идёт к выходу на работу';
        emit(messages,id,'depart',after<shift.start
          ?'выходит заранее, чтобы успеть к началу смены':'выходит на работу');
      }else if(after>=shift.start&&before<shift.start){
        if(noteWorkLifeConflict(root,id,after))
          emit(messages,id,'worklife','смена началась во время важного действия · выбор в смартфоне');
        else emit(messages,id,'late','смена началась, важное действие ещё выполняется');
      }
    }
  }
  messages.push(...cancelUnavailableSocialCommands(root));
  return messages;
}
/** Manual departure can begin after the T-60 reminder (even earlier than auto departure). */
export function requestCareerDeparture(root,id,at=root?.minutes){
  const contract=root?.careerSystem?.byResident?.[id],shift=contract?.currentShift;
  const actor=actorFor(root,id);
  if(!shift||shift.phase!=='pending'||!validMinute(at)||
    at<shift.start-60||at>=shift.end||!actor||actor.action||root.socialAction||
    [root.additionalSocial?.initiator,root.additionalSocial?.partner].includes(id))
    return {ok:false,reason:'Сначала заверши текущее действие или дождись начала смены'};
  shift.phase='departing';
  actor.event='Идёт к выходу на работу';
  const canceled=cancelUnavailableSocialCommands(root);
  return {ok:true,...(canceled.length?{canceledSocial:canceled.reduce((n,item)=>n+item.count,0)}:{})};
}
export function arriveCareerPortal(root,id,at=root?.minutes){
  const shift=root?.careerSystem?.byResident?.[id]?.currentShift;
  if(!shift||shift.phase!=='departing'||!validMinute(at))return false;
  if(at>=shift.end)return false;
  const actor=actorFor(root,id);
  shift.readiness=careerReadiness(actor);
  if(at<shift.start){
    shift.departedAt=at;
    shift.phase='waiting';
    if(actor){actor.action=null;actor.activitySession=null;
      actor.event='Прибыл заранее · ждёт начала смены';}
  }else{
    enterWorkingPhase(root,id,shift);
    // Late arrival is the only condition that reduces paid shift minutes.
    shift.departedAt=at;
  }
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
  }else if(shift?.phase==='waiting'){
    return {ok:false,reason:'Смена ещё не началась'};
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
  cancelUnavailableSocialCommands(root);
  contract.currentShift=null;
  const actor=actorFor(root,id);
  if(actor){actor.action=null;actor.event='Вернулся домой с работы';}
  return true;
}
export function skipCareerShift(root,id){
  const contract=root?.careerSystem?.byResident?.[id],shift=contract?.currentShift;
  if(!shift||!['pending','departing'].includes(shift.phase))return false;
  finalizeMissed(root,contract,id,root.minutes);
  applyWorkMoodContext(root);
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
  if(shift?.phase==='waiting')
    return {phase:'waiting',label:'Ожидает начала смены · '+clockAt(shift.start)+'–'+clockAt(shift.end),
      start:shift.start,end:shift.end};
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
