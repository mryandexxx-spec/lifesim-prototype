/**
 * QSK-09 explicit local v1 backup. No CAS migration or new on-device key.
 * Validation and preview are read-only; a separate user action commits the file.
 */
import {inspectV1Save,writeV1Save} from './qsk-09-save-safety.js';
import {loadHousehold} from './household.js';

export const MAX_V1_BACKUP_BYTES=12*1024*1024;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const len=v=>Array.isArray(v)?v.length:0;

function domainError(raw){
  if(['casSchema','characterCreator','creatorSchema','morphSchema'].some(k=>Object.hasOwn(raw,k)))
    return 'future-cas';
  if(Object.hasOwn(raw,'population')&&(!plain(raw.population)||raw.population.schema!==1))
    return 'invalid-population';
  for(const key of ['inventory','actionQueues','financialHistory']){
    if(Object.hasOwn(raw,key)&&!plain(raw[key]))return 'invalid-'+key;
  }
  if(Object.hasOwn(raw,'world')&&(!plain(raw.world)||
    ['furniture','construction','outdoors'].some(k=>Object.hasOwn(raw.world,k)&&!plain(raw.world[k]))))
    return 'invalid-world';
  if(Object.hasOwn(raw,'calendar')&&(!plain(raw.calendar)||raw.calendar.schema!==1))
    return 'invalid-calendar';
  return null;
}

export function backupSummary(raw){
  const extra=raw.population?.residentsById;
  const furniture=raw.world?.furniture;
  const items=Array.isArray(furniture?.instances)?furniture.instances.length:
    Array.isArray(furniture?.items)?furniture.items.length:null;
  const queue=raw.actionQueues?.byResident;
  return {
    residents:1+(raw.otherSim?1:0)+(plain(extra)?Object.keys(extra).length:0),
    minutes:raw.minutes,credits:Number.isSafeInteger(raw.shop?.credits)?raw.shop.credits:null,
    items,queued:plain(queue)?Object.values(queue).reduce((n,v)=>n+len(v),0):0
  };
}

export function validateV1BackupText(text){
  if(typeof text!=='string'||!text.length||text.length>MAX_V1_BACKUP_BYTES)
    return {ok:false,reason:'size'};
  let raw;
  try{raw=JSON.parse(text);}catch{return {ok:false,reason:'json'};}
  const validated=inspectV1Save(raw);
  if(!validated.ok)return {ok:false,reason:validated.reason};
  const domain=domainError(raw);
  if(domain)return {ok:false,reason:domain};
  let loaded;
  try{loaded=loadHousehold(raw);}catch{return {ok:false,reason:'restore'};}
  if(loaded.version!==1||loaded.minutes!==raw.minutes||
    (raw.otherSim&&loaded.otherSim?.needs?.energy!==raw.otherSim.needs.energy)||
    (raw.shop&&loaded.shop?.credits!==raw.shop.credits))
    return {ok:false,reason:'lossy-restore'};
  return {ok:true,value:raw,summary:backupSummary(raw)};
}

export function exportV1BackupText(storage,key){
  try{
    const text=storage.getItem(key);
    if(text===null)return {ok:false,reason:'missing'};
    const checked=validateV1BackupText(text);
    return checked.ok?{...checked,text}:checked;
  }catch{return {ok:false,reason:'unavailable'};}
}

export function commitV1Backup(storage,key,validated){
  if(!validated?.ok||!validated.value)return {ok:false,reason:'not-validated'};
  return writeV1Save(storage,key,validated.value);
}
