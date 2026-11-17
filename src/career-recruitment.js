/** W1-B.2b.1: saved applications and playable editorial interviews.
 * Pure game data. One household clock; never touches salary, renderer or browser time.
 */
import {careerDefinition} from './career-catalog.js';
import {CAREER_RESIDENT_IDS} from './career-state.js';
import {acceptCareerOffer} from './career-job-board.js';
import {currentSkillLevel} from './skills-engine.js';
import {HOBBY_SKILLS} from './hobby-reading.js';
import {deriveAxes} from './trait-catalog.js';

export const RECRUITMENT_SCHEMA=1;
export const RECRUITMENT_CAREERS=Object.freeze(['city-services','editorial']);
export const EDITORIAL_QUESTIONS=Object.freeze([
  {text:'Перед выпуском статьи источник просит проверить его слова. Что сделаете?',
    answers:[
      {id:'verify',text:'Сверю цитату и первичные факты, затем обновлю материал.',score:20,feedback:'Редактор ценит точность и внимание к фактам.'},
      {id:'discuss',text:'Обсужу сомнения с выпускающим редактором.',score:10,feedback:'Совместное решение полезно, но факты ещё нужно проверить.'},
      {id:'publish',text:'Опубликую как есть, чтобы не задерживать выпуск.',score:0,feedback:'Спешка без проверки создаёт риск для редакции.'}]},
  {text:'Вам поручили тему, о которой мало известно. Как начнёте?',
    answers:[
      {id:'research',text:'Изучу несколько источников и составлю план вопросов.',score:20,feedback:'Хорошая подготовка помогает написать содержательный текст.'},
      {id:'ask',text:'Попрошу коллегу объяснить ключевые обстоятельства.',score:10,feedback:'Вы используете помощь команды, но потребуется своя проверка.'},
      {id:'guess',text:'Напишу по первому впечатлению, детали добавлю позже.',score:0,feedback:'Одних впечатлений недостаточно для ответственной публикации.'}]},
  {text:'Коллега заметил ошибку в вашем тексте. Как отреагируете?',
    answers:[
      {id:'correct',text:'Поблагодарю и исправлю текст после проверки.',score:20,feedback:'Готовность исправлять ошибки — важное профессиональное качество.'},
      {id:'review',text:'Предложу вместе сравнить наши варианты.',score:10,feedback:'Вы открыты к диалогу, но не откладывайте исправление.'},
      {id:'ignore',text:'Оставлю первоначальную версию без изменений.',score:0,feedback:'Игнорирование замечаний снизило доверие редактора.'}]}
]);
const PHASES=new Set(['waiting_reply','interview_invited','interview_active',
  'waiting_decision','offer_ready','rejected']);
const TMAX=5256000000;
const time=x=>Number.isFinite(x)&&x>=0&&x<=TMAX;
const bounded=x=>Number.isFinite(x)?Math.max(0,Math.min(100,Math.round(x))):50;
const actor=(root,id)=>id==='mira'?root.otherSim:root;
const validId=id=>typeof id==='string'&&/^a[1-9]\d{0,8}$/.test(id);
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const reason=why=>({ok:false,reason:why});
function hashRoll(str){
  let h=2166136261;
  for(const char of str){h=Math.imul(h^char.charCodeAt(0),16777619);}
  return (h>>>0)%100;
}
function skillFor(root,id){
  return currentSkillLevel(actor(root,id)?.skills,HOBBY_SKILLS,'literature');
}
function getApp(root,id){return root?.recruitmentSystem?.byResident?.[id]??null;}
export function newRecruitmentSystem(){
  return {schema:RECRUITMENT_SCHEMA,nextApplicationId:1,
    byResident:{alex:null,mira:null},history:{alex:[],mira:[]}};
}
export function interviewScore(app){
  const answers=app?.interview?.answers;
  if(!Array.isArray(answers))return 0;
  return answers.reduce((sum,id,i)=>sum+(EDITORIAL_QUESTIONS[i]?.answers.find(a=>a.id===id)?.score??0),0);
}
export function hiringChance(app){
  const interview=app?.interview;
  if(!interview)return null;
  return clamp(25+interviewScore(app)+Math.min(12,interview.skill*3)+
    clamp(interview.traitBoost,-4,4)+clamp(Math.round((interview.mood-55)/12),-4,4),15,95);
}
function cleanHistory(raw){
  if(!Array.isArray(raw))return [];
  return raw.slice(-8).filter(x=>validId(x?.id)&&
    RECRUITMENT_CAREERS.includes(x.careerId)&&
    ['hired','rejected','declined'].includes(x.outcome)&&time(x.at))
    .map(x=>({id:x.id,careerId:x.careerId,outcome:x.outcome,at:x.at}));
}
function cleanApplication(raw,id){
  if(!raw||typeof raw!=='object'||!validId(raw.id)||raw.residentId!==id||
    !RECRUITMENT_CAREERS.includes(raw.careerId)||!PHASES.has(raw.phase)||
    !time(raw.appliedAt)||!time(raw.replyDueAt)||raw.replyDueAt<raw.appliedAt||
    raw.replyDueAt>raw.appliedAt+1440)return null;
  if(raw.careerId==='city-services'&&
    !['waiting_reply','offer_ready'].includes(raw.phase))return null;
  const app={id:raw.id,residentId:id,careerId:raw.careerId,
    appliedAt:raw.appliedAt,replyDueAt:raw.replyDueAt,phase:raw.phase,
    unread:raw.unread===true,interview:null,decisionDueAt:null};
  if(['interview_active','waiting_decision','offer_ready','rejected'].includes(raw.phase)&&
    raw.careerId==='editorial'){
    if(['waiting_decision','offer_ready','rejected'].includes(raw.phase)&&!raw.interview)
      return null;
    if(raw.interview){
      const i=raw.interview;
      if(!time(i.startedAt)||i.startedAt<app.appliedAt||
        !Number.isInteger(i.skill)||i.skill<0||i.skill>10||
        !Number.isInteger(i.traitBoost)||Math.abs(i.traitBoost)>4||
        !Number.isInteger(i.mood)||i.mood<0||i.mood>100||
        !Array.isArray(i.answers)||i.answers.length>3||
        !i.answers.every((choice,j)=>EDITORIAL_QUESTIONS[j].answers.some(a=>a.id===choice)))
        return null;
      if(raw.phase==='interview_active'&&i.answers.length>=3)return null;
      if(['waiting_decision','offer_ready','rejected'].includes(raw.phase)&&i.answers.length!==3)return null;
      app.interview={startedAt:i.startedAt,skill:i.skill,traitBoost:i.traitBoost,
        mood:i.mood,answers:[...i.answers]};
      if(raw.phase!=='interview_active'){
        if(!time(raw.decisionDueAt)||raw.decisionDueAt<i.startedAt||
          raw.decisionDueAt>i.startedAt+10080)return null;
        app.decisionDueAt=raw.decisionDueAt;
      }
    }
  }
  if(raw.phase==='interview_active'&&!app.interview)return null;
  return app;
}
export function restoreRecruitmentSystem(raw,careerSystem){
  const state=newRecruitmentSystem();
  if(raw?.schema!==RECRUITMENT_SCHEMA||!raw.byResident)return state;
  state.history.alex=cleanHistory(raw.history?.alex);
  state.history.mira=cleanHistory(raw.history?.mira);
  const seen=new Set();
  for(const id of CAREER_RESIDENT_IDS){
    const app=cleanApplication(raw.byResident[id],id);
    if(app&&!careerSystem?.byResident?.[id]&&!seen.has(app.id)){
      state.byResident[id]=app;seen.add(app.id);
    }
  }
  const max=Math.max(0,...[...seen].map(id=>Number(id.slice(1))),
    ...CAREER_RESIDENT_IDS.flatMap(id=>state.history[id].map(x=>Number(x.id.slice(1)))));
  state.nextApplicationId=Number.isSafeInteger(raw.nextApplicationId)&&
    raw.nextApplicationId>max&&raw.nextApplicationId<=999999999
    ?raw.nextApplicationId:max+1;
  return state;
}
export function submitCareerApplication(root,id,careerId){
  if(!CAREER_RESIDENT_IDS.includes(id)||!RECRUITMENT_CAREERS.includes(careerId)||
    !careerDefinition(careerId)||!time(root?.minutes)||root?.recruitmentSystem?.schema!==1)
    return reason('Недоступная вакансия');
  if(root.careerSystem?.byResident?.[id])return reason('У персонажа уже есть работа');
  if(getApp(root,id))return reason('Сначала завершите текущий отклик');
  const next=root.recruitmentSystem.nextApplicationId;
  if(!Number.isSafeInteger(next)||next<1||next>999999999)return reason('Лимит заявок');
  const app={id:'a'+next,residentId:id,careerId,appliedAt:root.minutes,
    replyDueAt:Math.ceil(root.minutes+(careerId==='city-services'?180:360)),
    phase:'waiting_reply',unread:false,interview:null,decisionDueAt:null};
  root.recruitmentSystem.nextApplicationId++;
  root.recruitmentSystem.byResident[id]=app;
  return {ok:true,app};
}
export function progressCareerRecruitment(root,before,after){
  if(!root||root.paused||!time(before)||!time(after)||after<=before)return [];
  const messages=[];
  for(const id of CAREER_RESIDENT_IDS){
    const app=getApp(root,id);
    if(!app||root.careerSystem?.byResident?.[id])continue;
    let text=null;
    if(app.phase==='waiting_reply'&&after>=app.replyDueAt){
      app.phase=app.careerId==='city-services'?'offer_ready':'interview_invited';
      text=app.phase==='offer_ready'?'работодатель прислал предложение · Городские сервисы':
        'Редакция приглашает на собеседование';
    }else if(app.phase==='waiting_decision'&&after>=app.decisionDueAt){
      const chance=hiringChance(app);
      const roll=hashRoll(app.id+'@'+app.appliedAt+'@'+app.residentId+'@editorial');
      app.phase=roll<chance?'offer_ready':'rejected';
      text=app.phase==='offer_ready'?'Редакция предлагает работу':
        'Редакция отказала после собеседования. Можно выбрать другую вакансию';
    }
    if(text){
      app.unread=true;
      messages.push({residentId:id,type:'recruitment',text:(id==='alex'?'Алекс':'Мира')+': '+text});
    }
  }
  return messages;
}
export function startCareerInterview(root,id){
  const app=getApp(root,id);
  if(app?.phase!=='interview_invited'||root.careerSystem?.byResident?.[id])
    return reason('Приглашение недоступно');
  const person=actor(root,id),axes=deriveAxes(person.personality);
  app.interview={startedAt:root.minutes,mood:bounded(person.mind?.mood?.value),
    skill:clamp(skillFor(root,id),0,10),
    traitBoost:clamp(Math.round((axes.organization+axes.resilience-1)*8),-4,4),
    answers:[]};
  app.phase='interview_active';app.unread=false;
  return {ok:true,app};
}
export function answerCareerInterview(root,id,choiceId){
  const app=getApp(root,id);
  if(app?.phase!=='interview_active'||!app.interview||root.careerSystem?.byResident?.[id])
    return reason('Собеседование неактивно');
  const index=app.interview.answers.length;
  if(!EDITORIAL_QUESTIONS[index]?.answers.some(a=>a.id===choiceId))
    return reason('Ответ недоступен');
  const answer=EDITORIAL_QUESTIONS[index].answers.find(a=>a.id===choiceId);
  app.interview.answers.push(choiceId);
  if(app.interview.answers.length===3){
    app.phase='waiting_decision';
    app.decisionDueAt=Math.ceil(root.minutes+120);
  }
  return {ok:true,feedback:answer.feedback,complete:app.phase==='waiting_decision',app};
}
export function markRecruitmentRead(root,id){
  const app=getApp(root,id);
  if(!app||!app.unread)return false;
  app.unread=false;return true;
}
export function finishRecruitmentApplication(root,id,operation){
  const app=getApp(root,id);
  if(!app)return reason('Нет заявки');
  if(operation==='accept'){
    if(app.phase!=='offer_ready')return reason('Сначала дождитесь предложения');
    // The existing work system is the ONLY employer/contract writer.
    const accepted=acceptCareerOffer(root,id,app.careerId);
    if(!accepted.ok)return accepted;
    root.careerSystem=accepted.careerSystem;
    addHistory(root,id,app,'hired');
    root.recruitmentSystem.byResident[id]=null;
    return {ok:true,contract:accepted.contract,shift:accepted.shift};
  }
  if(operation==='dismiss'&&['rejected','offer_ready'].includes(app.phase)){
    addHistory(root,id,app,app.phase==='rejected'?'rejected':'declined');
    root.recruitmentSystem.byResident[id]=null;
    return {ok:true};
  }
  return reason('Нельзя завершить заявку на этом этапе');
}
function addHistory(root,id,app,outcome){
  const hist=root.recruitmentSystem.history[id];
  hist.push({id:app.id,careerId:app.careerId,outcome,at:root.minutes});
  if(hist.length>8)hist.splice(0,hist.length-8);
}
