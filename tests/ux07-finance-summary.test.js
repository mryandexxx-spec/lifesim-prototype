import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold} from '../src/household.js';
import {financeOverviewSnapshot,oncePerInvoice} from '../src/ux07-finance-summary.js';
import {payHouseholdBill} from '../src/household-bills.js';
const DAY=1440;
function fixture(){
 const root=newHousehold('2026-11-01');
 root.minutes=17*DAY+720;root.otherSim.minutes=root.minutes;
 root.financialHistory={schema:1,nextId:4,entries:[
  {id:'fin-1',sourceId:'source-1',kind:'salary',delta:220,actorId:'alex',
   atGameMinute:10*DAY+600,balanceAfter:5220},
  {id:'fin-2',sourceId:'source-2',kind:'purchase',delta:-70,actorId:null,
   atGameMinute:14*DAY+600,balanceAfter:5150},
  {id:'fin-3',sourceId:'source-3',kind:'art-sale',delta:40,actorId:'mira',
   atGameMinute:16*DAY+600,balanceAfter:5190}]};
 root.shop.credits=5190;return root;
}
test('UX07: week summary uses only bounded ledger, never projects a fake balance',()=>{
 const s=financeOverviewSnapshot(fixture());
 assert.equal(s.balance,5190);
 assert.equal(s.active.startDate,'2026-11-12');
 assert.equal(s.active.endDate,'2026-11-18');
 assert.equal(s.active.income,40);
 assert.equal(s.active.expense,70);
 assert.equal(s.active.net,-30);
 assert.equal(s.active.count,2);
 assert.match(s.netText,/−30/);
 assert.match(s.periodText,/2026-11-12.*2026-11-18/);
 assert.match(s.billLine,/Счета:/);
});
test('UX07: custom dates reuse canonical ledger, invalid range is explicit',()=>{
 const root=fixture();
 const s=financeOverviewSnapshot(root,{mode:'custom',
  startDate:'2026-11-10',endDate:'2026-11-15'});
 assert.equal(s.active.ok,true);
 assert.equal(s.active.income,220);
 assert.equal(s.active.expense,70);
 assert.equal(s.active.net,150);
 assert.equal(s.active.count,2);
 const bad=financeOverviewSnapshot(root,{mode:'custom',
  startDate:'2026-11-20',endDate:'2026-11-10'});
 assert.equal(bad.active.ok,false);
 assert.match(bad.periodText,/Период недоступен/);
});
test('UX07: legacy v1 with empty ledger keeps historical wallet',()=>{
 const root=fixture();root.shop.credits=2719;delete root.financialHistory;
 const restored=loadHousehold(structuredClone(root));
 const s=financeOverviewSnapshot(restored);
 assert.equal(restored.version,1);
 assert.equal(s.balance,2719);
 assert.equal(s.active.count,0);
 assert.equal(s.active.net,0);
 assert.equal(s.active.limited,true);
});
test('UX07: duplicate event to same invoice never makes second payment',()=>{
 const root=fixture();
 root.householdBills={schema:1,activatedDayIndex:0,
  lastIssuedCycle:2,lastPaidCycle:0,lastReminderCycle:2};
 let attempts=0;
 const tap=oncePerInvoice(()=>{
  attempts++;
  const tx=payHouseholdBill(root);
  if(tx.ok){root.shop=tx.shop;root.financialHistory=tx.financialHistory;
   root.householdBills=tx.householdBills;}
  return tx;
 });
 assert.equal(tap().ok,true);
 assert.equal(tap().reason,'duplicate-tap');
 assert.equal(attempts,1);
 assert.equal(root.shop.credits,5010);
 assert.equal(root.financialHistory.entries.filter(e=>e.kind==='bill-payment').length,1);
 assert.equal(oncePerInvoice(()=>payHouseholdBill(root))().ok,true);
});
test('UX07: presentation reuses controller, v1 and Pages bundle',()=>{
 const src=readFileSync(new URL('../src/finance-phone-ui.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
 assert.match(src,/financeOverviewSnapshot\(root,applied\)/);
 assert.match(src,/oncePerInvoice\(/);
 assert.match(src,/finance-ux07-summary/);
 assert.match(src,/finance-period-presets/);
 assert.match(src,/finance-date-start/);
 assert.match(src,/payBill\(root\)/);
 assert.match(css,/finance-ux07-analytics-summary/);
 assert.match(pages,/cp src\/ux07-finance-summary\.js site\/src\//);
});
