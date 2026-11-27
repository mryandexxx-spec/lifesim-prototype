import {biographyRows} from './life-biography.js';
import {careerDefinition} from './career-catalog.js';
import {specializationDefinition,careerRankForContract} from './career-specializations.js';
import {HOBBY_SKILLS,HOBBY_CONTENT} from './hobby-reading.js';
import {furnitureProduct} from './furniture-products.js';
import {formatCalendarDay} from './calendar-core.js';
const rendered=new WeakMap();
function context(root,row){
 if(['artwork','sale','display'].includes(row.key))return HOBBY_CONTENT.entries[row.context]?.label||'Картина';
 if(row.key==='hire')return careerDefinition(row.context)?.title||'Профессия';
 if(row.key==='promotion'){
  const [rank,branch]=String(row.detail||'').split(':');
  return careerRankForContract({careerId:row.context,level:Number(rank),specialization:branch?{id:branch}:null})?.title||careerDefinition(row.context)?.title||'Карьера';
 }
 if(row.key==='specialization')return specializationDefinition(row.context,row.detail)?.title||careerDefinition(row.context)?.title||'Карьера';
 if(row.key==='friendship'||row.key==='romance')return ({alex:'Алекс',mira:'Мира'})[row.context]||root.population?.residentsById?.[row.context]?.identity?.firstName||'Другой персонаж';
 if(row.key==='ability')return (HOBBY_SKILLS.skills[row.context]?.label||'Навык')+(HOBBY_CONTENT.entries[row.detail]?.label?' · '+HOBBY_CONTENT.entries[row.detail].label:'');
 if(row.key==='home')return 'Семейное событие · '+(furnitureProduct(row.context)?.name||'Обустройство дома');
 return '';
}
export function renderBiography(host,root,id){
 if(!host)return;
 const rows=biographyRows(root,id),key=JSON.stringify([id,rows]);
 if(rendered.get(host)===key)return;rendered.set(host,key);
 const d=host.ownerDocument,info=d.createElement('p');info.className='gc-biography-note';
 info.textContent='Здесь — реальные события, записанные с появления биографии. Прошлое до этого не восстановлено.';
 const list=d.createElement('ol');list.className='gc-biography-list';
 for(const row of rows){
  const li=d.createElement('li');li.dataset.milestone=row.key;
  const title=d.createElement('strong');title.textContent=row.title;
  const detail=d.createElement('span');detail.textContent=context(root,row);
  const date=d.createElement('time');date.dateTime=row.date;date.textContent=formatCalendarDay(row.date,{includeYear:true});
  li.append(date,title,detail);list.append(li);
 }
 if(!rows.length){const empty=d.createElement('p');empty.className='gc-biography-empty';empty.textContent='Пока нет записанных событий. Живи как хочется — важное останется здесь.';host.replaceChildren(info,empty);}
 else host.replaceChildren(info,list);
}
