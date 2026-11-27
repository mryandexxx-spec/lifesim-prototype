/** GC-08: bounded factual biography; never grants gameplay rewards. */
import {calendarAt,parseCivilDate} from './calendar-core.js';
export const BIOGRAPHY_DEFINITIONS=Object.freeze({
 artwork:'Первая записанная картина',sale:'Первая записанная продажа картины',
 display:'Первая записанная выставленная картина',hire:'Трудоустройство',
 promotion:'Повышение',specialization:'Выбор специализации',
 friendship:'Близкая дружба',romance:'Серьёзные отношения',
 ability:'Открытие новой возможности',home:'Значимое улучшение дома'
});
const personal=Object.keys(BIOGRAPHY_DEFINITIONS).filter(k=>k!=='home');
const own=(o,k)=>Object.hasOwn(o||{},k);
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const token=v=>typeof v==='string'&&v.length>0&&v.length<=200&&/^[a-zA-Z0-9._:@#-]+$/.test(v);
const time=v=>Number.isFinite(v)&&v>=0;
const actor=(r,id)=>id==='alex'?r:id==='mira'?r?.otherSim:r?.population?.residentsById?.[id]?.actor;
function residents(r){
 const dwelling=r?.population?.linksByResident?.alex?.dwellingId;
 return ['alex','mira',...Object.keys(r?.population?.residentsById||{}).filter(id=>
 /^resident_[1-9][0-9]{0,8}$/.test(id)&&r.population.residentsById[id]?.id===id&&
 r.population.linksByResident?.[id]?.dwellingId===dwelling)].filter(id=>!!actor(r,id)).slice(0,4);
}
const current=r=>r?.lifeBiography?.schema===1?r.lifeBiography:null;
const existing=(r,id,key)=>id==='household'?current(r)?.household?.home:current(r)?.byResident?.[id]?.[key];
function validFact(f,root){
 return record(f)&&time(f.at)&&f.at<=root.minutes&&typeof f.date==='string'&&
 !!parseCivilDate(f.date)&&token(f.proof)&&token(f.context)&&(f.detail===null||token(f.detail));
}
const cleanFact=f=>({at:f.at,date:f.date,proof:f.proof,context:f.context,detail:f.detail});
export function restoreLifeBiography(root,raw){
 const byResident={},household={};
 if(raw?.schema===1){
  for(const id of residents(root)){
   const row=raw.byResident?.[id],next={};
   if(record(row))for(const k of personal)if(own(row,k)&&validFact(row[k],root))next[k]=cleanFact(row[k]);
   if(Object.keys(next).length)byResident[id]=next;
  }
  if(validFact(raw.household?.home,root))household.home=cleanFact(raw.household.home);
 }
 if(Object.keys(byResident).length||household.home)root.lifeBiography={schema:1,byResident,household};
 else delete root.lifeBiography;
}
function append(root,id,key,proof,context,detail=null){
 if(!own(BIOGRAPHY_DEFINITIONS,key)||!time(root?.minutes)||existing(root,id,key)||
  (key==='home'?id!=='household':!residents(root).includes(id)))return false;
 let date;try{date=calendarAt(root.calendar,root.minutes).iso;}catch{return false;}
 const fact={at:root.minutes,date,proof,context,detail};
 if(!validFact(fact,root))return false;
 const old=current(root),byResident=old?.byResident||{},household=old?.household||{};
 root.lifeBiography=key==='home'?{schema:1,byResident,household:{...household,home:fact}}:
  {schema:1,byResident:{...byResident,[id]:{...byResident[id],[key]:fact}},household};
 return true;
}
export function biographyRows(root,id){
 if(!residents(root).includes(id))return [];
 const b=current(root),out=[];
 for(const k of personal){const f=b?.byResident?.[id]?.[k];if(f)out.push({...f,key:k,owner:id,title:BIOGRAPHY_DEFINITIONS[k]});}
 if(b?.household?.home)out.push({...b.household.home,key:'home',owner:'household',title:BIOGRAPHY_DEFINITIONS.home});
 return out.sort((a,b)=>b.at-a.at||a.key.localeCompare(b.key));
}
export function biographyFactKeys(root){
 const b=current(root);return Object.entries(b?.byResident||{}).flatMap(([id,row])=>Object.keys(row).map(k=>id+':'+k))
 .concat(b?.household?.home?['household:home']:[]);
}
export function recordBiographyArtwork(root,id,work){
 if(work?.kind!=='artwork'||work.ownerId!==id||!time(work.createdAt)||
 Math.abs(work.createdAt-root.minutes)>.01||
 !(actor(root,id)?.createdWorks||[]).some(w=>w.id===work.id&&w.ownerId===id&&w.createdAt===work.createdAt))return false;
 return append(root,id,'artwork',work.id,work.contentId);
}
export function recordBiographySale(root,entry,work){
 const id=entry?.actorId,latest=root?.financialHistory?.entries?.at(-1);
 if(!latest||entry?.kind!=='art-sale'||entry.delta<=0||!Number.isSafeInteger(entry.delta)||
 latest.id!==entry.id||latest.sourceId!==entry.sourceId||latest.actorId!==id||
 latest.kind!==entry.kind||latest.delta!==entry.delta||latest.atGameMinute!==entry.atGameMinute||
 entry.atGameMinute!==Math.floor(root.minutes)||work?.ownerId!==id||work.id!==entry.sourceId||
 work.kind!=='artwork'||work.location!=='inventory'||!actor(root,id)||
 (actor(root,id).createdWorks||[]).some(w=>w.id===work.id))return false;
 return append(root,id,'sale',entry.id,work.contentId);
}
export function recordBiographyDisplay(root,id,oldWork){
 const work=(actor(root,id)?.createdWorks||[]).find(w=>w.id===oldWork?.id&&w.ownerId===id);
 if(oldWork?.ownerId!==id||oldWork.kind!=='artwork'||oldWork.location!=='inventory'||work?.location!=='wall'||
 !Number.isInteger(work.wallSlot))return false;
 return append(root,id,'display',work.id,work.contentId);
}
export function recordBiographyCareer(root,id,key){
 const c=root?.careerSystem?.byResident?.[id];
 if(c?.residentId!==id||c.status!=='employed')return false;
 if(key==='hire'&&Math.floor(root.minutes)===Math.floor(c.hiredAt))return append(root,id,key,c.employmentId,c.careerId);
 if(key==='promotion'&&Number.isInteger(c.level)&&c.level>0)return append(root,id,key,c.employmentId+':'+c.level,c.careerId,String(c.level)+(c.specialization?.id?':'+c.specialization.id:''));
 if(key==='specialization'&&c.specialization?.chosenAt===root.minutes)return append(root,id,key,c.employmentId+':'+c.specialization.id,c.careerId,c.specialization.id);
 return false;
}
const pair=(r,a,b)=>r?.socialGraph?.pairs?.[JSON.stringify(a<b?[a,b]:[b,a])];
const committed=p=>['engaged','married'].includes(p?.romance?.bond?.status);
export function biographyPairBefore(root,a,b){const p=pair(root,a,b);return {close:p?.friendship==='close',committed:committed(p)};}
export function recordBiographySocial(root,receipt,before){
 if(!receipt||!before)return false;
 const a=receipt.actorId,b=receipt.targetId,p=pair(root,a,b);
 if(!p?.events?.some(e=>e.seq===receipt.seq&&e.type===receipt.type&&e.actorId===a&&e.targetId===b)||
 receipt.type.endsWith('.refused')||['argue','conversation.argue','sports.disagree','rival.taunt','introduced','romance.breakup','romance.divorce','romance.jealousy'].includes(receipt.type))return false;
 let changed=false;
 if(!before.close&&p.friendship==='close')for(const [id,peer] of [[a,b],[b,a]])changed=append(root,id,'friendship','social:'+receipt.seq,peer)||changed;
 if(!before.committed&&committed(p)&&['romance.propose','romance.marry'].includes(receipt.type))for(const [id,peer] of [[a,b],[b,a]])changed=append(root,id,'romance','social:'+receipt.seq,peer)||changed;
 return changed;
}
export function biographySkillBefore(root,registry,level){
 return residents(root).filter(id=>!existing(root,id,'ability')).map(id=>[id,
 Object.fromEntries(Object.values(registry.skills).filter(d=>d.unlocks.length).map(d=>[d.id,level(actor(root,id).skills,registry,d.id)]))]);
}
export function recordBiographySkills(root,before,registry,level){
 for(const [id,levels] of before){
  if(existing(root,id,'ability')||!residents(root).includes(id))continue;
  for(const [skillId,old] of Object.entries(levels)){
   const after=level(actor(root,id).skills,registry,skillId);
   const unlock=registry.skills[skillId].unlocks.find(u=>u.minLevel>old&&u.minLevel<=after);
   if(unlock){append(root,id,'ability','skill:'+skillId+':'+unlock.id,skillId,unlock.id);break;}
  }
 }
}
export function recordBiographyHome(root,item,product,entry){
 const latest=root?.financialHistory?.entries?.at(-1);
 if(!item||!product||item.location!=='home'||item.itemDefinitionId!==product.itemId||
 !/^shop-[a-z0-9-]+-[1-9][0-9]*$/.test(item.instanceId)||
 !root.world?.furniture?.instances?.some(i=>i.instanceId===item.instanceId&&i.location==='home')||
 !latest||latest.id!==entry?.id||latest.kind!=='purchase'||latest.delta>=0||latest.sourceId!==item.instanceId||
 entry.atGameMinute!==Math.floor(root.minutes))return false;
 if(!(product.sleepQuality==='premium'||product.itemId==='sofa.comfort'||
 ['bookcase','music','easel','stove','prep','sink'].includes(product.prefabId)))return false;
 return append(root,'household','home',latest.id,product.itemId);
}
