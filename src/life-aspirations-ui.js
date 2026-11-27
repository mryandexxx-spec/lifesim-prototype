/** GC-07 profile projection. The button callback owns the guarded save. */
import {aspirationView,aspirationChoices} from './life-aspirations.js';
const keys=new WeakMap();
export function renderAspirationCard(host,root,id,onChoose){
 if(!host)return;
 const view=aspirationView(root,id),choices=aspirationChoices(root,id),key=JSON.stringify([id,view,choices]);
 const before=keys.get(host);
 if(before?.key===key)return;
 const keepOpen=before?.id===id&&before?.selected===view.id&&host.querySelector('details')?.open;
 keys.set(host,{key,id,selected:view.id});
 const doc=host.ownerDocument,card=doc.createElement('article');
 card.className='gc-task-card gc-aspiration-card';
 const caption=doc.createElement('small');caption.className='gc-task-period';caption.textContent='ЖИЗНЕННОЕ СТРЕМЛЕНИЕ';
 const title=doc.createElement('strong');title.textContent=view.title;
 const desc=doc.createElement('p');desc.className='gc-task-detail';desc.textContent=view.description;
 card.append(caption,title,desc);
 if(view.progress){const progress=doc.createElement('p');progress.className='gc-aspiration-progress';progress.textContent=view.progress;card.append(progress);}
 if(view.requirements.length){
  const list=doc.createElement('ul');list.className='gc-aspiration-requirements';
  for(const item of view.requirements){const li=doc.createElement('li');li.textContent=(item.met?'✓ ':'○ ')+item.label;li.dataset.met=String(item.met);list.append(li);}
  const status=doc.createElement('p');status.className='gc-task-note';status.textContent=view.currentTargetMet
   ?'Условия цели выполнены сейчас. Можно продолжать жизнь или сменить направление.'
   :'Условия цели пока не выполнены. Задания подсказывают возможные занятия, но не обязательны.';
  card.append(list,status);
 }
 const picker=doc.createElement('details');picker.className='gc-aspiration-picker';picker.open=!!keepOpen;
 const summary=doc.createElement('summary');summary.textContent=view.id?'Сменить стремление':'Выбрать стремление';
 const note=doc.createElement('p');note.className='gc-task-note';
 note.textContent='Свободный выбор, без наград и штрафов. Смена начинает новый личный прогресс, но не меняет навыки, деньги и отношения.';
 picker.append(summary,note);
 for(const choice of choices){
  const row=doc.createElement('div');row.className='gc-aspiration-choice';
  const name=doc.createElement('strong');name.textContent=choice.title;
  const detail=doc.createElement('p');detail.className='gc-task-detail';detail.textContent=choice.description;
  const button=doc.createElement('button');button.type='button';button.dataset.aspiration=choice.id;
  button.textContent=choice.id===view.id?'Выбрано':choice.enabled?'Выбрать':'Недоступно';
  button.disabled=choice.id===view.id||!choice.enabled;
  button.setAttribute('aria-label','Выбрать стремление: '+choice.title);
  button.addEventListener('click',()=>onChoose(id,choice.id));
  row.append(name,detail);
  if(choice.reason){const reason=doc.createElement('p');reason.className='gc-task-note';reason.textContent=choice.reason;row.append(reason);}
  row.append(button);picker.append(row);
 }
 card.append(picker);host.replaceChildren(card);
}
