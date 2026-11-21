/** Original, headless 0.9a conversation engine. Saves only validated IDs, no player text. */
import {getPerspective} from './social-perspective.js';
import {charismaSocialBonus} from './hobby-reading.js';
import {episodeContext,getPair} from './social-graph.js';
import {boundaryDisposition,cueConversationBias} from './social-boundaries.js';
import {socialCompatibility,CONVERSATION_DISCOVERY_TAGS} from './social-compatibility.js';
import {evaluateSocialReaction} from './social-reactions.js';
import {emitSocialReaction,socialOutcome} from './social-feedback.js';

const row=(label,opener,tag,lines)=>Object.freeze({label,opener,tag,lines:Object.freeze(lines)});
const saying=(label,line,yes,no,tone,weight)=>Object.freeze({label,line,yes,no,tone,weight});
export const CONVERSATION_TOPICS=Object.freeze({
  daily:row('Как проходит день','Как у тебя сегодня дела?','calm_leisure',['daily.listen','daily.news','daily.critic']),
  hobbies:row('Увлечения','Чем бы тебе хотелось заняться?','music',['hobbies.music','hobbies.books','hobbies.mock']),
  humor:row('Юмор','У меня для тебя одна забавная история.','games',['humor.joke','humor.story','humor.tease']),
  support:row('Поддержка','Кажется, у тебя сегодня непростой день.','socializing',['support.listen','support.help','support.dismiss']),
  plans:row('Планы','О чём мечтаешь на ближайшие дни?','drawing',['plans.idea','plans.invite','plans.doubt']),
  conflict:row('Разобраться','Между нами осталось что-то недосказанное.','socializing',['conflict.apologize','conflict.explain','conflict.blame'])
});
export const CONVERSATION_ACTS=Object.freeze({
  'daily.listen':saying('Спросить о настроении','Мне важно знать, как ты себя чувствуешь.','Спасибо, что интересуешься.','Не хочу об этом говорить.','warm',3),
  'daily.news':saying('Поделиться новостью','Сегодня было кое-что интересное!','Расскажи поподробнее.','Сейчас мне не до новостей.','neutral',2),
  'daily.critic':saying('Пожаловаться на день','Опять всё пошло не по плану.','Да, иногда бывает непросто.','Пожалуйста, не вымещай это на мне.','sharp',-2),
  'hobbies.music':saying('Поговорить о музыке','Что из музыки тебя сейчас радует?','Мне нравится делиться любимой музыкой.','Я лучше послушаю в одиночестве.','warm',3),
  'hobbies.books':saying('Обсудить книги','Есть интересная история, которую ты читал(а)?','Люблю необычные истории.','Мне сейчас не до книг.','neutral',2),
  'hobbies.mock':saying('Поддеть за увлечение','Серьёзно? Ты тратишь время на это?','Ты, наверное, шутишь?','Не высмеивай мои интересы.','sharp',-3),
  'humor.joke':saying('Пошутить','Мой чай сегодня пытался сбежать со стола!','Ха, это было бы зрелище!','Мне сейчас совсем не до шуток.','warm',3),
  'humor.story':saying('Рассказать историю','Вчера мне приснилась маленькая вселенная.','И что было дальше?','Мне не хочется сейчас слушать истории.','neutral',2),
  'humor.tease':saying('Съязвить','Ну ты и мастер приключений на ровном месте!','Ладно, это было забавно.','Не стоит шутить за мой счёт.','sharp',-2),
  'support.listen':saying('Выслушать','Если хочешь, расскажи — я выслушаю.','Мне легче, когда ты рядом.','Я пока побуду наедине с собой.','warm',4),
  'support.help':saying('Предложить помощь','Давай попробуем решить это вместе.','Спасибо, давай попробуем.','Мне нужно справиться самостоятельно.','neutral',3),
  'support.dismiss':saying('Обесценить проблему','Зачем так переживать из-за мелочей?','Может, ты и прав(а), но это сложно.','Ты совсем меня не слышишь.','sharp',-4),
  'plans.idea':saying('Предложить идею','Может, устроим что-нибудь новое дома?','Звучит интересно.','Мне не до новых затей.','warm',3),
  'plans.invite':saying('Пригласить к планам','Было бы здорово придумать план вместе.','Я за, вдвоём веселее.','Я предпочту решать за себя.','neutral',3),
  'plans.doubt':saying('Усомниться в планах','Не думаю, что у тебя это получится.','Посмотрим, как пойдёт.','Почему ты в меня не веришь?','sharp',-3),
  'conflict.apologize':saying('Извиниться','Прости, если я тебя задел(а).','Спасибо, мне важно это услышать.','Пока мне сложно это принять.','warm',4),
  'conflict.explain':saying('Объяснить свою позицию','Хочу спокойно объяснить, почему так вышло.','Хорошо, попробуем понять друг друга.','Я ещё не готов(а) это обсуждать.','neutral',2),
  'conflict.blame':saying('Обвинить','Всё случилось из-за тебя!','Давай без обвинений.','Я не собираюсь слушать обвинения.','sharp',-5)
});
export const CONVERSATION_MAX_TURNS=3;
const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const knownTopic=x=>typeof x==='string'&&Object.hasOwn(CONVERSATION_TOPICS,x);
const inTopic=(topic,id)=>knownTopic(topic)&&CONVERSATION_TOPICS[topic].lines.includes(id);
const contribution=(id,accepted)=>accepted?Math.max(1,CONVERSATION_ACTS[id].weight):-4;
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));

export function createConversation(topic){
  return knownTopic(topic)?{topic,phase:'opening',turns:[],score:0}:null;
}
export function restoreConversation(raw){
  if(!isRecord(raw)||!knownTopic(raw.topic)||!['opening','response','followUp'].includes(raw.phase)||
    !Array.isArray(raw.turns)||raw.turns.length>CONVERSATION_MAX_TURNS||
    !Number.isInteger(raw.score)||Math.abs(raw.score)>30)return null;
  const turns=[],seen=new Set();
  for(const turn of raw.turns){
    if(!isRecord(turn)||!inTopic(raw.topic,turn.id)||seen.has(turn.id)||
      typeof turn.accepted!=='boolean')return null;
    turns.push({id:turn.id,accepted:turn.accepted});seen.add(turn.id);
  }
  if((raw.phase==='opening'&&turns.length!==0)||
    (raw.phase==='response'&&turns.length===0)||
    (raw.phase==='followUp'&&(turns.length===0||turns.length>=CONVERSATION_MAX_TURNS)))return null;
  if(turns.reduce((sum,x)=>sum+contribution(x.id,x.accepted),0)!==raw.score)return null;
  return {topic:raw.topic,phase:raw.phase,turns,score:raw.score};
}
export function conversationOptions(session){
  if(!isRecord(session)||!knownTopic(session.topic)||
    !['opening','followUp'].includes(session.phase))return [];
  const used=new Set((session.turns||[]).map(x=>x.id));
  return CONVERSATION_TOPICS[session.topic].lines.filter(id=>!used.has(id))
    .map(id=>({id,label:CONVERSATION_ACTS[id].label,tone:CONVERSATION_ACTS[id].tone}));
}
export function evaluateResponse(root,initiator,topic,id){
  if(!inTopic(topic,id)||!['alex','mira'].includes(initiator))return null;
  const partnerId=initiator==='alex'?'mira':'alex';
  const partner=partnerId==='alex'?root:root?.otherSim;
  if(!partner||!Number.isFinite(root?.minutes))return null;
  const a=CONVERSATION_ACTS[id];
  const reaction=evaluateSocialReaction({
    kind:'conversation',recipient:partner,view:getPerspective(root,partnerId),
    minutes:root.minutes,tag:CONVERSATION_DISCOVERY_TAGS[id]||CONVERSATION_TOPICS[topic].tag,
    tone:a.tone,weight:a.weight,
    historyBias:episodeContext(root.socialGraph,partnerId,initiator,root.minutes).bias,
    compatibilityBias:socialCompatibility(partner.personality,
      (initiator==='alex'?root:root?.otherSim)?.personality).bias,
    styleBias:boundaryDisposition(partner.personality,id)+
      cueConversationBias(getPair(root.socialGraph,initiator,partnerId),initiator,id)+
      (a.tone==='sharp'?0:charismaSocialBonus(
        (initiator==='alex'?root:root?.otherSim)?.skills))
  });
  return reaction?{accepted:reaction.accepted,confidence:reaction.confidence}:null;
}
/** No social event is applied before explicit completion of the conversation. */
export function chooseConversationTurn(root,id){
  const s=root?.socialAction,c=s?.conversation;
  if(root?.paused||s?.phase!=='using'||!c||!conversationOptions(c).some(x=>x.id===id))return null;
  const reaction=evaluateResponse(root,s.initiator,c.topic,id);
  if(!reaction)return null;
  c.turns.push({id,accepted:reaction.accepted});
  c.score+=contribution(id,reaction.accepted);
  c.phase='response';
  // A spoken reply really happened now; a queued invitation does not.
  emitSocialReaction(root,{
    actorId:s.initiator,responderId:s.partner,eventType:'conversation.line',
    outcome:socialOutcome({kind:'conversation',accepted:reaction.accepted,
      score:reaction.confidence,tone:CONVERSATION_ACTS[id].tone}),
    intensity:Math.min(100,Math.max(30,Math.abs(reaction.confidence-50)*2))
  });
  return reaction;
}
export function continueConversation(root){
  const s=root?.socialAction,c=s?.conversation;
  if(root?.paused||s?.phase!=='using'||c?.phase!=='response'||
    c.turns.length>=CONVERSATION_MAX_TURNS)return false;
  c.phase='followUp';
  return true;
}
export function conversationTranscript(c){
  if(!isRecord(c)||!knownTopic(c.topic)||!Array.isArray(c.turns))return [];
  const out=[{speaker:'initiator',line:CONVERSATION_TOPICS[c.topic].opener}];
  for(const t of c.turns.slice(0,CONVERSATION_MAX_TURNS)){
    if(!inTopic(c.topic,t.id)||typeof t.accepted!=='boolean')continue;
    const a=CONVERSATION_ACTS[t.id];
    out.push({speaker:'initiator',line:a.line},{speaker:'partner',line:t.accepted?a.yes:a.no});
  }
  return out;
}
export function conversationOutcome(c){
  if(!isRecord(c)||!Array.isArray(c.turns)||!c.turns.length)return null;
  const score=clamp(c.score,-12,12);
  return {kind:score<0?'argue':'talk',score,label:score<0?'Разошлись во мнениях':
    score>=6?'Нашли общий язык':'Поговорили и узнали друг друга лучше'};
}
