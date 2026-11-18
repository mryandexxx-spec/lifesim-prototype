/** W4-B — read-only, deterministic household finance presentation.
 * Sole wallet = root.shop.credits. History is bounded and never a balance source.
 * All periods use the saved GAME calendar; device Date/time are never consulted.
 */
import {calendarAt,civilToSerial,serialToCivil,toISODate,parseCivilDate}
  from './calendar-core.js';
import {restoreFinancialHistory,FINANCE_HISTORY_LIMIT} from './finance-ledger.js';

export const FINANCE_PAGE_SIZE=20;
const NAME={alex:'Алекс',mira:'Мира'};
const KIND={
  salary:['Зарплата за смену','Зарплата'],
  purchase:['Покупка мебели','Мебель'],
  sale:['Продажа мебели','Мебель'],
  'art-sale':['Продажа картины','Творчество'],
  undo:['Отмена действия с мебелью','Корректировка'],
  redo:['Повтор действия с мебелью','Корректировка']
};
export const credits=n=>Number(n||0).toLocaleString('ru-RU')+' кр.';
const stamp=(root,e)=>calendarAt(root.calendar,e.atGameMinute);
export function financeReceipt(root,entry){
  const date=stamp(root,entry);
  const [title,category]=KIND[entry.kind]||['Денежная операция','Прочее'];
  return {id:entry.id,kind:entry.kind,category,title,actor:NAME[entry.actorId]||null,
    delta:entry.delta,balanceAfter:entry.balanceAfter,
    sign:entry.delta>0?'+':'−',amount:credits(Math.abs(entry.delta)),
    date:date.iso,day:date.day+' '+date.iso.slice(5,7)+'.'+date.iso.slice(0,4),
    time:date.time,atGameMinute:entry.atGameMinute};
}
export function financeRows(root,filter='all',limit=FINANCE_PAGE_SIZE){
  const entries=restoreFinancialHistory(root?.financialHistory).entries;
  return entries.filter(e=>filter==='income'?e.delta>0:filter==='expense'?e.delta<0:true)
    .sort((a,b)=>b.atGameMinute-a.atGameMinute).slice(0,Math.max(0,Math.min(120,limit)))
    .map(e=>financeReceipt(root,e));
}
function rangeError(reason){return {ok:false,reason};}
export function financePeriod(root,{mode='7',startDate=null,endDate=null}={}){
  if(!root?.calendar||!Number.isFinite(root?.minutes))return rangeError('Нет игрового календаря');
  const current=calendarAt(root.calendar,root.minutes),today=current.serial;
  const earliest=civilToSerial(root.calendar.startCivilDate);
  let start=today,end=today;
  const entries=restoreFinancialHistory(root.financialHistory).entries;
  if(mode==='custom'){
    if(!parseCivilDate(startDate)||!parseCivilDate(endDate))
      return rangeError('Выбери обе игровые даты');
    start=civilToSerial(startDate);end=civilToSerial(endDate);
    if(start>end)return rangeError('Дата начала позже даты окончания');
    if(end>today)return rangeError('Период не может заканчиваться в будущем');
    if(start<earliest)return rangeError('Дата раньше начала этой игровой жизни');
  }else if(mode==='7'||mode==='30'){
    start=Math.max(earliest,today-(mode==='7'?6:29));
  }else if(mode==='all'){
    start=entries.length?Math.max(earliest,Math.min(...entries.map(e=>stamp(root,e).serial))):today;
  }else return rangeError('Неизвестный период');
  return {ok:true,mode,start,end,startDate:toISODate(serialToCivil(start)),
    endDate:toISODate(serialToCivil(end)),days:end-start+1,today:current.iso};
}
function groupedPeriod(root,range,entries){
  if(!entries.length)return [];
  const span=range.days;
  const step=span<=31?1:span<=180?7:Math.max(7,Math.ceil(span/24));
  const map=new Map();
  for(const e of entries){
    const serial=stamp(root,e).serial;
    const index=Math.floor((serial-range.start)/step);
    if(!map.has(index)){
      const first=range.start+index*step,last=Math.min(range.end,first+step-1);
      const date=toISODate(serialToCivil(first));
      map.set(index,{index,from:date,to:toISODate(serialToCivil(last)),
        label:step===1?date.slice(5):date.slice(5)+'–'+
          toISODate(serialToCivil(last)).slice(5),income:0,expense:0});
    }
    const p=map.get(index);
    if(e.delta>0)p.income+=e.delta;else p.expense-=e.delta;
  }
  // Empty days have zero *recorded* operations, not asserted lifetime zero.
  return Array.from({length:Math.ceil(span/step)},(_,index)=>{
    const first=range.start+index*step,last=Math.min(range.end,first+step-1);
    const a=toISODate(serialToCivil(first)),b=toISODate(serialToCivil(last));
    return map.get(index)||{index,from:a,to:b,
      label:step===1?a.slice(5):a.slice(5)+'–'+b.slice(5),income:0,expense:0};
  });
}
export function financeAnalytics(root,selection={mode:'7'}){
  const range=financePeriod(root,selection);
  if(!range.ok)return range;
  const history=restoreFinancialHistory(root.financialHistory).entries;
  const dated=history.filter(e=>{
    const day=stamp(root,e).serial;
    return day>=range.start&&day<=range.end;
  }).sort((a,b)=>a.atGameMinute-b.atGameMinute);
  const income=dated.reduce((n,e)=>n+(e.delta>0?e.delta:0),0);
  const expense=dated.reduce((n,e)=>n+(e.delta<0?-e.delta:0),0);
  const expenses={Мебель:0,Корректировки:0,Другое:0};
  const sources={salary:0,art:0,corrections:0,other:0};
  for(const e of dated){
    if(e.delta<0){
      if(e.kind==='purchase')expenses.Мебель-=e.delta;
      else if(e.kind==='undo'||e.kind==='redo')expenses.Корректировки-=e.delta;
      else expenses.Другое-=e.delta;
    }else if(e.kind==='salary')sources.salary+=e.delta;
    else if(e.kind==='art-sale')sources.art+=e.delta;
    else if(e.kind==='undo'||e.kind==='redo')sources.corrections+=e.delta;
    else sources.other+=e.delta;
  }
  const first=history.length?Math.min(...history.map(e=>stamp(root,e).serial)):null;
  const coverageNote=!history.length?'В журнале пока нет операций. Старые события не восстановить.':
    'Расчёт только по сохранённым операциям (не более '+FINANCE_HISTORY_LIMIT+
    '). Старые или вытесненные записи могут отсутствовать.';
  const limited=!history.length||first>range.start||history.length===FINANCE_HISTORY_LIMIT;
  return {...range,currentBalance:root.shop.credits,entries:dated,
    income,expense,net:income-expense,count:dated.length,expenses,sources,
    grouped:groupedPeriod(root,range,dated),
    points:dated.map(e=>({minute:e.atGameMinute,balance:e.balanceAfter,
      date:stamp(root,e).iso,time:stamp(root,e).time,id:e.id})),
    limited,coverageNote};
}
export function financeAssessment(a){
  if(!a?.ok)return {level:'Недостаточно данных',reason:'Выбери корректный период',tips:[]};
  if(a.count<2)return {level:'Недостаточно данных',
    reason:'В выбранном периоде мало записанных операций.',
    tips:['Продолжай играть: новые доходы и расходы появятся в журнале.']};
  const level=a.net<0?'Расходы выше поступлений':a.net>0?
    'Поступления выше расходов':'Поступления и расходы равны';
  const reason='За период: '+credits(a.income)+' поступило, '+
    credits(a.expense)+' потрачено; разница '+
    (a.net>=0?'+':'−')+credits(Math.abs(a.net))+'.';
  const tips=[];
  if(a.net<0)tips.push('Расходы превысили поступления на '+
    credits(-a.net)+'. Проверь необязательные покупки.');
  if(a.expense>0&&a.expenses.Мебель/a.expense>=.5)
    tips.push('Мебель — '+Math.round(a.expenses.Мебель/a.expense*100)+
      '% записанных расходов. Перед новой обстановкой оцени бюджет.');
  if(a.sources.salary===0)
    tips.push('За выбранный период зарплат не записано. Можно проверить график смен.');
  if(a.net>0&&tips.length<2)
    tips.push('По записанным операциям поступления превышают траты. Можно сохранить часть средств.');
  if(a.limited&&tips.length<3)
    tips.push('История ограничена: для ранних дней выводы могут быть неполными.');
  return {level,reason,tips:tips.slice(0,3)};
}
