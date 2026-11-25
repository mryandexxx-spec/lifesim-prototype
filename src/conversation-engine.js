/** Original, headless 0.9a conversation engine. Saves only validated IDs, no player text. */
import {getPerspective} from './social-perspective.js';
import {charismaSocialBonus} from './hobby-reading.js';
import {episodeContext,getPair,getDirectedView} from './social-graph.js';
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
  conflict:row('Разобраться','Между нами осталось что-то недосказанное.','socializing',['conflict.apologize','conflict.explain','conflict.blame']),
  sports:row('Обсудить матч','Как тебе последний матч Лиги Блин’С?','games',['sports.result','sports.cheer','sports.debate'])
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
  'conflict.blame':saying('Обвинить','Всё случилось из-за тебя!','Давай без обвинений.','Я не собираюсь слушать обвинения.','sharp',-5),
  'sports.result':saying('Обсудить матч','Этот матч получился интересным, правда?','Да, было что обсудить.','Я особо не следил(а), но расскажи.','neutral',2),
  'sports.cheer':saying('Порадоваться победе','Вот это был красивый момент!','Разделяю твой восторг.','Мне этот футбол не слишком интересен.','warm',3),
  'sports.debate':saying('Поспорить о счёте','Я бы по-другому оценил(а) этот матч.','Интересная точка зрения!','Давай не превращать это в ссору.','sharp',-1)
});
export const CONVERSATION_MAX_TURNS=3;
const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const knownTopic=x=>typeof x==='string'&&Object.hasOwn(CONVERSATION_TOPICS,x);
const inTopic=(topic,id)=>knownTopic(topic)&&(CONVERSATION_TOPICS[topic].lines.includes(id)||(topic==='daily'&&Object.hasOwn(pilotActs,id)));
const pilotActs=Object.freeze({
  'daily.tact':{...saying('Подбодрить с юмором','Может, сегодняшний день просто репетирует завтрашний?','Хорошо сказано.','Мне сейчас не до юмора.','warm',3),minLevel:3},
  'daily.reframe':{...saying('Помочь взглянуть иначе','Что из сегодняшнего дня всё-таки получилось?','Об этом я не подумал(а).','Не хочу сейчас искать плюсы.','neutral',3),minLevel:6},
  'daily.inspire':{...saying('Вдохновить на перемены','Какой маленький шаг сделал бы завтра лучше?','Попробую об этом подумать.','Мне нужно решить это самостоятельно.','warm',3),minLevel:9}
});
const act=id=>CONVERSATION_ACTS[id]||pilotActs[id];
const contribution=(id,accepted)=>accepted?Math.max(1,act(id).weight):-4;
export const activeConversationAction=root=>root?.socialAction?.conversation?root.socialAction:
  root?.additionalSocial?.conversation?root.additionalSocial:null;
export function conversationActor(root,id){
  if(id==='alex')return root;
  if(id==='mira')return root?.otherSim;
  if(typeof id!=='string'||!/^resident_(?:[3-9]|[1-9][0-9]{1,7})$/.test(id))return null;
  const p=root?.population,home=p?.linksByResident?.alex?.dwellingId;
  return home&&p?.linksByResident?.[id]?.dwellingId===home
    ?p.residentsById?.[id]?.actor||null:null;
}
const extraPair=(a,b)=>!['alex','mira'].includes(a)||!['alex','mira'].includes(b);
const tier=(root,id)=>charismaSocialBonus(conversationActor(root,id)?.skills)*3;
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
export function conversationOptions(session,root=null){
  if(!isRecord(session)||!knownTopic(session.topic)||
    !['opening','followUp'].includes(session.phase))return [];
  const used=new Set((session.turns||[]).map(x=>x.id));
  const action=activeConversationAction(root);
  const ids=[...CONVERSATION_TOPICS[session.topic].lines,
    ...(root&&session.topic==='daily'?Object.keys(pilotActs):[])].filter(id=>!used.has(id));
  const previous=session.turns?.at(-1);
  if(root&&previous&&!previous.accepted)
    ids.sort((a,b)=>Number(act(b).tone==='warm')-Number(act(a).tone==='warm'));
  return ids.map(id=>{
    const a=act(id),minLevel=a.minLevel||0;
    return {id,label:a.label,tone:a.tone,...(root?{minLevel,locked:tier(root,action?.initiator)<minLevel}:{})};
  });
}
export function evaluateResponse(root,initiator,topic,id,partnerId=initiator==='alex'?'mira':'alex',previous=null){
  if(!inTopic(topic,id)||initiator===partnerId)return null;
  const self=conversationActor(root,initiator),partner=conversationActor(root,partnerId);
  if(!self||!partner||!Number.isFinite(root?.minutes))return null;
  const a=act(id);
  const reaction=evaluateSocialReaction({
    kind:'conversation',recipient:partner,view:extraPair(initiator,partnerId)
      ?getDirectedView(root.socialGraph,partnerId,initiator):getPerspective(root,partnerId),
    minutes:root.minutes,tag:CONVERSATION_DISCOVERY_TAGS[id]||CONVERSATION_TOPICS[topic].tag,
    tone:a.tone,weight:a.weight,
    historyBias:episodeContext(root.socialGraph,partnerId,initiator,root.minutes).bias,
    compatibilityBias:socialCompatibility(partner.personality,self.personality).bias,
    styleBias:boundaryDisposition(partner.personality,id)+
      cueConversationBias(getPair(root.socialGraph,initiator,partnerId),initiator,id)+
      (a.tone==='sharp'?0:charismaSocialBonus(self.skills))+
      (previous&&!previous.accepted&&a.tone==='sharp'?-2:0)
  });
  return reaction?{accepted:reaction.accepted,confidence:reaction.confidence}:null;
}
/** No social event is applied before explicit completion of the conversation. */
export function chooseConversationTurn(root,id){
  const s=activeConversationAction(root),c=s?.conversation;
  if(root?.paused||s?.phase!=='using'||!c||!conversationOptions(c,root).some(x=>x.id===id&&!x.locked))return null;
  const reaction=evaluateResponse(root,s.initiator,c.topic,id,s.partner,c.turns.at(-1));
  if(!reaction)return null;
  c.turns.push({id,accepted:reaction.accepted});
  c.score+=contribution(id,reaction.accepted);
  c.phase='response';
  // A spoken reply really happened now; a queued invitation does not.
  emitSocialReaction(root,{
    actorId:s.initiator,responderId:s.partner,eventType:'conversation.line',
    outcome:socialOutcome({kind:'conversation',accepted:reaction.accepted,
      score:reaction.confidence,tone:act(id).tone}),
    intensity:Math.min(100,Math.max(30,Math.abs(reaction.confidence-50)*2))
  });
  return reaction;
}
export function continueConversation(root){
  const s=activeConversationAction(root),c=s?.conversation;
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
    const a=act(t.id);
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
