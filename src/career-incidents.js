/** Headless W1-B.3b.2: once-only workplace situations; no wages or invented XP. */
import {deriveAxes} from './trait-catalog.js';
import {currentSkillLevel} from './skills-engine.js';
import {HOBBY_SKILLS} from './hobby-reading.js';
import {refreshMind} from './psychology.js';
import {feelMemory} from './emotion-engine.js';
import {recordProfessionalIncident} from './career-goals.js';
import {specializationDefinition,recordSpecializationIncident} from './career-specializations.js';
import {seniorMissingScenes,recordSeniorIncident} from './career-seniority.js';

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

/** Stable scenario IDs: legacy is the exact W1-B.3b.2 content, including option IDs.
 * Additions never rewrite an already saved choice or its shift receipt.
 */
const S=(id,title,text,focus,tone,options)=>Object.freeze({
  id,title,text,focus,tone,options:Object.freeze(options)
});
export const WORK_INCIDENT_CATALOG=Object.freeze(Object.fromEntries(
  Object.entries({
    'city-services':[
      S('city-missing','Посылка без адреса','В сортировке нашли важную доставку без номера дома. Получатель ждёт её сегодня.','empathy','pressure',[
        O('find','Связаться с получателем','Посылка доставлена, но поиск отнял время.',5,-8,-2,'empathy','work.pride'),
        O('trace','Проверить записи маршрута','Команда уточнила адрес и устранила ошибку.',4,-5,1,'organization','work.pride'),
        O('hold','Передать в отдел уточнений','Риск неверной доставки исчез, сроки сдвинулись.',-2,1,5,'resilience','work.relief')]),
      S('city-route','Карта нового квартала','В районе открыли новый проход. Коллеги предлагают попробовать короткий маршрут.','organization','opportunity',[
        O('test','Проверить проход лично','Новый путь работает, но ноги устали.',6,-9,2,'resilience','work.pride'),
        O('plan','Составить безопасную схему','У команды появился надёжный маршрут.',4,-4,3,'organization','work.pride'),
        O('wait','Оставить прежний путь на сегодня','Без сюрпризов, но экономии времени не вышло.',-1,2,4,'practicality','work.relief')])],
    'kitchen-studio':[
      S('kitchen-allergy','Вопрос об ингредиентах','Гость уточнил состав соуса, а запись повара оказалась неполной.','organization','pressure',[
        O('check','Перепроверить рецепт и состав','Состав подтверждён, заказ задержался.',6,-10,-3,'organization','work.pressure','cooking'),
        O('fresh','Приготовить блюдо с понятным составом','Гость получил безопасную альтернативу.',4,-7,3,'creativity','work.pride','cooking'),
        O('decline','Честно предложить другое блюдо','Риск исключён, заказ стал скромнее.',-1,1,4,'empathy','work.relief')]),
      S('kitchen-special','Идея для сезонного меню','Шеф предлагает сделать пробное блюдо из доступных продуктов.','creativity','opportunity',[
        O('invent','Предложить авторский рецепт','Вышло ярко, но пришлось потрудиться.',6,-10,5,'creativity','work.pride','cooking'),
        O('pair','Доработать блюдо вместе','Команда открыла удачное сочетание.',4,-5,4,'empathy','work.pride','cooking'),
        O('classic','Остаться при проверенном меню','Смена спокойная, новый шанс отложен.',-1,2,3,'practicality','work.relief')])],
    editorial:[
      S('editorial-deadline','Пустая полоса','За два часа до выпуска не пришли материалы для одной полосы.','organization','pressure',[
        O('report','Подготовить собственную заметку','Полоса заполнена, сил почти не осталось.',6,-9,-3,'resilience','work.pressure','literature'),
        O('team','Собрать проверенные короткие новости','Выпуск вышел вовремя благодаря коллегам.',4,-4,2,'organization','work.pride','literature'),
        O('reduce','Сократить объём номера','Точность важнее количества, но рейтинг снизился.',-2,2,5,'practicality','work.relief')]),
      S('editorial-letter','Письмо читателя','Редакция получила историю о маленьком городском открытии.','empathy','opportunity',[
        O('visit','Проверить историю на месте','Получился живой материал ценой усталости.',6,-9,4,'empathy','work.pride','literature'),
        O('interview','Взять интервью и сверить детали','Читателя услышали, текст получился точным.',4,-5,3,'organization','work.pride','literature'),
        O('archive','Сохранить письмо для следующего выпуска','Идея не потеряна, но пока не опубликована.',-1,2,2,'resilience','work.relief')])],
    'art-studio':[
      S('art-frame','Трещина в раме','Перед открытием заметили повреждённое крепление у картины.','coordination','pressure',[
        O('repair','Исправить крепление самостоятельно','Работа сохранена, времени ушло много.',6,-10,-2,'coordination','work.pressure','painting'),
        O('move','Перенести работу и изменить композицию','Экспозиция осталась цельной.',4,-5,3,'creativity','work.pride','painting'),
        O('label','Временно убрать работу из зала','Посетители в безопасности, но зал пустует.',-1,2,5,'practicality','work.relief')]),
      S('art-young','Неизвестный художник','В мастерскую принесли необычный эскиз и попросили дать обратную связь.','creativity','opportunity',[
        O('mentor','Помочь доработать замысел','Работа раскрылась, а день затянулся.',5,-8,5,'empathy','work.pride','painting'),
        O('exhibit','Выделить место для пробного показа','Гости увидели новое имя.',4,-5,3,'creativity','work.pride','painting'),
        O('later','Предложить встречу после выставки','Эскиз сохранён, но шанс отложен.',-1,2,4,'organization','work.relief')])],
    'business-center':[
      S('business-pitch','Срочная презентация','Коллега заболел перед встречей с заказчиком.','resilience','pressure',[
        O('lead','Провести презентацию лично','Клиент доволен, напряжение велико.',6,-10,-3,'resilience','work.pressure'),
        O('share','Разделить роли с командой','Встреча состоялась без потери качества.',4,-5,3,'organization','work.pride'),
        O('reschedule','Согласовать другой день','Риск ошибки меньше, но переговоры отложены.',-2,2,4,'empathy','work.relief')]),
      S('business-idea','Предложение улучшения','Сотрудники придумали способ упростить долгий внутренний процесс.','practicality','opportunity',[
        O('pilot','Запустить небольшой эксперимент','Получены данные, пришлось задержаться.',6,-9,4,'practicality','work.pride'),
        O('review','Сначала оценить риски с коллегами','План стал надёжнее.',4,-4,3,'organization','work.pride'),
        O('file','Оформить идею в очередь задач','Идея сохранена, эффект наступит позднее.',-1,2,4,'resilience','work.relief')])],
    'civic-service':[
      S('civic-record','Потерянная справка','Посетитель не может найти копию нужного документа.','organization','pressure',[
        O('search','Проверить архив вместе с посетителем','Документ найден, очередь задержалась.',6,-10,-2,'empathy','work.pressure'),
        O('request','Оформить официальный запрос','Помощь оказана по правилам.',4,-5,2,'organization','work.pride'),
        O('guide','Объяснить порядок повторного получения','Человек знает следующий шаг, но ждёт.',-1,1,5,'resilience','work.relief')]),
      S('civic-neighbors','Встреча соседей','Жители спорят о распределении общественного пространства.','empathy','opportunity',[
        O('mediate','Выслушать каждого и найти компромисс','Стороны договорились, смена была трудной.',6,-9,3,'empathy','work.pride'),
        O('survey','Организовать открытый опрос','Решение получит прозрачную основу.',4,-4,4,'organization','work.pride'),
        O('postpone','Перенести встречу для подготовки','Конфликт утих, но решение задержалось.',-1,2,4,'resilience','work.relief')])]
  }).map(([careerId,more])=>[careerId,Object.freeze([
    S('legacy',WORK_INCIDENTS[careerId].title,WORK_INCIDENTS[careerId].text,
      'organization','pressure',WORK_INCIDENTS[careerId].options),...more
  ])])
));
export const INCIDENT_HISTORY_LIMIT=12;
const valid=n=>Number.isFinite(n)&&n>=0&&n<=5256000000;
const clip=(n,a=0,b=100)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:50));
const actorFor=(root,id)=>id==='mira'?root?.otherSim:root;
const hash=value=>{
  let h=2166136261;
  for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);
  return h>>>0;
};
export const incidentId=shift=>shift.id+'#work';
export function workScenario(careerId,scenarioId='legacy'){
  return WORK_INCIDENT_CATALOG[careerId]?.find(s=>s.id===scenarioId)||null;
}
/** Contextual, reproducible scoring; never a random call or a second game clock. */
export function selectWorkScenario(root,id,shift=root?.careerSystem?.byResident?.[id]?.currentShift){
  const bank=WORK_INCIDENT_CATALOG[shift?.careerId],contract=root?.careerSystem?.byResident?.[id];
  if(!bank)return null;
  const history=root?.careerSystem?.incidentHistory?.[id]||[];
  // First shift keeps the original W1-B.3b.2 scenario and its familiar choices.
  if(!history.length&&!(contract?.workedShifts>0))return 'legacy';
  const actor=actorFor(root,id),axes=deriveAxes(actor?.personality);
  const mood=clip(actor?.mind?.mood?.value),energy=clip(actor?.needs?.energy);
  const recent=history.slice(-4);
  const last=recent.at(-1)?.scenarioId;
  const track=specializationDefinition(contract?.careerId,contract?.specialization?.id);
  const scores=bank.map((scene,index)=>{
    const variety=(hash(shift.id+'|'+scene.id+'|'+id)%100)/20;
    const trait=(axes[scene.focus]-.5)*6;
    const condition=scene.tone==='pressure'?(energy>=55?1.5:-2)+(mood>=55?1:0):
      (mood>=65?2:0)+(energy<40?-1:1);
    const rank=(contract?.level||0)*(index===0?-.5:1.3);
    const skill=scene.options.some(o=>o.skill&&currentSkillLevel(
      actor?.skills,HOBBY_SKILLS,o.skill)>=2)?1.5:0;
    const repetition=recent.reduce((sum,h)=>sum+(h.scenarioId===scene.id?8:0),0);
    const focus=track?.scenarioId===scene.id?
      (contract.specialization.focusReceiptId?3:100):0;
    const senior=seniorMissingScenes(contract).includes(scene.id)?70:0;
    return variety+trait+condition+rank+skill-repetition+focus+senior-(last===scene.id?1000:0);
  });
  const order=bank.map((_,index)=>index).sort((a,b)=>scores[b]-scores[a]||a-b);
  return bank[order[0]].id;
}
export function restoreWorkIncident(shift,raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const scenarioId=raw.scenarioId===undefined?'legacy':raw.scenarioId;
  const def=workScenario(shift?.careerId,scenarioId);
  if(!def||raw.id!==incidentId(shift)||!valid(raw.createdAt)||
    raw.createdAt<shift.start||raw.createdAt>shift.end)return null;
  const choice=def.options.find(x=>x.id===raw.choiceId);
  if(raw.choiceId!==null&&!choice)return null;
  if(choice&&(!valid(raw.resolvedAt)||raw.resolvedAt<shift.start||
    !Number.isInteger(raw.performanceDelta)||raw.performanceDelta< -5||raw.performanceDelta>10||
    !Number.isInteger(raw.energyDelta)||raw.energyDelta< -20||raw.energyDelta>5||
    !Number.isInteger(raw.funDelta)||raw.funDelta< -10||raw.funDelta>10))return null;
  return {id:raw.id,careerId:shift.careerId,scenarioId,createdAt:raw.createdAt,
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
    !WORK_INCIDENT_CATALOG[shift.careerId])return false;
  const scenarioId=selectWorkScenario(root,id,shift);
  if(!workScenario(shift.careerId,scenarioId))return false;
  shift.incident={id:incidentId(shift),careerId:shift.careerId,scenarioId,
    createdAt:Math.min(at,shift.end),choiceId:null,resolvedAt:null,auto:false,
    performanceDelta:0,energyDelta:0,funDelta:0};
  return true;
}
export function chooseAutonomousWorkOption(root,id){
  const contract=root?.careerSystem?.byResident?.[id],shift=contract?.currentShift;
  const def=workScenario(contract?.careerId,shift?.incident?.scenarioId);
  if(!def)return null;
  const actor=actorFor(root,id),axes=deriveAxes(actor?.personality);
  const energy=clip(actor?.needs?.energy),mood=clip(actor?.mind?.mood?.value);
  const history=root?.careerSystem?.incidentHistory?.[id]||[];
  return [...def.options].sort((a,b)=>{
    const score=o=>{
      const level=o.skill?currentSkillLevel(actor?.skills,HOBBY_SKILLS,o.skill):0;
      const familiarity=history.slice(-3).filter(h=>h.choiceId===o.id).length;
      return o.performance*.45+o.energy*(energy<45?.75:.22)+o.fun*(mood<45?.38:.2)+
        (axes[o.axis]-.5)*16+Math.min(3,level)*1.1-familiarity*.65;
    };
    return score(b)-score(a)||a.id.localeCompare(b.id);
  })[0].id;
}
export function decideWorkIncident(root,id,choiceId,{automatic=false}={}){
  const contract=root?.careerSystem?.byResident?.[id],incident=pendingWorkIncident(root,id);
  const def=workScenario(contract?.careerId,incident?.scenarioId);
  const option=def?.options.find(o=>o.id===choiceId),actor=actorFor(root,id);
  const ledger=root?.careerSystem?.incidentIds;
  if(!incident||!option||!actor||!Array.isArray(ledger)||ledger.includes(incident.id))
    return {ok:false,reason:'Событие уже завершено или недоступно'};
  const axes=deriveAxes(actor.personality),trait=Math.round((axes[option.axis]-.5)*4);
  const level=option.skill?currentSkillLevel(actor.skills,HOBBY_SKILLS,option.skill):0;
  const skillBonus=option.skill?Math.min(2,Math.floor(level/2)):0;
  const change=Math.max(-5,Math.min(10,option.performance+trait+skillBonus));
  const now=valid(root.minutes)?root.minutes:contract.currentShift.start;
  const before=clip(contract.performance);
  // All effects, the unique shift receipt and journal commit in one game mutation.
  ledger.push(incident.id);
  if(ledger.length>256)ledger.splice(0,ledger.length-256);
  contract.performance=clip(before+change);
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
  const journal=root.careerSystem.incidentHistory?.[id];
  if(Array.isArray(journal)&&!journal.some(x=>x.id===incident.id)){
    journal.push({id:incident.id,careerId:incident.careerId,scenarioId:incident.scenarioId,
      shiftStart:contract.currentShift.start,at:now,rank:contract.level,
      choiceId:option.id,auto:automatic===true,performanceDelta:change,
      performanceAfter:contract.performance,energyDelta:option.energy,funDelta:option.fun});
    if(journal.length>INCIDENT_HISTORY_LIMIT)
      journal.splice(0,journal.length-INCIDENT_HISTORY_LIMIT);
  }
  const badges=recordProfessionalIncident(root,id,incident);
  const specializationEvidence=recordSpecializationIncident(root,id,incident);
  const seniorEvidence=recordSeniorIncident(root,id,incident);
  return {ok:true,incident,option,performanceDelta:change,feedback:option.feedback,
    badges,specializationEvidence,seniorEvidence};
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
