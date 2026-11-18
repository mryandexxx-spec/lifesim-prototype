/** W1-B shift summary: presentation-only, no salary or save mutations. */
import {careerDefinition} from './career-catalog.js';
import {careerRankForContract} from './career-specializations.js';
import {clockAt} from './career-work.js';

const NAMES={alex:'Алекс',mira:'Мира'};
const signed=n=>(n>0?'+':'')+n;
const duration=minutes=>{
  const n=Math.max(0,Math.floor(minutes||0)),h=Math.floor(n/60),m=n%60;
  return (h?h+' ч':'')+(h&&m?' ':'')+(m||!h?m+' мин':'');
};

/** Immutable view model, built from the already settled canonical contract. */
export function shiftSummaryForEvent(root,event){
  if(!root||!event||!['salary','missed'].includes(event.type)||!NAMES[event.residentId])return null;
  const contract=root.careerSystem?.byResident?.[event.residentId];
  const last=contract?.lastShift;
  if(!last||!last.id||!['worked','missed'].includes(last.outcome))return null;
  if(event.type==='salary'&&last.outcome!=='worked')return null;
  if(event.type==='missed'&&last.outcome!=='missed')return null;
  const career=careerDefinition(contract.careerId);
  return Object.freeze({
    key:event.residentId+':'+last.id,
    residentId:event.residentId,
    name:NAMES[event.residentId],
    career:career?.title||'Работа',
    role:careerRankForContract(contract)?.title||'Сотрудник',
    missed:last.outcome==='missed',
    salary:Math.max(0,last.salary||0),
    duration:duration(last.workedMinutes),
    period:clockAt(last.start)+'–'+clockAt(last.end),
    grade:last.grade||null,
    workReport:last.workReport||null,
    lateMinutes:Math.max(0,last.lateMinutes||0),
    performance:contract.performance,
    performanceDelta:Number.isInteger(last.performanceDelta)?last.performanceDelta:null,
    detail:typeof event.text==='string'?event.text:'',
  });
}

/** Keeps a once-per-shift visual queue separate from persisted settlement IDs. */
export function createShiftSummaryQueue(){
  const pending=[],seen=new Set();
  return {
    add(summary){
      if(!summary||seen.has(summary.key))return false;
      seen.add(summary.key);pending.push(summary);return true;
    },
    take:()=>pending.shift()||null,
    count:()=>pending.length,
    clear(){pending.length=0;seen.clear();}
  };
}
function el(tag,cls,text){
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!==undefined)node.textContent=text;
  return node;
}
/** Accessible, touch-sized single-focus modal, shown only on real tick transitions. */
export function createCareerShiftSummaryUI({host,getRoot,shouldDefer=()=>false}){
  const queue=createShiftSummaryQueue();
  const overlay=el('section','career-shift-summary-overlay');
  overlay.id='career-shift-summary';overlay.hidden=true;
  const shade=el('div','career-shift-summary-shade');
  shade.setAttribute('aria-hidden','true');
  const panel=el('div','career-shift-summary-card');
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
  panel.setAttribute('aria-labelledby','career-shift-summary-title');
  panel.tabIndex=-1;
  const kicker=el('span','career-shift-summary-kicker','💼 РАБОТА');
  const title=el('h2','career-shift-summary-title');
  title.id='career-shift-summary-title';
  const subtitle=el('p','career-shift-summary-subtitle');
  const money=el('strong','career-shift-summary-money');
  const moneyLabel=el('small','career-shift-summary-money-label');
  const details=el('dl','career-shift-summary-details');
  const note=el('p','career-shift-summary-note');
  const done=el('button','career-shift-summary-done','Продолжить');
  done.type='button';
  panel.append(kicker,title,subtitle,money,moneyLabel,details,note,done);
  overlay.append(shade,panel);host.append(overlay);
  let current=null,previousFocus=null;
  const isOpen=()=>!overlay.hidden;
  function dismiss(){
    if(!isOpen())return;
    overlay.hidden=true;current=null;
    const focus=previousFocus;previousFocus=null;
    if(focus?.isConnected&&typeof focus.focus==='function')focus.focus({preventScroll:true});
    flush();
  }
  done.addEventListener('click',dismiss);
  // A backdrop tap is an explicit dismissal, not a click-through to the 3D world.
  shade.addEventListener('click',dismiss);
  document.addEventListener('keydown',event=>{
    if(!isOpen())return;
    if(event.key==='Escape'){event.preventDefault();dismiss();}
    if(event.key==='Tab'){
      event.preventDefault();done.focus();
    }
  });
  function addRow(name,value){
    details.append(el('dt',null,name),el('dd',null,value));
  }
  function flush(){
    if(isOpen()||shouldDefer()||!queue.count())return false;
    const next=queue.take();
    if(!next)return false;
    current=next;previousFocus=document.activeElement;
    title.textContent=next.missed?'Смена пропущена':'Смена завершена';
    subtitle.textContent=next.name+' · '+next.career+' · '+next.role;
    money.textContent='+'+next.salary+' кр.';
    moneyLabel.textContent=next.missed?'Доход за смену: 0':'Начислено на общий счёт семьи';
    details.replaceChildren();
    addRow('График',next.period);
    if(!next.missed)addRow('Отработано',next.duration);
    if(next.grade)addRow('Оценка',next.grade);
    if(next.performanceDelta!==null)
      addRow('Результативность',signed(next.performanceDelta)+' · теперь '+next.performance+'/100');
    if(next.lateMinutes)addRow('Опоздание',duration(next.lateMinutes));
    if(next.workReport&&!next.missed)addRow('На работе',
      'Обед '+(next.workReport.meal?'✓':'—')+' · туалет '+next.workReport.toilet+
      ' · разговоры '+next.workReport.socialMinutes+' мин.');
    note.textContent=next.missed?'Смена не оплачена. Следующую можно посетить по графику.':
      'Зарплата уже начислена. '+next.name+' возвращается домой.';
    overlay.hidden=false;
    done.focus({preventScroll:true});
    return true;
  }
  return {
    isOpen,
    enqueue(events){
      let added=0;
      for(const event of events||[]){
        const summary=shiftSummaryForEvent(getRoot(),event);
        if(queue.add(summary))added++;
      }
      flush();return added;
    },
    flush,
    clear(){
      queue.clear();current=null;overlay.hidden=true;previousFocus=null;
    }
  };
}
