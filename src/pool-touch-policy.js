/** LOT-D2c: read-only iPhone pool action availability and explanatory UX.
 * Enqueue remains in the existing persisted D2a action queue. This policy
 * never starts, pays for, or simulates a swimming action.
 */
import {poolHasExit} from './pool-equipment.js';
import {planPoolEntry} from './pool-navigation.js';
import {MAX_ACTION_QUEUE} from './action-queue.js';
import {SWIM_START} from './pool-swim-runtime.js';

const STAGE_TEXT=Object.freeze({
  approaching:'Идёт к бассейну',waiting:'Ждёт свободную лестницу',
  entering:'Входит в воду',swimming:'Плавает',exiting:'Плывёт к выходу',
  recovering:'Безопасно выбирается из воды'
});

export function poolActionStatus(root,id,poolId,{actionId='swim',fixtureId=null}={}){
  const actor=id==='alex'?root:id==='mira'?root?.otherSim:null;
  const pool=root?.world?.outdoors?.pools?.find(p=>p.poolId===poolId);
  const result=(available,reason='',info='')=>({available,reason,info});
  if(!actor)return result(false,'Персонаж не найден');
  if(!pool)return result(false,'Этот бассейн удалён');
  if(actor.action?.id==='swim'&&actor.action.poolId===poolId)
    return result(false,'Персонаж уже плавает или идёт к этому бассейну');
  if(!poolHasExit(root.world.outdoors,poolId))
    return result(false,'Сначала установи лестницу или ступени для выхода');
  if(actionId!=='swim'&&actionId!=='jump')
    return result(false,'Неизвестное действие');
  if(actionId==='jump'&&!root.world.outdoors.poolFixtures?.some(f=>
    f.fixtureId===fixtureId&&f.poolId===poolId&&f.kind==='board'))
    return result(false,'Трамплин убран или перемещён');
  if(actor.needs.energy<SWIM_START.energy)
    return result(false,'Мало сил: нужно не меньше 30');
  if(actor.needs.bladder<SWIM_START.bladder)
    return result(false,'Сначала в туалет: потребность ниже 25');
  if((root.actionQueues?.byResident?.[id]||[]).length>=MAX_ACTION_QUEUE)
    return result(false,'План заполнен: сначала освободи место');
  // Ignore temporary shared-ladder/slot reservations when offering a future
  // FIFO command: D2b will reserve only when the command actually starts.
  const plan=planPoolEntry(root.world,actor.position,poolId,{
    jump:actionId==='jump',fixtureId
  });
  if(!plan)return result(false,
    actionId==='jump'?'Нет безопасного прыжка или подхода к трамплину':
      'Нет безопасного подхода, свободного водного маршрута или выхода');
  const other=id==='alex'?root.otherSim:root;
  const busy=other?.action?.id==='swim'&&other.action.poolId===poolId;
  return result(true,'',busy?'Вход занят: действие подождёт в общей очереди.':
    '45 игровых минут в воде · действия можно отменить в плане.');
}

export function poolActivityLabel(action){
  if(action?.id!=='swim')return null;
  const label=STAGE_TEXT[action.stage]||'Плавание';
  return action.stage==='swimming'
    ?label+' · '+Math.min(100,Math.round((action.waterElapsed||0)/45*100))+'%'
    :label;
}
