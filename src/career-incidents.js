/** Headless W1-B.3b.2: once-only workplace situations; no wages or invented XP. */
import {deriveAxes} from './trait-catalog.js';
import {currentSkillLevel} from './skills-engine.js';
import {HOBBY_SKILLS} from './hobby-reading.js';
import {refreshMind} from './psychology.js';
import {feelMemory} from './emotion-engine.js';

const O=(id,text,feedback,performance,energy,fun,axis,memory,skill=null)=>
  Object.freeze({id,text,feedback,performance,energy,fun,axis,memory,skill});
export const WORK_INCIDENTS=Object.freeze({
  'city-services':{title:'Маршрут после перекрытия',text:'Внезапно закрыли улицу. Три срочных поручения оказались под угрозой.',options:[
    O('rush','Лично объехать квартал','Сроки спасены ценой усталости.',6,-10,-3,'resilience','work.pressure'),
    O('coordinate','Перераспределить адреса','Команда справилась сообща.',3,-3,2,'organization','work.pride'),
    O('warn','Согласовать новые сроки','Меньше суеты, но часть поручений задержалась.',-1,2,6,'empathy','work.relief')]},
  'kitchen-studio':{title:'Неожиданный ингредиент',text:'На подготовке обнаружилась партия продуктов с неверной маркировкой.',options:[
    O('recheck','Проверить все запасы','Качество под контролем, сил почти не осталось.',6,-11,-2,'organization','work.pressure','cooking'),
    O('adapt','Изменить меню','Гости получили удачное новое блюдо.',3,-4,3,'creativity','work.pride','cooking'),
    O('simplify','Объяснить гостям и сократить меню','Меньше спешки, но план продаж нарушен.',-1,2,5,'empathy','work.relief')]},
  editorial:{title:'Спорная цитата',text:'Перед выпуском заметки источник попросил изменить важную цитату.',options:[
    O('verify','Перепроверить факты','Точность сохранена, график напряжён.',6,-9,-3,'organization','work.pressure','literature'),
    O('rewrite','Переписать заметку с пояснением','Материал стал прозрачнее для читателей.',3,-3,4,'creativity','work.pride','literature'),
    O('hold','Перенести публикацию','Источник услышан, но выпуск стал беднее.',-1,1,6,'empathy','work.relief')]},
  'art-studio':{title:'Последний штрих',text:'За час до открытия экспозиции заказчик просит заменить центральный акцент.',options:[
    O('rebuild','Переделать композицию','Выставка впечатляет, но работа вымотала.',6,-11,-2,'coordination','work.pressure','painting'),
    O('accent','Создать временный акцент','Новый ход понравился посетителям.',3,-4,4,'creativity','work.pride','painting'),
    O('discuss','Согласовать правку после открытия','Открытие спокойное, пожелания отложены.',-1,2,6,'empathy','work.relief')]},
  'business-center':{title:'Несовпадение в отчёте',text:'В двух таблицах для совещания расходятся итоговые показатели.',options:[
    O('audit','Проверить все исходные строки','Ошибка найдена, но пришлось задержаться.',6,-10,-3,'organization','work.pressure'),
    O('compare','Показать наглядную сверку','Команда получила честную картину.',3,-4,3,'practicality','work.pride'),
    O('postpone','Перенести решение','Риск ошибки снижен, сроки сдвинулись.',-1,2,6,'resilience','work.relief')]},
  'civic-service':{title:'Очередь за помощью',text:'В конце дежурства сразу несколько жителей обращаются с разными просьбами.',options:[
    O('triage','Принять всех по срочности','Никто не остался без ответа, силы на исходе.',6,-11,-2,'resilience','work.pressure'),
    O('assist','Подключить коллег','Благодаря сотрудничеству очередь сократилась.',3,-4,4,'empathy','work.pride'),
    O('appointments','Назначить часть обращений на завтра','У каждого есть план, но некоторые ждут.',-1,2,6,'organization','work.relief')]}
});
const valid=n=>Number.isFinite(n)&&n>=0&&n<=5256000000;
const clip=(n,a=0,b=100)=>Math.max(a,Math.min(b,n));
const actorFor=(root,id)=>id==='mira'?root?.otherSim:root;
export const incidentId=shift=>shift.id+'#work';
export function restoreWorkIncident(shift,raw){
  const def=WORK_INCIDENTS[shift?.careerId];
  if(!def||!raw||typeof raw!=='object'||Array.isArray(raw)||
    raw.id!==incidentId(shift)||!valid(raw.createdAt)||
    raw.createdAt<shift.start||raw.createdAt>shift.end)return null;
  const choice=def.options.find(x=>x.id===raw.choiceId);
  if(raw.choiceId!==null&&!choice)return null;
  if(choice&&(!valid(raw.resolvedAt)||raw.resolvedAt<shift.start||
    !Number.isInteger(raw.performanceDelta)||raw.performanceDelta< -5||raw.performanceDelta>10||
    !Number.isInteger(raw.energyDelta)||raw.energyDelta< -20||raw.energyDelta>5||
    !Number.isInteger(raw.funDelta)||raw.funDelta< -10||raw.funDelta>10))return null;
  return {id:raw.id,careerId:shift.careerId,createdAt:raw.createdAt,
    choiceId:choice?.id??null,resolvedAt:choice?raw.resolvedAt:null,
    auto:choice?raw.auto===true:false,performanceDelta:choice?raw.performanceDelta:0,
    energyDelta:choice?raw.energyDelta:0,funDelta:choice?raw.funDelta:0};
}
export function pendingWorkIncident(root,id){
  const shift=root?.careerSystem?.byResident?.[id]?.currentShift;
  return shift?.phase==='working'&&shift.incident?.choiceId===null?shift.incident:null;
}
export function startWorkIncident(root,id,at){
  const shift=root?.careerSystem?.byResident?.[id]?.currentShift;
  if(!shift||shift.phase!=='working'||!valid(at)||
    at<shift.start+(shift.end-shift.start)/2||shift.incident||
    root.careerSystem.incidentIds?.includes(incidentId(shift))||
    !WORK_INCIDENTS[shift.careerId])return false;
  shift.incident={id:incidentId(shift),careerId:shift.careerId,
    createdAt:Math.min(at,shift.end),choiceId:null,resolvedAt:null,auto:false,
    performanceDelta:0,energyDelta:0,funDelta:0};
  return true;
}
export function chooseAutonomousWorkOption(root,id){
  const contract=root?.careerSystem?.byResident?.[id],def=WORK_INCIDENTS[contract?.careerId];
  if(!def)return null;
  const actor=actorFor(root,id),axes=deriveAxes(actor?.personality);
  const energy=actor?.needs?.energy??50;
  return [...def.options].sort((a,b)=>{
    const score=o=>o.performance*.45+o.energy*(energy<45?.65:.22)+
      o.fun*.28+(axes[o.axis]-.5)*12;
    return score(b)-score(a)||a.id.localeCompare(b.id);
  })[0].id;
}
export function decideWorkIncident(root,id,choiceId,{automatic=false}={}){
  const contract=root?.careerSystem?.byResident?.[id],
    incident=pendingWorkIncident(root,id),def=WORK_INCIDENTS[contract?.careerId];
  const option=def?.options.find(o=>o.id===choiceId),actor=actorFor(root,id);
  const ledger=root?.careerSystem?.incidentIds;
  if(!incident||!option||!actor||!Array.isArray(ledger)||ledger.includes(incident.id))
    return {ok:false,reason:'Событие уже завершено или недоступно'};
  const axes=deriveAxes(actor.personality),trait=Math.round((axes[option.axis]-.5)*4);
  const level=option.skill?currentSkillLevel(actor.skills,HOBBY_SKILLS,option.skill):0;
  const skillBonus=option.skill?Math.min(2,Math.floor(level/2)):0;
  const change=Math.max(-5,Math.min(10,option.performance+trait+skillBonus));
  const now=valid(root.minutes)?root.minutes:contract.currentShift.start;
  // Receipt and consequences are one synchronous game mutation.
  ledger.push(incident.id);
  if(ledger.length>256)ledger.splice(0,ledger.length-256);
  contract.performance=clip((Number.isFinite(contract.performance)?contract.performance:50)+change);
  if(actor.needs){
    actor.needs.energy=clip(actor.needs.energy+option.energy);
    actor.needs.fun=clip(actor.needs.fun+option.fun);
  }
  if(actor.mind&&Array.isArray(actor.mind.memories)){
    const memory={id:option.memory,at:now,fulfilled:false};
    actor.mind.memories=[...actor.mind.memories,memory].slice(-12);
    feelMemory(actor,memory);
    refreshMind(actor,root.world);
  }
  Object.assign(incident,{choiceId:option.id,resolvedAt:now,auto:automatic===true,
    performanceDelta:change,energyDelta:option.energy,funDelta:option.fun});
  return {ok:true,incident,option,performanceDelta:change,feedback:option.feedback};
}
export function automaticWorkIncident(root,id){
  return pendingWorkIncident(root,id)?
    decideWorkIncident(root,id,chooseAutonomousWorkOption(root,id),{automatic:true}):{ok:false};
}
export function workIncidentChoiceDescription(root,id,option){
  const actor=actorFor(root,id),axes=deriveAxes(actor?.personality);
  const change=Math.max(-5,Math.min(10,option.performance+
    Math.round((axes[option.axis]-.5)*4)+
    (option.skill?Math.min(2,Math.floor(currentSkillLevel(actor?.skills,HOBBY_SKILLS,option.skill)/2)):0)));
  return 'Рейтинг '+(change>=0?'+':'')+change+
    ' · энергия '+(option.energy>=0?'+':'')+option.energy+
    ' · досуг '+(option.fun>=0?'+':'')+option.fun+
    ' · '+(option.memory==='work.pressure'?'напряжение':
      option.memory==='work.pride'?'гордость':'облегчение');
}
