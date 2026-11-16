/** F4b0 — data-only effect proposal engine. Does NOT write game state.
 * Runtime must authorize real action/consent, paused time, occupancy, and
 * canonical once-only receipts before invoking these pure helpers.
 */
import {getObjectItem} from './object-definition-registry.js';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const round=n=>Math.round(n*1e6)/1e6;

/** Unknown item/event, stored furniture, pauses and missing completion
 * receipts never produce deltas. No callbacks or user-authored code is run.
 */
export function proposeObjectEffectDeltas(registry,context={}){
  const item=getObjectItem(registry,context.itemId);
  if(!item||context.location!=='home'||context.active!==true||
    !registry.triggers.includes(context.trigger)||
    typeof context.instanceId!=='string'||!context.instanceId)return [];
  const minutes=context.minutes;
  const eventId=context.eventId;
  return item.effects.filter(effect=>effect.trigger===context.trigger&&
      (!effect.actionId||effect.actionId===context.actionId)&&
      (effect.mode!=='once'||(typeof eventId==='string'&&eventId.length>0&&eventId.length<=256))&&
      (effect.mode!=='perMinute'||(finite(minutes)&&minutes>0&&minutes<=1440)))
    .map(effect=>Object.freeze({
      instanceId:context.instanceId,itemId:item.id,effectId:effect.id,
      statId:effect.statId,stacking:effect.stacking,group:effect.group,
      delta:round(effect.amount*(effect.mode==='perMinute'?minutes:1)),
      eventId:effect.mode==='once'?eventId:null
    }));
}
/** Deterministic aggregation boundary for overlapping furniture effects.
 * 'sum' adds independent sources. 'highest' selects greatest magnitude.
 * 'unique' chooses ONE source in a group. Tie-breaks MUST be stable across
 * scene traversal order, save/restore and two-resident update order.
 *
 * Source identity uses nested maps rather than concatenated delimiters:
 * arbitrary IDs containing "|" cannot collide or gain an extra grant.
 * The caller still owns authorization and committing canonical state.
 */
export function calculateObjectEffectChanges(registry,contributions,values={}){
  if(!Array.isArray(contributions)||contributions.length>4096)return [];
  const buckets=new Map();
  // A source is one (instance, effect, event) for ONE stat/group/policy.
  // A duplicate should never be credited even if values differ. Authoring
  // IDs are stable, but external events must not alias across group strings.
  const seen=new Map();
  const validId=x=>typeof x==='string'&&x.length>0&&x.length<=256;
  function slot(map,key){if(!map.has(key))map.set(key,new Map());return map.get(key);}
  for(const row of contributions){
    if(!row||!Object.hasOwn(registry?.stats||{},row.statId)||
      !['sum','highest','unique'].includes(row.stacking)||
      !finite(row.delta)||Math.abs(row.delta)>1e6||
      !validId(row.group)||!validId(row.instanceId)||!validId(row.effectId)||
      (row.eventId!==null&&row.eventId!==undefined&&!validId(row.eventId)))
      continue;
    const groupBucket=slot(slot(buckets,row.statId),row.group);
    if(!groupBucket.has(row.stacking))groupBucket.set(row.stacking,[]);
    const groupSeen=slot(slot(slot(seen,row.statId),row.group),row.stacking);
    const instanceSeen=slot(groupSeen,row.instanceId);
    const effectSeen=slot(instanceSeen,row.effectId);
    const eventKey=row.eventId??null;
    if(effectSeen.has(eventKey))continue;
    effectSeen.set(eventKey,true);
    groupBucket.get(row.stacking).push({
      delta:row.delta,instanceId:row.instanceId,effectId:row.effectId,
      eventId:eventKey
    });
  }
  const totals=new Map();
  const sourceOrder=(a,b)=>{
    // Stable tie-break: source instance -> effect -> receipt ID.
    const fields=['instanceId','effectId','eventId'];
    for(const field of fields){
      const x=a[field]??'',y=b[field]??'';
      if(x<y)return -1;
      if(x>y)return 1;
    }
    return 0;
  };
  for(const [statId,groups] of buckets){
    let sum=0;
    for(const policies of groups.values())for(const [policy,rows] of policies){
      let gained;
      if(policy==='sum')gained=rows.reduce((n,row)=>n+row.delta,0);
      else if(policy==='highest'){
        const best=rows.slice().sort((a,b)=>
          Math.abs(b.delta)-Math.abs(a.delta)||sourceOrder(a,b))[0];
        gained=best.delta;
      }else{
        gained=rows.slice().sort(sourceOrder)[0].delta;
      }
      sum+=gained;
    }
    totals.set(statId,sum);
  }
  return [...totals].sort(([a],[b])=>a.localeCompare(b)).map(([statId,delta])=>{
    const stat=registry.stats[statId];
    const before=values[statId];
    const next=finite(before)
      ?Math.max(stat.min,Math.min(stat.max,round(before+delta))):null;
    return Object.freeze({statId,delta:round(delta),next});
  });
}
