/** Блин’С 1.0h: headless pair dynamics and respectful social autonomy.
 * Both are derived from canonical completed graph events, not UI events.
 * No hardcoded residents, persistent shadow relationship score or randomness.
 */
import {deriveAxes} from './trait-catalog.js';
import {episodeAppraisal} from './social-episodes.js';
import {knownSocialCues} from './social-boundaries.js';

const DAY=1440;
export const DYNAMIC_WINDOW_DAYS=14;
export const AUTONOMOUS_PAIR_COOLDOWN=360; // Six in-game hours, not render seconds.
export const AUTONOMOUS_REFUSAL_COOLDOWN=960;
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
  socialBusy=false,nextSocialAt=0
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
  if(Math.min(self.needs.energy,self.needs.hunger,self.needs.hygiene)<48)return null;
  const axes=deriveAxes(self.personality);
  const mood=finite(self.mind?.mood?.value)?self.mind.mood.value:50;
  if(mood<34&&reconcileTargetId===null)return null;
  const urge=clamp(65-self.needs.fun,0,65)*.8+axes.sociability*11-
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
      recipient.needs.hygiene)<48)continue;
    const latest=safeEvent(pair,minutes);
    const severe=latest&&(conflict.has(latest.type)||refusals.has(latest.type));
    if(finite(pair.lastAt)&&minutes-pair.lastAt<
      (severe?AUTONOMOUS_REFUSAL_COOLDOWN:AUTONOMOUS_PAIR_COOLDOWN))continue;
    const recipientMood=finite(recipient.mind?.mood?.value)
      ?recipient.mind.mood.value:50;
    if(recipientMood<40)continue; // They may need privacy, not an unsolicited chat.
    const directed=pair.views?.[actorId],targetView=pair.views?.[targetId];
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
    const score=urge+relationship+dynamicWeight-restraint;
    if(score<26)continue; // Having nothing to say is a valid autonomous choice.
    // Hostility is never chosen just to fill a need: avoid obsessive quarrels.
    // The player can still initiate any permitted manual conflict.
    const candidate={actorId,targetId,kind:'talk',style:style.id,
      score:Math.round(score)};
    if(!chosen||candidate.score>chosen.score||
      (candidate.score===chosen.score&&targetId<chosen.targetId))chosen=candidate;
  }
  return chosen;
}
