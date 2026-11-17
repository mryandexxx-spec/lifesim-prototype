/** W1-A.3: mobile calendar DOM adapter. No engine or wall clock dependencies. */
import {calendarAt,civilToSerial,serialToCivil,toISODate,parseCivilDate,monthCells,
 weekdayFromSerial,WEEKDAYS_RU,MONTHS_RU,daysInMonth} from './calendar-core.js';
import {addCalendarEvent,editCalendarEvent,removeCalendarEvent,changeEventOccurrence,
 expandCalendarEvents,findEventConflicts} from './calendar-events.js';
import {holidayDefinitions,expandHolidays,saveHoliday,removeHoliday,isCalendarDayOff} from './calendar-holidays.js';
const pad=n=>String(n).padStart(2,'0'),time=n=>pad(Math.floor(n/60))+':'+pad(n%60);
const fromTime=s=>/^\d{2}:\d{2}$/.test(s)?Number(s.slice(0,2))*60+Number(s.slice(3,5)):NaN;
const addDays=(iso,n)=>toISODate(serialToCivil(civilToSerial(iso)+n));
const showDate=iso=>{const d=parseCivilDate(iso);return d?d.day+' '+MONTHS_RU[d.month-1]+' '+d.year:'—';};
const monthNames=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
const markup=`
<div class="lc-scrim" data-lc-close></div>
<div class="lc-sheet" role="dialog" aria-modal="true" aria-labelledby="lc-title" tabindex="-1">
<div class="lc-top"><div><small>Блин’С · расписание семьи</small><h2 id="lc-title">Календарь</h2></div><button id="lc-close" type="button" aria-label="Закрыть">✕</button></div>
<div class="lc-controls"><button id="lc-prev">‹</button><strong id="lc-period"></strong><button id="lc-next">›</button><button id="lc-today">Сегодня</button></div>
<div class="lc-tabs"><button data-lc-view="month">Месяц</button><button data-lc-view="week">Неделя</button><button data-lc-view="day">День</button></div>
<div id="lc-browse">
 <div id="lc-days" class="lc-days"></div>
 <div class="lc-heading"><h3 id="lc-selected"></h3><button id="lc-add">+ Событие</button></div>
 <div id="lc-agenda" class="lc-agenda"></div>
 <div class="lc-heading"><h3>Ближайшее</h3><button id="lc-add-holiday">+ Праздник</button></div>
 <div id="lc-upcoming" class="lc-upcoming"></div>
 <details class="lc-settings"><summary>Праздники и настройки</summary>
 <fieldset id="lc-weekends"><legend>Выходные дни недели</legend>
  <div class="lc-weekdays"><label><input type="checkbox" data-weekend="0"/>Пн</label><label><input type="checkbox" data-weekend="1"/>Вт</label>
  <label><input type="checkbox" data-weekend="2"/>Ср</label><label><input type="checkbox" data-weekend="3"/>Чт</label>
  <label><input type="checkbox" data-weekend="4"/>Пт</label><label><input type="checkbox" data-weekend="5"/>Сб</label>
  <label><input type="checkbox" data-weekend="6"/>Вс</label></div></fieldset>
 <div id="lc-holidays"></div><button id="lc-anchor">Начальная дата игры</button><small>Изменить дату можно до появления событий и пользовательских праздников.</small></details>
</div>
<form id="lc-event-form" class="lc-form" hidden>
<h3>Событие</h3>
<label>Название<input name="title" required maxlength="80"/></label>
<label>Описание<textarea name="description" maxlength="280" rows="2"></textarea></label>
<label>Дата<input name="date" type="date" required/></label>
<label class="lc-check"><input name="allDay" type="checkbox"/> Весь день</label>
<div class="lc-fields"><label>Начало<input name="start" type="time"/></label><label>Конец<input name="end" type="time"/></label></div>
<label>Участники<select name="participants"><option value="both">Алекс и Мира</option><option value="alex">Алекс</option><option value="mira">Мира</option></select></label>
<label>Категория<select name="category"><option value="family">Семейное</option><option value="personal">Личное</option><option value="meeting">Встреча</option><option value="holiday">Праздник</option><option value="other">Другое</option></select></label>
<label>Повтор<select name="repeat"><option value="none">Один раз</option><option value="daily">Каждый день</option><option value="weekly">Каждую неделю</option><option value="monthly">Каждый месяц</option><option value="yearly">Каждый год</option></select></label>
<fieldset id="lc-week"><legend>Дни недели</legend><div class="lc-weekdays">
<label><input name="w0" type="checkbox"/>Пн</label><label><input name="w1" type="checkbox"/>Вт</label><label><input name="w2" type="checkbox"/>Ср</label><label><input name="w3" type="checkbox"/>Чт</label><label><input name="w4" type="checkbox"/>Пт</label><label><input name="w5" type="checkbox"/>Сб</label><label><input name="w6" type="checkbox"/>Вс</label>
</div></fieldset>
<div class="lc-fields"><label>Повторять до<input name="until" type="date"/></label><label>Количество<input name="count" type="number" min="1" max="10000" placeholder="Без лимита"/></label></div>
<label>Напоминание<select name="reminder"><option value="none">Нет</option><option value="0">В начале</option><option value="15">За 15 игровых минут</option><option value="60">За час</option><option value="1440">За сутки</option></select></label>
<label id="lc-scope-box">Изменение<select name="scope"><option value="series">Всю серию</option><option value="one">Только этот повтор</option></select></label>
<p id="lc-event-error" class="lc-error" role="alert" hidden></p>
<div class="lc-form-actions"><button type="button" id="lc-event-back">Назад</button><button type="button" id="lc-event-delete">Удалить</button><button type="submit">Сохранить</button></div>
</form>
<form id="lc-holiday-form" class="lc-form" hidden>
<h3>Праздник</h3><label>Название<input name="title" required maxlength="80"/></label>
<div class="lc-fields"><label>Месяц<select name="month"><option value="1">Январь</option><option value="2">Февраль</option><option value="3">Март</option><option value="4">Апрель</option><option value="5">Май</option><option value="6">Июнь</option><option value="7">Июль</option><option value="8">Август</option><option value="9">Сентябрь</option><option value="10">Октябрь</option><option value="11">Ноябрь</option><option value="12">Декабрь</option></select></label>
<label>День<input name="day" type="number" min="1" max="31" required/></label></div>
<label class="lc-check"><input name="dayOffWork" type="checkbox"/> Нерабочий день (для карьеры)</label>
<label class="lc-check"><input name="enabled" type="checkbox" checked/> Праздник включён</label>
<p id="lc-holiday-error" class="lc-error" role="alert" hidden></p>
<div class="lc-form-actions"><button type="button" id="lc-holiday-back">Назад</button><button type="button" id="lc-holiday-delete">Удалить</button><button type="submit">Сохранить</button></div>
</form></div>`;
export function createCalendarUI({host,getRoot,setCalendar,notify,onAnchor,onClose=()=>{}}){
 const wrap=document.createElement('section');wrap.id='life-calendar';wrap.className='life-calendar';wrap.hidden=true;wrap.innerHTML=markup;host.append(wrap);
 const el=id=>wrap.querySelector('#'+id),eventForm=el('lc-event-form'),holidayForm=el('lc-holiday-form');
 const field=(f,name)=>f.elements.namedItem(name),browse=el('lc-browse');
 let view='month',selected=null,editing=null,holidayEditing=null,cache='';
 const today=()=>calendarAt(getRoot().calendar,getRoot().minutes).iso;
 function commit(calendar){setCalendar(calendar);cache='';}
 function close(){wrap.hidden=true;eventForm.hidden=true;holidayForm.hidden=true;editing=null;holidayEditing=null;onClose();}
 function back(){browse.hidden=false;eventForm.hidden=true;holidayForm.hidden=true;editing=null;holidayEditing=null;}
 function open(){selected=selected||today();wrap.hidden=false;back();cache='';render();el('lc-close').focus({preventScroll:true});}
 function move(n){
  const d=parseCivilDate(selected);
  if(view==='day')selected=addDays(selected,n);
  else if(view==='week')selected=addDays(selected,n*7);
  else {const value=d.year*12+d.month-1+n,y=Math.floor(value/12),m=(value%12+12)%12+1;
   selected=toISODate({year:y,month:m,day:Math.min(d.day,daysInMonth(y,m))});}
  cache='';render();
 }
 function row(title,detail,callback,holiday=false){
  const b=document.createElement('button');b.type='button';b.className='lc-entry'+(holiday?' lc-holiday':'');
  const name=document.createElement('strong');name.textContent=title;
  const note=document.createElement('small');note.textContent=detail;b.append(name,note);b.addEventListener('click',callback);return b;
 }
 function render(){
  if(wrap.hidden||!eventForm.hidden||!holidayForm.hidden)return;
  const now=today(),d=parseCivilDate(selected),c=getRoot().calendar;
  if(!d)return;
  const key=[view,selected,now,JSON.stringify(c.events||[]),JSON.stringify(c.holidays||[]),
   JSON.stringify(c.occurrenceOverrides||[])].join('|');
  if(cache===key)return;cache=key;
  wrap.querySelectorAll('[data-lc-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lcView===view)));
  const from=view==='month'?toISODate({year:d.year,month:d.month,day:1}):
   view==='week'?addDays(selected,-weekdayFromSerial(civilToSerial(selected))):selected;
  const to=view==='month'?toISODate({year:d.year,month:d.month,day:daysInMonth(d.year,d.month)}):
   view==='week'?addDays(from,6):selected;
  el('lc-period').textContent=view==='month'?monthNames[d.month-1]+' '+d.year:
    view==='week'?showDate(from)+' — '+showDate(to):showDate(selected);
  const events=expandCalendarEvents(c,from,to),holidays=expandHolidays(c,from,to);
  const grid=el('lc-days');grid.replaceChildren();grid.className='lc-days lc-'+view;
  if(view!=='day'){
   for(const s of WEEKDAYS_RU){const tag=document.createElement('span');tag.textContent=s;tag.className='lc-week-label';grid.append(tag);}
   const cells=view==='month'?monthCells(d.year,d.month):
     Array.from({length:7},(_,i)=>{const iso=addDays(from,i);return {...parseCivilDate(iso),iso,inMonth:true};});
   for(const day of cells){
    const b=document.createElement('button');b.type='button';b.className='lc-date';
    if(!day.inMonth)b.classList.add('lc-outside');
    if(day.iso===selected)b.classList.add('lc-active');
    if(day.iso===now)b.classList.add('lc-today');
    if(isCalendarDayOff(c,day.iso))b.classList.add('lc-day-off');
    const n=events.filter(e=>e.iso===day.iso).length,h=holidays.filter(x=>x.iso===day.iso).length;
    b.setAttribute('aria-label',showDate(day.iso)+(day.iso===now?' сегодня':'')+(n?' событий '+n:'')+(h?' праздников '+h:''));
    b.setAttribute('aria-pressed',String(day.iso===selected));
    const span=document.createElement('span');span.textContent=String(day.day);b.append(span);
    if(n||h){const mark=document.createElement('small');mark.textContent=(n?'●'.repeat(Math.min(3,n)):'')+(h?' ✦':'');b.append(mark);}
    b.addEventListener('click',()=>{selected=day.iso;cache='';render();});grid.append(b);
   }
  }else{const p=document.createElement('p');p.className='lc-day-summary';p.textContent=showDate(selected)+' · '+WEEKDAYS_RU[weekdayFromSerial(civilToSerial(selected))];grid.append(p);}
  el('lc-selected').textContent=showDate(selected)+(selected===now?' · сегодня':'')+(isCalendarDayOff(c,selected)?' · выходной':'');
  const agenda=el('lc-agenda');agenda.replaceChildren();
  for(const h of holidays.filter(h=>h.iso===selected))
   agenda.append(row('✦ '+h.title,'Праздник'+(h.dayOffWork?' · нерабочий':''),()=>showHoliday(h),true));
  for(const e of events.filter(e=>e.iso===selected))
   agenda.append(row(e.title,(e.allDay?'Весь день':time(e.start)+'–'+time(e.end))+' · '+
    (e.participants.length===2?'Алекс и Мира':e.participants[0]==='alex'?'Алекс':'Мира')+
    (e.repeat!=='none'?' · ↻':''),()=>showEvent(e)));
  if(!agenda.childNodes.length){const p=document.createElement('p');p.textContent='На эту дату событий нет.';agenda.append(p);}
  const upcoming=el('lc-upcoming');upcoming.replaceChildren();
  const future=[...expandCalendarEvents(c,now,addDays(now,30)),...expandHolidays(c,now,addDays(now,30))]
   .sort((a,b)=>a.iso.localeCompare(b.iso)||a.start-b.start).slice(0,8);
  for(const x of future){const holiday=x.id.startsWith('h-');
    upcoming.append(row((holiday?'✦ ':'')+x.title,showDate(x.iso)+' · '+
     (holiday||x.allDay?'весь день':time(x.start)),
     ()=>{selected=x.iso;cache='';render();},holiday));}
  if(!future.length)upcoming.textContent='На ближайший месяц событий нет.';
  const holidaysList=el('lc-holidays');holidaysList.replaceChildren();
  for(const h of holidayDefinitions(c))
    holidaysList.append(row(h.title,pad(h.day)+'.'+pad(h.month)+' · '+(h.enabled?'включён':'выключен')+
      (h.dayOffWork?' · нерабочий':''),()=>showHoliday(h),true));
  wrap.querySelectorAll('[data-weekend]').forEach(box=>{
    box.checked=(c.weekendDays??[5,6]).includes(Number(box.dataset.weekend));
   });
   el('lc-anchor').disabled=Boolean(c.events?.length||c.holidays?.length||c.reminderReceipts?.length);
 }
 function eventFields(){
  el('lc-week').hidden=field(eventForm,'repeat').value!=='weekly';
  for(const n of ['start','end'])field(eventForm,n).disabled=field(eventForm,'allDay').checked;
 }
 // Editing an occurrence must NEVER silently re-anchor its entire series.
 // For a single override show the chosen day; for the series show original fields.
 function fillEventDetails(item){
  const f=n=>field(eventForm,n),source=item||null;
  f('title').value=source?.title||'';f('description').value=source?.description||'';
  f('date').value=source?.iso||source?.date||selected;
  f('allDay').checked=source?.allDay||false;
  f('start').value=time(source?.start??1080);
  f('end').value=time(source?.end===1440?1439:source?.end??1140);
  f('participants').value=source?.participants?.length===2?'both':source?.participants?.[0]||'both';
  f('category').value=source?.category||'family';
  f('repeat').value=source?.repeat||'none';f('until').value=source?.until||'';
  f('count').value=source?.count||'';
  f('reminder').value=source?.reminder===null||source?.reminder===undefined?'none':String(source.reminder);
  for(let i=0;i<7;i++)f('w'+i).checked=(source?.weekdays||
    [weekdayFromSerial(civilToSerial(selected))]).includes(i);
 }
 function syncEventScope({refill=false}={}){
  const f=n=>field(eventForm,n),single=Boolean(editing&&editing.repeat!=='none'&&f('scope').value==='one');
  const source=single?editing:getRoot().calendar.events?.find(x=>x.id===editing?.id)||editing;
  if(refill&&editing)fillEventDetails(single?{...source,iso:editing.iso}:source);
  f('date').disabled=single;
  for(const name of ['repeat','until','count'])f(name).disabled=single;
  for(let i=0;i<7;i++)f('w'+i).disabled=single;
  eventFields();
 }
 function showEvent(item=null){
  editing=item;browse.hidden=true;holidayForm.hidden=true;eventForm.hidden=false;
  const f=n=>field(eventForm,n);
  f('scope').value=item?.overridden?'one':'series';
  const single=Boolean(item?.overridden);
  const base=item?getRoot().calendar.events?.find(x=>x.id===item.id):null;
  fillEventDetails(single?item:base||item);
  el('lc-scope-box').hidden=!item||item.repeat==='none';
  el('lc-event-delete').hidden=!item;
  el('lc-event-error').hidden=true;
  syncEventScope();
  f('title').focus({preventScroll:true});
 }
 function eventData(){
  const f=n=>field(eventForm,n),allDay=f('allDay').checked,start=allDay?0:fromTime(f('start').value),end=allDay?1440:fromTime(f('end').value);
  if(!parseCivilDate(f('date').value)||!Number.isInteger(start)||!Number.isInteger(end)||end<=start)
   throw new RangeError('Проверьте дату и время: окончание должно быть позже начала');
  const weekdays=Array.from({length:7},(_,i)=>i).filter(i=>f('w'+i).checked);
  if(f('repeat').value==='weekly'&&!weekdays.length)throw new RangeError('Выберите дни недели');
  return {title:f('title').value,description:f('description').value,date:f('date').value,
   allDay,start,end,participants:f('participants').value==='both'?['alex','mira']:[f('participants').value],
   category:f('category').value,repeat:f('repeat').value,weekdays,
   until:f('until').value||null,count:f('count').value?Number(f('count').value):null,
   reminder:f('reminder').value==='none'?null:Number(f('reminder').value)};
 }
 function showHoliday(item=null){
  holidayEditing=item;browse.hidden=true;eventForm.hidden=true;holidayForm.hidden=false;
  const f=n=>field(holidayForm,n),date=parseCivilDate(selected);
  f('title').value=item?.title||'';f('month').value=String(item?.month||date.month);
  f('day').value=String(item?.day||date.day);
  f('enabled').checked=item?.enabled??true;f('dayOffWork').checked=item?.dayOffWork||false;
  el('lc-holiday-delete').hidden=!item;el('lc-holiday-error').hidden=true;f('title').focus({preventScroll:true});
 }
 el('lc-close').addEventListener('click',close);wrap.querySelector('[data-lc-close]').addEventListener('click',close);
 el('lc-prev').addEventListener('click',()=>move(-1));el('lc-next').addEventListener('click',()=>move(1));
 el('lc-today').addEventListener('click',()=>{selected=today();cache='';render();});
 wrap.querySelectorAll('[data-lc-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.lcView;cache='';render();}));
 el('lc-add').addEventListener('click',()=>showEvent());el('lc-add-holiday').addEventListener('click',()=>showHoliday());
 el('lc-event-back').addEventListener('click',()=>{back();cache='';render();});
 el('lc-holiday-back').addEventListener('click',()=>{back();cache='';render();});
 el('lc-anchor').addEventListener('click',()=>{close();onAnchor();});
 wrap.querySelectorAll('[data-weekend]').forEach(box=>box.addEventListener('change',()=>{
   const weekendDays=[...wrap.querySelectorAll('[data-weekend]:checked')]
     .map(node=>Number(node.dataset.weekend)).sort((a,b)=>a-b);
   commit({...getRoot().calendar,weekendDays});render();notify('Выходные дни обновлены');
 }));
 field(eventForm,'repeat').addEventListener('change',eventFields);
 field(eventForm,'allDay').addEventListener('change',eventFields);
 field(eventForm,'scope').addEventListener('change',()=>syncEventScope({refill:true}));
 eventForm.addEventListener('submit',e=>{
  e.preventDefault();try{
   const data=eventData(),calendar=getRoot().calendar;
   const conflicts=findEventConflicts(calendar,{...data,id:editing?.id||'draft'});
   const one=editing&&field(eventForm,'scope').value==='one'&&editing.repeat!=='none';
   if(one&&data.date!==editing.iso)throw new RangeError('Дата отдельного повтора не меняется');
   commit(one?changeEventOccurrence(calendar,editing.id,editing.iso,data):
    editing?editCalendarEvent(calendar,editing.id,data):addCalendarEvent(calendar,data));
   back();render();notify(conflicts.length?'Сохранено · есть пересечения':'Событие сохранено');
  }catch(err){el('lc-event-error').textContent=err.message;el('lc-event-error').hidden=false;}
 });
 el('lc-event-delete').addEventListener('click',()=>{
  if(!editing)return;const one=field(eventForm,'scope').value==='one'&&editing.repeat!=='none';
  if(!window.confirm(one?'Удалить только этот повтор?':'Удалить событие и все повторения?'))return;
  commit(one?changeEventOccurrence(getRoot().calendar,editing.id,editing.iso,{deleted:true}):
   removeCalendarEvent(getRoot().calendar,editing.id));back();render();notify('Событие удалено');
 });
 holidayForm.addEventListener('submit',e=>{
  e.preventDefault();try{
   const f=n=>field(holidayForm,n);
   commit(saveHoliday(getRoot().calendar,{id:holidayEditing?.id,title:f('title').value,
    month:Number(f('month').value),day:Number(f('day').value),enabled:f('enabled').checked,
    dayOffWork:f('dayOffWork').checked}));
   back();render();notify('Праздник сохранён');
  }catch(err){el('lc-holiday-error').textContent=err.message;el('lc-holiday-error').hidden=false;}
 });
 el('lc-holiday-delete').addEventListener('click',()=>{
  if(!holidayEditing||!window.confirm('Удалить праздник? Встроенный праздник выключится.'))return;
  commit(removeHoliday(getRoot().calendar,holidayEditing.id));back();render();notify('Праздник изменён');
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!wrap.hidden){e.preventDefault();close();}});
 return {open,close,tick:render,refresh:()=>{cache='';render();},reset:()=>{close();selected=null;cache='';}};
}
