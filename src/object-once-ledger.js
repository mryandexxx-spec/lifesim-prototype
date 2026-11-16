/** F4b8 — bounded, per-resident one-shot effect receipt ledger.
 * This is a persistence guard, NOT a source of gameplay authorization.
 * Caller MUST first prove the canonical completed action and real item.
 * Once a ledger is malformed/full, fail closed: never silently erase history.
 */
export const OBJECT_ONCE_LEDGER_LIMIT=1024;
const validId=v=>typeof v==='string'&&v.length>0&&v.length<=256;
const validSource=v=>v&&validId(v.instanceId)&&validId(v.itemId)&&
  validId(v.effectId)&&validId(v.eventId);
const key=v=>JSON.stringify([v.instanceId,v.itemId,v.effectId,v.eventId]);
const blocked=()=>({schema:1,blocked:true,entries:[]});
export function newObjectOnceLedger(){return {schema:1,blocked:false,entries:[]};}
export function restoreObjectOnceLedger(raw){
  // Pre-F4b8 v1 saves had NO one-shot furniture bonuses.
  if(raw===undefined)return newObjectOnceLedger();
  if(!raw||raw.schema!==1||raw.blocked!==false||!Array.isArray(raw.entries)||
     raw.entries.length>OBJECT_ONCE_LEDGER_LIMIT)return blocked();
  const known=new Set(),entries=[];
  for(const value of raw.entries){
    if(!validSource(value))return blocked();
    const id=key(value);
    if(known.has(id))return blocked();
    known.add(id);
    entries.push({instanceId:value.instanceId,itemId:value.itemId,
      effectId:value.effectId,eventId:value.eventId});
  }
  return {schema:1,blocked:false,entries};
}
/** Separate per-minute contributions from durable, one-shot proposals.
 * Never evict old receipts: once the cap is reached, NEW once effects deny.
 * JSON tuple keys avoid delimiter collisions in arbitrary event identifiers.
 * This pure stage returns a proposed ledger; caller commits it together with
 * the verified secondary stat write, or does not commit anything.
 */
export function stageObjectOnceEffects(current,proposals=[]){
  const ledger=restoreObjectOnceLedger(current);
  if(!Array.isArray(proposals)||proposals.length>4096)
    return {contributions:[],ledger};
  if(!proposals.some(p=>p?.eventId!==null&&p?.eventId!==undefined))
    return {contributions:proposals.slice(),ledger};
  const known=new Set(ledger.entries.map(key));
  const entries=ledger.entries.slice(),contributions=[];
  for(const proposal of proposals){
    if(proposal?.eventId===null||proposal?.eventId===undefined){
      contributions.push(proposal);continue;
    }
    if(ledger.blocked||!validSource(proposal))continue;
    const id=key(proposal);
    if(known.has(id)||entries.length>=OBJECT_ONCE_LEDGER_LIMIT)continue;
    known.add(id);
    entries.push({instanceId:proposal.instanceId,itemId:proposal.itemId,
      effectId:proposal.effectId,eventId:proposal.eventId});
    contributions.push(proposal);
  }
  return {contributions,ledger:{schema:1,blocked:ledger.blocked,entries}};
}
