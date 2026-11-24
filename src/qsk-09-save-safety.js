/**
 * QSK-09: storage boundary for the existing v1 save, not a new format.
 * Browser localStorage.setItem is atomic for a single key on failure. Do not
 * emulate file rename, auto-delete previous data or create quota-hungry backups.
 * This module is DOM/PlayCanvas-free and can be tested with injected storage.
 */
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const coords=value=>record(value)&&Number.isFinite(value.x)&&Number.isFinite(value.z);
const needs=value=>record(value)&&
  ['hunger','energy','hygiene','fun'].every(key=>Number.isFinite(value[key]));
const actor=value=>record(value)&&value.version===1&&
  Number.isFinite(value.minutes)&&value.minutes>=0&&
  needs(value.needs)&&coords(value.position);

/** Missing optional fields are valid for old v1 saves; malformed core data is not. */
export function inspectV1Save(root){
  if(!actor(root))return {ok:false,reason:'invalid-root'};
  if(Object.hasOwn(root,'otherSim')&&root.otherSim!==undefined&&
    !actor(root.otherSim))return {ok:false,reason:'invalid-second-resident'};
  // A damaged shop would otherwise silently restore starter credits.
  if(Object.hasOwn(root,'shop')&&root.shop!==undefined){
    const shop=root.shop;
    if(!record(shop)||shop.schema!==1||
      !Number.isSafeInteger(shop.credits)||shop.credits<0||shop.credits>1_000_000_000||
      !Number.isSafeInteger(shop.nextId)||shop.nextId<1||shop.nextId>10_000_000)
      return {ok:false,reason:'invalid-wallet'};
  }
  return {ok:true};
}

/** Never substitute a fresh household and then overwrite bytes we could not read. */
export function readV1Save(storage,key){
  try{
    const raw=storage.getItem(key);
    if(raw===null)return {status:'missing',value:null};
    const value=JSON.parse(raw);
    const result=inspectV1Save(value);
    return result.ok?{status:'valid',value}:{status:'locked',reason:result.reason};
  }catch{
    return {status:'locked',reason:'unreadable'};
  }
}

/** Only a standards-compliant atomic single-key write; no destructive fallback. */
export function writeV1Save(storage,key,value){
  const check=inspectV1Save(value);
  if(!check.ok)return check;
  try{
    const bytes=JSON.stringify(value);
    if(typeof bytes!=='string')return {ok:false,reason:'not-serializable'};
    storage.setItem(key,bytes);
    return {ok:true};
  }catch(error){
    const quota=error?.name==='QuotaExceededError'||error?.code===22||error?.code===1014;
    return {ok:false,reason:quota?'quota':'unavailable'};
  }
}
