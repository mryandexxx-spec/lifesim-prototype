/** GC-04/09 C1 candidate: pure art-market projections. No runtime wiring yet.
 * Prices are experimental defaults, not a released economy. The caller must
 * atomically commit the returned market, wallet, journal, works and session
 * lifecycle in the existing v1 snapshot. Never reconstruct demand from journal.
 */
import {PAINT_ACTIVITY_ID,PAINT_CONTENT_IDS,PAINT_WORKS_LIMIT,finishPainting,restoreCreatedWorks} from './painting.js';
import {paintingResaleCredits} from './painting-gallery.js';
import {HOBBY_ACTIVITIES,HOBBY_CONTENT,HOBBY_SKILLS} from './hobby-reading.js';
import {restoreActivitySession} from './activity-session.js';
import {recordFinanceChange} from './finance-ledger.js';
import {SHOP_MAX_CREDITS} from './furniture-shop.js';

export const ART_MARKET_SCHEMA=1;
export const ART_MARKET_PILOT=Object.freeze({materials:20,dailyDemand:256,capacity:256,initialDemand:256,orderDays:7});
const UNIT=1440, MAX_MINUTE=10000000;
const IDS=['alex','mira'];
const MODES=['practice','speculative','commission'];
const SUBJECT='painting.hills';
const actor=(root,id)=>id==='alex'?root:id==='mira'?root?.otherSim:null;
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const clock=n=>Number.isFinite(n)&&n>=0&&n<=MAX_MINUTE?Math.floor(n):null;
const validId=s=>typeof s==='string'&&/^[a-z][a-z0-9._:-]{1,95}$/.test(s);
const reject=reason=>({ok:false,reason});
const windowAt=(m,at)=>Math.floor((at-m.activatedAt)/(ART_MARKET_PILOT.orderDays*UNIT));
const newPerson=()=>({lastStartedAt:-1,active:null,order:null});
export function newArtMarket(minutes){
 const at=clock(minutes);
 if(at===null)return null;
 return {schema:ART_MARKET_SCHEMA,activatedAt:at,demandAt:at,demandUnits:ART_MARKET_PILOT.initialDemand*UNIT,
  byResident:Object.fromEntries(IDS.map(id=>[id,newPerson()]))};
}
function validPerson(row,id,m,now){
 if(!row||!integer(row.lastStartedAt,-1,now))return false;
 if(row.lastStartedAt!==-1&&row.lastStartedAt<m.activatedAt)return false;
 const a=row.active,o=row.order;
 if(a!==null&&(!a||!validId(a.sessionId)||!MODES.includes(a.mode)||!PAINT_CONTENT_IDS.includes(a.contentId)||
  !integer(a.startedAt,m.activatedAt,now)||a.startedAt!==row.lastStartedAt))return false;
 if(o!==null&&(!o||!integer(o.window,0,windowAt(m,now))||o.subject!==SUBJECT||
  !validId(o.sessionId)||!integer(o.acceptedAt,m.activatedAt,now)||windowAt(m,o.acceptedAt)!==o.window||
  !['accepted','ready','fulfilled','cancelled'].includes(o.status)||
  (['ready','fulfilled'].includes(o.status)?o.workId!=='work:'+o.sessionId:o.workId!==null)))return false;
 if(a?.mode==='commission'&&(!o||o.status!=='accepted'||o.sessionId!==a.sessionId||o.acceptedAt!==a.startedAt))return false;
 if(o?.status==='accepted'&&a?.sessionId!==o.sessionId)return false;
 return true;
}
/** Missing legacy state can be initialized explicitly by the future loader.
 * Invalid existing state fails closed, rather than resetting buyer money/orders.
 */
export function restoreArtMarket(raw,minutes){
 const now=clock(minutes);
 if(now===null||raw?.schema!==ART_MARKET_SCHEMA||
  !integer(raw.activatedAt,0,now)||!integer(raw.demandAt,raw.activatedAt,now)||
  !integer(raw.demandUnits,0,ART_MARKET_PILOT.capacity*UNIT)||
  !IDS.every(id=>validPerson(raw.byResident?.[id],id,raw,now)))return null;
 return {schema:ART_MARKET_SCHEMA,activatedAt:raw.activatedAt,demandAt:raw.demandAt,demandUnits:raw.demandUnits,
  byResident:Object.fromEntries(IDS.map(id=>{const r=raw.byResident[id];return [id,{lastStartedAt:r.lastStartedAt,active:r.active?{sessionId:r.active.sessionId,mode:r.active.mode,contentId:r.active.contentId,startedAt:r.active.startedAt}:null,order:r.order?{window:r.order.window,subject:r.order.subject,sessionId:r.order.sessionId,acceptedAt:r.order.acceptedAt,status:r.order.status,workId:r.order.workId}:null}];}))};
}
function state(root,id){
 const now=clock(root?.minutes),m=restoreArtMarket(root?.artMarket,root?.minutes);
 const person=actor(root,id);
 return m&&person&&IDS.includes(id)?{now,m,person,row:m.byResident[id]}:null;
}
function buyer(m,now){return Math.min(ART_MARKET_PILOT.capacity*UNIT,m.demandUnits+(now-m.demandAt)*ART_MARKET_PILOT.dailyDemand);}
function activeSession(person,id,phase){
 const s=restoreActivitySession(HOBBY_ACTIVITIES,person?.activitySession,HOBBY_CONTENT);
 return s?.activityId===PAINT_ACTIVITY_ID&&s.actorId===id&&s.phase===phase?s:null;
}
export function artAdmissionQuote(root,id,mode,contentId){
 const x=state(root,id);
 if(!x||!MODES.includes(mode)||!PAINT_CONTENT_IDS.includes(contentId))return reject('invalid-market');
 if(x.row.active)return reject('active-painting');
 if(mode==='commission'&&(contentId!==SUBJECT||x.row.order?.window===windowAt(x.m,x.now)))return reject('order-unavailable');
 if(mode!=='practice'&&(x.person.createdWorks?.length||0)>=PAINT_WORKS_LIMIT)return reject('collection-full');
 const price=mode==='practice'?0:ART_MARKET_PILOT.materials;
 if(!integer(root.shop?.credits,0,SHOP_MAX_CREDITS)||root.shop.credits<price)return reject('insufficient-credits');
 return {ok:true,mode,contentId,price,orderWindow:mode==='commission'?windowAt(x.m,x.now):null};
}
/** Called only after canonical walking admission succeeds. Never charge for
 * mere queue insertion; caller rolls back admission if this projection fails. */
export function projectArtAdmission(root,id,mode,expectedPrice){
 const x=state(root,id);if(!x)return reject('invalid-market');
 const s=activeSession(x.person,id,'walking');
 if(!s||x.person.action?.id!=='paint'||x.person.action.targetInstanceId!==s.targetInstanceId||
  x.person.action.contentId!==s.contentId)return reject('invalid-session');
 const q=artAdmissionQuote(root,id,mode,s.contentId);
 if(!q.ok)return q;
 if(q.price!==expectedPrice)return reject('stale-quote');
 if(x.now<=x.row.lastStartedAt)return reject('replayed-admission');
 let finance={shop:root.shop,financialHistory:root.financialHistory,recorded:false};
 if(q.price){
  finance=recordFinanceChange(root,{...root.shop,credits:root.shop.credits-q.price},{kind:'purchase',sourceId:'painting.materials',actorId:id,atGameMinute:x.now,receiptId:'materials:'+s.sessionId});
  if(!finance.ok||!finance.recorded)return reject(finance.reason||'unrecorded-materials');
 }
 x.row.lastStartedAt=x.now;
 x.row.active={sessionId:s.sessionId,contentId:s.contentId,mode,startedAt:x.now};
 if(mode==='commission')x.row.order={window:q.orderWindow,subject:SUBJECT,sessionId:s.sessionId,acceptedAt:x.now,status:'accepted',workId:null};
 return {ok:true,artMarket:x.m,shop:finance.shop,financialHistory:finance.financialHistory,entry:finance.entry};
}
/** No money moves on cancellation. Previously created art is never evicted. */
export function projectArtCancellation(root,id,sessionId){
 const x=state(root,id);if(!x||x.row.active?.sessionId!==sessionId)return reject('not-active');
 if(x.row.active.mode==='commission')x.row.order={...x.row.order,status:'cancelled'};
 x.row.active=null;
 return {ok:true,artMarket:x.m};
}
/** Canonical ready session and physical easel are required; practice yields no
 * durable artwork or credit, but existing skill practice remains canonical. */
export function projectArtCompletion(root,id){
 const x=state(root,id);if(!x)return reject('invalid-market');
 const s=activeSession(x.person,id,'ready'),a=x.row.active;
 if(!s||!a||a.sessionId!==s.sessionId||a.contentId!==s.contentId||x.now<=a.startedAt)return reject('not-ready');
 const practice=a.mode==='practice';
 const result=finishPainting({session:s,actor:practice?{...x.person,createdWorks:[]}:x.person,actorId:id,world:root.world,at:root.minutes,registry:HOBBY_ACTIVITIES,skills:HOBBY_SKILLS});
 if(!result)return reject('invalid-completion');
 if(a.mode==='commission'){
  const o=x.row.order;
  x.row.order=windowAt(x.m,x.now)===o.window?{...o,status:'ready',workId:result.work.id}:{...o,status:'cancelled'};
 }
 x.row.active=null;
 return {ok:true,artMarket:x.m,works:practice?x.person.createdWorks:result.works,work:practice?null:result.work};
}
export function quoteArtSale(root,id,workId){
 const x=state(root,id);if(!x)return reject('invalid-market');
 const work=restoreCreatedWorks(x.person.createdWorks,id).find(w=>w.id===workId);
 if(!work)return reject('not-owned');
 if(work.kind!=='artwork'||work.location!=='inventory')return reject('not-in-inventory');
 const base=paintingResaleCredits(work),o=x.row.order;
 const commission=o?.status==='ready'&&o.window===windowAt(x.m,x.now)&&o.workId===work.id&&work.contentId===o.subject;
 const units=buyer(x.m,x.now);
 const amount=commission?base:Math.min(base,Math.floor(units/UNIT));
 if(!amount)return reject('no-demand');
 if(!integer(root.shop?.credits,0,SHOP_MAX_CREDITS)||root.shop.credits+amount>SHOP_MAX_CREDITS)return reject('wallet-limit');
 return {ok:true,workId,kind:commission?'commission':'spot',amount,base,belowMaterialCost:amount<ART_MARKET_PILOT.materials};
}
/** Explicit confirmation only, no automatic sale. Quote recomputed against
 * current canonical state; reject changed price or type without mutation. */
export function projectArtSale(root,id,workId,expected){
 const q=quoteArtSale(root,id,workId);if(!q.ok)return q;
 if(expected?.workId!==workId||expected?.kind!==q.kind||expected?.amount!==q.amount)return reject('stale-quote');
 const x=state(root,id);
 const finance=recordFinanceChange(root,{...root.shop,credits:root.shop.credits+q.amount},{kind:'art-sale',sourceId:workId,actorId:id,atGameMinute:x.now,receiptId:'art:'+id+':'+workId});
 if(!finance.ok||!finance.recorded)return reject(finance.reason||'unrecorded-sale');
 if(q.kind==='commission')x.row.order={...x.row.order,status:'fulfilled'};
 else {x.m.demandUnits=buyer(x.m,x.now)-q.amount*UNIT;x.m.demandAt=x.now;}
 return {...q,artMarket:x.m,shop:finance.shop,financialHistory:finance.financialHistory,entry:finance.entry,
  works:x.person.createdWorks.filter(w=>w.id!==workId)};
}
