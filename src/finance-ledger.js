/** W4-A: finite, bounded and optional history for the ONE existing household wallet.
 * PlayCanvas/DOM independent. This is an audit journal, not a second balance.
 * Legacy transactions cannot be reconstructed and must never be invented.
 */
import {SHOP_MAX_CREDITS,SHOP_SCHEMA} from './furniture-shop.js';

export const FINANCE_SCHEMA=1;
export const FINANCE_HISTORY_LIMIT=120;
const MAX_SEQUENCE=1_000_000_000;
const KINDS=new Set(['salary','purchase','sale','art-sale','undo','redo']);
const safeMoney=n=>Number.isSafeInteger(n)&&n>=0&&n<=SHOP_MAX_CREDITS;
const safeText=(s,max=160)=>typeof s==='string'&&s.length>0&&s.length<=max&&
  !/[\u0000-\u001f]/.test(s);
const validShop=s=>s?.schema===SHOP_SCHEMA&&safeMoney(s.credits)&&
  Number.isSafeInteger(s.nextId)&&s.nextId>=1&&s.nextId<=10_000_000;

export function newFinancialHistory(){
  return {schema:FINANCE_SCHEMA,nextId:1,entries:[]};
}
function validEntry(e){
  return !!e&&safeText(e.id)&&KINDS.has(e.kind)&&
    Number.isSafeInteger(e.delta)&&e.delta!==0&&
    Math.abs(e.delta)<=SHOP_MAX_CREDITS&&safeMoney(e.balanceAfter)&&
    Number.isSafeInteger(e.atGameMinute)&&e.atGameMinute>=0&&
    safeText(e.sourceId)&&
    (e.actorId===null||['alex','mira'].includes(e.actorId));
}
/** An old save is a known beginning-of-history boundary, not a zero balance. */
export function restoreFinancialHistory(raw){
  if(raw?.schema!==FINANCE_SCHEMA)return newFinancialHistory();
  const seen=new Set(),entries=[];
  const input=Array.isArray(raw.entries)?raw.entries.slice(-FINANCE_HISTORY_LIMIT):[];
  for(const entry of input){
    if(!validEntry(entry)||seen.has(entry.id))continue;
    seen.add(entry.id);
    entries.push({id:entry.id,kind:entry.kind,delta:entry.delta,
      atGameMinute:entry.atGameMinute,sourceId:entry.sourceId,
      actorId:entry.actorId,balanceAfter:entry.balanceAfter});
  }
  const nextId=Number.isSafeInteger(raw.nextId)&&
    raw.nextId>=1&&raw.nextId<=MAX_SEQUENCE?raw.nextId:1;
  return {schema:FINANCE_SCHEMA,nextId,entries};
}
/** Pure pre-commit projection: both shop and journal are applied in the same
 * in-memory transaction by the caller, then the existing single save snapshot.
 * Receipt IDs complement—not replace—career settlement/physical item guards.
 */
export function recordFinanceChange(root,nextShop,{
  kind,sourceId,actorId=null,atGameMinute=root?.minutes,receiptId=null
}={}){
  if(!validShop(root?.shop)||!validShop(nextShop)||
     !Number.isSafeInteger(atGameMinute)||atGameMinute<0||
     !KINDS.has(kind)||!safeText(sourceId)||
     (actorId!==null&&!['alex','mira'].includes(actorId)))
    return {ok:false,reason:'invalid-finance'};
  const delta=nextShop.credits-root.shop.credits;
  if(!Number.isSafeInteger(delta)||Math.abs(delta)>SHOP_MAX_CREDITS)
    return {ok:false,reason:'invalid-amount'};
  const history=restoreFinancialHistory(root.financialHistory);
  // Free storage/movement, or a zero-hour shift, creates no phantom entry.
  if(delta===0)return {ok:true,shop:nextShop,financialHistory:history,recorded:false};
  if((['salary','sale','art-sale'].includes(kind)&&delta<0)||
     (kind==='purchase'&&delta>0))
    return {ok:false,reason:'wrong-finance-sign'};
  if(history.nextId>=MAX_SEQUENCE)return {ok:false,reason:'history-id-limit'};
  const id=receiptId??'fin-'+history.nextId;
  if(!safeText(id)||history.entries.some(e=>e.id===id))
    return {ok:false,reason:'duplicate-transaction'};
  const entry={id,kind,delta,atGameMinute,sourceId,actorId,balanceAfter:nextShop.credits};
  return {ok:true,shop:nextShop,financialHistory:{
    schema:FINANCE_SCHEMA,nextId:history.nextId+1,
    entries:[...history.entries,entry].slice(-FINANCE_HISTORY_LIMIT)
  },recorded:true,entry};
}
