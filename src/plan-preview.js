/**
 * Read-only presenter for an individual resident's live plan.
 * No mutation, no queue reordering, no save schema; works for arbitrary IDs.
 */
export const PLAN_PREVIEW_LIMIT=3;
export function planPreview({
  residentName='Житель',
  activeLabel=null,
  pending=[],
  taskName=()=> 'Действие',
  paused=false,
  needsReply=false,
  idleLabel='Свободное время'
}={}){
  const label=typeof activeLabel==='string'&&activeLabel.trim()
    ?activeLabel.trim():null;
  const items=Array.isArray(pending)?pending:[];
  const upcoming=items.slice(0,PLAN_PREVIEW_LIMIT).map((task,index)=>({
    seq:task?.seq??null,
    type:task?.type||'unknown',
    index:index+1,
    label:String(taskName(task)??'Действие').slice(0,100)
  }));
  const heading=needsReply
    ?'⏸ Ждёт твоего ответа'
    :paused
      ?label?'⏸ Пауза · '+label:'⏸ Пауза'
      :label
        ?'Сейчас · '+label
        :items.length
          ?'Ожидает начала действия'
          :String(idleLabel||'Свободное время');
  const next=upcoming.map(task=>task.index+'. '+task.label);
  const accessible=String(residentName)+': '+heading+
    (next.length?'. Далее: '+next.join('; '):'. Нет запланированных действий')+
    (items.length>PLAN_PREVIEW_LIMIT?'; ещё '+(items.length-PLAN_PREVIEW_LIMIT):'')+
    '. Открыть очередь действий.';
  return {
    heading,
    upcoming,
    total:items.length,
    more:Math.max(0,items.length-PLAN_PREVIEW_LIMIT),
    accessible
  };
}
export function planTaskIcon(type){
  return type==='object'?'⌂':
    type==='outdoor'?'🪑':
    type==='conversation'?'☏':
    type==='social'||type==='branch'?'♡':
    type==='shared'?'♫':'•';
}
