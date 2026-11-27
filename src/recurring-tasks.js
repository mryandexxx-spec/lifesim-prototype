/** GC-06: optional personal calendar goals. No rewards, queue or DOM.
 * Only canonical completion sites call recordTaskOutcome; never scan old journals.
 * Two bounded slots per resident; a weekly practice goal counts distinct days.
 */
import {calendarAt,MINUTES_PER_GAME_DAY as DAY} from './calendar-core.js';
import {resolveActionFurniture,furnitureActionApproach} from './furniture-catalog.js';
import {careerShiftsInWindow} from './career-scheduler.js';
import {careerTimeOffForShift} from './career-timeoff.js';
import {quoteArtSale} from './art-market.js';
import {residentIdsForSimulation,savedAdditionalActor} from './resident-activity-runtime.js';
import {ACTIONS} from './simulation.js';
import {aspirationTaskPreferences} from './life-aspirations.js';
import {getPair} from './social-graph.js';
import {SOCIAL_NEED_REWARDS} from './social-need.js';

const PERIODS=['day','week'];
const DEFINITIONS=Object.freeze({
  rest:{label:'Отдохнуть на диване',weekly:'Уделить время отдыху',action:'sofa',weeklyTarget:3,detail:'Заверши отдых на установленном диване.'},
  tv:{label:'Посмотреть телевизор',weekly:'Устроить вечера с телевизором',action:'tv',weeklyTarget:3,detail:'Заверши обычный просмотр телевизора.'},
  speech:{label:'Репетировать речь',weekly:'Развивать харизму',action:'mirror',weeklyTarget:3,detail:'Выбери репетицию речи у зеркала, а не причёску.'},
  paint:{label:'Заняться живописью',weekly:'Продолжить творческую практику',action:'paint',weeklyTarget:2,detail:'Заверши занятие живописью на мольберте.'},
  work:{label:'Завершить рабочую смену',weekly:'Уделить время карьере',weeklyTarget:2,detail:'Отработай запланированную смену.'},
  sale:{label:'Продать картину',weekly:'Получить доход от творчества',weeklyTarget:1,detail:'Продай свою картину из личного инвентаря.'},
  social:{label:'Пообщаться с другим жителем',weekly:'Уделить время близким',weeklyTarget:3,detail:'Начни общение и получи положительный отклик. Отказ или ссора не засчитываются.'}
});
const KINDS=Object.keys(DEFINITIONS);
const own=(o,k)=>Object.hasOwn(o||{},k);
const record=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const validTime=n=>Number.isFinite(n)&&n>=0;
const validProofId=x=>typeof x==='string'&&x.length>0&&x.length<=180&&!/[\u0000-\u001f]/.test(x);
const actorFor=(root,id)=>id==='alex'?root:id==='mira'?root.otherSim:savedAdditionalActor(root,id);
export function taskPeriod(calendar,at,period){
  if(!PERIODS.includes(period))throw new RangeError('unknown task period');
  const view=calendarAt(calendar,at),offset=period==='week'?view.weekday:0;
  const raw=(view.dayIndex-offset)*DAY;
  return {key:period+':'+calendar.startCivilDate+':'+(view.serial-offset),
    start:Math.max(0,raw),end:raw+(period==='week'?7:1)*DAY};
}
function periodsAt(root,at){return Object.fromEntries(PERIODS.map(p=>[p,taskPeriod(root.calendar,at,p)]));}
function maxDays(at,end){return Math.max(1,Math.ceil(end/DAY)-Math.floor(at/DAY));}
function saleAvailable(root,id){
  return (actorFor(root,id)?.createdWorks||[]).some(w=>w.ownerId===id&&w.kind==='artwork'&&w.location==='inventory'&&
    (!root.artMarket||quoteArtSale(root,id,w.id).ok));
}
function eligible(root,id,kind,at,window,period,remaining=null){
  if(!actorFor(root,id)||!own(DEFINITIONS,kind))return false;
  if((kind==='paint'||kind==='sale')&&!['alex','mira'].includes(id))return false;
  if(kind==='sale')return saleAvailable(root,id);
  if(kind==='social')return residentIdsForSimulation(root).some(other=>other!==id&&actorFor(root,other)&&root.socialGraph?.persons?.includes(other));
  if(kind==='work'){
    const c=root.careerSystem?.byResident?.[id];
    if(!c||c.discipline?.pendingDismissal)return false;
    const available=careerShiftsInWindow(root.calendar,c,at,window.end)
      .filter(s=>s.end>at&&s.end<window.end&&!root.careerSystem.settlementIds?.includes(s.id)&&
        !careerTimeOffForShift(c,s.id)&&c.lastShift?.id!==s.id);
    // A cross-midnight shift belongs to the period containing its completion.
    return new Set(available.map(s=>Math.floor(s.end/DAY))).size>=(remaining??(period==='week'?2:1));
  }
  return !!resolveActionFurniture(root.world,DEFINITIONS[kind].action);
}
function options(root,id,period,at,window){
  const prefs=aspirationTaskPreferences(root,id);
  return KINDS.filter(k=>(k!=='social'||prefs.includes('social'))&&eligible(root,id,k,at,window,period));
}
function makeSlot(root,id,period,at,window,exclude=null,previous=null){
  const kinds=options(root,id,period,at,window);
  const preferred=kinds.filter(k=>k!==exclude&&k!==previous);
  const choices=preferred.length?preferred:kinds.filter(k=>k!==previous);
  const related=choices.filter(k=>aspirationTaskPreferences(root,id).includes(k));
  const pool=related.length?related:choices;
  const seed=Math.floor(window.start/DAY)+[...id].reduce((n,c)=>n+c.charCodeAt(0),0)+(period==='week'?1:0);
  const kind=pool.length?pool[seed%pool.length]:null;
  const target=kind?(period==='day'?1:Math.min(DEFINITIONS[kind].weeklyTarget,maxDays(at,window.end))):0;
  return {key:window.key,startedAt:at,kind,target,proofs:[],dismissed:false};
}
function validSlot(slot,window,at,period){
  if(!record(slot)||slot.key!==window.key||!validTime(slot.startedAt)||slot.startedAt<window.start||
    slot.startedAt>at||slot.startedAt>=window.end||typeof slot.dismissed!=='boolean'||!Array.isArray(slot.proofs))return false;
  if(slot.kind===null)return slot.target===0&&slot.proofs.length===0;
  if(!own(DEFINITIONS,slot.kind)||!Number.isInteger(slot.target)||slot.target<1||
    slot.target!==(period==='day'?1:Math.min(DEFINITIONS[slot.kind].weeklyTarget,maxDays(slot.startedAt,window.end)))||
    slot.proofs.length>slot.target)return false;
  const ids=new Set(),days=new Set();
  for(const proof of slot.proofs){
    if(!record(proof)||!validProofId(proof.id)||!validTime(proof.at)||proof.at<slot.startedAt||
      proof.at>at||proof.at>=window.end||ids.has(proof.id)||days.has(Math.floor(proof.at/DAY)))return false;
    ids.add(proof.id);days.add(Math.floor(proof.at/DAY));
  }
  return true;
}
function cleanSlot(slot){
  return {key:slot.key,startedAt:slot.startedAt,kind:slot.kind,target:slot.target,
    dismissed:slot.dismissed,proofs:slot.proofs.map(p=>({id:p.id,at:p.at}))};
}
function slotFor(root,id,period){return root.recurringTasks?.byResident?.[id]?.[period];}
function withSlot(root,id,period,slot){
  const state=root.recurringTasks;
  root.recurringTasks={schema:1,byResident:{...state.byResident,
    [id]:{...state.byResident[id],[period]:slot}}};
}
/** Called on new/load, tick boundary, or verified transaction. No stale evidence is imported. */
export function syncRecurringTasks(root,at=root.minutes,{restore=false}={}){
  if(!root?.calendar||!validTime(at))return false;
  const windows=periodsAt(root,at),ids=residentIdsForSimulation(root);
  const old=root.recurringTasks?.schema===1&&record(root.recurringTasks.byResident)?root.recurringTasks.byResident:{};
  let changed=restore||!record(root.recurringTasks)||root.recurringTasks.schema!==1||
    Object.keys(old).length!==ids.length;
  const byResident={};
  for(const id of ids){
    const row=old[id],next={};
    for(const period of PERIODS){
      const slot=row?.[period],window=windows[period];
      // On the steady path avoid repeated eligibility scans and retain identity.
      const good=validSlot(slot,window,at,period)&&
        !(!['alex','mira'].includes(id)&&['paint','sale'].includes(slot.kind));
      if(good)next[period]=restore?cleanSlot(slot):slot;
      else{
        const exclude=next.day?.kind??row?.day?.kind??null;
        // A reanchored calendar or malformed field must not grant historical proof.
        next[period]=makeSlot(root,id,period,at,window,period==='week'?exclude:row?.week?.kind);
        changed=true;
      }
    }
    byResident[id]=next;
  }
  if(changed)root.recurringTasks={schema:1,byResident};
  return changed;
}
export function restoreRecurringTasks(root,raw){
  root.recurringTasks=raw;
  syncRecurringTasks(root,root.minutes,{restore:true});
}
/** Internal adapters call this only after real domain success. Returns whether saved state changed. */
export function recordTaskOutcome(root,id,kind,receiptId,at=root.minutes){
  if(!own(DEFINITIONS,kind)||!validProofId(receiptId)||!validTime(at)||at+1e-8<root.minutes||
    !residentIdsForSimulation(root).includes(id)||!actorFor(root,id))return false;
  syncRecurringTasks(root,at);
  let changed=false;
  for(const period of PERIODS){
    const slot=slotFor(root,id,period);
    if(!slot||slot.kind!==kind||slot.dismissed||slot.proofs.length>=slot.target||at<slot.startedAt||
      slot.proofs.some(p=>p.id===receiptId||Math.floor(p.at/DAY)===Math.floor(at/DAY)))continue;
    withSlot(root,id,period,{...slot,proofs:[...slot.proofs,{id:receiptId,at}]});
    changed=true;
  }
  return changed;
}
/** Only newly committed positive graph receipts, attributed to the initiator. */
export function recordSocialTaskOutcome(root,receipt){
  const id=receipt?.actorId;
  if(!id||receipt.type==='sports.disagree'||!own(SOCIAL_NEED_REWARDS,receipt.type)||
    !Number.isSafeInteger(receipt.seq)||receipt.seq<1||
    !getPair(root.socialGraph,id,receipt.targetId)?.events.some(e=>e.seq===receipt.seq&&e.type===receipt.type&&e.actorId===id&&e.at===receipt.at))return false;
  if(!aspirationTaskPreferences(root,id).includes('social')&&!PERIODS.some(p=>slotFor(root,id,p)?.kind==='social'))return false;
  return recordTaskOutcome(root,id,'social','social:'+receipt.seq,receipt.at);
}
/** Capture a normal leisure completion from the actual tick, with exact object and physical position.
 * A queued/walking/canceled/deleted action, early no-op, or TV conversation is not a goal receipt.
 */
export function captureTaskLeisure(root,actor){
  const a=actor?.action;
  if(!a||!['sofa','tv'].includes(a.id)||a.phase!=='using'||a.tvTalk||
    a.automatic!==false||!validTime(a.elapsed)||a.elapsed>=ACTIONS[a.id].duration||
    !a.targetInstanceId)return null;
  const point=furnitureActionApproach(root.world,a.id,a.targetInstanceId);
  // Seated TV uses the couch approach, not the standing TV anchor.
  const seat=a.id==='tv'&&a.watchSeatInstanceId
    ?furnitureActionApproach(root.world,'sofa',a.watchSeatInstanceId):null;
  if(a.watchSeatInstanceId&&!seat)return null;
  if(!point||Math.hypot(actor.position.x-(seat||point).x,actor.position.z-(seat||point).z)>.65)return null;
  return {action:a,elapsed:a.elapsed,at:actor.minutes};
}
export function settleTaskLeisure(root,id,actor,before){
  if(!before||actor.action||actor.minutes<=before.at)return false;
  const a=before.action,d=ACTIONS[a.id];
  if(a.elapsed+1e-8<d.duration||actor.event!==d.label+' — готово'||
    !resolveActionFurniture(root.world,a.id,a.targetInstanceId))return false;
  const at=root.minutes;
  return recordTaskOutcome(root,id,a.id==='sofa'?'rest':'tv',
    a.id+':'+a.targetInstanceId+':'+Math.round((before.at-before.elapsed)*1e6),at);
}
export function taskView(root,id){
  if(!residentIdsForSimulation(root).includes(id))return [];
  const at=root.minutes,windows=periodsAt(root,at);
  return PERIODS.map(period=>{
    const slot=slotFor(root,id,period),window=windows[period];
    if(!validSlot(slot,window,at,period))return {period,kind:null,title:'Нет доступного задания',status:'empty',progress:0,target:0,canReplace:false,canDismiss:false};
    const complete=slot.target>0&&slot.proofs.length===slot.target;
    const kind=slot.kind,d=DEFINITIONS[kind];
    const available=options(root,id,period,at,window);
    return {period,kind,title:d?(period==='week'?d.weekly:d.label):'Нет доступного задания',
      detail:d?.detail??'Задания появятся при наличии подходящих занятий.',
      status:slot.dismissed?'dismissed':complete?'complete':!kind?'empty':
        eligible(root,id,kind,at,window,period,slot.target-slot.proofs.length)?'active':'unavailable',
      progress:slot.proofs.length,target:slot.target,
      canReplace:!complete&&available.some(k=>k!==kind||slot.dismissed),
      canDismiss:!complete&&!!kind&&!slot.dismissed};
  });
}
export function changeRecurringTask(root,id,period,operation){
  if(!PERIODS.includes(period)||!residentIdsForSimulation(root).includes(id)||
    !['replace','dismiss'].includes(operation))return false;
  syncRecurringTasks(root);
  const slot=slotFor(root,id,period);
  if(!slot||slot.target>0&&slot.proofs.length===slot.target)return false;
  if(operation==='dismiss'){
    if(slot.dismissed||!slot.kind)return false;
    withSlot(root,id,period,{...slot,dismissed:true});return true;
  }
  const window=taskPeriod(root.calendar,root.minutes,period);
  const available=options(root,id,period,root.minutes,window);
  if(slot.dismissed&&available.includes(slot.kind)){
    withSlot(root,id,period,{...slot,dismissed:false});return true;
  }
  const prefs=aspirationTaskPreferences(root,id);
  const order=prefs.length?[...prefs,...KINDS.filter(k=>!prefs.includes(k))]:KINDS;
  const start=order.indexOf(slot.kind);
  const ordered=Array.from({length:order.length},(_,i)=>order[(start+1+i)%order.length]);
  const kind=ordered.find(k=>k!==slot.kind&&available.includes(k));
  if(!kind)return false;
  const target=period==='day'?1:Math.min(DEFINITIONS[kind].weeklyTarget,maxDays(root.minutes,window.end));
  withSlot(root,id,period,{key:window.key,startedAt:root.minutes,kind,target,proofs:[],dismissed:false});return true;
}
