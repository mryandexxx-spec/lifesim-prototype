// QSK-11 stage A: read-only labels for the existing 2–4-resident plan UI.
// No DOM, localStorage, queue writes, or separate game truth.
import {ACTIONS,mirrorActionLabel} from './simulation.js';
import {grillRecipe} from './grill-r1.js';
import {getActivityDefinition} from './activity-registry.js';
import {HOBBY_ACTIVITIES} from './hobby-reading.js';
import {SOCIAL_ACTIONS} from './relationships.js';
import {BRANCH_ACTIONS} from './social-graph.js';
import {CONVERSATION_TOPICS} from './conversation-engine.js';
import {GIFT_CATALOG,LEISURE_CATALOG,inventoryFor} from './gifts-leisure.js';
import {getActor,getActorName} from './household.js';
import {poolActivityLabel} from './pool-touch-policy.js';

export function labelQueuedTask(game,task){
  if(!task)return 'Неизвестное действие';
  if(task.type==='move')return 'Идти в указанное место';
  if(task.type==='outdoor')return 'Отдохнуть на садовой скамейке';
  if(task.type==='grill')return 'Гриль: '+(grillRecipe(task.recipeId)?.label||'готовка');
  if(task.type==='garden')return task.actionId==='water'?'Полить грядку':
    task.actionId==='inspect'?'Осмотреть растение':
    task.actionId==='harvest'?'Собрать садовые травы':
    task.actionId==='replant'?'Посадить травы заново':'Полюбоваться садом';
  if(task.type==='pool')return task.actionId==='jump'?'Прыгнуть и поплавать':'Плавать';
  if(task.type==='object')return task.tvTalk===true?'Поговорить с телевизором':
    task.mirrorPractice===true?'Репетировать речь':
      ACTIONS[task.actionId]?.label||'Предмет';
  if(task.type==='activity')return task.inventoryItemId?'Читать подаренную книгу':
    getActivityDefinition(HOBBY_ACTIVITIES,task.activityId)?.label||'Хобби';
  if(task.type==='social')return SOCIAL_ACTIONS[task.actionId]?.label||'Общение';
  if(task.type==='conversation')return 'Беседа: '+(CONVERSATION_TOPICS[task.topicId]?.label||'Разговор');
  if(task.type==='branch')return BRANCH_ACTIONS[task.actionId]?.label||'Общение';
  if(task.type==='shared'){
    if(task.mode==='gift')return 'Подарить: '+(GIFT_CATALOG[inventoryFor(game,task.residentId||game.selectedSim)
      .find(x=>x.id===task.choiceId)?.type]?.label||'предмет');
    return LEISURE_CATALOG[task.choiceId]?.label||'Совместный досуг';
  }
  return 'Действие';
}

export function labelActiveTask(game,id){
  const s=game.socialAction;
  if(s&&(s.initiator===id||s.partner===id)){
    if(s.conversation)return 'Беседа с '+getActorName(s.partner===id?s.initiator:s.partner);
    if(s.branchAction)return BRANCH_ACTIONS[s.branchAction.id]?.label||'Общение';
    if(s.shared)return s.shared.choiceId==='tv'?'Смотрит телевизор вместе':
      s.shared.mode==='gift'?'Вручает или принимает подарок':'Проводит время вместе';
    return SOCIAL_ACTIONS[s.kind]?.label||'Общается';
  }
  const actor=getActor(game,id);
  if(actor.action?.id==='swim')return poolActivityLabel(actor.action);
  if(mirrorActionLabel(actor.action))return mirrorActionLabel(actor.action);
  return actor.action
    ?(actor.action.id==='music'
      ?getActivityDefinition(HOBBY_ACTIVITIES,actor.action.activityId)?.label
      :null)||ACTIONS[actor.action.id]?.label||'Занятие'
    :null;
}
