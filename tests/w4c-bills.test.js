import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {newHouseholdBills,restoreHouseholdBills,householdBillView,
  progressHouseholdBills,payHouseholdBill,BILL_AMOUNT,BILL_PERIOD_DAYS,
  BILL_GRACE_DAYS} from '../src/household-bills.js';
import {financeAnalytics,financeRows} from '../src/finance-presentation.js';
import {FINANCE_HISTORY_LIMIT} from '../src/finance-ledger.js';

const D=1440,copy=o=>JSON.parse(JSON.stringify(o));
const day=(r,n)=>{r.minutes=n*D+480;r.otherSim.minutes=r.minutes;return r;};
function family(today=0){
  const r=newHousehold('2026-12-24');
  day(r,today);
  r.householdBills=newHouseholdBills(r.minutes);
  return r;
}
test('W4-C: tariff and first week are family-wide game time, not real Date or per resident',()=>{
  assert.equal(BILL_AMOUNT,180);assert.equal(BILL_PERIOD_DAYS,7);
  assert.equal(BILL_GRACE_DAYS,3);
  const r=family(0);
  assert.deepEqual([r.householdBills.activatedDayIndex,r.householdBills.lastIssuedCycle,
    r.householdBills.lastPaidCycle],[0,0,0]);
  assert.equal(householdBillView(r).unpaidCount,0);
  assert.equal(householdBillView(r).nextIssueDay,7);
  assert.equal(householdBillView(r).nextIssueDate,'2026-12-31');
  r.minutes=5*D+480;
  assert.equal(progressHouseholdBills(r,4*D+480,r.minutes).length,1);
  assert.equal(progressHouseholdBills(r,4*D+480,r.minutes).length,0,
    'notifier is idempotent');
  assert.equal(r.householdBills.lastReminderCycle,1);
  r.minutes=7*D+480;
  const due=progressHouseholdBills(r,6*D+480,r.minutes);
  assert.equal(due.length,1);assert.equal(due[0].type,'bill-issued');
  assert.equal(householdBillView(r).unpaidCount,1);
  assert.equal(householdBillView(r).totalDue,180);
  assert.equal(householdBillView(r).oldestDueDate,'2027-01-03');
  assert.equal(r.shop.credits,5000,'issuing a bill is not charging money');
  assert.equal(r.financialHistory.entries.length,0,'no imaginary debit for issuing bills');
});
test('W4-C: no retrospective charges on pre-W4-C save after 600 game days',()=>{
  const old=family(610);
  old.shop.credits=2719;
  delete old.householdBills;delete old.financialHistory;
  const r=loadHousehold(copy(old),'2026-12-24');
  assert.deepEqual([r.householdBills.activatedDayIndex,householdBillView(r).unpaidCount,
    householdBillView(r).nextIssueDay,r.shop.credits],[610,0,617,2719]);
  assert.equal(r.financialHistory.entries.length,0);
  day(r,616);
  assert.equal(householdBillView(r).unpaidCount,0);
  day(r,617);
  assert.equal(householdBillView(r).unpaidCount,1);
});
test('W4-C: three-day payment window, no interest or punitive late fee',()=>{
  const r=family();
  for(const [n,count,overdue] of [[6,0,0],[7,1,0],[10,1,0],
    [11,1,1],[14,2,1],[17,2,1],[18,2,2]]){
    day(r,n);
    const b=householdBillView(r);
    assert.deepEqual([b.unpaidCount,b.overdueCount,b.totalDue],
      [count,overdue,count*180],'game day '+n);
  }
  assert.equal(r.shop.credits,5000);
});
test('W4-C: oldest bill manual payment is a single atomic credit receipt',()=>{
  const r=family();
  day(r,15);
  const prior=copy(r);
  const p=payHouseholdBill(r);
  assert.equal(p.ok,true);assert.equal(p.amount,180);assert.equal(p.cycle,1);
  assert.deepEqual(r,prior,'pure projection does not mutate');
  Object.assign(r,{shop:p.shop,financialHistory:p.financialHistory,
    householdBills:p.householdBills});
  assert.deepEqual([r.shop.credits,r.householdBills.lastPaidCycle,
    householdBillView(r).unpaidCount],[4820,1,1]);
  assert.equal(r.financialHistory.entries.length,1);
  assert.equal(r.financialHistory.entries[0].kind,'bill-payment');
  assert.equal(r.financialHistory.entries[0].delta,-180);
  assert.equal(r.financialHistory.entries[0].balanceAfter,4820);
  assert.equal(r.financialHistory.entries[0].id,'bill:0:1');
  const follow=payHouseholdBill(r);
  assert.equal(follow.ok,true);assert.equal(follow.cycle,2);
  Object.assign(r,{shop:follow.shop,financialHistory:follow.financialHistory,
    householdBills:follow.householdBills});
  assert.deepEqual([r.shop.credits,householdBillView(r).unpaidCount],[4640,0]);
  assert.equal(payHouseholdBill(r).reason,'no-bill');
  const reloaded=loadHousehold(copy(r));
  assert.equal(reloaded.shop.credits,4640);
  assert.equal(reloaded.householdBills.lastPaidCycle,2);
  assert.equal(payHouseholdBill(reloaded).reason,'no-bill','reload must never repay');
});
test('W4-C: insufficient funds, zero funds and tampered history leave household untouched',()=>{
  const r=family();
  day(r,7);
  for(const credits of [0,179]){
    r.shop.credits=credits;
    const before=copy(r),res=payHouseholdBill(r);
    assert.equal(res.reason,'insufficient-credits');
    assert.deepEqual(r,before);
  }
  r.shop.credits=180;
  const payment=payHouseholdBill(r);
  assert.equal(payment.ok,true);
  assert.equal(payment.shop.credits,0);
  assert.equal(payment.entry.delta,-180);
  // An invalid journal cannot be used to produce a partial charge.
  const damaged=family();day(damaged,7);
  damaged.financialHistory.nextId=1_000_000_000;
  const before=copy(damaged),fail=payHouseholdBill(damaged);
  assert.equal(fail.ok,false);assert.deepEqual(damaged,before);
});
test('W4-C: large jumps have O(1) state and never duplicate notifications',()=>{
  const r=family();
  day(r,36500);
  const ev=progressHouseholdBills(r,0,r.minutes);
  assert.equal(ev.length,1);
  assert.equal(r.householdBills.lastIssuedCycle,Math.floor(36500/7));
  const out=householdBillView(r);
  assert.equal(out.unpaidCount,Math.floor(36500/7));
  assert.equal(out.totalDue,out.unpaidCount*BILL_AMOUNT);
  assert.equal(progressHouseholdBills(r,0,r.minutes).length,0);
  assert.equal(r.financialHistory.entries.length,0);
});
test('W4-C: malformed saved bills are reset forward without affecting old assets or money',()=>{
  const old=family(90);
  old.shop.credits=4001;
  for(const bills of [
    {schema:1,activatedDayIndex:-1,lastIssuedCycle:3,lastPaidCycle:0,lastReminderCycle:0},
    {schema:1,activatedDayIndex:0,lastIssuedCycle:10_000,lastPaidCycle:0,lastReminderCycle:0},
    {schema:1,activatedDayIndex:70,lastIssuedCycle:2,lastPaidCycle:3,lastReminderCycle:0},
    {schema:100,activatedDayIndex:0,lastIssuedCycle:0,lastPaidCycle:0,lastReminderCycle:0}
  ]){
    const saved={...copy(old),householdBills:bills};
    const restored=loadHousehold(saved);
    assert.equal(restored.householdBills.activatedDayIndex,90);
    assert.equal(householdBillView(restored).unpaidCount,0);
    assert.equal(restored.shop.credits,4001);
  }
  assert.deepEqual(restoreHouseholdBills(null,90*D).lastPaidCycle,0);
});
test('W4-C: bill-payment is visible in actual period finance graphs, never on issue',()=>{
  const r=family();
  day(r,7);
  assert.equal(financeAnalytics(r,{mode:'all'}).count,0);
  const p=payHouseholdBill(r);
  Object.assign(r,{shop:p.shop,financialHistory:p.financialHistory,
    householdBills:p.householdBills});
  const a=financeAnalytics(r,{mode:'all'});
  assert.equal(a.count,1);assert.equal(a.expense,180);
  assert.equal(a.expenses.Счета,180);
  assert.equal(a.income,0);
  assert.equal(a.grouped.reduce((sum,x)=>sum+x.expense,0),180);
  const rows=financeRows(r,'expense',120);
  assert.equal(rows.length,1);assert.equal(rows[0].title,'Оплата семейного счёта');
});
test('W4-C: finite receipts and durable paid-cycle keep idempotency past 120 payments',()=>{
  const r=family();
  for(let i=1;i<=FINANCE_HISTORY_LIMIT+15;i++){
    day(r,i*7);
    const pay=payHouseholdBill(r);
    assert.equal(pay.ok,true,'cycle '+i);
    Object.assign(r,{shop:pay.shop,financialHistory:pay.financialHistory,
      householdBills:pay.householdBills});
    // Keep sufficient money: later top-ups are historical external earnings in this synthetic test.
    r.shop.credits+=BILL_AMOUNT;
  }
  assert.equal(r.financialHistory.entries.length,FINANCE_HISTORY_LIMIT);
  assert.equal(r.householdBills.lastPaidCycle,FINANCE_HISTORY_LIMIT+15);
  assert.equal(payHouseholdBill(r).reason,'no-bill');
  assert.equal(loadHousehold(copy(r)).householdBills.lastPaidCycle,FINANCE_HISTORY_LIMIT+15);
});
test('W4-C: household tick drives billing once, pause and invalid ticks do not',()=>{
  const r=family();
  day(r,6);r.minutes=7*D-0.1;r.otherSim.minutes=r.minutes;
  r.paused=true;
  tickHousehold(r,0.2);assert.equal(householdBillView(r).unpaidCount,0);
  assert.equal(r.householdBills.lastIssuedCycle,0);
  r.paused=false;r.autonomy.enabled=false;r.otherSim.autonomy.enabled=false;
  const events=tickHousehold(r,0.2);
  assert.ok(events.some(e=>e.type==='bill-issued'));
  assert.equal(r.householdBills.lastIssuedCycle,1);
});
test('W4-C: static Pages and touch interface contain the new bill module',()=>{
  const html=readFileSync('index.html','utf8');
  const pages=readFileSync('.github/workflows/pages.yml','utf8');
  const phone=readFileSync('src/finance-phone-ui.js','utf8');
  const game=readFileSync('src/game.js','utf8');
  assert.match(html,/src\/household-bills\.js/);
  assert.match(pages,/cp src\/career-work\.js.*src\/household-bills\.js/);
  assert.match(phone,/finance-bill-pay/);
  assert.match(phone,/Счета за дом/);
  assert.match(game,/billsNeedsPersistence/);
});

test('W4-C: manual payment uses a whole-minute journal stamp during live fractional ticks',()=>{
  const r=family();day(r,7);
  r.minutes+=.31; // Actual PlayCanvas fixed step advances the one household clock fractionally.
  const payment=payHouseholdBill(r);
  assert.equal(payment.ok,true);
  assert.equal(payment.entry.atGameMinute,Math.round(r.minutes));
  assert.equal(payment.entry.delta,-BILL_AMOUNT);
});
