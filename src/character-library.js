/** CF-04 G3A — created adult profiles, not active household actors.
 * The existing population remains the simulation's admitted residents.
 * No global gameplay quota; practical storage/ID bounds are separate.
 * Do not enumerate this library in simulation, queues, career, social or 3D.
 */
import {createProfile,PROFILE_RULES} from './trait-catalog.js';
import {ASPIRATIONS} from './life-aspirations.js';
import {commitPopulationSave} from './resident-population.js';
export const CHARACTER_LIBRARY_SCHEMA=1;
const own=(o,k)=>Object.hasOwn(o||{},k);
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const idPattern=/^resident_(?:[3-9]|[1-9][0-9]{1,7})$/;
const maxSerial=100000000; // Existing resident ID namespace, not household capacity.
const serial=id=>Number(id.slice('resident_'.length));
const name=(x,empty=false)=>typeof x==='string'&&x.length<=40&&
 (empty||x.length>0)&&x===x.trim()&&!/[\u0000-\u001f\u007f<>]/.test(x);
const exact=(x,keys)=>record(x)&&Object.keys(x).length===keys.length&&keys.every(k=>own(x,k));
const clone=x=>JSON.parse(JSON.stringify(x));
export class CharacterLibraryError extends Error{
 constructor(reason){super('Character library invalid: '+reason);this.name='CharacterLibraryError';}
}
const invalid=reason=>{throw new CharacterLibraryError(reason);};
function validateDraft(d){
 if(!exact(d,['identity','personality','aspirationId','appearance']))invalid('draft fields');
 const i=d.identity,p=d.personality,a=d.appearance;
 if(!exact(i,['firstName','lastName','lifeStage'])||!name(i.firstName)||!name(i.lastName,true)||i.lifeStage!=='adult')invalid('adult identity');
 if(!exact(p,['schema','traitIds','preferences'])||p.schema!==PROFILE_RULES.schema||
    !exact(p.preferences,['likes','dislikes']))invalid('personality');
 let personality;try{personality=createProfile(p.traitIds,p.preferences);}catch{invalid('personality selection');}
 if(!own(ASPIRATIONS,d.aspirationId))invalid('explicit aspiration');
 // G3A only stores recipe inputs; does not qualify any new visual asset.
 // Three continuous axes are the existing CF lattice. Additional appearance
 // fields are a future versioned contract, not silently discarded.
 if(!exact(a,['sex','axes','outfitId'])||!['female','male'].includes(a.sex)||
    !Array.isArray(a.axes)||a.axes.length!==3||Object.keys(a.axes).length!==3||
    !a.axes.every(v=>Number.isFinite(v)&&v>=-1&&v<=1)||
    typeof a.outfitId!=='string'||!a.outfitId.startsWith(a.sex+'_')||
    !/^[a-z][a-z0-9_]{2,63}$/.test(a.outfitId))invalid('appearance recipe');
 return {identity:{...i},personality,aspirationId:d.aspirationId,
  appearance:{sex:a.sex,axes:[...a.axes],outfitId:a.outfitId}};
}
function populationNext(population){
 if(!population)return 3;
 const n=population.nextResidentSerial;
 if(!Number.isSafeInteger(n)||n<3||n>maxSerial)invalid('population serial');
 return n;
}
/** Strict optional extension. Existing actor IDs cannot also be dormant. */
export function restoreCharacterLibrary(raw,population=null){
 if(!exact(raw,['schema','nextResidentSerial','profilesById'])||raw.schema!==CHARACTER_LIBRARY_SCHEMA||
    !Number.isSafeInteger(raw.nextResidentSerial)||raw.nextResidentSerial<3||
    raw.nextResidentSerial>maxSerial||!record(raw.profilesById))invalid('schema');
 const entries=[];
 for(const [id,p] of Object.entries(raw.profilesById)){
  if(!idPattern.test(id)||serial(id)>=raw.nextResidentSerial||own(population?.residentsById,id)||
     !exact(p,['id','identity','personality','aspirationId','appearance'])||p.id!==id)
    invalid('profile identity or collision');
  const {id:_,...draft}=p;entries.push([id,{id,...validateDraft(draft)}]);
 }
 return {schema:CHARACTER_LIBRARY_SCHEMA,
  nextResidentSerial:Math.max(raw.nextResidentSerial,populationNext(population)),
  profilesById:Object.fromEntries(entries)};
}
/** Read-only projection of independent IDs. Does not fabricate actors. */
export function characterDirectory(root){
 const pop=root?.population,lib=own(root,'characterLibrary')?restoreCharacterLibrary(root.characterLibrary,pop):null;
 const ids=['alex','mira',...Object.keys(pop?.residentsById||{}),...Object.keys(lib?.profilesById||{})];
 return Object.freeze({ids:Object.freeze(ids),getUnassignedProfile:id=>
   own(lib?.profilesById,id)?clone(lib.profilesById[id]):null});
}
/** Build a detached full root-v1 candidate using the existing restore boundary.
 * New profiles never enter population or active subsystems. Failed persistence
 * never consumes a serial. Caller publishes only commit's returned root.
 */
export function proposeCharacterCreation(root,draft,restoreSnapshot){
 if(!record(root)||root.version!==1||typeof restoreSnapshot!=='function')return {ok:false,reason:'invalid-root'};
 try{
  const profile=validateDraft(draft),base=JSON.stringify(root);
  if(!base||base.length>8_000_000)return {ok:false,reason:'snapshot-too-large'};
  const next=JSON.parse(base),pop=next.population;
  const lib=own(next,'characterLibrary')?restoreCharacterLibrary(next.characterLibrary,pop):
   {schema:CHARACTER_LIBRARY_SCHEMA,nextResidentSerial:populationNext(pop),profilesById:{}};
  const n=lib.nextResidentSerial;
  if(n>=maxSerial)return {ok:false,reason:'id-space-exhausted'};
  const id='resident_'+n;
  if(own(pop?.residentsById,id)||own(lib.profilesById,id))invalid('serial collision');
  lib.profilesById[id]={id,...profile};lib.nextResidentSerial=n+1;
  next.characterLibrary=lib;
  const serialized=JSON.stringify(next);
  if(serialized.length>8_000_000)return {ok:false,reason:'snapshot-too-large'};
  const restored=restoreSnapshot(JSON.parse(serialized));
  if(!restored||restored.version!==1||JSON.stringify(restored.characterLibrary)!==JSON.stringify(lib)||
     JSON.stringify(restored.population)!==JSON.stringify(next.population))
   return {ok:false,reason:'preflight-mismatch'};
  return Object.freeze({ok:true,id,base,serialized,root:restored});
 }catch(e){return {ok:false,reason:e instanceof CharacterLibraryError?'invalid-profile':'preflight-failed'};}
}
export function commitCharacterCreation(root,proposal,write){
 return commitPopulationSave(root,proposal,write);
}
