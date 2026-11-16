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
/** One aggregation boundary for overlapping furniture effects.
 * 'sum' adds independent sources, 'highest' selects strongest by magnitude,
 * 'unique' takes at most one effect per named group.
 * The returned values are proposals; the caller alone commits canonical state.
 */
export function calculateObjectEffectChanges(registry,contributions,values={}){
  if(!Array.isArray(contributions)||contributions.length>4096)return [];
  const buckets=new Map(),seen=new Set();
  for(const row of contributions){
    if(!row||!Object.hasOwn(registry?.stats||{},row.statId)||
      !['sum','highest','unique'].includes(row.stacking)||
      !finite(row.delta)||Math.abs(row.delta)>1e6||
      typeof row.group!=='string'||!row.group)continue;
    const key=[row.statId,row.group,row.stacking].join('|');
    const identity=[row.instanceId,row.effectId,row.eventId||'tick',key].join('|');
    if(seen.has(identity))continue;
    seen.add(identity);
    if(!buckets.has(key))buckets.set(key,{statId:row.statId,stacking:row.stacking,rows:[]});
    buckets.get(key).rows.push(row.delta);
  }
  const totals=new Map();
  for(const bucket of buckets.values()){
    let gained;
    if(bucket.stacking==='sum')gained=bucket.rows.reduce((n,v)=>n+v,0);
    else if(bucket.stacking==='highest')
      gained=bucket.rows.reduce((v,n)=>Math.abs(n)>Math.abs(v)?n:v,0);
    else gained=bucket.rows[0];
    totals.set(bucket.statId,(totals.get(bucket.statId)||0)+gained);
  }
  return [...totals].sort(([a],[b])=>a.localeCompare(b)).map(([statId,delta])=>{
    const stat=registry.stats[statId];
    const before=values[statId];
    const next=finite(before)
      ?Math.max(stat.min,Math.min(stat.max,round(before+delta))):null;
    return Object.freeze({statId,delta:round(delta),next});
  });
}
