/** UI5 — trustworthy read-only explanations. Never make up a social event,
 * never expose the internal numeric relationship formulas or mutate saves.
 */
import {moodReasons,needPresentation,NEED_LABELS} from './mood-presentation.js';
import {visibleEmotions} from './emotion-engine.js';
import {latestSentiments} from './social-perspective.js';
import {SOCIAL_OUTCOME_LABELS} from './social-feedback.js';
import {environmentSnapshot} from './environment-effects.js';

const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const cleanName=(value,other='Житель')=>
  typeof value==='string'&&value.trim()?value.trim().slice(0,48):other;
const needHighlights=resident=>Object.entries(NEED_LABELS)
  .filter(([key])=>Number.isFinite(resident?.needs?.[key])&&resident.needs[key]<45)
  .sort(([a],[b])=>resident.needs[a]-resident.needs[b])
  .slice(0,3)
  .map(([key,label])=>({
    type:'need',symbol:{hunger:'◕',energy:'☾',hygiene:'✧',fun:'♫',social:'♧'}[key],
    title:label+' — '+needPresentation(resident.needs[key]).label.toLowerCase(),
    detail:{
      hunger:'Не хватает еды',energy:'Нуждается в отдыхе',
      hygiene:'Хочет освежиться',fun:'Нужны приятные занятия',
      social:'Не хватает общения'
    }[key]
  }));

/** Descriptions are justified by the actual needs and validated memory-derived
 * emotions. Snapshot contains zero persisted or fabricated event identities.
 */
export function residentMoodInsight(resident,{
  residentName='Житель',partnerName=null,
  relationLabel=null,perspective=null,world=resident?.world??null
}={}){
  const name=cleanName(residentName);
  const emotions=visibleEmotions(resident?.mind,resident?.minutes,resident?.personality)
    .filter(e=>e.intensity>=20).slice(0,2);
  const reasons=moodReasons(resident,{world});
  const needs=needHighlights(resident);
  const environment=environmentSnapshot(resident,world).causes.slice(0,2).map(c=>({
    type:'environment',symbol:c.symbol,title:c.title,detail:c.detail,
    direction:c.delta<0?'negative':'positive'
  }));
  const feeling=emotions.length?{
    type:'feeling',symbol:emotions[0].icon,title:emotions[0].label,
    detail:'Причина: '+emotions[0].cause
  }:null;
  const sentiment=perspective?latestSentiments(perspective,1)[0]:null;
  const other=partnerName?cleanName(partnerName,'собеседнику'):null;
  const relation=other&&typeof relationLabel==='string'&&relationLabel.trim()
    ?{
      title:'Отношение к '+other,
      status:relationLabel.trim().slice(0,90),
      recent:sentiment?'Недавний опыт: '+sentiment.label:
        'Пока нет подтверждённых совместных событий'
    }:null;
  return {
    name,
    mood:typeof resident?.mind?.mood?.label==='string'
      ?resident.mind.mood.label:'Спокоен',
    summary:reasons[0]||'Сейчас нет сильных переживаний',
    needs,
    environment,
    feeling,
    relation,
    reasons:reasons.slice(0,3),
    hasPressure:needs.length>0,
    // Use a summary worded as an observation, not a deterministic promise.
    guidance:needs.length?'Сначала можно позаботиться о потребностях':
      feeling?'Недавние события отражаются на настроении':
      environment.some(e=>e.direction==='negative')?'В проходах тесновато':
      environment.length?'Обстановка немного влияет на настроение':
      'Сейчас нет явных причин для беспокойства'
  };
}

/** Feedback is published only for an actual emitted completion receipt.
 * No queued/unstarted command can create this line. */
export function socialReactionInsight(receipt,getName){
  if(!receipt||!own(SOCIAL_OUTCOME_LABELS,receipt.outcome)||
    typeof receipt.responderId!=='string'||!receipt.responderId.trim())return null;
  const name=cleanName(typeof getName==='function'
    ?getName(receipt.responderId):receipt.responderId);
  const outcome=SOCIAL_OUTCOME_LABELS[receipt.outcome];
  return Object.freeze({
    residentId:receipt.responderId,
    outcome:receipt.outcome,
    title:name+' · '+outcome,
    description:'Реакция на завершённое взаимодействие',
    // This does not claim the underlying graph friendship changed.
    accessible:name+' отреагировал(а): '+outcome.toLowerCase()
  });
}

/** An optional panel never outranks a mandatory player reply. */
export function insightLayerPolicy({
  required=false,optionalOpen=false,feedbackActive=false
}={}){
  return {
    allowOptional:!required,
    showFeedback:!required&&!optionalOpen&&Boolean(feedbackActive)
  };
}
