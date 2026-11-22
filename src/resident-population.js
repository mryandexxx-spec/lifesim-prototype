/**
 * CAS-01.3: optional root-v1 population payload. This is durable data for
 * future CAS residents, NOT activation in ticks, UI, work or economy.
 * Invalid/future data fails closed: never substitute an empty population.
 */
import {createResidentMembership} from './resident-membership.js';

export const POPULATION_SCHEMA=1;
const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const EXTRA_ID=/^resident_(?:[3-9]|[1-9][0-9]{1,7})$/;
const NEEDS=['hunger','energy','hygiene','fun','social','bladder'];
const FORBIDDEN_ACTOR_FIELDS=['shop','financialHistory','careerSystem','recruitmentSystem',
  'otherSim','population','world','actionQueues','socialGraph','householdBills','homeMarket',
  'calendar','inventory','phoneCalls','sportsWorld'];
export class PopulationSaveError extends Error {
  constructor(reason){super('CAS population save invalid: '+reason);this.name='PopulationSaveError';}
}
const invalid=reason=>{throw new PopulationSaveError(reason);};

/** Reject objects that would be truncated/coerced by JSON.stringify, cycles,
 * nonfinite numbers, dangerous keys and oversized structures.
 */
function assertJson(value,depth=0,budget={nodes:0},visited=new Set()){
  if(++budget.nodes>30000||depth>18)invalid('payload exceeds bounds');
  if(value===null||typeof value==='boolean')return;
  if(typeof value==='number'){if(!Number.isFinite(value))invalid('nonfinite value');return;}
  if(typeof value==='string'){if(value.length>512)invalid('oversized string');return;}
  if(typeof value!=='object'||visited.has(value))invalid('non-JSON or cyclic value');
  if(!Array.isArray(value)&&!isRecord(value))invalid('invalid object');
  const proto=Object.getPrototypeOf(value);
  if(proto!==Object.prototype&&proto!==null&&!Array.isArray(value))
    invalid('nonplain object');
  visited.add(value);
  if(Array.isArray(value)){
    if(value.length>2000||Object.keys(value).length!==value.length)invalid('invalid array');
    for(const item of value)assertJson(item,depth+1,budget,visited);
  }else{
    const keys=Object.keys(value);
    if(keys.length>300)invalid('oversized record');
    for(const key of keys){
      if(key==='__proto__'||key==='constructor'||key==='prototype'||key.length>80)
        invalid('unsafe JSON property');
      assertJson(value[key],depth+1,budget,visited);
    }
  }
  visited.delete(value);
}

function validName(x,{allowEmpty=false}={}){
  return typeof x==='string'&&(allowEmpty?x.length<=40:x.length>=1&&x.length<=40)&&
    x===x.trim()&&!/[\u0000-\u001f\u007f<>]/.test(x);
}
function validateResident(id,entry){
  if(!EXTRA_ID.test(id)||!isRecord(entry)||entry.id!==id||!isRecord(entry.identity))
    invalid('invalid additional resident ID or identity');
  const identity=entry.identity;
  if(!validName(identity.firstName)||!validName(identity.lastName,{allowEmpty:true})||
    identity.lifeStage!=='adult')invalid('invalid adult identity');
  const actor=entry.actor;
  if(!isRecord(actor)||actor.version!==1||!Number.isFinite(actor.minutes)||
    actor.minutes<0||actor.minutes>10000000||
    !isRecord(actor.position)||!Number.isFinite(actor.position.x)||
    !Number.isFinite(actor.position.z)||!isRecord(actor.needs)||
    NEEDS.some(k=>!Number.isFinite(actor.needs[k])||actor.needs[k]<0||actor.needs[k]>100)||
    !isRecord(actor.autonomy)||typeof actor.autonomy.enabled!=='boolean'||
    actor.action!==null)invalid('invalid inert resident actor snapshot');
  if(FORBIDDEN_ACTOR_FIELDS.some(key=>own(actor,key)))
    invalid('additional resident cannot own household state');
}

/** Returns detached JSON-safe population. Without population, return null:
 * old one/two-person v1 saves keep their exact root layout.
 */
export function restorePopulation(raw){
  if(!isRecord(raw)||raw.schema!==POPULATION_SCHEMA||
    !isRecord(raw.residentsById)||!isRecord(raw.linksByResident)||
    !Array.isArray(raw.kinship)||!Number.isSafeInteger(raw.nextResidentSerial)||
    raw.nextResidentSerial<3||raw.nextResidentSerial>100000000)
    invalid('unsupported or truncated schema');
  if(Object.keys(raw).some(k=>!['schema','nextResidentSerial','residentsById',
    'linksByResident','kinship'].includes(k)))invalid('unrecognized population fields');
  assertJson(raw);
  const extras=Object.keys(raw.residentsById);
  if(extras.length>2)invalid('dwelling exceeds four residents');
  for(const id of extras){
    if(!own(raw.linksByResident,id))invalid('additional resident missing membership');
    validateResident(id,raw.residentsById[id]);
    if(Number(id.slice('resident_'.length))>=raw.nextResidentSerial)
      invalid('resident serial may not be reused');
  }
  try{
    createResidentMembership(['alex','mira',...extras],raw.linksByResident,raw.kinship);
  }catch(e){invalid('invalid residence, family or kinship: '+e.message);}
  return JSON.parse(JSON.stringify(raw));
}

/** Read-only roster view; no extra actor enters legacy getActor/tick. */
export function savedPopulationMembership(root){
  const pop=own(root??{},'population')?restorePopulation(root.population):null;
  return createResidentMembership(['alex','mira',...Object.keys(pop?.residentsById||{})],
    pop?.linksByResident??{},pop?.kinship??[]);
}

/** Build and preflight one full root-v1 snapshot without touching current root. */
export function proposePopulationSave(root,population,restoreSnapshot){
  if(!isRecord(root)||root.version!==1||typeof restoreSnapshot!=='function')
    return {ok:false,reason:'invalid-root'};
  try{
    const base=JSON.stringify(root);
    if(!base||base.length>8_000_000)return {ok:false,reason:'snapshot-too-large'};
    const next=JSON.parse(base);
    next.population=restorePopulation(population);
    const serialized=JSON.stringify(next);
    if(serialized.length>8_000_000)return {ok:false,reason:'snapshot-too-large'};
    const restored=restoreSnapshot(JSON.parse(serialized));
    if(!restored||restored.version!==1||
      JSON.stringify(restored.population)!==JSON.stringify(next.population))
      return {ok:false,reason:'preflight-mismatch'};
    return Object.freeze({ok:true,base,serialized,root:restored});
  }catch(e){return {ok:false,reason:e instanceof PopulationSaveError
    ?'invalid-population':'preflight-failed'};}
}

/** Writer must perform exactly one setItem to the existing SAVE_KEY. If it
 * throws/returns false, original storage and live root remain untouched.
 */
export function commitPopulationSave(liveRoot,proposal,write){
  if(!proposal?.ok||typeof write!=='function')
    return {ok:false,reason:'invalid-proposal'};
  try{
    if(JSON.stringify(liveRoot)!==proposal.base)
      return {ok:false,reason:'stale-state'};
  }catch{return {ok:false,reason:'stale-state'};}
  try{
    if(write(proposal.serialized)===false)
      return {ok:false,reason:'storage-failed'};
  }catch{return {ok:false,reason:'storage-failed'};}
  return {ok:true,root:proposal.root};
}
