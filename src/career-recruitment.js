/** W1-B.2b.3: saved applications, interview archive and safe retries.
 * Pure game data. One household clock; never touches salary, renderer or browser time.
 */
import {careerDefinition} from './career-catalog.js';
import {CAREER_RESIDENT_IDS} from './career-state.js';
import {acceptCareerOffer,careerRehireRetry} from './career-job-board.js';
import {currentSkillLevel} from './skills-engine.js';
import {HOBBY_SKILLS} from './hobby-reading.js';
import {deriveAxes} from './trait-catalog.js';
import {ADDITIONAL_INTERVIEW_QUESTIONS} from './career-interview-content.js';

export const RECRUITMENT_SCHEMA=1;
export const RECRUITMENT_RETRY_MINUTES=2880;
export const RECRUITMENT_HISTORY_LIMIT=8;
export const FAST_OFFER_CAREERS=Object.freeze(['city-services','kitchen-studio']);
export const INTERVIEW_CAREERS=Object.freeze(['editorial','art-studio','business-center','civic-service']);
export const RECRUITMENT_CAREERS=Object.freeze([...FAST_OFFER_CAREERS,...INTERVIEW_CAREERS]);
export const CAREER_SKILL_LABELS=Object.freeze({editorial:'Литературная эрудиция','art-studio':'Живопись'});
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
export const INTERVIEW_QUESTIONS_BY_CAREER=Object.freeze({
  editorial:EDITORIAL_QUESTIONS,...ADDITIONAL_INTERVIEW_QUESTIONS
});
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
function skillFor(root,id,careerId){
  const skillId=careerId==='editorial'?'literature':careerId==='art-studio'?'painting':
    careerId==='kitchen-studio'?'cooking':null;
  return skillId?currentSkillLevel(actor(root,id)?.skills,HOBBY_SKILLS,skillId):0;
}
function traitBoostFor(axes,careerId){
  // Preserve the exact legacy editorial formula for in-progress Safari saves.
  if(careerId==='editorial')return clamp(Math.round((axes.organization+axes.resilience-1)*8),-4,4);
  const focus=careerId==='art-studio'?['creativity','coordination','practicality']:
    careerId==='business-center'?['organization','practicality','resilience']:
    ['empathy','resilience','sociability'];
  return clamp(Math.round((focus.reduce((sum,key)=>sum+axes[key],0)/focus.length-.5)*16),-4,4);
}
function getApp(root,id){return root?.recruitmentSystem?.byResident?.[id]??null;}
export function newRecruitmentSystem(){
  return {schema:RECRUITMENT_SCHEMA,nextApplicationId:1,
    byResident:{alex:null,mira:null},history:{alex:[],mira:[]},cooldowns:{alex:{},mira:{}}};
}
export function interviewScore(app){
  const answers=app?.interview?.answers;
  if(!Array.isArray(answers))return 0;
  const questions=INTERVIEW_QUESTIONS_BY_CAREER[app?.careerId];
  return answers.reduce((sum,id,i)=>sum+(questions?.[i]?.answers.find(a=>a.id===id)?.score??0),0);
}
export function hiringChance(app){
  const interview=app?.interview;
  if(!interview)return null;
  return clamp(25+interviewScore(app)+Math.min(12,interview.skill*3)+
    clamp(interview.traitBoost,-4,4)+clamp(Math.round((interview.mood-55)/12),-4,4),15,95);
}
/** Only known catalog IDs and bounded primitives enter the saved archive. */
function cleanHistory(raw,now=TMAX){
  if(!Array.isArray(raw))return [];
  return raw.slice(-RECRUITMENT_HISTORY_LIMIT).filter(x=>validId(x?.id)&&
    RECRUITMENT_CAREERS.includes(x.careerId)&&
    ['hired','rejected','declined'].includes(x.outcome)&&time(x.at)&&x.at<=now)
    .map(x=>{
      // Old history only stored completion time: do not invent an application date.
      const appliedAt=time(x.appliedAt)&&x.appliedAt<=x.at?x.appliedAt:null;
      const resolvedAt=time(x.resolvedAt)&&x.resolvedAt>=(appliedAt??0)&&x.resolvedAt<=x.at
        ?x.resolvedAt:x.at;
      const entry={id:x.id,careerId:x.careerId,outcome:x.outcome,at:x.at,resolvedAt};
      if(appliedAt!==null)entry.appliedAt=appliedAt;
      const questions=INTERVIEW_QUESTIONS_BY_CAREER[x.careerId],i=x.interview;
      if(questions&&i&&typeof i==='object'&&!Array.isArray(i)&&
        time(i.startedAt)&&i.startedAt>=(appliedAt??0)&&i.startedAt<=x.at&&
        Number.isInteger(i.skill)&&i.skill>=0&&i.skill<=10&&
        Number.isInteger(i.traitBoost)&&Math.abs(i.traitBoost)<=4&&
        Number.isInteger(i.mood)&&i.mood>=0&&i.mood<=100&&
        Array.isArray(i.answers)&&i.answers.length===3&&
        i.answers.every((choice,j)=>questions[j].answers.some(a=>a.id===choice))){
        entry.interview={startedAt:i.startedAt,skill:i.skill,
          traitBoost:i.traitBoost,mood:i.mood,answers:[...i.answers]};
      }
      if(x.careerId==='kitchen-studio'&&Number.isInteger(x.kitchenSkill)&&
        x.kitchenSkill>=0&&x.kitchenSkill<=10)entry.kitchenSkill=x.kitchenSkill;
      return entry;
    });
}
function cleanCooldowns(raw,now){
  const result={};
  for(const careerId of RECRUITMENT_CAREERS){
    const deadline=raw?.[careerId];
    if(time(deadline)&&deadline<=now+RECRUITMENT_RETRY_MINUTES)
      result[careerId]=deadline;
  }
  return result;
}
/** No mutation: consult durable receipts as well as the bounded history. */
export function recruitmentRetry(root,id,careerId){
  if(!CAREER_RESIDENT_IDS.includes(id)||!RECRUITMENT_CAREERS.includes(careerId))
    return {retryAt:0,remaining:0,blocked:false};
  const now=time(root?.minutes)?root.minutes:0,system=root?.recruitmentSystem;
  let retryAt=time(system?.cooldowns?.[id]?.[careerId])
    ?system.cooldowns[id][careerId]:0;
  for(const item of system?.history?.[id]??[]){
    if(item.careerId===careerId&&item.outcome==='rejected'&&time(item.resolvedAt??item.at))
      retryAt=Math.max(retryAt,Math.min(TMAX,(item.resolvedAt??item.at)+RECRUITMENT_RETRY_MINUTES));
  }
  const app=system?.byResident?.[id];
  if(app?.careerId===careerId&&app.phase==='rejected'&&time(app.resolvedAt??app.decisionDueAt))
    retryAt=Math.max(retryAt,Math.min(TMAX,(app.resolvedAt??app.decisionDueAt)+RECRUITMENT_RETRY_MINUTES));
  return {retryAt,remaining:Math.max(0,Math.ceil(retryAt-now)),blocked:retryAt>now};
}
function cleanApplication(raw,id){
  if(!raw||typeof raw!=='object'||!validId(raw.id)||raw.residentId!==id||
    !RECRUITMENT_CAREERS.includes(raw.careerId)||!PHASES.has(raw.phase)||
    !time(raw.appliedAt)||!time(raw.replyDueAt)||raw.replyDueAt<raw.appliedAt||
    raw.replyDueAt>raw.appliedAt+1440)return null;
  if(FAST_OFFER_CAREERS.includes(raw.careerId)&&
    !['waiting_reply','offer_ready'].includes(raw.phase))return null;
  const app={id:raw.id,residentId:id,careerId:raw.careerId,
    appliedAt:raw.appliedAt,replyDueAt:raw.replyDueAt,phase:raw.phase,
    unread:raw.unread===true,interview:null,decisionDueAt:null};
  if(raw.phase==='rejected'&&time(raw.resolvedAt)&&raw.resolvedAt>=raw.appliedAt)
    app.resolvedAt=raw.resolvedAt;
  if(raw.careerId==='kitchen-studio')
    app.kitchenSkill=Number.isInteger(raw.kitchenSkill)&&raw.kitchenSkill>=0&&raw.kitchenSkill<=10
      ?raw.kitchenSkill:0;
  if(['interview_active','waiting_decision','offer_ready','rejected'].includes(raw.phase)&&
    INTERVIEW_CAREERS.includes(raw.careerId)){
    if(['waiting_decision','offer_ready','rejected'].includes(raw.phase)&&!raw.interview)
      return null;
    if(raw.interview){
      const i=raw.interview;
      if(!time(i.startedAt)||i.startedAt<app.appliedAt||
        !Number.isInteger(i.skill)||i.skill<0||i.skill>10||
        !Number.isInteger(i.traitBoost)||Math.abs(i.traitBoost)>4||
        !Number.isInteger(i.mood)||i.mood<0||i.mood>100||
        !Array.isArray(i.answers)||i.answers.length>3||
        !i.answers.every((choice,j)=>INTERVIEW_QUESTIONS_BY_CAREER[raw.careerId][j].answers.some(a=>a.id===choice)))
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
  if(INTERVIEW_CAREERS.includes(raw.careerId)&&
    ['waiting_decision','offer_ready','rejected'].includes(raw.phase)&&!app.interview)return null;
  return app;
}
export function restoreRecruitmentSystem(raw,careerSystem,now=TMAX){
  const state=newRecruitmentSystem();
  if(raw?.schema!==RECRUITMENT_SCHEMA||!raw.byResident)return state;
  const current=time(now)?now:TMAX;
  state.history.alex=cleanHistory(raw.history?.alex,current);
  state.history.mira=cleanHistory(raw.history?.mira,current);
  for(const id of CAREER_RESIDENT_IDS){
    state.cooldowns[id]=cleanCooldowns(raw.cooldowns?.[id],current);
    for(const item of state.history[id]){
      if(item.outcome!=='rejected')continue;
      const deadline=Math.min(TMAX,item.resolvedAt+RECRUITMENT_RETRY_MINUTES);
      if(deadline<=current+RECRUITMENT_RETRY_MINUTES)
        state.cooldowns[id][item.careerId]=Math.max(state.cooldowns[id][item.careerId]||0,deadline);
    }
  }
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
  const discharge=careerRehireRetry(root,id,careerId);
  if(discharge.blocked)return reason('После увольнения повторный отклик через '+
    discharge.remaining+' игровых мин.');
  const retry=recruitmentRetry(root,id,careerId);
  if(retry.blocked)return reason('Повторный отклик доступен через '+retry.remaining+' игровых мин.');
  const next=root.recruitmentSystem.nextApplicationId;
  if(!Number.isSafeInteger(next)||next<1||next>999999999)return reason('Лимит заявок');
  const app={id:'a'+next,residentId:id,careerId,appliedAt:root.minutes,
    replyDueAt:Math.ceil(root.minutes+(FAST_OFFER_CAREERS.includes(careerId)?180:360)),
    phase:'waiting_reply',unread:false,interview:null,decisionDueAt:null};
  if(careerId==='kitchen-studio')app.kitchenSkill=clamp(skillFor(root,id,careerId),0,10);
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
      app.phase=FAST_OFFER_CAREERS.includes(app.careerId)?'offer_ready':'interview_invited';
      const title=careerDefinition(app.careerId).title;
      text=app.phase==='offer_ready'?title+': предложение о работе готово':
        title+': приглашение на собеседование';
    }else if(app.phase==='waiting_decision'&&after>=app.decisionDueAt){
      const chance=hiringChance(app);
      const roll=hashRoll(app.id+'@'+app.appliedAt+'@'+app.residentId+'@'+app.careerId);
      app.phase=roll<chance?'offer_ready':'rejected';
      if(app.phase==='rejected'){
        app.resolvedAt=app.decisionDueAt; // verdict time, not dismiss/reload time
        const retryAt=Math.min(TMAX,app.resolvedAt+RECRUITMENT_RETRY_MINUTES);
        root.recruitmentSystem.cooldowns[id][app.careerId]=
          Math.max(root.recruitmentSystem.cooldowns[id][app.careerId]||0,retryAt);
      }
      const title=careerDefinition(app.careerId).title;
      text=app.phase==='offer_ready'?title+': предложение работы после собеседования':
        title+': отказ после собеседования. Можно выбрать другую вакансию';
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
  if(!INTERVIEW_CAREERS.includes(app.careerId))return reason('Эта профессия не проводит собеседование');
  app.interview={startedAt:root.minutes,mood:bounded(person.mind?.mood?.value),
    skill:clamp(skillFor(root,id,app.careerId),0,10),
    traitBoost:traitBoostFor(axes,app.careerId),
    answers:[]};
  app.phase='interview_active';app.unread=false;
  return {ok:true,app};
}
export function answerCareerInterview(root,id,choiceId){
  const app=getApp(root,id);
  if(app?.phase!=='interview_active'||!app.interview||root.careerSystem?.byResident?.[id])
    return reason('Собеседование неактивно');
  const index=app.interview.answers.length;
  const question=INTERVIEW_QUESTIONS_BY_CAREER[app.careerId]?.[index];
  if(!question?.answers.some(a=>a.id===choiceId))return reason('Ответ недоступен');
  const answer=question.answers.find(a=>a.id===choiceId);
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
  if(hist.some(item=>item.id===app.id))return; // idempotent receipt
  const raw={id:app.id,careerId:app.careerId,outcome,at:root.minutes,
    appliedAt:app.appliedAt,resolvedAt:app.resolvedAt??root.minutes,
    interview:app.interview,kitchenSkill:app.kitchenSkill};
  const entry=cleanHistory([raw],root.minutes)[0];
  if(!entry)return;
  hist.push(entry);
  if(hist.length>RECRUITMENT_HISTORY_LIMIT)
    hist.splice(0,hist.length-RECRUITMENT_HISTORY_LIMIT);
  if(outcome==='rejected'){
    const deadline=Math.min(TMAX,entry.resolvedAt+RECRUITMENT_RETRY_MINUTES);
    root.recruitmentSystem.cooldowns[id][app.careerId]=
      Math.max(root.recruitmentSystem.cooldowns[id][app.careerId]||0,deadline);
  }
}
