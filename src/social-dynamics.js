/** Блин’С 1.0h: headless pair dynamics and respectful social autonomy.
 * Both are derived from canonical completed graph events, not UI events.
 * No hardcoded residents, persistent shadow relationship score or randomness.
 */
import {deriveAxes,preferenceAffinity} from './trait-catalog.js';
import {episodeAppraisal} from './social-episodes.js';
import {knownSocialCues} from './social-boundaries.js';

const DAY=1440;
export const DYNAMIC_WINDOW_DAYS=14;
export const AUTONOMOUS_PAIR_COOLDOWN=360; // Six in-game hours, not render seconds.
export const AUTONOMOUS_REFUSAL_COOLDOWN=960;
export const AUTONOMOUS_REPAIR_COOLDOWN=180; // Preserve gentle reconciliation after old 3h wait.
export const AUTONOMOUS_LEISURE=Object.freeze(['music','books','games']);
export const AUTONOMOUS_FRIEND_BRANCHES=Object.freeze([
  'acquaint.chat','friend.tease','friend.confide'
]);
export const PAIR_DYNAMICS=Object.freeze({
  forming:{label:'Пока присматриваются',description:'Привычный способ общения ещё складывается'},
  supportive:{label:'Поддерживают друг друга',description:'Есть опыт добрых поступков и доверия'},
  playful:{label:'Любят подшучивать',description:'Вместе находят повод повеселиться'},
  strained:{label:'Сложно понять друг друга',description:'Повторяющиеся ссоры оставили напряжение'},
  distant:{label:'Держат дистанцию',description:'Не все предложения о сближении были желанными'}
});
const positive=new Set(['talk','conversation.talk','friend.confide',
  'gift.accepted','leisure.accepted','friend.tease','rival.truce','acquaint.chat']);
const conflict=new Set(['argue','conversation.argue','rival.taunt','friend.tease.refused']);
const refusals=new Set(['gift.refused','leisure.refused','friend.confide.refused',
  'acquaint.chat.refused','rival.truce.refused']);
const playful=new Set(['friend.tease','leisure.accepted']);
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const finite=n=>Number.isFinite(n);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const validId=id=>typeof id==='string'&&/^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/.test(id);
const autonomyToken=(choiceId,seq)=>'auto.leisure.'+choiceId+':'+seq;
/** Only fulfilled auto leisure has a typed token in the canonical graph;
 * previewed and cancelled choices never acquire a history marker.
 */
export function autonomousLeisureToken(choiceId,seq){
  return AUTONOMOUS_LEISURE.includes(choiceId)&&Number.isSafeInteger(seq)&&seq>0
    ?autonomyToken(choiceId,seq):null;
}
/** Actions are distinct from a queued intent: an event token confirms completion. */
function recentLeisureChoice(pair){
  const recent=Array.isArray(pair?.events)?pair.events.slice(-4):[];
  for(let i=recent.length-1;i>=0;i--){
    if(recent[i].type==='leisure.accepted'&&typeof recent[i].token==='string'){
      const match=/^auto\.leisure\.(music|books|games):[1-9][0-9]*$/.exec(recent[i].token);
      if(match)return match[1];
    }
    if(recent[i].type!=='introduced')break;
  }
  return null;
}
/** Completed pair habits: who initiated on different game days matters;
 * recent saturation is shared by both participants. Derived, never persisted.
 */
export const AUTONOMOUS_HABIT_WINDOW_DAYS=10;
function completedActivity(e){
  if(e.type==='talk'||e.type==='conversation.talk')return 'talk';
  if(AUTONOMOUS_FRIEND_BRANCHES.includes(e.type))return 'branch.'+e.type;
  if(e.type==='leisure.accepted'&&typeof e.token==='string'){
    const match=/^auto\.leisure\.(music|books|games):[1-9][0-9]*$/.exec(e.token);
    return match?'leisure.'+match[1]:null;
  }
  return null;
}
export function pairSocialHabits(pair,actorId,now){
  const empty={recent:[],familiar:{}};
  if(!validId(actorId)||!record(pair)||!Array.isArray(pair.ids)||
    !pair.ids.includes(actorId)||!finite(now)||now<0||
    !Array.isArray(pair.events))return empty;
  const finished=pair.events.filter(e=>record(e)&&finite(e.at)&&
    e.at<=now&&e.at>=now-AUTONOMOUS_HABIT_WINDOW_DAYS*DAY&&
    pair.ids.includes(e.actorId)).map(e=>({
      activity:completedActivity(e),actorId:e.actorId,day:Math.floor(e.at/DAY)
    })).filter(e=>e.activity).slice(-16);
  const days=new Map();
  for(const e of finished){
    if(e.actorId!==actorId)continue;
    if(!days.has(e.activity))days.set(e.activity,new Set());
    days.get(e.activity).add(e.day);
  }
  const familiar={};
  for(const [key,observed] of days){
    if(observed.size>=2)familiar[key]=Math.min(3,observed.size);
  }
  return {recent:finished.slice(-4).map(e=>e.activity),familiar};
}

/** A matching pleasant pastime is suggested, never a knowingly disliked one.
 * The receiver's actual reaction is still checked before and after execution.
 */
function sharedInterest(self,recipient,pair,actorId,now){
  const remembered=Array.isArray(pair?.knowledge?.[actorId])?
    pair.knowledge[actorId]:[];
  const last=recentLeisureChoice(pair);
  const habits=pairSocialHabits(pair,actorId,now);
  return AUTONOMOUS_LEISURE.map(choiceId=>{
    const own=preferenceAffinity(self.personality,choiceId);
    const their=preferenceAffinity(recipient.personality,choiceId);
    const known=remembered.find(entry=>entry.tag===choiceId)?.stance;
    // We can suggest our own favourite pastime or a preference the partner
    // actually disclosed; unseen private tastes only veto obvious dislikes.
    const activity='leisure.'+choiceId;
    const repeated=habits.recent.filter(key=>key===activity).length;
    const familiarity=habits.familiar[activity]||0;
    // Familiarity attracts, but A/B/A/B cycles must not become a habit loop.
    const score=own*4+(known==='likes'&&their>0?6:0)+familiarity-
      (repeated>=2?8:repeated===1?1:0);
    return {choiceId,score};
  }).filter(x=>x.choiceId!==last&&
    preferenceAffinity(self.personality,x.choiceId)>=0&&
    preferenceAffinity(recipient.personality,x.choiceId)>=0&&x.score>=3)
    .sort((a,b)=>b.score-a.score||a.choiceId.localeCompare(b.choiceId))[0]||null;
}
const needsSafe=x=>record(x)&&['energy','hunger','hygiene','fun'].every(k=>finite(x[k])&&x[k]>=0&&x[k]<=100);

/** Slow-changing qualitative interpretation for a particular viewpoint.
 * Repeating the same action on one game day counts as one piece of evidence.
 * No new field is saved, so loading old saves never synthesizes new events.
 */
export function pairDynamic(pair,viewerId,now){
  const forming={id:'forming',...PAIR_DYNAMICS.forming};
  if(!record(pair)||!Array.isArray(pair.ids)||!pair.ids.includes(viewerId)||
    !record(pair.views?.[viewerId])||!finite(now)||now<0)return forming;
  const recent=Array.isArray(pair.events)?pair.events.filter(e=>record(e)&&
    finite(e.at)&&e.at<=now&&e.at>=now-DYNAMIC_WINDOW_DAYS*DAY&&
    typeof e.type==='string'&&e.type!=='introduced').slice(-32):[];
  const seen=new Set(),events=[];
  for(const e of recent){
    const key=e.type+':'+Math.floor(e.at/DAY);
    if(seen.has(key))continue;
    seen.add(key);events.push(e);
  }
  const days=new Set(events.map(e=>Math.floor(e.at/DAY)));
  if(days.size<2||events.length<3)return forming;
  const count=set=>events.filter(e=>set.has(e.type)).length;
  const pos=count(positive),neg=count(conflict),ref=count(refusals),fun=count(playful);
  const view=pair.views[viewerId];
  const wound=episodeAppraisal(pair,viewerId,now);
  let id='forming';
  if(neg>=2&&(view.tension>=48||wound.unresolved))id='strained';
  else if(ref>=2&&(view.trust<=55||view.tension>=35))id='distant';
  else if(pos>=3&&fun>=2&&view.friendship>=52&&view.tension<48)id='playful';
  else if(pos>=3&&view.trust>=55&&view.tension<55)id='supportive';
  return {id,...PAIR_DYNAMICS[id]};
}
function safeEvent(pair,now){
  if(!Array.isArray(pair?.events))return null;
  return pair.events.filter(e=>record(e)&&finite(e.at)&&e.at<=now&&
    typeof e.type==='string').at(-1)||null;
}
/** Generic, non-mutating social proposal. The renderer/adapter may accept it
 * only after pathfinding and availability; no direct queue edits happen here.
 */
export function proposeAutonomousSocial({
  graph,actorId,residents,queues,minutes,enabled=true,paused=false,
  socialBusy=false,nextSocialAt=0,reconcileTargetId=null,viewOverrides=null
}={}){
  if(!enabled||paused||socialBusy||!validId(actorId)||!finite(minutes)||
    minutes<540||minutes<nextSocialAt||!record(residents)||
    !graph?.persons?.includes(actorId)||
    !record(queues?.byResident)||!Object.hasOwn(queues.byResident,actorId))
    return null;
  const self=residents[actorId];
  if(!record(self)||self.action||!needsSafe(self.needs)||
    self.autonomy?.enabled===false||self.paused===true||
    (queues?.byResident?.[actorId]?.length||0)>0)return null;
  if(Math.min(self.needs.energy,self.needs.hunger,self.needs.hygiene,
    finite(self.needs.bladder)?self.needs.bladder:75)<48)return null;
  const axes=deriveAxes(self.personality);
  const mood=finite(self.mind?.mood?.value)?self.mind.mood.value:50;
  if(mood<34&&reconcileTargetId===null)return null;
  // A real missing social need increases willingness to seek company; it
  // cannot override the existing exhaustion, consent or pair cooldown gates.
  const socialLevel=finite(self.needs.social)?clamp(self.needs.social,0,100):75;
  const socialUrge=clamp(65-socialLevel,0,65)*.85;
  // Real work recovery lightly prefers a real available relationship,
  // never bypassing consent, physical urgency or social cooldowns.
  const recovery=self.workRecovery?.until>minutes&&socialLevel<35?5:0;
  const urge=clamp(65-self.needs.fun,0,65)*.8+socialUrge+recovery+axes.sociability*11-
    axes.independence*5+(mood>60?3:0);
  let chosen=null;
  for(const targetId of graph.persons){
    if(targetId===actorId||!validId(targetId)||
      !Object.hasOwn(queues.byResident,targetId))continue;
    const recipient=residents[targetId],pair=graph.pairs?.[JSON.stringify(
      [actorId,targetId].sort())];
    if(!record(recipient)||recipient.action||recipient.paused===true||
      recipient.autonomy?.enabled===false||!needsSafe(recipient.needs)||
      (queues?.byResident?.[targetId]?.length||0)>0||
      !record(pair)||!finite(pair.metAt)||pair.metAt>minutes)continue;
    if(Math.min(recipient.needs.energy,recipient.needs.hunger,
      recipient.needs.hygiene,
      finite(recipient.needs.bladder)?recipient.needs.bladder:75)<48)continue;
    const latest=safeEvent(pair,minutes);
    const severe=latest&&(conflict.has(latest.type)||refusals.has(latest.type));
    // A remorseful initiator may make one gentle repair approach after the
    // historical reconciliation window, not after every disagreement.
    const repair=reconcileTargetId===targetId&&latest&&
      (latest.type==='argue'||latest.type==='conversation.argue')&&
      finite(pair.lastAt)&&minutes-pair.lastAt>=AUTONOMOUS_REPAIR_COOLDOWN;
    if(finite(pair.lastAt)&&minutes-pair.lastAt<
      (repair?AUTONOMOUS_REPAIR_COOLDOWN:
        severe?AUTONOMOUS_REFUSAL_COOLDOWN:AUTONOMOUS_PAIR_COOLDOWN))continue;
    const recipientMood=finite(recipient.mind?.mood?.value)
      ?recipient.mind.mood.value:50;
    if(recipientMood<(repair?25:40))continue; // No unsolicited pressure on someone in distress.
    // The legacy two-person adapter may have live directed views that have
    // not yet been copied into its canonical graph snapshot. Read-only bridge.
    const directed=viewOverrides?.[actorId]??pair.views?.[actorId];
    const targetView=viewOverrides?.[targetId]??pair.views?.[targetId];
    if(!record(directed)||!record(targetView))continue;
    const recipientWound=episodeAppraisal(pair,targetId,minutes);
    const style=pairDynamic(pair,actorId,minutes);
    const boundary=knownSocialCues(pair,actorId).find(e=>e.id==='space');
    const targetAxes=deriveAxes(recipient.personality);
    // High-confidence personal-space cues matter even after generic cooldown.
    if(boundary?.count>=2&&targetAxes.independence>=.7&&
      directed.trust<68)continue;
    const restraint=(targetAxes.independence>=.7?5:0)+
      (recipientWound.unresolved?15:0)+(boundary?.count>=1?5:0);
    const relationship=(directed.friendship-50)*.18+
      (directed.trust-45)*.12-directed.tension*.15+
      (targetView.tension>=70? -10:0);
    const dynamicWeight={forming:0,supportive:9,playful:6,strained:-15,distant:-18}[style.id];
    let score=urge+relationship+dynamicWeight-restraint;
    // Reconciliation is a special motive, not an arbitrary need for fun.
    if(repair)score=Math.max(score,38);
    // Preserve rare spontaneous conflict driven by intense directed tension
    // AND bad mood AND low fun, but never immediately repeat a recent fight.
    const distressed=!repair&&!severe&&directed.tension>=85&&
      mood<42&&self.needs.fun<35;
    // A composed temperament can decline the discretionary confrontation.
    // Do not turn restraint into an imposed conversation or suppress repair.
    // Other profiles retain the existing severe-tension conflict threshold.
    if(distressed&&axes.emotionalReactivity<=.36&&axes.resilience>=.62)continue;
    if(distressed)score+=20;
    // Discretionary company is distinct from a genuinely unmet social need.
    // Preserve all existing eligibility, cooldown, repair and distress gates.
    // A weak but safe acquaintance is interesting to an outgoing resident;
    // reserved/independent residents are more selective about optional company.
    if(!repair&&!distressed&&finite(self.needs.social)&&socialLevel>=45){
      if(axes.sociability<=.36&&directed.trust<60)score-=4;
      if(axes.independence>=.70)score-=4;
      if(axes.sociability>=.70&&directed.friendship>=35&&directed.friendship<=55&&
        directed.trust>=45&&directed.tension<20&&targetView.tension<20&&!boundary&&!recipientWound.unresolved)
        score+=3;
      if(axes.empathy>=.70&&boundary?.count>=1)score-=3;
    }
    if(score<26)continue; // Having nothing to say is a valid autonomous choice.
    const candidate={actorId,targetId,
      kind:distressed?'argue':'talk',
      style:style.id,score:Math.round(score)};
    // Never turn a remorseful reconciliation into a playful detour.
    // These are actual existing branch and leisure systems, not new rewards.
    if(!repair&&!distressed&&recipientMood>=55&&mood>=45&&
      directed.tension<32&&targetView.tension<40&&
      directed.trust>=52&&targetView.trust>=48){
      const lastType=latest?.type||null;
      const habits=pairSocialHabits(pair,actorId,minutes);
      const hobby=sharedInterest(self,recipient,pair,actorId,minutes);
      const enoughFun=self.needs.fun<55&&recipient.needs.fun<88;
      if(hobby&&enoughFun&&directed.friendship>=52){
        candidate.action={type:'shared',mode:'leisure',choiceId:hobby.choiceId};
      }else if(pair.friendship!=='none'&&directed.trust>=65&&
        targetView.trust>=55&&lastType!=='friend.confide'&&
        (style.id==='supportive'||habits.familiar['branch.friend.confide']>=2)){
        candidate.action={type:'branch',actionId:'friend.confide'};
      }else if(pair.friendship!=='none'&&directed.trust>=60&&
        lastType!=='friend.tease'&&
        (style.id==='playful'||habits.familiar['branch.friend.tease']>=2)){
        candidate.action={type:'branch',actionId:'friend.tease'};
      }else if(pair.metAt!==null&&lastType!=='acquaint.chat'&&
        (lastType==='talk'||habits.familiar['branch.acquaint.chat']>=2)&&
        directed.friendship>=50&&targetView.friendship>=47){
        candidate.action={type:'branch',actionId:'acquaint.chat'};
      }
    }
    // Choosing nothing is valid when a recent activity has been overused.
    // Reconciliation and rare serious conflict retain their special pathways.
    const habits=pairSocialHabits(pair,actorId,minutes);
    const proposedActivity=candidate.action?.type==='shared'
      ?'leisure.'+candidate.action.choiceId
      :candidate.action?.type==='branch'
        ?'branch.'+candidate.action.actionId:candidate.kind;
    if(!repair&&!distressed&&
      habits.recent.filter(key=>key===proposedActivity).length>=2&&
      finite(pair.lastAt)&&minutes-pair.lastAt<AUTONOMOUS_PAIR_COOLDOWN*2)
      continue;
    if(!chosen||candidate.score>chosen.score||
      (candidate.score===chosen.score&&targetId<chosen.targetId))chosen=candidate;
  }
  return chosen;
}
