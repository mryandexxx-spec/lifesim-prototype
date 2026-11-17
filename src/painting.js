/** H5: deterministic authoring and bounded owned works; no renderer or economy. */
import {getActivityDefinition} from './activity-registry.js';
import {currentSkillLevel} from './skills-engine.js';
import {completeActivitySession} from './activity-session.js';
export const PAINT_ACTIVITY_ID='hobby.paint.picture';
export const PAINT_SKILL_ID='painting';
export const PAINT_CONTENT_IDS=Object.freeze(['painting.hills','painting.garden','painting.city','painting.sea','painting.meadow','painting.stilllife','painting.night','painting.harbor','painting.mountains','painting.autumn','painting.desert','painting.abstract','painting.aurora']);
export const PAINT_WORKS_LIMIT=24;
export const PAINT_SUBJECTS=Object.freeze({
  'painting.hills':Object.freeze({label:'Долина ветров',minLevel:0,genre:'landscape',palette:['#d9e9dc','#82b9a7','#6e9581','#e9c59b','#4f786e']}),
  'painting.garden':Object.freeze({label:'Летний сад',minLevel:0,genre:'garden',palette:['#f2e1c9','#7da88a','#db9a94','#e0c25c','#456d58']}),
  'painting.city':Object.freeze({label:'Городские крыши',minLevel:0,genre:'city',palette:['#d3deea','#7093aa','#a7acc8','#eab686','#4a647c']}),
  'painting.sea':Object.freeze({label:'Морской бриз',minLevel:1,genre:'seascape',palette:['#b9dfdd','#499db0','#f9ce89','#5f8580','#2f6579']}),
  'painting.meadow':Object.freeze({label:'Полевые цветы',minLevel:2,genre:'botanical',palette:['#d7ecdf','#a1c58c','#dc8585','#f3cb61','#496e58']}),
  'painting.stilllife':Object.freeze({label:'Тёплый натюрморт',minLevel:3,genre:'stilllife',palette:['#dcc8b2','#735e69','#e39c62','#a6b26d','#4f494a']}),
  'painting.night':Object.freeze({label:'Звёздная ночь',minLevel:4,genre:'nightscape',palette:['#253654','#4c668b','#c7d8b7','#f6daa3','#354b70']}),
  'painting.harbor':Object.freeze({label:'Старый порт',minLevel:5,genre:'architecture',palette:['#c9dcd6','#739da8','#dfb590','#9b6f69','#4e7182']}),
  'painting.mountains':Object.freeze({label:'Снежные вершины',minLevel:6,genre:'mountain',palette:['#d7e3e7','#809eb2','#eef1df','#537b89','#a6b0b1']}),
  'painting.autumn':Object.freeze({label:'Осенний парк',minLevel:7,genre:'seasonal',palette:['#efd8ba','#d3a36e','#bd6c4c','#e9c576','#785b55']}),
  'painting.desert':Object.freeze({label:'Янтарные дюны',minLevel:8,genre:'desert',palette:['#e9d6b5','#d4a476','#a66a54','#f4d7a0','#8c736c']}),
  'painting.abstract':Object.freeze({label:'Цветовые ритмы',minLevel:9,genre:'abstract',palette:['#e5ddcd','#2c6682','#db786c','#e1bb72','#658778']}),
  'painting.aurora':Object.freeze({label:'Северное сияние',minLevel:10,genre:'atmosphere',palette:['#1e3751','#39736f','#87b9a1','#c7dbc1','#826c9f']})
});
/** H5c: declarative recipes; authored at six bounded geometric strokes/theme. */
export const PAINT_CANVAS_BOUNDS=Object.freeze({minX:-.38,maxX:.38,minY:.895,maxY:1.855});
export const PAINT_COMPOSITION_SHAPES=Object.freeze(Object.fromEntries(
  Object.entries({
    'painting.hills':[['box',0,1.505,0.74,0.69,0],['sphere',0.25,1.65,0.18,0.18,3],['sphere',-0.15,1.29,0.44,0.37,1],['sphere',0.15,1.2,0.44,0.35,4],['box',0,1.01,0.73,0.19,2],['box',-0.12,1.06,0.18,0.09,3]],
    'painting.garden':[['box',0,1.51,0.73,0.68,0],['box',0,1.07,0.73,0.24,1],['box',-0.25,1.29,0.055,0.47,4],['sphere',-0.25,1.55,0.25,0.24,2],['box',0.22,1.32,0.05,0.47,4],['sphere',0.22,1.53,0.27,0.27,3]],
    'painting.city':[['box',0,1.53,0.74,0.64,0],['sphere',0.25,1.69,0.2,0.2,3],['box',-0.25,1.18,0.25,0.43,4],['box',0,1.25,0.19,0.53,2],['box',0.24,1.16,0.25,0.4,1],['box',0,0.99,0.74,0.14,4]],
    'painting.sea':[['box',0,1.51,0.73,0.68,0],['box',0,1.11,0.73,0.3,1],['sphere',0.23,1.66,0.2,0.2,2],['sphere',-0.26,1.15,0.21,0.22,3],['box',0.11,1.17,0.23,0.07,4],['box',0.11,1.31,0.028,0.28,2]],
    'painting.meadow':[['box',0,1.52,0.73,0.66,0],['box',0,1.1,0.73,0.3,1],['box',-0.2,1.23,0.04,0.31,4],['sphere',-0.2,1.45,0.22,0.22,2],['box',0.2,1.19,0.04,0.25,4],['sphere',0.2,1.37,0.19,0.19,3]],
    'painting.stilllife':[['box',0,1.51,0.73,0.68,0],['box',0,1.08,0.73,0.26,1],['box',0,1.26,0.49,0.07,4],['sphere',-0.17,1.37,0.2,0.2,2],['sphere',0.15,1.39,0.23,0.23,3],['box',0.03,1.57,0.045,0.15,4]],
    'painting.night':[['box',0,1.51,0.73,0.68,0],['sphere',0.23,1.67,0.17,0.17,3],['sphere',-0.12,1.67,0.055,0.055,2],['sphere',-0.24,1.5,0.055,0.055,2],['sphere',-0.12,1.16,0.46,0.28,4],['sphere',0.21,1.12,0.32,0.22,1]],
    'painting.harbor':[['box',0,1.52,0.73,0.66,0],['box',0,1.09,0.73,0.28,1],['box',-0.24,1.31,0.21,0.34,3],['box',-0.24,1.51,0.25,0.1,2],['box',0.17,1.23,0.26,0.09,4],['box',0.17,1.43,0.032,0.37,3]],
    'painting.mountains':[['box',0,1.51,0.73,0.68,0],['sphere',-0.2,1.28,0.33,0.48,1],['sphere',0.16,1.27,0.38,0.5,3],['sphere',-0.2,1.51,0.16,0.12,2],['sphere',0.16,1.53,0.17,0.13,2],['box',0,1,0.73,0.18,4]],
    'painting.autumn':[['box',0,1.52,0.73,0.66,0],['box',0,1.06,0.73,0.26,1],['box',-0.19,1.27,0.065,0.48,4],['sphere',-0.21,1.55,0.31,0.29,2],['box',0.23,1.23,0.055,0.38,4],['sphere',0.23,1.49,0.22,0.25,3]],
    'painting.desert':[['box',0,1.51,0.73,0.68,0],['sphere',0.25,1.69,0.16,0.16,3],['sphere',-0.2,1.18,0.35,0.33,1],['sphere',0.18,1.1,0.37,0.29,2],['box',0,1,0.73,0.18,4],['box',-0.24,1.29,0.04,0.24,4]],
    'painting.abstract':[['box',0,1.51,0.73,0.68,0],['box',-0.19,1.52,0.23,0.46,1],['sphere',0.15,1.64,0.29,0.29,2],['box',0.15,1.2,0.32,0.16,3],['sphere',-0.16,1.16,0.24,0.24,4],['box',0.3,1.37,0.09,0.35,1]],
    'painting.aurora':[['box',0,1.51,0.73,0.68,0],['box',-0.21,1.52,0.24,0.52,1],['box',0.07,1.55,0.22,0.56,2],['box',0.27,1.56,0.16,0.48,4],['sphere',-0.12,1.1,0.47,0.25,3],['sphere',0.2,1.06,0.32,0.21,1]]
  }).map(([id,parts])=>[id,Object.freeze(parts.map(p=>Object.freeze(p)))]))
);
/** The old three themes and all pre-H5c works render identically on load. */
export function canPaintContent(progress,skills,contentId){
  const theme=PAINT_SUBJECTS[contentId];
  return Boolean(theme&&currentSkillLevel(progress,skills,PAINT_SKILL_ID)>=theme.minLevel);
}
/** Pure seeded geometric variation for NEW works only. No non-finite transforms,
 * no protruding past the easel's inner frame, and no browser dependency. */
export function compositionForArtwork(contentId,seed,renderVersion=0,quality=50){
  const base=PAINT_COMPOSITION_SHAPES[contentId];
  if(!base)return [];
  if(renderVersion!==1||!Number.isSafeInteger(seed)||seed<0||seed>2147483647)return base;
  let state=(seed+0x9e3779b9)>>>0;
  const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
  const strength=.11+Math.min(100,Math.max(1,Number.isFinite(quality)?quality:50))*.0006;
  const shape=base.map(([kind,x,y,w,h,color],i)=>{
    if(i===0)return [kind,x,y,w,h,color]; // never shift the background
    const size=Math.max(.87,Math.min(1.11,1+(random()-.5)*strength));
    const newW=Math.min(.74,w*size),newH=Math.min(.94,h*(.88+random()*.24));
    const dx=(random()-.5)*strength*.44,dy=(random()-.5)*strength*.30;
    const nx=Math.max(PAINT_CANVAS_BOUNDS.minX+newW/2,
      Math.min(PAINT_CANVAS_BOUNDS.maxX-newW/2,x+dx));
    const ny=Math.max(PAINT_CANVAS_BOUNDS.minY+newH/2,
      Math.min(PAINT_CANVAS_BOUNDS.maxY-newH/2,y+dy));
    return [kind,Math.round(nx*10000)/10000,Math.round(ny*10000)/10000,
      Math.round(newW*10000)/10000,Math.round(newH*10000)/10000,color];
  });
  return shape;
}
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
    if(work.kind==='artwork'&&['studio','inventory','wall'].includes(work.location)){
      // H5b: a single durable work changes location; never duplicate its ID.
      // Older studio-only saves and legacy collection entries still load.
      const badSlot=work.location==='wall'&&(!Number.isInteger(work.wallSlot)||
          work.wallSlot<0||work.wallSlot>7);
      // Malformed wall metadata becomes safely stored art, never lost art.
      normalized.kind='artwork';normalized.location=badSlot?'inventory':work.location;
      if(validOrigin(work.origin))normalized.origin=
        {x:work.origin.x,z:work.origin.z,yaw:work.origin.yaw};
      else if(work.location==='studio')normalized.origin=null;
      if(work.location==='wall'&&!badSlot)normalized.wallSlot=work.wallSlot;
    }
    if(work.renderVersion===1)normalized.renderVersion=1;
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
export const paintingSeedFromSession=sessionId=>seedFrom('work:'+sessionId);
/** Commit only when the verified activity is READY and physically finished.
 * XP for genuine practice is separate; a canceled canvas never becomes art.
 */
export function finishPainting({session,actor,actorId,world,at,registry,skills}={}){
  const definition=getActivityDefinition(registry,PAINT_ACTIVITY_ID);
  const item=world?.furniture?.instances?.find(i=>i.instanceId===session?.targetInstanceId);
  if(!definition||session?.activityId!==PAINT_ACTIVITY_ID||
    session.actorId!==actorId||!item||item.prefabId!=='easel'||
    item.location!=='home'||!stationId(item.instanceId)||
    !canPaintContent(actor?.skills,skills,session.contentId)||
    !Number.isFinite(at)||at<0||at>10000000)return null;
  const id='work:'+session.sessionId;
  const previous=restoreCreatedWorks(actor?.createdWorks,actorId);
  // Do not silently evict previously created/hung/stored artwork at capacity.
  if(previous.length>=PAINT_WORKS_LIMIT||previous.some(work=>work.id===id))
    return null;
  const committed=completeActivitySession(registry,session,{
    authorized:true,resourceAvailable:true,eventId:id});
  if(!committed)return null;
  const level=currentSkillLevel(actor.skills,skills,PAINT_SKILL_ID);
  const energy=Number.isFinite(actor.needs?.energy)?actor.needs.energy:50;
  const fun=Number.isFinite(actor.needs?.fun)?actor.needs.fun:50;
  const quality=Math.max(1,Math.min(100,Math.round(
    25+level*5+Math.max(-12,Math.min(12,(energy-50)*.16))+
    Math.max(-10,Math.min(10,(fun-50)*.12))+
    Math.min(10,session.elapsed/5))));
  const work={id,ownerId:actorId,easelInstanceId:item.instanceId,
    contentId:session.contentId,seed:seedFrom(id),quality,createdAt:round(at),renderVersion:1,
    kind:'artwork',location:'studio',origin:{x:item.x,z:item.z,yaw:item.yaw}};
  return {work,works:[...previous,work]};
}
