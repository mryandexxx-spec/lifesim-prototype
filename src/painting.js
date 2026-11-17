/** H5: deterministic authoring and bounded owned works; no renderer or economy. */
import {getActivityDefinition} from './activity-registry.js';
import {currentSkillLevel} from './skills-engine.js';
import {completeActivitySession} from './activity-session.js';
export const PAINT_ACTIVITY_ID='hobby.paint.picture';
export const PAINT_SKILL_ID='painting';
export const PAINT_CONTENT_IDS=Object.freeze(['painting.hills','painting.garden','painting.city']);
export const PAINT_WORKS_LIMIT=24;
export const PAINT_SUBJECTS=Object.freeze({
  'painting.hills':Object.freeze({label:'Долина ветров',palette:['#d9e9dc','#82b9a7','#6e9581','#e9c59b','#4f786e']}),
  'painting.garden':Object.freeze({label:'Летний сад',palette:['#f2e1c9','#7da88a','#db9a94','#e0c25c','#456d58']}),
  'painting.city':Object.freeze({label:'Городские крыши',palette:['#d3deea','#7093aa','#a7acc8','#eab686','#4a647c']})
});
/** Local surface bounds of the usable easel canvas (base mesh: .78 × .99).
 * Keep every procedural stroke inside this rectangle, with a little margin.
 * These render recipes are data-only so Node tests catch geometry regressions.
 */
export const PAINT_CANVAS_BOUNDS=Object.freeze({
  minX:-.38,maxX:.38,minY:.895,maxY:1.855
});
export const PAINT_COMPOSITION_SHAPES=Object.freeze(Object.fromEntries(
  Object.entries({
    'painting.hills':[
      ['box',0,1.505,.74,.69,0],['sphere',.25,1.65,.18,.18,3],
      ['sphere',-.15,1.29,.44,.37,1],['sphere',.15,1.20,.44,.35,4],
      ['box',0,1.01,.73,.19,2],['box',-.12,1.06,.18,.09,3]],
    'painting.garden':[
      ['box',0,1.51,.73,.68,0],['box',0,1.07,.73,.24,1],
      ['box',-.25,1.29,.055,.47,4],['sphere',-.25,1.55,.25,.24,2],
      ['box',.22,1.32,.05,.47,4],['sphere',.22,1.53,.27,.27,3]],
    'painting.city':[
      ['box',0,1.53,.74,.64,0],['sphere',.25,1.69,.20,.20,3],
      ['box',-.25,1.18,.25,.43,4],['box',0,1.25,.19,.53,2],
      ['box',.24,1.16,.25,.40,1],['box',0,.99,.74,.14,4]]
  }).map(([id,strokes])=>[id,Object.freeze(strokes.map(stroke=>
    Object.freeze(stroke)))]))
);
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const safeId=v=>typeof v==='string'&&/^[a-z][a-z0-9._:-]{1,95}$/.test(v);
const stationId=v=>typeof v==='string'&&/^shop-easel-[0-9]+$/.test(v);
const round=n=>Math.round(n*1000)/1000;
// Preserve optional finished-work metadata from the reverted H5a renderer.
// Unsupported positions are normalized rather than trusting arbitrary saves.
const validOrigin=p=>record(p)&&[p.x,p.z].every(v=>Number.isFinite(v)&&Math.abs(v)<1000)&&
  [0,90,180,270].includes(p.yaw);
export function restoreCreatedWorks(raw,ownerId){
  if(!Array.isArray(raw))return [];
  const works=[],ids=new Set();
  for(const work of raw.slice(-PAINT_WORKS_LIMIT*3)){
    if(!record(work)||!safeId(work.id)||ids.has(work.id)||
      work.ownerId!==ownerId||!stationId(work.easelInstanceId)||
      !PAINT_CONTENT_IDS.includes(work.contentId)||
      !Number.isSafeInteger(work.seed)||work.seed<0||work.seed>2147483647||
      !Number.isInteger(work.quality)||work.quality<1||work.quality>100||
      !Number.isFinite(work.createdAt)||work.createdAt<0||
      work.createdAt>10000000)continue;
    ids.add(work.id);
    const normalized={id:work.id,ownerId,easelInstanceId:work.easelInstanceId,
      contentId:work.contentId,seed:work.seed,quality:work.quality,createdAt:round(work.createdAt)};
    if(work.kind==='artwork'&&work.location==='studio'){
      normalized.kind='artwork';normalized.location='studio';
      normalized.origin=validOrigin(work.origin)
        ?{x:work.origin.x,z:work.origin.z,yaw:work.origin.yaw}:null;
    }
    works.push(normalized);
    if(works.length>PAINT_WORKS_LIMIT)works.shift();
  }
  return works;
}
function seedFrom(text){
  let n=2166136261;
  for(let i=0;i<text.length;i++)n=Math.imul(n^text.charCodeAt(i),16777619);
  return n>>>1;
}
/** Commit only when the verified activity is READY and physically finished.
 * XP for genuine practice is separate; a canceled canvas never becomes art.
 */
export function finishPainting({session,actor,actorId,world,at,registry,skills}={}){
  const definition=getActivityDefinition(registry,PAINT_ACTIVITY_ID);
  const item=world?.furniture?.instances?.find(i=>i.instanceId===session?.targetInstanceId);
  if(!definition||session?.activityId!==PAINT_ACTIVITY_ID||
    session.actorId!==actorId||!item||item.prefabId!=='easel'||
    item.location!=='home'||!stationId(item.instanceId)||
    !PAINT_CONTENT_IDS.includes(session.contentId)||
    !Number.isFinite(at)||at<0||at>10000000)return null;
  const id='work:'+session.sessionId;
  const committed=completeActivitySession(registry,session,{
    authorized:true,resourceAvailable:true,eventId:id});
  if(!committed)return null;
  const previous=restoreCreatedWorks(actor?.createdWorks,actorId);
  if(previous.some(work=>work.id===id))return null;
  const level=currentSkillLevel(actor.skills,skills,PAINT_SKILL_ID);
  const energy=Number.isFinite(actor.needs?.energy)?actor.needs.energy:50;
  const fun=Number.isFinite(actor.needs?.fun)?actor.needs.fun:50;
  const quality=Math.max(1,Math.min(100,Math.round(
    25+level*5+Math.max(-12,Math.min(12,(energy-50)*.16))+
    Math.max(-10,Math.min(10,(fun-50)*.12))+
    Math.min(10,session.elapsed/5))));
  const work={id,ownerId:actorId,easelInstanceId:item.instanceId,
    contentId:session.contentId,seed:seedFrom(id),quality,createdAt:round(at)};
  return {work,works:[...previous,work].slice(-PAINT_WORKS_LIMIT)};
}
