/** Блин’С 1.0k: headless Stage IV romantic feelings and safety gates.
 * Stable person IDs, no graphics or gender assumptions. No romance without
 * an explicit adult life stage, no known family connections, and no consent.
 */
export const LIFE_STAGES=Object.freeze(['child','teen','adult','elder']);
export const FAMILY_KINDS=Object.freeze(['parent','sibling']);
export const ROMANCE_ACTION_IDS=Object.freeze(['romance.flirt','romance.confess']);
export const ROMANCE_COOLDOWN_MINUTES=1440;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const valid=id=>typeof id==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(id);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const time=at=>Number.isFinite(at)&&at>=0&&at<=1e7;
const adult=stage=>stage==='adult'||stage==='elder';
const view=()=>({attraction:0,boundary:'open',lastRefusedAt:null});
export function newRomanceState(ids){
  return {views:Object.fromEntries(ids.map(id=>[id,view()]))};
}
export function restoreRomanceState(raw,ids){
  const fresh=newRomanceState(ids);
  for(const id of ids){
    const source=raw?.views?.[id];
    if(!record(source))continue;
    fresh.views[id]={
      attraction:Number.isFinite(source.attraction)?clamp(Math.round(source.attraction),0,100):0,
      boundary:source.boundary==='closed'?'closed':'open',
      lastRefusedAt:time(source.lastRefusedAt)?source.lastRefusedAt:null
    };
  }
  return fresh;
}
export function setLifeStage(graph,id,stage){
  if(!graph?.persons?.includes(id)||!LIFE_STAGES.includes(stage)||
    !record(graph.lifeStages))return false;
  graph.lifeStages[id]=stage;return true;
}
export function addFamilyLink(graph,from,to,kind){
  if(!graph?.persons?.includes(from)||!graph.persons.includes(to)||from===to||
    !FAMILY_KINDS.includes(kind)||!Array.isArray(graph.familyLinks)||
    graph.familyLinks.length>=2048)return false;
  if(kind==='parent'&&!adult(graph.lifeStages?.[from]))return false;
  const duplicate=graph.familyLinks.some(x=>x.kind===kind&&
    (x.from===from&&x.to===to||kind==='sibling'&&x.from===to&&x.to===from));
  if(duplicate)return false;
  // A child cannot become its own ancestor. Existing connections are kept.
  if(kind==='parent'){
    const seen=new Set([to]),todo=[to];
    while(todo.length){
      const now=todo.shift();
      if(now===from)return false;
      for(const e of graph.familyLinks){
        if(e.kind==='parent'&&e.from===now&&!seen.has(e.to)){
          seen.add(e.to);todo.push(e.to);
        }
      }
    }
  }
  graph.familyLinks.push({from,to,kind});return true;
}
/** An intentionally conservative first kinship rule: a known connected
 * family tree disallows romance, including sibling/adoptive parent routes.
 * Unrelated people connected only by friendship are NOT family links.
 */
export function relatedByFamily(graph,a,b){
  if(!Array.isArray(graph?.familyLinks))return true; // fail closed
  const seen=new Set([a]),todo=[a];
  while(todo.length){
    const current=todo.shift();
    if(current===b)return true;
    for(const edge of graph.familyLinks){
      if(edge.from!==current&&edge.to!==current)continue;
      const next=edge.from===current?edge.to:edge.from;
      if(!seen.has(next)){seen.add(next);todo.push(next);}
    }
  }
  return false;
}
const pairFor=(graph,a,b)=>valid(a)&&valid(b)&&a!==b&&
  graph?.persons?.includes(a)&&graph.persons.includes(b)
  ?graph.pairs?.[JSON.stringify([a,b].sort())]:null;
export function romanceSafety(graph,a,b){
  if(!pairFor(graph,a,b))return {allowed:false,reason:'Сначала познакомьтесь'};
  if(!adult(graph.lifeStages?.[a])||!adult(graph.lifeStages?.[b]))
    return {allowed:false,reason:'Романтика доступна только взрослым'};
  if(relatedByFamily(graph,a,b))
    return {allowed:false,reason:'Между родственниками романтика недоступна'};
  return {allowed:true,reason:''};
}
export function romanceAvailability(graph,a,b,actionId,now=0){
  if(!ROMANCE_ACTION_IDS.includes(actionId)||!time(now))
    return {enabled:false,reason:'Недоступное действие'};
  const safety=romanceSafety(graph,a,b);
  if(!safety.allowed)return {enabled:false,reason:safety.reason};
  const pair=pairFor(graph,a,b),src=pair.views?.[a],target=pair.views?.[b];
  const feelings=pair.romance?.views;
  if(!record(src)||!record(target)||!record(feelings?.[a])||
    !record(feelings?.[b])||pair.metAt===null)
    return {enabled:false,reason:'Сначала познакомьтесь'};
  if(feelings[a].boundary==='closed'||feelings[b].boundary==='closed')
    return {enabled:false,reason:'Важно уважать личные границы'};
  if(time(feelings[b].lastRefusedAt)&&
    now-feelings[b].lastRefusedAt<ROMANCE_COOLDOWN_MINUTES)
    return {enabled:false,reason:'После отказа нужно время'};
  if(src.tension>=42||target.tension>=42||
    src.trust<49||target.trust<45||src.friendship<50||target.friendship<47)
    return {enabled:false,reason:'Сначала узнайте друг друга получше'};
  if(actionId==='romance.confess'&&(
    feelings[a].attraction<24||feelings[b].attraction<15||
    src.trust<58||target.trust<54||
    // Being a gracious recipient is not the same as taking initiative.
    // A confession needs at least one completed reciprocal flirt.
    !Array.isArray(pair.events)||!pair.events.some(e=>
      e.type==='romance.flirt'&&e.actorId===b&&e.targetId===a&&
      Number.isFinite(e.at)&&e.at<=now&&now-e.at<=14*1440)))
    return {enabled:false,reason:'Пока рано открывать чувства'};
  return {enabled:true,reason:''};
}
export function setRomanceBoundary(graph,viewerId,otherId,boundary){
  const pair=pairFor(graph,viewerId,otherId);
  if(!pair||!['open','closed'].includes(boundary)||
    !record(pair.romance?.views?.[viewerId]))return false;
  pair.romance.views[viewerId].boundary=boundary;
  pair.revision++;return true;
}
export function recordRomanceReceipt(graph,pair,receipt){
  if(!ROMANCE_ACTION_IDS.some(id=>receipt?.type===id||
    receipt?.type===id+'.refused')||!romanceSafety(graph,receipt.actorId,receipt.targetId).allowed)
    return false;
  const actor=pair.romance?.views?.[receipt.actorId];
  const target=pair.romance?.views?.[receipt.targetId];
  if(!record(actor)||!record(target))return false;
  const accepted=!receipt.type.endsWith('.refused');
  const confession=receipt.type.startsWith('romance.confess');
  actor.attraction=clamp(actor.attraction+(accepted?(confession?16:10):-5),0,100);
  target.attraction=clamp(target.attraction+(accepted?(confession?14:7):-1),0,100);
  if(!accepted)target.lastRefusedAt=receipt.at;
  return true;
}
export function romanceStatus(graph,viewerId,otherId){
  const pair=pairFor(graph,viewerId,otherId);
  if(!pair||!record(pair.romance?.views?.[viewerId])||
    !record(pair.romance?.views?.[otherId]))return 'Пока нет романтической истории';
  const me=pair.romance.views[viewerId],them=pair.romance.views[otherId];
  if(me.boundary==='closed')return 'Предпочитает дружескую дистанцию';
  if(me.attraction>=24&&them.attraction>=24)return 'Взаимная симпатия';
  if(me.attraction>=18&&them.attraction<18)return 'Нравится, но взаимность неясна';
  if(them.attraction>=18&&me.attraction<18)return 'К нему проявляют симпатию';
  if(me.attraction>0||them.attraction>0)return 'Искра симпатии';
  return 'Пока нет романтической истории';
}
