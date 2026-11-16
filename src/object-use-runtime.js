/** F4b3 — trusted action-use boundary. Never award anything from a UI click,
 * purchase, walking phase, warehouse inventory or unverified receipt.
 * Existing F2/F3 action rewards remain owned by simulation.tick().
 */
import {ACTIONS} from './simulation.js';
import {resolveActionFurniture} from './furniture-catalog.js';
import {legacyObjectRegistry,legacyItemIdForPrefab} from './object-legacy-adapter.js';
import {getObjectItem} from './object-definition-registry.js';
import {proposeObjectEffectDeltas,calculateObjectEffectChanges} from './object-effect-engine.js';
import {stageObjectOnceEffects} from './object-once-ledger.js';

const validTime=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));

/** Record only immutable facts BEFORE the authoritative simulation time step.
 * This is not an authorization token: settlement re-checks real world+action.
 */
export function captureObjectUse(actor){
  const a=actor?.action;
  if(actor?.paused||!a||a.phase!=='using'||!ACTIONS[a.id]||
     !validTime(a.elapsed)||typeof a.targetInstanceId!=='string')return null;
  return Object.freeze({actionId:a.id,instanceId:a.targetInstanceId,
    elapsed:a.elapsed,minutes:actor.minutes});
}

/** Called directly after a successful simulation.tick(), never from rendering.
 * A completed action clears actor.action; in that case the game's exact
 * completion event is required. This prevents canceled/redirected actions
 * from manufacturing completion effects. No IDs or user input are trusted.
 *
 * item effects are strictly additive SECONDARY metrics: the need already
 * rewarded by ACTIONS[actionId] cannot be rewarded a second time.
 */
export function settleObjectUseStep({registry=legacyObjectRegistry(),world,actor,before}={}){
  if(!before||!actor||actor.paused||!validTime(actor.minutes)||
     !validTime(before.minutes)||actor.minutes<=before.minutes)return [];
  const action=ACTIONS[before.actionId];
  if(!action||!validTime(before.elapsed)||before.elapsed>=action.duration)return [];
  const furniture=resolveActionFurniture(world,before.actionId,before.instanceId);
  if(!furniture||furniture.instanceId!==before.instanceId||furniture.location!=='home')return [];
  const itemId=furniture.itemDefinitionId||legacyItemIdForPrefab(furniture.prefabId);
  const item=getObjectItem(registry,itemId);
  if(!item||item.prefabId!==furniture.prefabId)return [];
  const current=actor.action;
  const continued=current?.id===before.actionId&&
    current?.targetInstanceId===before.instanceId&&current.phase==='using'&&
    validTime(current.elapsed)&&current.elapsed>before.elapsed;
  const completed=!current&&actor.event===action.label+' — готово';
  if(!continued&&!completed)return [];
  const elapsed=continued?current.elapsed-before.elapsed:
    Math.min(actor.minutes-before.minutes,action.duration-before.elapsed);
  const authorized=Math.min(elapsed,actor.minutes-before.minutes,action.duration-before.elapsed);
  if(!Number.isFinite(authorized)||authorized<=0)return [];
  const trigger='item.use.tick';
  const proposals=proposeObjectEffectDeltas(registry,{
    itemId,instanceId:furniture.instanceId,location:'home',active:true,
    trigger,actionId:before.actionId,minutes:authorized
  }).filter(x=>x.statId!=='needs.'+action.need);
  if(completed){
    const eventId=[before.actionId,before.instanceId,
      Math.round((before.minutes-before.elapsed)*1000000)].join(':');
    proposals.push(...proposeObjectEffectDeltas(registry,{
      itemId,instanceId:furniture.instanceId,location:'home',active:true,
      trigger:'item.use.complete',actionId:before.actionId,eventId
    }).filter(x=>x.statId!=='needs.'+action.need));
  }
  // Only supported, actually existing secondary needs can consume a receipt.
  // Unsupported mood, skill, and currency adapters MUST NOT spend once events.
  const eligible=proposals.filter(x=>x.statId.startsWith('needs.')&&
    Number.isFinite(actor.needs?.[x.statId.slice(6)]));
  if(!eligible.length)return [];
  const staged=stageObjectOnceEffects(actor.objectOnceLedger,eligible);
  if(!staged.contributions.length)return [];
  const values={};
  for(const statId of Object.keys(registry.stats)){
    if(statId.startsWith('needs.'))values[statId]=actor.needs?.[statId.slice(6)];
  }
  const changes=calculateObjectEffectChanges(registry,staged.contributions,values);
  const applied=[];
  for(const change of changes){
    // No mood/environment or skill writes until their own canonical adapters
    // exist. Unknown and non-need metrics are deliberately fail-closed.
    if(!change.statId.startsWith('needs.')||change.next===null)continue;
    const need=change.statId.slice(6);
    if(!Object.hasOwn(actor.needs,need)||!Number.isFinite(actor.needs[need]))continue;
    actor.needs[need]=clamp(change.next,0,100);
    applied.push(change);
  }
  // Same synchronous simulation update as the reward. JSON v1 persistence
  // includes both fields on the next autosave/pagehide/manual save.
  if(applied.length)actor.objectOnceLedger=staged.ledger;
  return applied;
}
