import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold} from '../src/household.js';
import {calendarAt} from '../src/calendar-core.js';
import {FINANCE_HISTORY_LIMIT} from '../src/finance-ledger.js';
import {financePeriod,financeAnalytics,financeAssessment,financeRows,financeReceipt,
  credits,FINANCE_PAGE_SIZE} from '../src/finance-presentation.js';

const copy=o=>JSON.parse(JSON.stringify(o));
const D=1440;
function root(){
  const r=newHousehold('2026-11-01');
  r.minutes=D*17+720;r.otherSim.minutes=r.minutes;
  // Day zero = Nov 1; today = Nov 18. Real saved ledger operations only.
  const items=[
    ['salary',300,10,'alex'],['purchase',-150,12,null],
    ['art-sale',200,14,'mira'],['sale',91,15,null],
    ['undo',-41,16,null],['redo',41,17,null]
  ];
  let amount=5000;
  r.financialHistory={schema:1,nextId:7,entries:items.map(([kind,delta,day,actorId],i)=>{
    amount+=delta;
    return {id:'fin-'+(i+1),kind,delta,balanceAfter:amount,
      atGameMinute:day*D+600,sourceId:'source-'+(i+1),actorId};
  })};
  r.shop.credits=amount;
  return r;
}
test('W4-B: date ranges use game calendar; quick, custom, inclusive both boundary days',()=>{
  const r=root();
  assert.equal(calendarAt(r.calendar,r.minutes).iso,'2026-11-18');
  const week=financePeriod(r,{mode:'7'});
  assert.deepEqual([week.startDate,week.endDate,week.days],
    ['2026-11-12','2026-11-18',7]);
  const month=financePeriod(r,{mode:'30'});
  assert.deepEqual([month.startDate,month.endDate],['2026-11-01','2026-11-18']);
  const all=financePeriod(r,{mode:'all'});
  assert.deepEqual([all.startDate,all.endDate],['2026-11-11','2026-11-18']);
  const exact=financeAnalytics(r,{mode:'custom',startDate:'2026-11-13',endDate:'2026-11-15'});
  assert.equal(exact.count,2,'both Nov13 purchase and Nov15 art sale included');
  assert.equal(exact.income,200);assert.equal(exact.expense,150);
  assert.equal(exact.net,50);assert.equal(exact.startDate,'2026-11-13');
  assert.equal(financeAnalytics(r,{mode:'7'}).count,5);
  assert.equal(financeAnalytics(r,{mode:'all'}).count,6);
  assert.equal(financePeriod(r,{mode:'custom',startDate:'2026-11-18',endDate:'2026-11-18'}).ok,true);
});
test('W4-B: game month/year rollover and leap day, no device dates',()=>{
  const r=newHousehold('2024-02-27');
  r.minutes=4*D+100;
  const p=financePeriod(r,{mode:'custom',startDate:'2024-02-29',endDate:'2024-03-02'});
  assert.equal(p.ok,true);assert.equal(p.days,3);
  for(const bad of [
    {startDate:'2024-03-02',endDate:'2024-02-29'},
    {startDate:'2024-02-28',endDate:'2024-03-03'},
    {startDate:'2024-02-26',endDate:'2024-03-01'},
    {startDate:'2024-02-30',endDate:'2024-03-01'},
    {startDate:'',endDate:'2024-03-01'}]){
    const got=financePeriod(r,{mode:'custom',...bad});
    assert.equal(got.ok,false);
  }
});
test('W4-B: receipts display categories and signed amounts + after each, newest first',()=>{
  const r=root(),rows=financeRows(r,'all',20);
  assert.equal(rows.length,6);
  assert.equal(rows[0].title,'Повтор действия с мебелью');
  assert.equal(rows[0].sign,'+');assert.equal(rows[0].balanceAfter,5441);
  assert.equal(rows[0].date,'2026-11-18');assert.equal(rows[0].time,'10:00');
  assert.equal(rows[1].sign,'−');
  assert.equal(rows.at(-1).actor,'Алекс');
  assert.equal(rows.at(-1).title,'Зарплата за смену');
  assert.equal(financeRows(r,'income',100).length,4);
  assert.equal(financeRows(r,'expense',100).length,2);
  assert.equal(financeRows(r,'all',120).length,6);
  assert.equal(FINANCE_PAGE_SIZE,20);
  assert.match(credits(5400),/5.*400 кр./);
  assert.equal(r.shop.credits,5441);
});
test('W4-B: all analytics and advice use same selected period; returns never fake wage',()=>{
  const r=root(),a=financeAnalytics(r,{mode:'7'});
  assert.deepEqual([a.income,a.expense,a.net,a.count],[332,191,141,5]);
  assert.equal(a.sources.salary,0);
  assert.deepEqual([a.expenses.Мебель,a.expenses.Корректировки],[150,41]);
  assert.equal(a.grouped.reduce((sum,p)=>sum+p.income,0),a.income);
  assert.equal(a.grouped.reduce((sum,p)=>sum+p.expense,0),a.expense);
  assert.equal(a.points.length,a.count);
  assert.equal(a.points.at(-1).balance,5441);
  assert.equal(a.currentBalance,r.shop.credits,'current wallet not a selected-range balance');
  const advice=financeAssessment(a);
  assert.match(advice.level,/Поступления выше/);
  assert.ok(advice.tips.some(s=>s.includes('зарплат не записано')));
  const all=financeAnalytics(r,{mode:'all'});
  assert.equal(all.sources.salary,300);
  assert.equal(financeAssessment(all).tips.some(s=>s.includes('зарплат не записано')),false);
  const prior=copy(r);
  financeAnalytics(r,{mode:'custom',startDate:'2026-11-01',endDate:'2026-11-18'});
  assert.deepEqual(r,prior,'rendering/aggregation must not change saves');
});
test('W4-B: old v1 with no journal retains money and reports absence',()=>{
  const old=root();
  delete old.financialHistory;
  old.shop.credits=2719;
  const r=loadHousehold(copy(old));
  const a=financeAnalytics(r,{mode:'30'});
  assert.equal(a.ok,true);assert.equal(a.currentBalance,2719);
  assert.equal(a.count,0);assert.equal(a.income,0);assert.equal(a.expense,0);
  assert.equal(a.limited,true);assert.match(a.coverageNote,/Старые события/);
  assert.equal(financeAssessment(a).level,'Недостаточно данных');
  assert.equal(financeRows(r).length,0);
  assert.equal(r.shop.credits,2719);
});
test('W4-B: large journal bounded to 120; many dates use limited chart columns',()=>{
  const r=root();
  const rows=[];
  for(let i=0;i<FINANCE_HISTORY_LIMIT+30;i++)rows.push({
    id:'fin-'+(i+1),kind:'purchase',delta:-1,
    atGameMinute:100+i*D,balanceAfter:15000-i,actorId:null,sourceId:'object-'+i
  });
  r.minutes=D*280+200;
  r.financialHistory={schema:1,nextId:rows.length+1,entries:rows};
  const a=financeAnalytics(r,{mode:'all'});
  assert.equal(a.entries.length,FINANCE_HISTORY_LIMIT);
  assert.equal(a.count,FINANCE_HISTORY_LIMIT);
  assert.equal(a.limited,true);
  assert.ok(a.grouped.length<=32,'bounded chart bars for lengthy periods');
  assert.equal(financeRows(r,'all',200).length,FINANCE_HISTORY_LIMIT);
});
test('W4-B: no scores, extra accounts or mutated wallet in presentation modules',()=>{
  const presentation=readFileSync('src/finance-presentation.js','utf8');
  const phone=readFileSync('src/finance-phone-ui.js','utf8');
  const game=readFileSync('src/game.js','utf8');
  const html=readFileSync('index.html','utf8');
  const pages=readFileSync('.github/workflows/pages.yml','utf8');
  assert.ok(game.includes("financeTrigger:$('family-balance-chip')"));
  assert.match(html,/id="family-balance-chip"/);
  assert.match(phone,/finance-date-start/);
  assert.match(phone,/finance-date-end/);
  assert.match(pages,/src\/finance-phone-ui\.js/);
  assert.match(pages,/src\/finance-presentation\.js/);
  assert.doesNotMatch(presentation,/setItem\(|localStorage|Math\.random/);
  assert.doesNotMatch(phone,/root\.shop\.credits\s*=/);
});
