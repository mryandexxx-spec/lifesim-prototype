/**
 * CAS-01.1 foundational resident-addressing seam. Existing Alex/Mira live in
 * the exact original root/otherSim v1 locations. This module deliberately does
 * NOT make provisional actors playable, saved, ticked or rendered: that belongs
 * to later CAS-01 stages with explicit migration and resource reservations.
 */
import {validPersonId} from './social-graph.js';

export const LEGACY_RESIDENT_IDS=Object.freeze(['alex','mira']);
export const MAX_HOUSE_RESIDENTS=4;
const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

/** No fallback: unrecognized IDs are not aliases for Alex. */
export function strictLegacyActor(root,id){
  if(!isRecord(root))return null;
  if(id==='alex')return root;
  if(id==='mira')return isRecord(root.otherSim)?root.otherSim:null;
  return null;
}

/** Read-only registry projection for current actors and optionally proposed
 * residents in pure tests/planning. Does not mutate/serialize root or extras.
 * Future save/population migration must validate those records separately.
 */
export function createResidentDirectory(root,proposed=[]){
  if(!isRecord(root)||root.version!==1||!Array.isArray(proposed))
    throw new TypeError('Invalid CAS resident directory inputs');
  const entries=new Map([['alex',root]]);
  if(isRecord(root.otherSim)&&root.otherSim.version===1)
    entries.set('mira',root.otherSim);
  if(entries.size+proposed.length>MAX_HOUSE_RESIDENTS)
    throw new RangeError('CAS resident limit is four per dwelling');
  const seenActors=new Set(entries.values());
  for(const item of proposed){
    const id=item?.id,actor=item?.actor;
    if(!validPersonId(id)||!/^resident_(?:[3-9]|[1-9][0-9]{1,7})$/.test(id)||
      !isRecord(actor)||actor.version!==1)
      throw new TypeError('Invalid proposed CAS resident');
    if(entries.has(id)||seenActors.has(actor))
      throw new TypeError('Invalid duplicate CAS resident');
    entries.set(id,actor);
    seenActors.add(actor);
  }
  const ids=Object.freeze([...entries.keys()]);
  return Object.freeze({
    ids,
    getActor(id){return entries.get(id)??null;}
  });
}
