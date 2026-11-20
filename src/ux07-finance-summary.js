/** UX-07 read-only presentation: existing ledger, bills and shared family wallet. */
import {financeAnalytics,credits} from './finance-presentation.js';
import {householdBillView} from './household-bills.js';
export function financeOverviewSnapshot(root,period={mode:'7'}){
 const active=financeAnalytics(root,period),bill=householdBillView(root);
 return {active,bill,balance:root.shop.credits,
  periodText:active.ok?'Период: '+active.startDate+' — '+active.endDate:
   'Период недоступен: '+active.reason,
  netText:active.ok?(active.net>=0?'+':'−')+credits(Math.abs(active.net)):'—',
  billLine:!bill.ok?'Счета временно недоступны':
   bill.unpaidCount?'Счета: '+bill.unpaidCount+' · '+credits(bill.totalDue)+' к оплате':
   'Счета: всё оплачено'};
}
/** One rendered invoice may submit once; canonical payHouseholdBill owns persistence. */
export function oncePerInvoice(fn){
 let submitted=false;
 return (...args)=>{
  if(submitted)return {ok:false,reason:'duplicate-tap'};
  submitted=true;
  return fn(...args);
 };
}
