/** Headless two-person social relationship simulation. */
import { refreshMind } from './psychology.js';
import {creditCompletedSocialNeed} from './social-need.js';
import {feelMemory} from './emotion-engine.js';
import {evaluateSocialReaction} from './social-reactions.js';
import {emitSocialReaction} from './social-feedback.js';
import {socialCompatibility,CONVERSATION_DISCOVERY_TAGS} from './social-compatibility.js';
import {cueFromAnswer} from './social-boundaries.js';
import {proposeAutonomousSocial,AUTONOMOUS_FRIEND_BRANCHES,autonomousLeisureToken} from './social-dynamics.js';
import {GIFT_CATALOG,LEISURE_CATALOG,inventoryFor,evaluateLeisure} from './gifts-leisure.js';
import {newPerspective,restorePerspective,applySocialPerspective,getPerspective} from './social-perspective.js';
import {createConversation,restoreConversation,chooseConversationTurn,continueConversation,conversationOutcome} from './conversation-engine.js';
import {createSharedSession,restoreSharedSession,sharedDuration,completeSharedSession} from './gifts-leisure.js';
import {validSharedTvPlan} from './tv-together.js';
import {availableSocialActions,resolveBranchResponse,observePairViews,
  applySocialEvent,learnSocialPreference,learnSocialCue} from './social-graph.js';
import {romanceAvailability} from './romance.js';
import {validRomanticEveningStage} from './romantic-evening-stage.js';
import {HUG_REFUSAL_DURATION_MINUTES} from './romantic-hug.js';
import {KISS_DURATION_MINUTES} from './romantic-kiss.js';
import {intimacyBedPlan,INTIMACY_DURATION_MINUTES,INTIMACY_REFUSAL_DURATION_MINUTES} from './romantic-intimacy.js';
export const SOCIAL_ACTIONS=Object.freeze({
  talk:{label:'Поговорить',duration:18,affinity:8,fun:6},
  argue:{label:'Поспорить',duration:16,affinity:-12,fun:-5}
});
export const SOCIAL_COOLDOWN_MINUTES=180;
export const ROMANTIC_EVENING_DURATION_MINUTES=30;
export const ROMANTIC_EVENING_REFUSAL_MINUTES=3;
export const RECONCILIATION_WINDOW_MINUTES=480;
const SOCIAL_MEMORY_IDS=new Set(['talk','argue','regret','hurt','reconcile']);
const CONFLICT_MEMORY_IDS=new Set(['argue','regret','hurt']);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const validId=id=>id==='alex'||id==='mira';
const otherId=id=>id==='alex'?'mira':'alex';
const get=(root,id)=>id==='mira'?root.otherSim:root;
function lastSocialMemory(resident){
  const memories=resident?.mind?.memories;
  return Array.isArray(memories)
    ?memories.filter(m=>SOCIAL_MEMORY_IDS.has(m?.id)).at(-1)||null:null;
}
/** Both residents must still remember a recent unresolved quarrel.
 * No separate saved flag: works with old v1 'argue' memories too.
 */
export function canReconcile(root){
  if(root?.relationship?.lastKind!=='argue'||!root?.otherSim||
    !Number.isFinite(root.minutes))return false;
  return ['alex','mira'].every(id=>{
    const memory=lastSocialMemory(get(root,id));
    const age=root.minutes-memory?.at;
    return memory&&CONFLICT_MEMORY_IDS.has(memory.id)&&
      Number.isFinite(age)&&age>=0&&age<=RECONCILIATION_WINDOW_MINUTES;
  });
}

export function newRelationship(minutes=480) {
  return {affinity:50,nextSocialAt:minutes+90,lastKind:null,
    views:{alex:newPerspective(50),mira:newPerspective(50)}};
}
/** v1 compatibility: shared affinity keeps its exact historical semantics.
 * Missing directed views are derived without replaying social events.
 */
export function loadRelationship(data,minutes,legacyMemories={}){
  const rel=newRelationship(minutes);
  if(data&&typeof data==='object'&&!Array.isArray(data)){
    if(Number.isFinite(data.affinity))rel.affinity=clamp(Math.round(data.affinity),0,100);
    if(Number.isFinite(data.nextSocialAt))rel.nextSocialAt=clamp(data.nextSocialAt,0,10000000);
    if(Object.hasOwn(SOCIAL_ACTIONS,data.lastKind))rel.lastKind=data.lastKind;
  }
  const views=data?.views;
  rel.views={
    alex:restorePerspective(views?.alex,rel.affinity,minutes,legacyMemories.alex),
    mira:restorePerspective(views?.mira,rel.affinity,minutes,legacyMemories.mira)
  };
  return rel;
}
export function relationshipLabel(value) {
  return value<30?'Напряжённо':value<66?'Нейтрально':'Дружески';
}
export function canStartSocial(root,kind,initiator,automatic=false) {
  if(!Object.hasOwn(SOCIAL_ACTIONS,kind)||!validId(initiator)||!root.otherSim||root.socialAction)return false;
  const self=get(root,initiator),partner=get(root,otherId(initiator));
  if(!self||!partner)return false;
  // No social invitation interrupts furniture work, another talk or sleep.
  // Player requests wait in a per-resident FIFO queue until both are idle.
  if(self.action||partner.action||root.paused)return false;
  if(automatic&&(!root.autonomy?.enabled||
    root.minutes<root.relationship.nextSocialAt||
    root.actionQueues?.byResident?.[initiator]?.length||
    root.actionQueues?.byResident?.[otherId(initiator)]?.length||
    !root.actionQueues?.byResident?.[initiator]||
    !root.actionQueues?.byResident?.[otherId(initiator)]))return false;
  return true;
}
export function startSocial(root,kind,initiator,target,automatic=false) {
  if(!canStartSocial(root,kind,initiator,automatic)||!target||
    !Number.isFinite(target.x)||!Number.isFinite(target.z)||
    Math.abs(target.x)>4.65||Math.abs(target.z)>4.01)return false;
  const self=get(root,initiator),partner=get(root,otherId(initiator));
  // Both actors are idle here. Never reset their ongoing work as a side effect.
  root.socialAction={kind,initiator,partner:otherId(initiator),
    target:{x:target.x,z:target.z},phase:'walking',elapsed:0,automatic:Boolean(automatic)};
  self.event=SOCIAL_ACTIONS[kind].label;
  partner.event='Ждёт общения';
  return true;
}
/** Multi-turn sessions reuse the existing path reservation and social poses. */
export function startConversation(root,initiator,target,topic){
  const session=createConversation(topic);
  if(!session||!startSocial(root,'talk',initiator,target,false))return false;
  root.socialAction.conversation=session;
  return true;
}
export const chooseSocialLine=(root,id)=>chooseConversationTurn(root,id);
export const nextSocialLine=root=>continueConversation(root);
export function finishSocialConversation(root){
  const social=root?.socialAction,session=social?.conversation;
  if(root?.paused||social?.phase!=='using'||!session)return null;
  const outcome=conversationOutcome(session);
  if(!outcome)return null;
  social.kind=outcome.kind;
  if(!completeSocial(root,outcome.score))return null;
  // Each completed conversation can leave its initiator with a different feeling.
  emitSocialReaction(root,{
    actorId:social.partner,responderId:social.initiator,
    eventType:'conversation.finish',outcome:outcome.kind==='argue'?'awkward':'neutral'
  });
  return outcome;
}
/** Existing walk/animation/social reservation also supports gift/leisure.
 * Nothing changes until this shared action finishes its fixed game time.
 */
export function startSharedSocial(root,initiator,target,mode,choiceId,automatic=false,tvPlan=null){
  if(automatic&&mode==='leisure'&&choiceId==='tv')return false;
  const session=createSharedSession(root,initiator,mode,choiceId,tvPlan);
  // A spontaneous gift could consume player-owned items without permission;
  // only voluntary leisure is allowed, and must appear welcome in preflight.
  if(automatic&&(mode!=='leisure'||
    evaluateLeisure(root,initiator,choiceId)?.accepted!==true))return false;
  if(!session||!startSocial(root,'talk',initiator,target,automatic))return false;
  root.socialAction.shared=session;
  return true;
}
/** The adapter remains two-resident only; social-graph.js works with N stable IDs. */
export function startBranchSocial(root,initiator,target,actionId,automatic=false){
  if((actionId==='romance.intimacy'&&!intimacyBedPlan(root,initiator))||
    !root?.socialGraph||!availableSocialActions(root.socialGraph,initiator,otherId(initiator),root.minutes)
    .some(action=>action.id===actionId&&action.enabled))return false;
  if(automatic&&(!AUTONOMOUS_FRIEND_BRANCHES.includes(actionId)||
    resolveBranchResponse(root.socialGraph,initiator,otherId(initiator),actionId,{
      recipient:get(root,otherId(initiator)),minutes:root.minutes,
      compatibilityBias:socialCompatibility(get(root,otherId(initiator))?.personality,
        get(root,initiator)?.personality).bias
    })?.accepted!==true))return false;
  if(!startSocial(root,'talk',initiator,target,automatic))return false;
  root.socialAction.branchAction={id:actionId};
  return true;
}
function recordPairCompletion(root,session,type,token=null){
  const graph=root.socialGraph,a=session.initiator,b=session.partner;
  if(!graph||!root.relationship?.views?.[a]||!root.relationship.views[b])return false;
  const views={[a]:root.relationship.views[a],[b]:root.relationship.views[b]};
  observePairViews(graph,a,b,views);
  const committed=applySocialEvent(graph,{
    actorId:a,targetId:b,type,at:root.minutes,
    ...(typeof token==='string'?{token}:{})
  },{observedViews:views})||null;
  // Only NEW canonical positive receipts can refill the fifth need:
  // never queued, walked-to, refused, cancelled, reloaded or replayed.
  // Household is only a two-resident adapter; the need function itself
  // accepts arbitrary person IDs without referring to Alex or Mira.
  if(committed&&creditCompletedSocialNeed({[a]:get(root,a),[b]:get(root,b)},committed)){
    refreshMind(get(root,a));
    refreshMind(get(root,b));
  }
  return committed;
}
export function arriveSocial(root) {
  const social=root.socialAction;
  if(social?.phase!=='walking')return false;
  if(social.shared?.mode==='leisure'&&social.shared.choiceId==='tv'){
    // Partner is consulted after both people actually reach their own places.
    const agreed=validSharedTvPlan(root,social.shared.tvPlan,social.initiator)&&
      evaluateLeisure(root,social.initiator,'tv')?.accepted===true;
    if(!agreed){
      get(root,social.initiator).event='Предложение посмотреть ТВ не принято';
      get(root,social.partner).event='Сегодня не хочется смотреть вместе';
      root.socialAction=null;return false;
    }
    social.shared.tvConsent=true;
  }
  // No physical contact until the recipient has answered this invitation.
  if(social?.eveningStage&&
    !validRomanticEveningStage(root.world,social.eveningStage)){
    root.socialAction=null;return false;
  }
  if(['romance.hug','romance.kiss','romance.intimacy','romance.evening'].includes(social.branchAction?.id)){
    const a=social.initiator,b=social.partner;
    if(social.branchAction.id==='romance.intimacy'&&!intimacyBedPlan(root,a)){
      // An unavailable private place cannot be misreported as rejection.
      root.socialAction=null;return false;
    }
    const response=resolveBranchResponse(root.socialGraph,a,b,social.branchAction.id,{
      recipient:get(root,b),minutes:root.minutes,
      compatibilityBias:socialCompatibility(
        get(root,b)?.personality,get(root,a)?.personality).bias
    });
    if(social.branchAction.id==='romance.intimacy'){
      // Only after both adults' current consent: two distinct reachable
      // bed approaches, blackout in the renderer, no explicit animation.
      const plan=intimacyBedPlan(root,a);
      const yes=response?.accepted===true&&Boolean(plan);
      social.branchAction.intimacyConsent=yes;
      if(yes){
        get(root,a).position={...plan.actor};
        get(root,b).position={...plan.partner};
      }
    }else if(social.branchAction.id==='romance.evening'){
      social.branchAction.eveningConsent=response?.accepted===true;
    }else{
      social.branchAction[social.branchAction.id==='romance.hug'?'hugConsent':'kissConsent']=
        response?.accepted===true;
    }
  }
  social.phase='using';social.elapsed=0;return true;
}
export function cancelSocial(root) {
  if(!root.socialAction)return false;
  root.socialAction=null;return true;
}
function completeSocial(root,conversationScore=null){
  const s=root.socialAction,def=SOCIAL_ACTIONS[s?.kind];
  if(!def||!root.otherSim){root.socialAction=null;return false;}
  // One-button talk/argue is never refused, preserving legacy semantics.
  // Its individual effects go through socialImpressionFactor below.
  const directReaction=s.branchAction||s.conversation?null:evaluateSocialReaction({
    kind:'direct',actionId:s.kind,recipient:get(root,s.partner),
    view:getPerspective(root,s.partner),minutes:root.minutes
  });
  const reconciled=s.kind==='talk'&&canReconcile(root);
  // Old one-click talk/argue keep exact +8 / -12 / reconciliation +12.
  // A multi-turn talk has a single context-dependent signed result.
  const gain=conversationScore===null
    ?(reconciled?def.affinity+4:def.affinity)
    :(reconciled?Math.max(4,conversationScore)+4:conversationScore);
  root.relationship.affinity=clamp(root.relationship.affinity+gain,0,100);
  root.relationship.lastKind=s.kind;
  root.relationship.nextSocialAt=root.minutes+SOCIAL_COOLDOWN_MINUTES;
  for(const id of ['alex','mira']){
    const resident=get(root,id);
    resident.needs.fun=clamp(resident.needs.fun+def.fun,0,100);
    const memoryId=reconciled?'reconcile'
      :s.kind==='argue'?(id===s.initiator?'regret':'hurt'):'talk';
    const memory={id:memoryId,at:root.minutes,fulfilled:false};
    resident.mind.memories.push(memory);
    resident.mind.memories=resident.mind.memories.slice(-12);
    feelMemory(resident,memory);
    // A completed shared interaction leaves two DIFFERENT impressions.
    // The old affinity meter remains a backwards-compatible shared record.
    applySocialPerspective(getPerspective(root,id),memory,resident,root.minutes);
    resident.autonomy.nextAt=root.minutes+15;
    resident.event=reconciled?'Удалось помириться'
      :s.kind==='talk'?'Приятно поговорили'
      :id===s.initiator?'Сожалеет о ссоре':'Обиделся после ссоры';
    refreshMind(resident);
  }
  const completed=recordPairCompletion(root,s,s.branchAction?.resultType||
    (s.conversation?'conversation.'+s.kind:s.kind));
  if(completed&&s.conversation){
    // No premature discovery from a started, abandoned or merely queued talk.
    for(const turn of s.conversation.turns||[]){
      const tag=CONVERSATION_DISCOVERY_TAGS[turn.id];
      if(turn.accepted&&tag)learnSocialPreference(root.socialGraph,completed,
        s.initiator,s.partner,get(root,s.partner).personality,tag);
      if(cueFromAnswer(turn.id,turn.accepted))learnSocialCue(root.socialGraph,completed,
        s.initiator,s.partner,turn.id,turn.accepted);
    }
  }
  // Legacy one-button actions only show a response after their effects finish.
  if(directReaction){
    emitSocialReaction(root,{actorId:s.initiator,responderId:s.partner,
      outcome:directReaction.outcome,intensity:directReaction.intensity,
      eventType:'direct.reply'});
    emitSocialReaction(root,{actorId:s.partner,responderId:s.initiator,
      outcome:s.kind==='argue'?'awkward':directReaction.outcome,
      eventType:'direct.initiator'});
  }
  root.socialAction=null;
  return true;
}
export function tickSocial(root,minutes){
  const s=root.socialAction;
  if(root.paused||!Number.isFinite(minutes)||minutes<=0||s?.phase!=='using')return false;
  if(s.conversation)return false; // explicit multi-turn choices decide the finish
  if(s.branchAction){
    s.elapsed+=minutes;
    const hugging=s.branchAction.id==='romance.hug';
    const kissing=s.branchAction.id==='romance.kiss';
    const intimacy=s.branchAction.id==='romance.intimacy';
    const evening=s.branchAction.id==='romance.evening';
    if(evening&&s.eveningStage&&
      !validRomanticEveningStage(root.world,s.eveningStage)){
      root.socialAction=null;return false;
    }
    const physical=hugging||kissing||intimacy;
    const consent=evening?s.branchAction.eveningConsent:
      hugging?s.branchAction.hugConsent:
      kissing?s.branchAction.kissConsent:s.branchAction.intimacyConsent;
    const agreedBeforeUsing=physical||evening;
    const length=agreedBeforeUsing&&consent!==true
      ?evening?ROMANTIC_EVENING_REFUSAL_MINUTES:
        intimacy?INTIMACY_REFUSAL_DURATION_MINUTES:HUG_REFUSAL_DURATION_MINUTES
      :evening?ROMANTIC_EVENING_DURATION_MINUTES:
        intimacy?INTIMACY_DURATION_MINUTES:kissing?KISS_DURATION_MINUTES:18;
    if(intimacy&&consent===true&&!intimacyBedPlan(root,s.initiator)){
      // No phantom completed intimacy when the bed disappears mid-scene.
      root.socialAction=null;return false;
    }
    if(s.elapsed<length)return false;
    const physicalAccepted=agreedBeforeUsing&&consent===true&&
      romanceAvailability(root.socialGraph,s.initiator,s.partner,
        s.branchAction.id,root.minutes).enabled&&
      (!intimacy||Boolean(intimacyBedPlan(root,s.initiator)));
    const response=agreedBeforeUsing
      ?{accepted:physicalAccepted,
        type:physicalAccepted?s.branchAction.id:s.branchAction.id+'.refused',
        outcome:physicalAccepted?'warm':'refused',intensity:1}
      :resolveBranchResponse(root.socialGraph,s.initiator,s.partner,
        s.branchAction.id,{recipient:get(root,s.partner),minutes:root.minutes,
          compatibilityBias:socialCompatibility(get(root,s.partner)?.personality,
            get(root,s.initiator)?.personality).bias});
    if(!response){root.socialAction=null;return false;}
    s.branchAction.resultType=response.type;
    if(['romance.date','romance.breakup','romance.tender',
      'romance.propose','romance.marry','romance.divorce',
      'romance.checkin','romance.repair','romance.hug','romance.kiss',
      'romance.intimacy','romance.evening'].includes(s.branchAction.id)){
      // A commitment or loving gesture is a verified canonical milestone,
      // never a fake generic talk, quarrel or automatic affinity reward.
      const completed=recordPairCompletion(root,s,response.type);
      root.socialAction=null;
      if(!completed)return false;
      if(evening&&response.accepted){
        // Modest leisure benefit only after the accepted canonical receipt.
        for(const id of [s.initiator,s.partner]){
          const resident=get(root,id);
          resident.needs.fun=clamp(resident.needs.fun+8,0,100);
          refreshMind(resident);
        }
      }
      root.relationship.nextSocialAt=root.minutes+SOCIAL_COOLDOWN_MINUTES;
      const accepted=response.accepted;
      const separated=['romance.breakup','romance.divorce'].includes(response.type);
      const notices={
        'romance.date':'Теперь встречаются',
        'romance.tender':'Проявил(а) нежность',
        'romance.hug':'Нежно обнялись',
        'romance.kiss':'Поцеловались',
        'romance.intimacy':'Побыли наедине',
        'romance.evening':'Провели вечер вдвоём',
        'romance.checkin':'Уделил(а) внимание',
        'romance.repair':'Поговорил(а) об обиде',
        'romance.propose':'Обручились',
        'romance.marry':'Стали супругами',
        'romance.breakup':'Завершил(а) отношения',
        'romance.divorce':'Брак завершён'
      };
      get(root,s.initiator).event=notices[response.type]||'Уважает отказ';
      get(root,s.partner).event=notices[response.type]||
        'Предпочёл(ла) сохранить дистанцию';
      for(const id of [s.initiator,s.partner])
        get(root,id).autonomy.nextAt=root.minutes+15;
      emitSocialReaction(root,{actorId:s.initiator,responderId:s.partner,
        outcome:response.outcome,intensity:response.intensity,
        eventType:'branch.reply'});
      emitSocialReaction(root,{actorId:s.partner,responderId:s.initiator,
        outcome:separated?'awkward':accepted?'warm':'awkward',
        eventType:'branch.initiator'});
      return true;
    }
    // Respectful romantic refusal: no quarrel, imposed fun, shared-affinity
    // penalty or fake positive memory. Only a canonical refusal + cooldown.
    if(s.branchAction.id.startsWith('romance.')&&!response.accepted){
      const declined=recordPairCompletion(root,s,response.type);
      root.socialAction=null;
      if(!declined)return false;
      root.relationship.nextSocialAt=root.minutes+SOCIAL_COOLDOWN_MINUTES;
      get(root,s.initiator).event='Уважает отказ';
      get(root,s.partner).event='Обозначил(а) границы';
      emitSocialReaction(root,{actorId:s.initiator,responderId:s.partner,
        outcome:'refused',eventType:'branch.reply'});
      emitSocialReaction(root,{actorId:s.partner,responderId:s.initiator,
        outcome:'awkward',eventType:'branch.initiator'});
      return true;
    }
    s.kind=response.accepted?'talk':'argue';
    if(!completeSocial(root,response.accepted?6:-5))return false;
    emitSocialReaction(root,{actorId:s.initiator,responderId:s.partner,
      outcome:response.outcome,intensity:response.intensity,eventType:'branch.reply'});
    emitSocialReaction(root,{actorId:s.partner,responderId:s.initiator,
      outcome:response.accepted?'neutral':'awkward',eventType:'branch.initiator'});
    return true;
  }
  if(s.shared){
    // A cancelled/removed TV or seat never produces canonical Social/Fun.
    if(s.shared.choiceId==='tv'&&
      (s.shared.tvConsent!==true||
       !validSharedTvPlan(root,s.shared.tvPlan,s.initiator))){
      root.socialAction=null;return false;
    }
    const duration=sharedDuration(s.shared);
    if(!duration){root.socialAction=null;return false;}
    s.elapsed+=minutes;
    if(s.elapsed<duration)return false;
    const receipt=completeSharedSession(root);
    if(!receipt){root.socialAction=null;return false;}
    const acceptedShared=receipt.kind!=='refused';
    const autoLeisureToken=s.automatic&&s.shared.mode==='leisure'&&acceptedShared
      ?autonomousLeisureToken(s.shared.choiceId,root.socialGraph?.nextSeq):null;
    const completed=recordPairCompletion(root,s,s.shared.mode==='gift'
      ?receipt.kind==='refused'?'gift.refused':'gift.accepted'
      :receipt.kind==='refused'?'leisure.refused':'leisure.accepted',
      autoLeisureToken);
    const accepted=receipt.kind!=='refused';
    if(accepted&&completed){
      const tag=s.shared.mode==='gift'
        ?GIFT_CATALOG[inventoryFor(root,s.partner)
          .find(item=>item.id===s.shared.choiceId)?.type]?.tag
        :LEISURE_CATALOG[s.shared.choiceId]?.tag;
      if(tag)learnSocialPreference(root.socialGraph,completed,
        s.initiator,s.partner,get(root,s.partner).personality,tag);
    }
    const recipientOutcome=!accepted?'refused':
      receipt.kind==='liked'||s.shared.mode==='leisure'?'warm':'neutral';
    emitSocialReaction(root,{actorId:s.initiator,responderId:s.partner,
      outcome:recipientOutcome,eventType:s.shared.mode+'.reply'});
    emitSocialReaction(root,{actorId:s.partner,responderId:s.initiator,
      outcome:accepted?'neutral':'awkward',eventType:s.shared.mode+'.initiator'});
    root.relationship.nextSocialAt=root.minutes+SOCIAL_COOLDOWN_MINUTES;
    root.socialAction=null;
    return true;
  }
  const def=SOCIAL_ACTIONS[s.kind];
  if(!def)return false;
  s.elapsed+=minutes;
  return s.elapsed>=def.duration?completeSocial(root):false;
}
export function loadSocialAction(data,root) {
  const shared=data?.shared===undefined?null:restoreSharedSession(data.shared,root,data.initiator);
  const duration=shared?sharedDuration(shared):
    data?.branchAction?.id==='romance.intimacy'&&
    data?.branchAction?.intimacyConsent===true
      ?INTIMACY_DURATION_MINUTES:
    data?.branchAction?.id==='romance.evening'
      ?(data.branchAction.eveningConsent===true
        ?ROMANTIC_EVENING_DURATION_MINUTES:ROMANTIC_EVENING_REFUSAL_MINUTES):
      SOCIAL_ACTIONS[data?.kind]?.duration;
  if(!data||typeof data!=='object'||Array.isArray(data)||
    !Object.hasOwn(SOCIAL_ACTIONS,data.kind)||!validId(data.initiator)||
    data.partner!==otherId(data.initiator)||!['walking','using'].includes(data.phase)||
    !data.target||!Number.isFinite(data.target.x)||!Number.isFinite(data.target.z)||
    Math.abs(data.target.x)>4.65||Math.abs(data.target.z)>4.01||
    !Number.isFinite(data.elapsed)||data.elapsed<0||data.elapsed>=duration||
    (!root.autonomy.enabled&&data.automatic===true))return null;
  if(get(root,data.initiator).action||get(root,data.partner).action)return null;
  const session=data.conversation===undefined?null:restoreConversation(data.conversation);
  if(data.conversation!==undefined&&(!session||data.kind!=='talk'||data.automatic===true))
    return null;
  if(data.shared!==undefined&&(!shared||session||data.kind!=='talk'||
    (data.automatic===true&&shared.mode!=='leisure')||
    (shared.choiceId==='tv'&&(data.automatic===true||
      (data.phase==='using'&&shared.tvConsent!==true)||
      (data.phase==='walking'&&shared.tvConsent!==undefined)))))return null;
  const branch=data.branchAction;
  // Optional v1 R5b table stage must reference the actual unmoved table and
  // predeclared opposite-side foot anchors; forged/corrupt stages fail closed.
  if(data.eveningStage!==undefined&&
    (branch?.id!=='romance.evening'||
      !validRomanticEveningStage(root.world,data.eveningStage)))return null;
  if(branch!==undefined&&(
    !branch||typeof branch!=='object'||Array.isArray(branch)||
    !Object.hasOwn(branch,'id')||
    !(Object.keys(branch).length===1||
      (['romance.hug','romance.kiss','romance.intimacy','romance.evening'].includes(branch.id)&&
        Object.keys(branch).length===2&&
        typeof branch[branch.id==='romance.hug'?'hugConsent':
          branch.id==='romance.kiss'?'kissConsent':
            branch.id==='romance.evening'?'eveningConsent':'intimacyConsent']==='boolean'))||
    !availableSocialActions(root.socialGraph,data.initiator,data.partner,root.minutes)
      .some(action=>action.id===branch.id&&action.enabled)||
    (branch?.id==='romance.intimacy'&&(
      !intimacyBedPlan(root,data.initiator)||
      (data.phase==='using'&&typeof branch.intimacyConsent!=='boolean')))||
    (branch?.id==='romance.evening'&&data.phase==='using'&&
      typeof branch.eveningConsent!=='boolean')||
    session||shared||data.kind!=='talk'||
    (data.automatic===true&&!AUTONOMOUS_FRIEND_BRANCHES.includes(branch.id))))return null;
  return {kind:data.kind,initiator:data.initiator,partner:data.partner,
    target:{x:data.target.x,z:data.target.z},phase:data.phase,
    elapsed:data.elapsed,automatic:data.automatic===true,
    ...(session?{conversation:session}:{}),
    ...(shared?{shared}:{}),
    ...(data.eveningStage?{eveningStage:{instanceId:data.eveningStage.instanceId,
      tableX:data.eveningStage.tableX,tableZ:data.eveningStage.tableZ,
      tableYaw:data.eveningStage.tableYaw,
      actor:{x:data.eveningStage.actor.x,z:data.eveningStage.actor.z},
      partner:{x:data.eveningStage.partner.x,z:data.eveningStage.partner.z}}}:{}),
    ...(branch?{branchAction:{id:branch.id,
      ...(['romance.hug','romance.kiss','romance.intimacy','romance.evening'].includes(branch.id)&&
          data.phase==='using'
        ?{[branch.id==='romance.hug'?'hugConsent':
            branch.id==='romance.kiss'?'kissConsent':
            branch.id==='romance.evening'?'eveningConsent':'intimacyConsent']:
          branch[branch.id==='romance.hug'?'hugConsent':
            branch.id==='romance.kiss'?'kissConsent':
            branch.id==='romance.evening'?'eveningConsent':'intimacyConsent']===true&&
          resolveBranchResponse(root.socialGraph,data.initiator,data.partner,
            branch.id,{recipient:get(root,data.partner),
              minutes:root.minutes,
              compatibilityBias:socialCompatibility(
                get(root,data.partner)?.personality,
                get(root,data.initiator)?.personality).bias})?.accepted===true}
        :{})}}:{})};
}
/** Current scene adapter stays two-person; policy core handles N IDs.
 * No automatic invitation reserves or deletes a player's FIFO action here.
 */
export function autonomousSocialChoice(root,id='alex') {
  if(!validId(id)||!root?.otherSim)return null;
  const idea=proposeAutonomousSocial({
    graph:root.socialGraph,actorId:id,
    residents:{alex:root,mira:root.otherSim},
    queues:root.actionQueues,minutes:root.minutes,
    enabled:root.autonomy?.enabled,paused:root.paused,
    socialBusy:Boolean(root.socialAction),
    nextSocialAt:root.relationship?.nextSocialAt??Infinity,
    viewOverrides:root.relationship?.views??null,
    // Existing player-accepted behaviour: a genuinely remorseful actor may
    // initiate peace, but the wounded resident never has to propose it.
    reconcileTargetId:canReconcile(root)&&lastSocialMemory(get(root,id))?.id==='regret'
      ?otherId(id):null
  });
  return idea?.action?{kind:idea.kind,...idea.action}:idea?.kind??null;
}
