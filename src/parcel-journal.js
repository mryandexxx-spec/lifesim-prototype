/** BUILD-UX: session-only ordered history for the four lot editors.
 * Never snapshots/restores the household, queues or financial ledger.
 * Only changed domain slices are kept, and authoritative transactions persist
 * before the UI advances its cursor. The pool is committed through its own API.
 */
const DOMAINS=Object.freeze(['construction','furniture','outdoors']);
const clone=value=>JSON.parse(JSON.stringify(value));
const allocator=/^next[A-Z]/;
const canonical=value=>{
  const result=clone(value);
  if(result&&typeof result==='object'){
    delete result.revision;delete result.poolTxnSeq;
    for(const key of Object.keys(result))if(allocator.test(key))delete result[key];
  }
  return JSON.stringify(result);
};
export function parcelEditSnapshot(root){
  return {credits:root.shop.credits,world:Object.fromEntries(
    DOMAINS.map(key=>[key,clone(root.world[key])]))};
}
export function createParcelJournal(limit=40){
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Invalid history capacity');
  let entries=[],cursor=0;
  return {
    get canUndo(){return cursor>0;},
    get canRedo(){return cursor<entries.length;},
    get size(){return entries.length;},
    snapshot:parcelEditSnapshot,
    record(before,root,section){
      const after=parcelEditSnapshot(root),changed=DOMAINS.filter(key=>
        canonical(before.world[key])!==canonical(after.world[key]));
      if(!changed.length&&before.credits===after.credits)return false;
      if(!changed.length)throw Error('Financial edit without domain mutation');
      const entry={section,changed,from:{credits:before.credits,world:{}},
        to:{credits:after.credits,world:{}}};
      for(const key of changed){
        entry.from.world[key]=clone(before.world[key]);
        entry.to.world[key]=clone(after.world[key]);
      }
      entries=entries.slice(0,cursor);
      entries.push(entry);cursor++;
      if(entries.length>limit){entries.shift();cursor--;}
      return true;
    },
    preview(root,direction){
      if(direction!==-1&&direction!==1)return {ok:false,reason:'invalid-direction'};
      const nextIndex=cursor+(direction===-1?-1:0);
      if(nextIndex<0||nextIndex>=entries.length)
        return {ok:false,reason:'empty-history'};
      const entry=entries[nextIndex],source=direction===-1?entry.to:entry.from,
        destination=direction===-1?entry.from:entry.to;
      if(root.shop.credits!==source.credits)return {ok:false,reason:'balance-changed'};
      for(const key of entry.changed){
        if(canonical(root.world[key])!==canonical(source.world[key]))
          return {ok:false,reason:'world-changed',domain:key};
      }
      const credits=root.shop.credits+destination.credits-source.credits;
      if(!Number.isSafeInteger(credits)||credits<0||credits>1000000000)
        return {ok:false,reason:'insufficient-credits'};
      const world={};
      for(const key of entry.changed){
        const current=root.world[key],target=clone(destination.world[key]);
        if(!Number.isSafeInteger(current.revision)||current.revision>=100000000)
          return {ok:false,reason:'revision-limit'};
        target.revision=current.revision+1;
        for(const field of Object.keys(current)){
          if(allocator.test(field)&&Number.isSafeInteger(current[field]))
            target[field]=Math.max(current[field],Number.isSafeInteger(target[field])?target[field]:0);
        }
        if(key==='outdoors')target.poolTxnSeq=current.poolTxnSeq||0;
        world[key]=target;
      }
      const outside=entry.changed.includes('outdoors');
      const poolChange=outside&&(
        JSON.stringify(source.world.outdoors.pools)!==JSON.stringify(destination.world.outdoors.pools)||
        JSON.stringify(source.world.outdoors.poolFixtures)!==JSON.stringify(destination.world.outdoors.poolFixtures));
      return {ok:true,world,credits,poolChange,section:entry.section,
        changed:[...entry.changed]};
    },
    advance(direction){
      if(direction===-1&&cursor>0){cursor--;return true;}
      if(direction===1&&cursor<entries.length){cursor++;return true;}
      return false;
    }
  };
}
