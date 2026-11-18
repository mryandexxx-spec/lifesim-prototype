/** W4-B: accessible read-only Finances app inside the ONE existing career phone.
 * Owns only transient view/filter/date state. No household or simulation writes.
 */
import {financeAnalytics,financeAssessment,financeRows,financePeriod,
  FINANCE_PAGE_SIZE,credits} from './finance-presentation.js';
import {calendarAt} from './calendar-core.js';
import {householdBillView} from './household-bills.js';

const NS='http://www.w3.org/2000/svg';
function el(tag,cls,text){
  const e=document.createElement(tag);
  if(cls)e.className=cls;
  if(text!==undefined)e.textContent=text;
  return e;
}
function btn(label,fn,cls=''){
  const e=el('button','finance-action '+cls,label);
  e.type='button';e.addEventListener('click',fn);return e;
}
function svgNode(name,attrs={}){
  const e=document.createElementNS(NS,name);
  for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));
  return e;
}
function chartBase(label){
  return svgNode('svg',{viewBox:'0 0 320 145',role:'img','aria-label':label,
    class:'finance-svg',preserveAspectRatio:'xMidYMid meet'});
}
function tappable(group,text,fn){
  group.setAttribute('role','button');group.setAttribute('tabindex','0');
  group.setAttribute('aria-label',text);group.addEventListener('click',fn);
  group.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();fn();}
  });
}
function note(text,cls=''){return el('p','finance-note '+cls,text);}
function amountField(label,value,extra=''){
  const card=el('div','finance-kpi');
  card.append(el('small',null,label),el('strong',null,value));
  if(extra)card.append(el('span',null,extra));
  return card;
}
function renderBars(a,box){
  box.append(el('h3','finance-chart-heading','Поступления и расходы'));
  const chart=chartBase('Поступления и расходы по игровым датам, только записанные операции');
  const base=116,max=Math.max(1,...a.grouped.flatMap(x=>[x.income,x.expense]));
  const n=a.grouped.length;
  const width=288/Math.max(1,n),bar=Math.max(1.4,Math.min(10,width*.34));
  chart.append(svgNode('line',{x1:12,y1:base,x2:310,y2:base,stroke:'#9fbab0',
    'stroke-width':1}));
  const selected=note('Коснись столбца, чтобы увидеть сумму за период.','finance-chart-detail');
  for(let i=0;i<n;i++){
    const bucket=a.grouped[i],x=14+i*width,center=x+width/2;
    const g=svgNode('g');
    const h1=bucket.income/max*88,h2=bucket.expense/max*88;
    g.append(svgNode('rect',{x:center-bar-1,y:base-h1,width:bar,height:Math.max(1,h1),
      fill:'#377e69',rx:1}));
    g.append(svgNode('rect',{x:center+1,y:base-h2,width:bar,height:Math.max(1,h2),
      fill:'#d18b66',rx:1}));
    // Transparent hit rectangle covers both bars, including zero-height records.
    g.append(svgNode('rect',{x:x,y:15,width:Math.max(width,3),height:105,
      fill:'transparent'}));
    const details=bucket.label+': поступления '+credits(bucket.income)+
      ', расходы '+credits(bucket.expense);
    tappable(g,details,()=>{selected.textContent=details;});
    chart.append(g);
    if(n<=10||i%Math.ceil(n/6)===0){
      const tick=svgNode('text',{x:center,y:137,'text-anchor':'middle',fill:'#61766a',
        'font-size':n>10?8:9});
      tick.textContent=bucket.from.slice(5);chart.append(tick);
    }
  }
  box.append(chart);
  const legend=el('p','finance-legend');
  legend.append(el('span','finance-green','● Поступления'),el('span','finance-orange','● Расходы'));
  box.append(legend,selected);
}
function renderLine(a,box){
  box.append(el('h3','finance-chart-heading','Изменение остатка'));
  if(!a.points.length){
    box.append(note('За период нет записанных изменений баланса.'));return;
  }
  const chart=chartBase('Остаток после каждой записанной операции');
  const amounts=a.points.map(p=>p.balance),min=Math.min(...amounts),
    max=Math.max(...amounts),spread=Math.max(1,max-min);
  const first=a.points[0].minute,last=a.points.at(-1).minute;
  const coords=a.points.map((p,i)=>({
    x:first===last?160:16+(p.minute-first)/(last-first)*288,
    y:112-(p.balance-min)/spread*91,p
  }));
  chart.append(svgNode('line',{x1:12,y1:116,x2:309,y2:116,stroke:'#9fbab0'}));
  if(coords.length>1){
    const path=coords.map((p,i)=>(i?'L':'M')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' ');
    chart.append(svgNode('path',{d:path,stroke:'#397b72','stroke-width':2.6,
      fill:'none','stroke-linejoin':'round'}));
  }
  const detail=note('Точки показывают только зафиксированный остаток после операции.',
    'finance-chart-detail');
  for(const {x,y,p} of coords){
    const g=svgNode('g');
    g.append(svgNode('circle',{cx:x,cy:y,r:3.8,fill:'#236b66'}));
    const details=p.date+' '+p.time+': остаток '+credits(p.balance);
    tappable(g,details,()=>{detail.textContent=details;});
    chart.append(g);
  }
  const minDate=svgNode('text',{x:15,y:135,fill:'#61766a','font-size':10});
  minDate.textContent=coords[0].p.date.slice(5);
  chart.append(minDate);
  const maxDate=svgNode('text',{x:309,y:135,'text-anchor':'end',
    fill:'#61766a','font-size':10});
  maxDate.textContent=coords.at(-1).p.date.slice(5);
  chart.append(maxDate,);
  box.append(chart,detail);
}
function renderBreakdown(a,box){
  box.append(el('h3','finance-chart-heading','Структура расходов'));
  const rows=Object.entries(a.expenses).filter(([,v])=>v>0);
  if(!rows.length){box.append(note('За выбранный период нет записанных расходов.'));return;}
  for(const [name,value] of rows){
    const wrap=el('div','finance-breakdown-item');
    const label=el('div','finance-breakdown-label');
    label.append(el('strong',null,name),
      el('span',null,credits(value)+' · '+Math.round(value/a.expense*100)+'%'));
    const track=el('div','finance-breakdown-track');
    const fill=el('div','finance-breakdown-fill');
    fill.style.width=(value/a.expense*100)+'%';
    fill.setAttribute('role','meter');fill.setAttribute('aria-label',name);
    fill.setAttribute('aria-valuemin','0');fill.setAttribute('aria-valuemax','100');
    fill.setAttribute('aria-valuenow',String(Math.round(value/a.expense*100)));
    track.append(fill);wrap.append(label,track);box.append(wrap);
  }
}
export function createFinancePhoneUI({body,payBill=()=>({ok:false,reason:'unavailable'})}){
  let section='overview',filter='all',shown=FINANCE_PAGE_SIZE;
  let mode='7',customStart='',customEnd='',applied={mode:'7'},error='';
  let billError='';
  const getSection=()=>section;
  const setSection=id=>{section=id;};
  function render(root){
    body.replaceChildren();
    const today=calendarAt(root.calendar,root.minutes).iso;
    const active=financeAnalytics(root,applied);
    const tabs=el('nav','finance-tabs');
    tabs.setAttribute('aria-label','Разделы финансов');
    for(const [id,label] of [['overview','Обзор'],['operations','Операции'],
        ['analytics','Аналитика']]){
      const b=btn(label,()=>{section=id;render(root);body.scrollTop=0;},
        'finance-tab'+(section===id?' finance-tab-active':''));
      b.setAttribute('aria-pressed',String(section===id));
      tabs.append(b);
    }
    body.append(tabs);
    if(section==='overview'){
      body.append(el('h2','finance-title','Деньги семьи'));
      const wallet=el('section','finance-wallet');
      wallet.append(el('small',null,'ОБЩИЙ БАЛАНС СЕМЬИ'),
        el('strong',null,credits(root.shop.credits)),
        el('span',null,'Общие деньги Алекса и Миры'));
      body.append(wallet);
      const bill=householdBillView(root);
      const invoice=el('section','finance-bills');
      invoice.append(el('h3',null,'Счета за дом'),
        note('180 кр. каждые 7 игровых дней. Оплата вручную, без штрафов.'));
      if(bill.ok){
        if(bill.unpaidCount){
          invoice.append(el('strong','finance-bills-total',
            'Неоплачено: '+bill.unpaidCount+' · '+credits(bill.totalDue)));
          invoice.append(note((bill.overdueCount?'Просрочено: '+bill.overdueCount+'. ':'')+
            'Срок старейшего счёта: '+(bill.oldestDueDate||'игровой день '+bill.oldestDueDay)+
            ' (включительно).'));
          const pay=btn('Оплатить '+credits(bill.amount),()=>{
            const response=payBill(root);
            billError=response.ok?'':response.reason==='insufficient-credits'?
              'Недостаточно кредитов для оплаты.':response.reason==='no-bill'?
              'Неоплаченных счетов нет.':'Не удалось провести платёж.';
            render(root);
          },'finance-bill-pay');
          pay.disabled=!bill.canPay;
          invoice.append(pay);
          if(!bill.canPay)invoice.append(note('Недостаточно средств для оплаты.'));
        }else invoice.append(el('strong','finance-bills-clear','Неоплаченных счетов нет'));
        invoice.append(note('Следующий счёт: '+(bill.nextIssueDate||'через '+bill.daysToIssue+
          ' игровых дней')+'.'));
      }else invoice.append(note('Счета временно недоступны.'));
      if(billError)invoice.append(note(billError,'finance-error'));
      body.append(invoice);
      body.append(note('Баланс текущий. История содержит только последние записанные операции.'));
      const quick=el('div','finance-quick-actions');
      quick.append(btn('История операций',()=>{section='operations';render(root);},
        'finance-link'),btn('Аналитика периода',()=>{section='analytics';render(root);},
        'finance-link'));
      body.append(quick);
      body.append(el('h3','finance-chart-heading','Последние операции'));
      renderReceipts(root,financeRows(root,'all',3),false);
    }else if(section==='operations'){
      body.append(el('h2','finance-title','История операций'));
      body.append(note('Записано не более 120 последних изменений. Старые события не восстановить.'));
      const filters=el('div','finance-filters');
      for(const [id,label] of [['all','Все'],['income','Доходы'],['expense','Расходы']]){
        const b=btn(label,()=>{filter=id;shown=FINANCE_PAGE_SIZE;render(root);},
          'finance-filter'+(filter===id?' finance-filter-active':''));
        b.setAttribute('aria-pressed',String(filter===id));filters.append(b);
      }
      body.append(filters);
      const rows=financeRows(root,filter,shown);
      renderReceipts(root,rows,true);
      const total=financeRows(root,filter,120).length;
      if(total>rows.length)
        body.append(btn('Показать ещё · '+rows.length+' из '+total,()=>{
          shown=Math.min(120,shown+FINANCE_PAGE_SIZE);render(root);
        },'finance-more'));
    }else{
      body.append(el('h2','finance-title','Аналитика периода'));
      const pick=el('div','finance-period-presets');
      for(const [id,label] of [['7','7 дней'],['30','30 дней'],['all','Вся история'],
        ['custom','Свой период']]){
        const b=btn(label,()=>{
          mode=id;error='';
          if(id==='custom'){
            if(!customEnd)customEnd=today;
            if(!customStart)customStart=financePeriod(root,{mode:'7'}).startDate;
          }else applied={mode:id};
          render(root);
        },'finance-preset'+(mode===id?' finance-preset-active':''));
        b.setAttribute('aria-pressed',String(mode===id));pick.append(b);
      }
      body.append(pick);
      if(mode==='custom'){
        const dates=el('div','finance-dates');
        for(const [id,label,key] of [['finance-date-start','С даты','start'],
            ['finance-date-end','По дату','end']]){
          const wrap=el('label','finance-date-field',label);
          const input=el('input');
          input.type='date';input.id=id;
          input.min=root.calendar.startCivilDate;input.max=today;
          input.value=key==='start'?customStart:customEnd;
          input.addEventListener('change',()=>{
            if(key==='start')customStart=input.value;else customEnd=input.value;
          });
          wrap.append(input);dates.append(wrap);
        }
        body.append(dates);
        const apply=btn('Применить период',()=>{
          const trial=financePeriod(root,{mode:'custom',startDate:customStart,
            endDate:customEnd});
          if(!trial.ok)error=trial.reason;
          else {error='';applied={mode:'custom',startDate:customStart,endDate:customEnd};}
          render(root);
        },'finance-apply');
        body.append(apply);
      }
      if(error)body.append(note(error,'finance-error'));
      if(!active.ok){body.append(note(active.reason,'finance-error'));return;}
      const title=el('p','finance-period-range','Период: '+
        active.startDate+' — '+active.endDate);
      body.append(title);
      body.append(note('Текущий баланс семьи: '+credits(root.shop.credits)+
        '. Итоги ниже — только за выбранный период.'));
      const metrics=el('div','finance-kpis');
      metrics.append(amountField('Поступления',credits(active.income)),
        amountField('Расходы',credits(active.expense)),
        amountField('Разница',(active.net>=0?'+':'−')+credits(Math.abs(active.net))),
        amountField('Операций',String(active.count)));
      body.append(metrics);
      const chart1=el('section','finance-chart');
      renderBars(active,chart1);body.append(chart1);
      const chart2=el('section','finance-chart');
      renderLine(active,chart2);body.append(chart2);
      const chart3=el('section','finance-chart');
      renderBreakdown(active,chart3);body.append(chart3);
      const assessment=financeAssessment(active);
      const advice=el('section','finance-assessment');
      advice.append(el('h3',null,'Оценка периода'),
        el('strong',null,assessment.level),el('p',null,assessment.reason));
      advice.append(el('h3',null,'Рекомендации'));
      const tips=el('ul');
      for(const tip of assessment.tips)tips.append(el('li',null,tip));
      advice.append(tips);body.append(advice);
      body.append(note(active.coverageNote,active.limited?'finance-coverage':''));
    }
  }
  function renderReceipts(root,rows,detail){
    const history=el('div','finance-receipts');
    if(!rows.length){
      const any=financeRows(root,'all',1).length>0;
      history.append(note(any?'По выбранному фильтру операций нет.':
        'Пока нет записанных операций. Баланс сохранён, прежние события не восстановить.')); 
      body.append(history);return;
    }
    let lastDate=null;
    for(const e of rows){
      if(e.date!==lastDate){
        history.append(el('h3','finance-receipt-day',e.date));lastDate=e.date;
      }
      const item=el('article','finance-receipt');
      const left=el('div','finance-receipt-left');
      left.append(el('strong',null,e.title),el('span',null,
        (e.actor?e.actor+' · ':'')+e.time+' · '+e.category));
      const right=el('div','finance-receipt-right');
      right.append(el('strong',e.delta>0?'finance-positive':'finance-negative',
        e.sign+e.amount));
      right.append(el('small',null,'После: '+credits(e.balanceAfter)));
      item.append(left,right);history.append(item);
    }
    body.append(history);
  }
  return {render,setSection,getSection};
}
