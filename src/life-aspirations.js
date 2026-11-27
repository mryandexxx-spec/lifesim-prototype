/** GC-07: explicit resident intentions, no money/XP/queue effects.
 * Current conditions are not a biography. Only canonical completion adapters
 * may advance bounded earned-income and completed-art counters.
 */
import {residentIdsForSimulation,savedAdditionalActor} from './resident-activity-runtime.js';
import {careerRankForContract} from './career-specializations.js';
import {getPair} from './social-graph.js';
import {compatibleFurnitureProduct} from './furniture-products.js';
import {furnitureProvenance} from './furniture-catalog.js';
import {householdBillView,BILL_AMOUNT} from './household-bills.js';

export const ASPIRATION_SCHEMA=1;
export const EARNED_TARGET=50000;
export const ART_TARGET=10;
const definitions={
 career:{title:'Мастер своего дела',description:'Достичь высшей должности в выбранной профессии.',tasks:['work','speech']},
 wealth:{title:'Финансовая независимость',description:'Получить 50 000 кр. личного дохода от работы и продажи своих картин.',tasks:['work','sale']},
 creative:{title:'Творческая жизнь',description:'Создать 10 картин, одну продать и одну оставить в личной коллекции.',tasks:['paint','sale']},
 relationships:{title:'Близкие люди',description:'Построить взаимную близкую дружбу или серьёзные романтические отношения.',tasks:['social','speech']},
 home:{title:'Дом мечты',description:'Обустрой общий дом для сна, готовки и отдыха, не забывая о семейном бюджете.',tasks:['rest','tv']}
};
export const ASPIRATIONS=Object.freeze(Object.fromEntries(Object.entries(definitions).map(([id,d])=>[
 id,Object.freeze({...d,tasks:Object.freeze(d.tasks)})])));
const own=(o,k)=>Object.hasOwn(o||{},k);
const record=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const time=x=>Number.isFinite(x)&&x>=0;
const int=(x,max)=>Number.isSafeInteger(x)&&x>=0&&x<=max;
const safeId=x=>typeof x==='string'&&x.length>0&&x.length<=180&&!/[\u0000-\u001f]/.test(x);
const actor=(r,id)=>id==='alex'?r:id==='mira'?r.otherSim:savedAdditionalActor(r,id);
const active=(r,id)=>!!r&&residentIdsForSimulation(r).includes(id)&&!!actor(r,id);
const paintingSupported=id=>id==='alex'||id==='mira';
const financeSeq=r=>Number.isSafeInteger(r?.financialHistory?.nextId)&&r.financialHistory.nextId>=1
 ?r.financialHistory.nextId-1:0;
const rowFor=(r,id)=>r?.lifeAspirations?.schema===1&&own(r.lifeAspirations.byResident,id)
 ?r.lifeAspirations.byResident[id]:null;
export function aspirationChoices(root,id){
 if(!active(root,id))return [];
 return Object.entries(ASPIRATIONS).map(([key,d])=>({
  id:key,title:d.title,description:d.description,enabled:key!=='creative'||paintingSupported(id),
  reason:key==='creative'&&!paintingSupported(id)?'Живопись этого персонажа пока недоступна.':''
 }));
}
const write=(r,id,row)=>{r.lifeAspirations={schema:1,byResident:{...r.lifeAspirations?.byResident,[id]:row}};};
export function chooseAspiration(root,id,key){
 if(!active(root,id)||!own(ASPIRATIONS,key)||!time(root.minutes)||
  (key==='creative'&&!paintingSupported(id))||rowFor(root,id)?.definitionId===key)return false;
 const initialWorkIds=key==='creative'?(actor(root,id).createdWorks||[])
  .filter(w=>w.ownerId===id&&safeId(w.id)).map(w=>w.id).slice(0,24):[];
 write(root,id,{definitionId:key,selectedAt:root.minutes,earned:0,created:0,sold:false,
  lastFinanceSeq:financeSeq(root),lastArtworkAt:root.minutes,initialWorkIds:[...new Set(initialWorkIds)]});
 return true;
}
/** Old save or unknown optional row -> no chosen aspiration. No ledger replay. */
export function restoreLifeAspirations(root,raw){
 const next={};
 if(raw?.schema===1&&record(raw.byResident))for(const id of residentIdsForSimulation(root)){
  const r=own(raw.byResident,id)?raw.byResident[id]:null;
  if(!active(root,id)||!record(r)||!own(ASPIRATIONS,r.definitionId)||
   (r.definitionId==='creative'&&!paintingSupported(id))||!time(r.selectedAt)||r.selectedAt>root.minutes||
   !int(r.earned,EARNED_TARGET)||!int(r.created,ART_TARGET)||typeof r.sold!=='boolean'||
   !int(r.lastFinanceSeq,financeSeq(root))||!time(r.lastArtworkAt)||
   r.lastArtworkAt<r.selectedAt||r.lastArtworkAt>root.minutes||
   !Array.isArray(r.initialWorkIds)||r.initialWorkIds.length>24||
   !r.initialWorkIds.every(safeId)||new Set(r.initialWorkIds).size!==r.initialWorkIds.length)continue;
  const key=r.definitionId;
  if((key!=='wealth'&&r.earned!==0)||(key!=='creative'&&(r.created!==0||r.sold||r.initialWorkIds.length)))continue;
  next[id]={definitionId:key,selectedAt:r.selectedAt,earned:r.earned,created:r.created,sold:r.sold,
   lastFinanceSeq:r.lastFinanceSeq,lastArtworkAt:r.lastArtworkAt,initialWorkIds:[...r.initialWorkIds]};
 }
 if(Object.keys(next).length)root.lifeAspirations={schema:1,byResident:next};
 else delete root.lifeAspirations;
}
export function aspirationTaskPreferences(root,id){
 const key=rowFor(root,id)?.definitionId;
 return own(ASPIRATIONS,key)?ASPIRATIONS[key].tasks:[];
}
const newWork=(row,id,w)=>row?.definitionId==='creative'&&w?.kind==='artwork'&&w.ownerId===id&&
 safeId(w.id)&&!row.initialWorkIds.includes(w.id)&&time(w.createdAt)&&w.createdAt+.01>=row.selectedAt;
/** Call only after finishPainting/projectArtCompletion actually installed a new work.
 * Practice has no work; same-actor completion time cannot repeat.
 */
export function recordAspirationArtwork(root,id,work){
 const row=rowFor(root,id);
 if(!active(root,id)||!newWork(row,id,work)||row.created>=ART_TARGET||
  !time(root.minutes)||root.minutes<=row.lastArtworkAt||
  Math.abs(work.createdAt-root.minutes)>.01||
  !(actor(root,id).createdWorks||[]).some(w=>w.id===work.id&&w.ownerId===id))return false;
 write(root,id,{...row,created:row.created+1,lastArtworkAt:root.minutes});
 return true;
}
/** After the actual salary/sale projection is applied. The journal sequence
 * is monotonic even after its bounded history evicts the receipt. No scan.
 * Sale callers also pass the actual pre-transaction owned work for creative.
 */
export function recordAspirationIncome(root,entry,work=null){
 const id=entry?.actorId,row=rowFor(root,id),seq=financeSeq(root);
 const latest=root?.financialHistory?.entries?.at(-1);
 if(!active(root,id)||!row||!latest||!safeId(entry.id)||latest.id!==entry.id||
  latest.actorId!==id||latest.delta!==entry.delta||latest.kind!==entry.kind||
  latest.sourceId!==entry.sourceId||latest.atGameMinute!==entry.atGameMinute||
  !['salary','art-sale'].includes(entry.kind)||!Number.isSafeInteger(entry.delta)||entry.delta<=0||
  seq<=row.lastFinanceSeq||!time(entry.atGameMinute)||entry.atGameMinute<Math.floor(row.selectedAt))return false;
 if(row.definitionId==='wealth'&&row.earned<EARNED_TARGET){
  write(root,id,{...row,earned:Math.min(EARNED_TARGET,row.earned+entry.delta),lastFinanceSeq:seq});return true;
 }
 if(row.definitionId==='creative'&&!row.sold&&row.created>0&&entry.kind==='art-sale'&&
  entry.sourceId===work?.id&&newWork(row,id,work)){
  write(root,id,{...row,sold:true,lastFinanceSeq:seq});return true;
 }
 return false;
}
const requirement=(label,met)=>({label,met:!!met});
function homeRequirements(root){
 const items=(root.world?.furniture?.instances||[]).filter(w=>w.location==='home'&&furnitureProvenance(w)==='purchased');
 const has=fn=>items.some(w=>{const p=compatibleFurnitureProduct(w.prefabId,w.itemDefinitionId);return !!p&&fn(p);});
 const bills=householdBillView(root);
 return [
  requirement('Улучшенная кровать',has(p=>p.prefabId==='bed'&&p.sleepQuality==='premium')),
  requirement('Плита, рабочая поверхность и мойка', ['stove','prep','sink'].every(k=>has(p=>p.prefabId===k))),
  requirement('Диван «Комфорт», книжный шкаф или музыкальный центр',has(p=>p.itemId==='sofa.comfort'||['bookcase','music'].includes(p.prefabId))),
  requirement('Нет неоплаченных счетов семьи',bills.ok&&bills.unpaidCount===0),
  requirement('В семейном бюджете не менее '+2*BILL_AMOUNT+' кр.',Number.isFinite(root.shop?.credits)&&root.shop.credits>=2*BILL_AMOUNT)
 ];
}
export function aspirationView(root,id){
 const row=active(root,id)?rowFor(root,id):null;
 if(!row||!own(ASPIRATIONS,row.definitionId))return {id:null,title:'Жизненное стремление не выбрано',description:'Выбери направление жизни, если хочешь.',requirements:[],currentTargetMet:false};
 const key=row.definitionId,d=ASPIRATIONS[key];let requirements=[],progress='';
 if(key==='career'){
  const c=root.careerSystem?.byResident?.[id],rank=careerRankForContract(c);
  requirements=[requirement('Высшая должность в профессии',rank?.index===7&&c?.level===7)];
  progress=rank?.title||'Выбери профессию в смартфоне';
 }else if(key==='wealth'){
  requirements=[requirement('Получить личный заработок',row.earned>=EARNED_TARGET)];
  progress=row.earned+' / '+EARNED_TARGET+' кр. · с момента выбора';
 }else if(key==='creative'){
  const kept=(actor(root,id).createdWorks||[]).some(w=>newWork(row,id,w));
  requirements=[requirement('Создать '+ART_TARGET+' картин',row.created>=ART_TARGET),
   requirement('Продать свою новую картину',row.sold),requirement('Оставить свою новую картину',kept)];
  progress=row.created+' / '+ART_TARGET+' картин · с момента выбора';
 }else if(key==='relationships'){
  const peers=residentIdsForSimulation(root).filter(other=>other!==id);
  requirements=[requirement('Взаимная близкая дружба, помолвка или брак',peers.some(other=>{
   const p=getPair(root.socialGraph,id,other);
   return p?.friendship==='close'||['engaged','married'].includes(p?.romance?.bond?.status);
  }))];
 }else if(key==='home'){
  requirements=homeRequirements(root);progress='Общее хозяйство · не личная собственность';
 }
 return {id:key,title:d.title,description:d.description,progress,requirements,
  currentTargetMet:requirements.length>0&&requirements.every(x=>x.met)};
}
/** Future CAS must call this with a newly allocated ID in its candidate
 * population before its single atomic save. Existing saves never call it.
 * Current production creation UI is not enabled by this contract.
 */
export function prepareNewResidentAspiration(previousRoot,candidateRoot,id,choice){
 if(!previousRoot||!candidateRoot||active(previousRoot,id)||!active(candidateRoot,id)||
  rowFor(candidateRoot,id)||!own(ASPIRATIONS,choice))return {ok:false,reason:'explicit-new-resident-choice-required'};
 const candidate={...candidateRoot};
 if(!chooseAspiration(candidate,id,choice))return {ok:false,reason:'unsupported-choice'};
 return {ok:true,lifeAspirations:candidate.lifeAspirations};
}
