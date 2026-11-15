/** Unified social reaction rules for Блин’С.
 * One render-independent, deterministic interpreter for every social response.
 * No resident IDs, DOM, animations, random rolls, clock reads or saved state.
 * Legacy one-click talk/argue always execute; their individual impressions use
 * the same personality/emotion layer without changing historical affinity.
 */
import {deriveAxes,preferenceAffinity} from './trait-catalog.js';
import {visibleEmotions} from './emotion-engine.js';
import {socialOutcome} from './social-feedback.js';

export const SOCIAL_REACTION_KINDS=Object.freeze(['conversation','gift','leisure','branch','direct']);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const safe=(value,fallback)=>Number.isFinite(value)?value:fallback;
const NEGATIVE_IMPRESSIONS=new Set([
  'regret','hurt','gift.rejected','gift.refused','leisure.refused'
]);
const BRANCH_TAGS=Object.freeze({
  'acquaint.introduce':'socializing',
  'acquaint.chat':'socializing',
  'friend.tease':'games',
  'friend.confide':'socializing',
  'rival.taunt':'socializing',
  'rival.truce':'socializing'
});
const BRANCH_THRESHOLDS=Object.freeze({
  'acquaint.introduce':-Infinity,
  'acquaint.chat':6,
  'friend.tease':24,
  'friend.confide':43,
  'rival.taunt':Infinity,
  'rival.truce':24
});
const unwell=emotion=>['sadness','irritation','anxiety'].includes(emotion.kind);
const delighted=emotion=>['joy','enthusiasm','inspiration'].includes(emotion.kind);

/** A deterministic snapshot, safe for use by an arbitrary-N resident registry. */
export function socialReactionContext(recipient,view,minutes,tag=null){
  const axes=deriveAxes(recipient?.personality);
  const feelings=visibleEmotions(recipient?.mind,minutes,recipient?.personality);
  const bad=feelings.filter(unwell).reduce((top,e)=>Math.max(top,e.intensity),0);
  const good=feelings.filter(delighted).reduce((top,e)=>Math.max(top,e.intensity),0);
  const mood=safe(recipient?.mind?.mood?.value,60);
  const taste=typeof tag==='string'?preferenceAffinity(recipient?.personality,tag):0;
  return {
    axes,trust:clamp(safe(view?.trust,45),0,100),
    friendship:clamp(safe(view?.friendship,50),0,100),
    tension:clamp(safe(view?.tension,0),0,100),
    taste, bad, good, mood:clamp(mood,0,100)
  };
}
function stateEffect(c,kind){
  // Shared mood/emotion rules, but a mild invitation and a personal gift differ.
  const distressThreshold=kind==='gift'?40:30;
  const distress=c.bad>distressThreshold
    ?kind==='conversation'?12:kind==='gift'?8:kind==='leisure'?12:10:0;
  const uplift=c.good>50&&c.bad<=distressThreshold?3:0;
  const tiredMood=c.mood<42?-Math.min(8,Math.round((42-c.mood)/5)):0;
  return -distress+uplift+tiredMood;
}
/** Return a pure, bounded reaction; caller commits effects only on completion.
 * 'direct' is legacy talk/argue: no refusal gate (compatible +8/-12),
 * but the personalized impression is resolved by socialImpressionFactor.
 */
export function evaluateSocialReaction({
  kind,recipient,view,minutes,tag=null,tone='neutral',weight=0,actionId=null,historyBias=0
}={}){
  if(!SOCIAL_REACTION_KINDS.includes(kind)||!Number.isFinite(minutes)||minutes<0)return null;
  if(kind==='branch'&&!Object.hasOwn(BRANCH_THRESHOLDS,actionId))return null;
  const c=socialReactionContext(recipient,view,minutes,
    kind==='branch'?BRANCH_TAGS[actionId]:tag);
  const {axes,trust,friendship,tension,taste}=c;
  let score=0,threshold=0,accepted=false;
  if(kind==='conversation'){
    score=40+trust*.19-tension*.38+axes.sociability*8+axes.empathy*8+
      taste*19+(tone==='warm'?13:tone==='sharp'?-26:0)+
      (safe(weight,0)<0?Math.max(-10,weight*2):0)+stateEffect(c,kind);
    threshold=49;
  }else if(kind==='gift'){
    score=45+taste*38+trust*.15-tension*.28+axes.empathy*7+stateEffect(c,kind);
    threshold=37;
  }else if(kind==='leisure'){
    score=43+taste*28+trust*.17-tension*.42+axes.sociability*8+stateEffect(c,kind);
    threshold=42;
  }else if(kind==='branch'){
    score=trust*.42+friendship*.27-tension*.40+
      (axes.sociability-.5)*12+(axes.empathy-.5)*8+
      (axes.resilience-.5)*4+taste*8+stateEffect(c,kind);
    threshold=BRANCH_THRESHOLDS[actionId];
  }else{
    // Direct talk/argue has no refusal gate, but a contextual reading exists
    // for future animation/feedback; the existing signed result is unchanged.
    score=40+trust*.19+friendship*.13-tension*.38+
      axes.sociability*8+axes.empathy*8+stateEffect(c,'conversation');
    threshold=-Infinity;
  }
  // A severe directed memory influences choices, not legacy guaranteed
  // talk/argue or any saved shared-affinity rule.
  if(kind!=='direct')score+=clamp(safe(historyBias,0),-30,30);
  accepted=score>=threshold;
  // A confrontation is intentionally hostile; introducing oneself is
  // always possible if the relationship graph unlocked that option.
  const normalized=clamp(Math.round(score),0,100);
  return {accepted,score:normalized,confidence:normalized,
    outcome:socialOutcome({kind,accepted,score:normalized,tone,actionId}),
    intensity:clamp(Math.round(Math.abs(score-threshold)*1.4),20,100)||
      (Number.isFinite(threshold)?20:65),
    ...(kind==='gift'?{liked:accepted&&score>=70}:{})};
}
/** All role-specific relationship impressions, including old talk/argue,
 * gifts, leisure and future kinds, share this same affective multiplier.
 */
export function socialImpressionFactor(resident,memory,minutes){
  const axes=deriveAxes(resident?.personality);
  const feelings=visibleEmotions(resident?.mind,minutes,resident?.personality);
  const active=feelings.find(e=>e.source===memory?.id&&e.at===memory?.at);
  const intensity=active?.intensity??60;
  const felt=clamp(.9+intensity/600,.9,1.1);
  const positive=!NEGATIVE_IMPRESSIONS.has(memory?.id);
  const positiveFactor=clamp(.7+axes.sociability*.25+axes.empathy*.25+
    axes.optimism*.12,.7,1.2)*felt;
  const negativeFactor=clamp(.77+axes.emotionalReactivity*.4+
    (1-axes.resilience)*.2,.77,1.37)*felt;
  return positive?positiveFactor:negativeFactor;
}
