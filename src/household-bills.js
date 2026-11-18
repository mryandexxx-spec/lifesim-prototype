/** W4-C: deterministic, non-punitive family bills. No DOM, browser clock or 3D.
 * Cycles are indexed from first activation in this save, never backdated.
 * State is O(1) even after many game years; money changes only by manual payment.
 */
import {gameDayIndex,calendarAt,MINUTES_PER_GAME_DAY} from './calendar-core.js';
import {recordFinanceChange} from './finance-ledger.js';

export const BILL_SCHEMA=1;
export const BILL_AMOUNT=180;
export const BILL_PERIOD_DAYS=7;
export const BILL_GRACE_DAYS=3;
const MAX_DAY=3650000;
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const dayAt=minutes=>{
  try {
    const day=gameDayIndex(minutes);
    return integer(day,0,MAX_DAY)?day:null;
  }catch{return null;}
};
const cycles=(state,day)=>Math.max(0,Math.floor((day-state.activatedDayIndex)/BILL_PERIOD_DAYS));
const valid=(state,day)=>state?.schema===BILL_SCHEMA&&
  integer(state.activatedDayIndex,0,day)&&
  integer(state.lastIssuedCycle,0,cycles(state,day))&&
  integer(state.lastPaidCycle,0,state.lastIssuedCycle)&&
  integer(state.lastReminderCycle,0,cycles(state,day)+1);

export function newHouseholdBills(minutes=480){
  return {schema:BILL_SCHEMA,activatedDayIndex:dayAt(minutes)??0,
    lastIssuedCycle:0,lastPaidCycle:0,lastReminderCycle:0};
}
export function restoreHouseholdBills(raw,minutes){
  const day=dayAt(minutes);
  if(day===null||!valid(raw,day))return newHouseholdBills(minutes);
  return {schema:BILL_SCHEMA,activatedDayIndex:raw.activatedDayIndex,
    lastIssuedCycle:raw.lastIssuedCycle,lastPaidCycle:raw.lastPaidCycle,
    lastReminderCycle:raw.lastReminderCycle};
}
const dateAt=(calendar,day)=>{
  try{return calendarAt(calendar,day*MINUTES_PER_GAME_DAY).iso;}
  catch{return null;}
};
/** Derived state: debts do not require an unbounded invoice array or time loop. */
export function householdBillView(root){
  const day=dayAt(root?.minutes),state=root?.householdBills;
  if(day===null||!valid(state,day))return {ok:false,reason:'invalid-bills'};
  const issued=Math.max(state.lastIssuedCycle,cycles(state,day));
  const count=issued-state.lastPaidCycle;
  const overdueAll=Math.max(0,Math.floor(
    (day-state.activatedDayIndex-BILL_PERIOD_DAYS-BILL_GRACE_DAYS-1)/BILL_PERIOD_DAYS)+1);
  const overdue=Math.max(0,Math.min(issued,overdueAll)-state.lastPaidCycle);
  const oldestCycle=state.lastPaidCycle+1;
  const dueDay=state.activatedDayIndex+BILL_PERIOD_DAYS*oldestCycle+BILL_GRACE_DAYS;
  const nextIssueDay=state.activatedDayIndex+BILL_PERIOD_DAYS*(issued+1);
  return {ok:true,amount:BILL_AMOUNT,periodDays:BILL_PERIOD_DAYS,
    graceDays:BILL_GRACE_DAYS,issuedCycle:issued,paidCycle:state.lastPaidCycle,
    unpaidCount:count,overdueCount:overdue,totalDue:count*BILL_AMOUNT,
    oldestCycle:count?oldestCycle:null,oldestDueDay:count?dueDay:null,
    oldestDueDate:count?dateAt(root.calendar,dueDay):null,
    nextIssueDay,nextIssueDate:dateAt(root.calendar,nextIssueDay),
    daysToIssue:nextIssueDay-day,canPay:count>0&&root?.shop?.credits>=BILL_AMOUNT};
}
/** At most one notification per event; duplicate ticks, pause, reload are safe. */
export function progressHouseholdBills(root,beforeMinute,afterMinute){
  if(root?.paused||!Number.isFinite(beforeMinute)||!Number.isFinite(afterMinute)||
    afterMinute<=beforeMinute)return [];
  const day=dayAt(afterMinute),state=root?.householdBills;
  if(day===null||!valid(state,day))return [];
  const next={...state},messages=[];
  const issued=cycles(next,day);
  if(issued>next.lastIssuedCycle){
    const added=issued-next.lastIssuedCycle;
    next.lastIssuedCycle=issued;
    messages.push({type:'bill-issued',text:added===1?
      'Счёт семьи на '+BILL_AMOUNT+' кр. выставлен. Оплата в смартфоне → Финансы.':
      'Накопилось '+(next.lastIssuedCycle-next.lastPaidCycle)+
      ' неоплаченных счетов. Открой Финансы.'});
  }
  const future=issued+1,issueDay=next.activatedDayIndex+future*BILL_PERIOD_DAYS;
  if(day>=issueDay-2&&day<issueDay&&next.lastReminderCycle<future){
    next.lastReminderCycle=future;
    messages.push({type:'bill-reminder',text:'Через 2 игровых дня счёт семьи '+
      BILL_AMOUNT+' кр. Подготовь бюджет.'});
  }
  if(next.lastIssuedCycle!==state.lastIssuedCycle||
     next.lastReminderCycle!==state.lastReminderCycle)root.householdBills=next;
  return messages;
}
/** Pure atomic payment projection: caller commits all three objects together. */
export function payHouseholdBill(root){
  const bill=householdBillView(root);
  if(!bill.ok)return {ok:false,reason:bill.reason};
  if(!bill.unpaidCount)return {ok:false,reason:'no-bill'};
  if(root?.shop?.credits<BILL_AMOUNT)return {ok:false,reason:'insufficient-credits'};
  const cycle=bill.oldestCycle;
  const sourceId='bill:'+root.householdBills.activatedDayIndex+':'+cycle;
  const result=recordFinanceChange(root,
    {...root.shop,credits:root.shop.credits-BILL_AMOUNT},
    {kind:'bill-payment',sourceId,receiptId:sourceId,
      // The game clock advances in fractional minutes; journal times are whole minutes.
      atGameMinute:Math.max(0,Math.round(root.minutes))});
  if(!result.ok)return {ok:false,reason:result.reason};
  return {ok:true,amount:BILL_AMOUNT,cycle,
    shop:result.shop,financialHistory:result.financialHistory,
    householdBills:{...root.householdBills,lastIssuedCycle:bill.issuedCycle,
      lastPaidCycle:cycle},entry:result.entry};
}
