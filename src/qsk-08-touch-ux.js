/** QSK-08: read-only, renderer-independent queue presentation.
 * Nothing here changes the action scheduler, rewards, or save format.
 */
export const BLOCKED_ACTION_MESSAGES=Object.freeze({
  'missing-target':'Предмет отсутствует или убран',
  'unreachable-route':'Нет маршрута к цели',
  'invalid-destination':'Точка недоступна',
  'unavailable-gift':'Подарок или книга отсутствует',
  'resource-busy':'Предмет или собеседник занят; попробуй позже'
});
export function blockedActionMessage(reason){
  return BLOCKED_ACTION_MESSAGES[reason]||'Причина неизвестна; проверь действие';
}
export function visibleActionPhase(label,phase,{paused=false}={}){
  if(!label)return {code:'idle',text:'Свободен'};
  if(paused)return {code:'paused',text:'Пауза · '+label};
  if(phase==='walking')return {code:'walking',text:'Идёт к цели · '+label};
  if(phase==='using'||phase==='active'||phase==='working')
    return {code:'using',text:'Выполняется · '+label};
  if(phase==='waiting')return {code:'waiting',text:'Ожидает · '+label};
  return {code:'active',text:'Занят · '+label};
}
export function queuedActionStatus(position,waitReason=null){
  if(!Number.isSafeInteger(position)||position<1)return 'Ожидает';
  if(position===1&&typeof waitReason==='string'&&waitReason.trim())
    return 'Ожидает · '+waitReason.trim();
  return 'В очереди · №'+position;
}
export function interruptionQuestion(residentName,label,{shared=false}={}){
  const name=String(residentName||'Житель');
  const task=String(label||'текущее действие');
  return 'Прервать действие «'+task+'» у '+name+'?'+
    (shared?' Это завершит общую встречу для обоих жителей.':'')+
    ' Запланированные следующие команды останутся в очереди.';
}
export function verifiedLastEvent(event){
  if(typeof event!=='string'||!event.trim())return null;
  if(/прерван|отменено|недоступ|не удалось|заблокирован/i.test(event))
    return {code:'interrupted',text:'Прервано · '+event};
  if(event==='Причесаться у зеркала — готово'||/^Речь отрепетирована · харизма \+\d+(?:\.\d+)? XP$/.test(event)||
    /заверш|выполнено|пришёл|закончено/i.test(event))
    return {code:'completed',text:'Завершено · '+event};
  return null; // Never invent completion from an arbitrary idle event.
}
