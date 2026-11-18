/** W3-A: authorized work leave against Gregorian scheduled shift IDs.
 * No new clock, XP, wallet or retrospective accrual on legacy saves.
 */
import {plannedCareerShift} from './career-scheduler.js';
import {SHOP_MAX_CREDITS} from './furniture-shop.js';
import {recordFinanceChange} from './finance-ledger.js';

const DAY=1440,MAX_BOOKINGS=32;
export const PAID_LEAVE_EVERY=5,PAID_LEAVE_CAP=3;
const valid=n=>Number.isSafeInteger(n)&&n>=0;
const shiftKey=(employmentId,start)=>employmentId+'@'+Math.floor(start/DAY)+'@'+start;
export function restoreCareerTimeOff(raw,employmentId){
  const state={balance:0,progress:0,bookings:[]};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return state;
  if(valid(raw.balance)&&raw.balance<=PAID_LEAVE_CAP)state.balance=raw.balance;
  if(valid(raw.progress)&&raw.progress<PAID_LEAVE_EVERY)state.progress=raw.progress;
  if(!Array.isArray(raw.bookings))return state;
  const seen=new Set();
  for(const item of raw.bookings.slice(-MAX_BOOKINGS)){
    if(!item||typeof item!=='object'||Array.isArray(item)||
      !valid(item.start)||!valid(item.end)||item.end-item.start<60||
      item.end-item.start>720||item.id!==shiftKey(employmentId,item.start)||
      !['paid','unpaid'].includes(item.type)||
      !valid(item.hourlyCredits)||item.hourlyCredits>10000||
      typeof item.settled!=='boolean'||seen.has(item.id))continue;
    seen.add(item.id);
    state.bookings.push({id:item.id,start:item.start,end:item.end,
      type:item.type,hourlyCredits:item.hourlyCredits,settled:item.settled,
      paidAmount:valid(item.paidAmount)&&item.paidAmount<=SHOP_MAX_CREDITS?
        item.paidAmount:0});
  }
  return state;
}
const leaveState=contract=>contract.timeOff??=
  restoreCareerTimeOff(null,contract.employmentId);
export function creditCareerPaidLeave(contract){
  if(!contract||typeof contract.employmentId!=='string')return 0;
  const state=leaveState(contract);
  state.progress++;
  if(state.progress>=PAID_LEAVE_EVERY){
    state.progress=0;
    state.balance=Math.min(PAID_LEAVE_CAP,state.balance+1);
  }
  return state.balance;
}
export function careerTimeOffForShift(contract,shiftId){
  return contract?.timeOff?.bookings?.find(b=>b.id===shiftId)??null;
}
export function upcomingCareerTimeOff(root,residentId,limit=7){
  const contract=root?.careerSystem?.byResident?.[residentId];
  if(!contract||!Number.isFinite(root.minutes))return [];
  const startDay=Math.max(0,Math.floor(root.minutes/DAY)),out=[];
  for(let day=startDay;day<=startDay+20&&out.length<Math.max(1,Math.min(20,limit));day++){
    const shift=plannedCareerShift(root.calendar,contract,day);
    if(!shift||shift.start<=root.minutes||
      root.careerSystem.settlementIds?.includes(shift.id)||
      contract.lastShift?.id===shift.id)continue;
    out.push({shift,booking:careerTimeOffForShift(contract,shift.id)});
  }
  return out;
}
export function bookCareerTimeOff(root,residentId,shiftId,type){
  if(!['paid','unpaid'].includes(type))return {ok:false,reason:'Неизвестный тип отдыха'};
  const contract=root?.careerSystem?.byResident?.[residentId];
  if(!contract)return {ok:false,reason:'Нет трудового договора'};
  const found=upcomingCareerTimeOff(root,residentId,20).find(x=>x.shift.id===shiftId);
  if(!found)return {ok:false,reason:'Дата недоступна для оформления'};
  if(found.booking)return {ok:false,reason:'Отдых уже оформлен'};
  const active=contract.currentShift;
  if(active?.id===shiftId&&active.phase!=='pending')
    return {ok:false,reason:'Персонаж уже отправился на работу'};
  const state=leaveState(contract);
  if(state.bookings.length>=MAX_BOOKINGS)return {ok:false,reason:'Слишком много заявок на отдых'};
  if(type==='paid'&&state.balance<1)return {ok:false,reason:'Нет накопленного оплачиваемого отпуска'};
  const {shift}=found;
  state.bookings.push({id:shift.id,start:shift.start,end:shift.end,
    type,hourlyCredits:shift.hourlyCredits,settled:false,paidAmount:0});
  state.bookings.sort((a,b)=>a.start-b.start);
  if(type==='paid')state.balance--;
  if(active?.id===shiftId&&active.phase==='pending')contract.currentShift=null;
  return {ok:true};
}
export function cancelCareerTimeOff(root,residentId,shiftId){
  const contract=root?.careerSystem?.byResident?.[residentId];
  const state=contract?.timeOff;
  const booking=careerTimeOffForShift(contract,shiftId);
  if(!state||!booking||booking.settled||!Number.isFinite(root?.minutes)||
    root.minutes>=booking.start)return {ok:false,reason:'Этот отдых уже нельзя отменить'};
  state.bookings=state.bookings.filter(b=>b.id!==shiftId);
  if(booking.type==='paid')state.balance=Math.min(PAID_LEAVE_CAP,state.balance+1);
  return {ok:true};
}
/** Executes once at the scheduled end, not when booked; one saved receipt. */
export function settleCareerTimeOff(root,residentId,after){
  const contract=root?.careerSystem?.byResident?.[residentId],state=contract?.timeOff;
  if(!state||!Number.isFinite(after)||after<0||!root.shop)return [];
  const events=[];
  for(const booking of state.bookings){
    if(booking.settled||after<booking.end)continue;
    const planned=Math.round((booking.end-booking.start)*booking.hourlyCredits/60);
    const amount=booking.type==='paid'
      ?Math.max(0,Math.min(planned,SHOP_MAX_CREDITS-root.shop.credits)):0;
    if(booking.type==='paid'){
      const payment=recordFinanceChange(root,
        {...root.shop,credits:root.shop.credits+amount},
        {kind:'paid-leave',sourceId:booking.id,actorId:residentId,
          atGameMinute:booking.end,receiptId:'paid-leave:'+booking.id});
      if(!payment.ok)continue;
      root.shop=payment.shop;root.financialHistory=payment.financialHistory;
    }
    booking.settled=true;booking.paidAmount=amount;
    events.push({type:'time-off',residentId,
      text:booking.type==='paid'?'отпуск завершён · начислено '+amount+' кр.'
        :'отгул завершён · без штрафа за пропуск'});
  }
  return events;
}
