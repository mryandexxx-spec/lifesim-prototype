/** Блин’С 1.0m: gradual care, directed feelings, explicit consent-based commitments.
 * Stable person IDs, no graphics or gender assumptions. No romance without
 * an explicit adult life stage, no known family connections, and no consent.
 */
export const LIFE_STAGES=Object.freeze(['child','teen','adult','elder']);
export const FAMILY_KINDS=Object.freeze(['parent','sibling']);
export const ROMANCE_ACTION_IDS=Object.freeze([
  'romance.flirt','romance.confess','romance.date','romance.breakup',
  'romance.tender','romance.propose','romance.marry','romance.divorce'
]);
export const ROMANCE_COOLDOWN_MINUTES=1440;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const valid=id=>typeof id==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(id);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const time=at=>Number.isFinite(at)&&at>=0&&at<=1e7;
const adult=stage=>stage==='adult'||stage==='elder';
const view=()=>({attraction:0,boundary:'open',lastRefusedAt:null});
const emptyBond=()=>({status:'none',since:null,ex:false,lastEndedAt:null});
const COMMITTED=new Set(['dating','engaged','married']);
const safeDays=(values,firstDay)=>Array.isArray(values)
  ?[...new Set(values.filter(day=>Number.isSafeInteger(day)&&
    day>=firstDay&&day<=6944))].slice(-8):[];
const careFrom=(raw,ids,firstDay)=>Object.fromEntries(ids.map(id=>
  [id,safeDays(raw?.[id],firstDay)]));
const careCount=(bond,id)=>Array.isArray(bond?.careDays?.[id])
  ?bond.careDays[id].length:0;
const mutualCare=(bond,ids)=>ids.every(id=>careCount(bond,id)>=2);
const bondActive=bond=>COMMITTED.has(bond?.status);
export function romanceLoveDescription(graph,a,b){
  const bond=pairFor(graph,a,b)?.romance?.bond;
  if(!bondActive(bond))return '';
  if(mutualCare(bond,[a,b]))return 'Чувства стали глубже';
  if([a,b].every(id=>careCount(bond,id)>=1))
    return 'Учатся заботиться друг о друге';
  return 'Любовь растёт из поступков';
}
export function newRomanceState(ids){
  return {views:Object.fromEntries(ids.map(id=>[id,view()])),bond:emptyBond()};
}
export function restoreRomanceState(raw,ids,lastAt=null){
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
  const bond=raw?.bond;
  if(record(bond)){
    const ended=time(bond.lastEndedAt)?bond.lastEndedAt:null;
    const former=bond.ex===true;
    const horizon=time(lastAt)?lastAt:1e7;
    const since=time(bond.since)&&bond.since<=horizon?bond.since:null;
    // Each milestone is independently validated; a tampered wedding does
    // not invent a marriage, but a genuinely dated pair remains dated.
    if(since!==null&&COMMITTED.has(bond.status)){
      const dating={status:'dating',since,ex:former,lastEndedAt:ended,
        careDays:careFrom(bond.careDays,ids,Math.floor(since/1440))};
      // Validate the engagement on its own merits. A forged wedding must
      // never erase a genuine engagement that preceded it.
      const engagedAt=time(bond.engagedAt)&&bond.engagedAt>=since&&
        bond.engagedAt<=horizon?bond.engagedAt:null;
      const marriedAt=time(bond.marriedAt)&&engagedAt!==null&&
        bond.marriedAt>=engagedAt&&bond.marriedAt<=horizon
        ?bond.marriedAt:null;
      fresh.bond=dating;
      if(['engaged','married'].includes(bond.status)&&engagedAt!==null){
        fresh.bond.status='engaged';fresh.bond.engagedAt=engagedAt;
      }
      if(bond.status==='married'&&marriedAt!==null&&engagedAt!==null){
        fresh.bond.status='married';fresh.bond.marriedAt=marriedAt;
      }
    }else fresh.bond={status:'none',since:null,ex:former,lastEndedAt:ended};
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
/** A resident cannot be in two simultaneous committed pairs.
 * Pure generic traversal: no assumption about the number/IDs of residents.
 */
export function currentDatingPartner(graph,id){
  if(!graph?.persons?.includes(id)||!record(graph.pairs))return null;
  for(const pair of Object.values(graph.pairs))
    if(bondActive(pair?.romance?.bond)&&
      Array.isArray(pair.ids)&&pair.ids.includes(id))
      return pair.ids.find(other=>other!==id)||null;
  return null;
}
const reciprocalFlirt=(pair,a,b,now)=>Array.isArray(pair?.events)&&
  [a,b].every(id=>pair.events.some(e=>e.type==='romance.flirt'&&
    e.actorId===id&&e.targetId===(id===a?b:a)&&
    Number.isFinite(e.at)&&e.at<=now&&now-e.at<=14*1440));
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
  const pair=pairFor(graph,a,b);
  // Ending an existing commitment is one person's choice. Never block it
  // for lack of mood, aging, changed kinship data or a closed boundary.
  if(actionId==='romance.breakup')return ['dating','engaged'].includes(pair?.romance?.bond?.status)
      ?{enabled:true,reason:''}
      :{enabled:false,reason:'Сейчас нечего завершать'};
  if(actionId==='romance.divorce')return pair?.romance?.bond?.status==='married'
    ?{enabled:true,reason:''}
    :{enabled:false,reason:'Для развода необходим брак'};
  const safety=romanceSafety(graph,a,b);
  if(!safety.allowed)return {enabled:false,reason:safety.reason};
  const src=pair.views?.[a],target=pair.views?.[b];
  const feelings=pair.romance?.views;
  if(!record(src)||!record(target)||!record(feelings?.[a])||
    !record(feelings?.[b])||pair.metAt===null)
    return {enabled:false,reason:'Сначала познакомьтесь'};
  const bond=pair.romance?.bond;
  if(bondActive(bond)&&actionId==='romance.date')
    return {enabled:false,reason:'Вы уже состоите в отношениях'};
  const thirdA=currentDatingPartner(graph,a),thirdB=currentDatingPartner(graph,b);
  if((thirdA&&thirdA!==b)||(thirdB&&thirdB!==a))
    return {enabled:false,reason:'Сначала нужно завершить другие отношения'};
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
  if(actionId==='romance.date'&&(
    feelings[a].attraction<35||feelings[b].attraction<30||
    src.trust<63||target.trust<60||
    !reciprocalFlirt(pair,a,b,now)||
    !pair.events.some(e=>e.type==='romance.confess'&&
      Number.isFinite(e.at)&&e.at<=now&&now-e.at<=21*1440)))
    return {enabled:false,reason:'Для отношений нужно узнать чувства друг друга'};
  if(actionId==='romance.tender'&&!bondActive(bond))
    return {enabled:false,reason:'Сначала нужно стать парой'};
  if(actionId==='romance.propose'&&(
    bond?.status!=='dating'||now-bond.since<3*1440||
    !mutualCare(bond,[a,b])||
    feelings[a].attraction<56||feelings[b].attraction<54||
    src.trust<66||target.trust<66||src.tension>=30||target.tension>=30))
    return {enabled:false,reason:'Любовь должна окрепнуть с обеих сторон'};
  if(actionId==='romance.marry'&&(
    bond?.status!=='engaged'||!time(bond.engagedAt)||
    now-bond.engagedAt<1440||!mutualCare(bond,[a,b])||
    feelings[a].attraction<60||feelings[b].attraction<58||
    src.trust<68||target.trust<68||src.tension>=30||target.tension>=30))
    return {enabled:false,reason:'Для брака нужны время и взаимная уверенность'};
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
    receipt?.type===id+'.refused')||
    (!['romance.breakup','romance.divorce'].includes(receipt.type)&&
      !romanceSafety(graph,receipt.actorId,receipt.targetId).allowed))
    return false;
  const bond=pair.romance?.bond;
  if(!record(bond))return false;
  if(['romance.breakup','romance.divorce'].includes(receipt.type)){
    if(!bondActive(bond))return false;
    const previous=receipt.type==='romance.divorce'?'married':null;
    if(previous&&bond.status!==previous)return false;
    bond.status='none';bond.since=null;bond.ex=true;
    bond.lastEndedAt=receipt.at;
    delete bond.engagedAt;delete bond.marriedAt;delete bond.careDays;
  }else if(receipt.type==='romance.date'&&bond.status==='none'){
    bond.status='dating';bond.since=receipt.at;
    bond.careDays=careFrom(null,pair.ids,Math.floor(receipt.at/1440));
  }else if(receipt.type==='romance.propose'&&bond.status==='dating'){
    bond.status='engaged';bond.engagedAt=receipt.at;
  }else if(receipt.type==='romance.marry'&&bond.status==='engaged'){
    bond.status='married';bond.marriedAt=receipt.at;
  }else if(receipt.type==='romance.tender'&&bondActive(bond)){
    const days=bond.careDays?.[receipt.actorId];
    const day=Math.floor(receipt.at/1440);
    if(Array.isArray(days)&&!days.includes(day)){
      days.push(day);bond.careDays[receipt.actorId]=days.slice(-8);
    }
  }
  const actor=pair.romance?.views?.[receipt.actorId];
  const target=pair.romance?.views?.[receipt.targetId];
  if(!record(actor)||!record(target))return false;
  if(['romance.breakup','romance.divorce'].includes(receipt.type)){
    actor.attraction=clamp(actor.attraction-12,0,100);
    target.attraction=clamp(target.attraction-9,0,100);
    return true;
  }
  const accepted=!receipt.type.endsWith('.refused');
  const confession=receipt.type.startsWith('romance.confess');
  const dating=receipt.type.startsWith('romance.date');
  const tender=receipt.type==='romance.tender';
  const proposal=['romance.propose','romance.marry'].includes(receipt.type);
  actor.attraction=clamp(actor.attraction+(accepted?
    proposal?4:tender?9:dating?7:confession?16:10:-5),0,100);
  target.attraction=clamp(target.attraction+(accepted?
    proposal?4:tender?8:dating?7:confession?14:7:-1),0,100);
  if(!accepted)target.lastRefusedAt=receipt.at;
  return true;
}
export function romanceStatus(graph,viewerId,otherId){
  const pair=pairFor(graph,viewerId,otherId);
  if(!pair||!record(pair.romance?.views?.[viewerId])||
    !record(pair.romance?.views?.[otherId]))return 'Пока нет романтической истории';
  const me=pair.romance.views[viewerId],them=pair.romance.views[otherId];
  if(pair.romance.bond?.status==='married')return 'Супруги';
  if(pair.romance.bond?.status==='engaged')return 'Помолвлены';
  if(pair.romance.bond?.status==='dating')return 'Встречаются';
  if(pair.romance.bond?.ex===true)return 'Бывшие партнёры';
  if(me.boundary==='closed')return 'Предпочитает дружескую дистанцию';
  if(me.attraction>=24&&them.attraction>=24)return 'Взаимная симпатия';
  if(me.attraction>=18&&them.attraction<18)return 'Нравится, но взаимность неясна';
  if(them.attraction>=18&&me.attraction<18)return 'К нему проявляют симпатию';
  if(me.attraction>0||them.attraction>0)return 'Искра симпатии';
  return 'Пока нет романтической истории';
}
