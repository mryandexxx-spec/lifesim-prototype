/** GC-06 opt-in personal plan cards. Render only facts; no queue or reward. */
import {taskView} from './recurring-tasks.js';
import {ASPIRATIONS} from './life-aspirations.js';
const keys=new WeakMap();
const statuses={active:'В процессе',complete:'Выполнено',dismissed:'Пропущено',unavailable:'Сейчас недоступно',empty:'Нет подходящего занятия'};
export function renderRecurringTaskCards(host,root,id,onChange){
  if(!host)return;
  const view=taskView(root,id);
  const aspiration=root.lifeAspirations?.byResident?.[id]?.definitionId;
  const key=JSON.stringify([id,view,aspiration]);
  if(keys.get(host)===key)return;
  keys.set(host,key);
  const doc=host.ownerDocument,body=doc.createElement('div');
  body.className='gc-task-cards';
  const note=doc.createElement('p');note.className='gc-task-note';
  note.textContent='Необязательные задания. Без наград и штрафов.'+(Object.hasOwn(ASPIRATIONS,aspiration)?' Приоритет: '+ASPIRATIONS[aspiration].title+'.':'');
  body.append(note);
  for(const item of view){
    const card=doc.createElement('article');
    card.className='gc-task-card';card.dataset.period=item.period;card.dataset.status=item.status;
    const time=doc.createElement('small');time.className='gc-task-period';
    time.textContent=item.period==='day'?'Сегодня · до полуночи':'Неделя · до понедельника';
    const title=doc.createElement('strong');title.textContent=item.title;
    const status=doc.createElement('span');status.className='gc-task-status';
    status.textContent=statuses[item.status]||'';
    const progress=doc.createElement('span');progress.className='gc-task-progress';
    progress.textContent=item.target?item.progress+' / '+item.target+(item.period==='week'&&item.target>1?' дней':''):'';
    const detail=doc.createElement('p');detail.className='gc-task-detail';detail.textContent=item.detail||'';
    const line=doc.createElement('div');line.className='gc-task-line';line.append(status,progress);
    const actions=doc.createElement('div');actions.className='gc-task-actions';
    for(const [operation,label,enabled] of [
      ['replace',item.status==='dismissed'?'Вернуть / заменить':'Заменить',item.canReplace],
      ['dismiss','Пропустить',item.canDismiss]
    ]){
      if(!enabled)continue;
      const button=doc.createElement('button');button.type='button';button.textContent=label;
      button.dataset.taskOperation=operation;
      button.setAttribute('aria-label',label+(item.period==='day'?' ежедневное задание':' еженедельное задание'));
      button.addEventListener('click',()=>onChange(id,item.period,operation));
      actions.append(button);
    }
    card.append(time,title,line,detail,actions);body.append(card);
  }
  host.replaceChildren(body);
}
