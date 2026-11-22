/**
 * CAS-01.2. Residence, household membership and blood kinship are separate
 * concepts. Immutable in-memory index; no gameplay or save mutation.
 */
import {validPersonId} from './social-graph.js';

export const DEFAULT_FAMILY_ID='family_1';
export const DEFAULT_DWELLING_ID='dwelling_1';
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const membershipId=x=>typeof x==='string'&&/^[a-z][a-z0-9_-]{0,47}$/.test(x);
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);

/**
 * linksByResident: {id:{familyId,dwellingId}}, optional for old Alex/Mira.
 * kinship: explicit {fromId,toId,type:'parent'|'sibling'} only.
 * 'child' is a read-only reverse of 'parent'; same surname/family gives no kin.
 */
export function createResidentMembership(residentIds,linksByResident={},kinship=[]){
  if(!Array.isArray(residentIds)||residentIds.length<1||residentIds.length>4||
    new Set(residentIds).size!==residentIds.length||
    !residentIds.every(validPersonId)||!record(linksByResident)||
    !Array.isArray(kinship))throw new TypeError('Invalid CAS membership');
  const ids=Object.freeze([...residentIds]),people=new Set(ids);
  if(Object.keys(linksByResident).some(id=>!people.has(id)))
    throw new TypeError('Unknown CAS membership resident');
  const links=new Map();
  for(const id of ids){
    const raw=own(linksByResident,id)?linksByResident[id]:null;
    if(raw!==null&&(!record(raw)||!membershipId(raw.familyId)||
      !membershipId(raw.dwellingId)))throw new TypeError('Invalid CAS family or dwelling');
    links.set(id,Object.freeze({
      familyId:raw?.familyId??DEFAULT_FAMILY_ID,
      dwellingId:raw?.dwellingId??DEFAULT_DWELLING_ID
    }));
  }
  const relatives=new Map(),parentEdges=new Map(),edges=[],used=new Set();
  const set=(a,b,type)=>relatives.set(a+'|'+b,type);
  for(const edge of kinship){
    if(!record(edge)||!people.has(edge.fromId)||!people.has(edge.toId)||
      edge.fromId===edge.toId||!['parent','sibling'].includes(edge.type))
      throw new TypeError('Invalid CAS kinship');
    const key=edge.type==='sibling'
      ?'sibling|'+[edge.fromId,edge.toId].sort().join('|')
      :'parent|'+edge.fromId+'|'+edge.toId;
    if(used.has(key)||relatives.has(edge.fromId+'|'+edge.toId)||
      relatives.has(edge.toId+'|'+edge.fromId))
      throw new TypeError('Duplicate or conflicting CAS kinship');
    used.add(key);
    set(edge.fromId,edge.toId,edge.type);
    set(edge.toId,edge.fromId,edge.type==='parent'?'child':'sibling');
    if(edge.type==='parent'){
      const children=parentEdges.get(edge.fromId)||[];
      children.push(edge.toId);parentEdges.set(edge.fromId,children);
    }
    edges.push(Object.freeze({fromId:edge.fromId,toId:edge.toId,type:edge.type}));
  }
  // Prevent contradictory parent/child cycles, including indirect ones.
  const visit=(id,active,done)=>{
    if(active.has(id))throw new TypeError('Cyclic CAS parent kinship');
    if(done.has(id))return;
    active.add(id);
    for(const child of parentEdges.get(id)||[])visit(child,active,done);
    active.delete(id);done.add(id);
  };
  const done=new Set();
  for(const id of ids)visit(id,new Set(),done);
  const membersFor=(dimension,value)=>Object.freeze(
    ids.filter(id=>links.get(id)[dimension]===value));
  const copyLinks=Object.freeze(Object.fromEntries(ids.map(id=>[id,links.get(id)])));
  return Object.freeze({
    ids,linksByResident:copyLinks,kinship:Object.freeze(edges),
    getFamilyId:id=>links.get(id)?.familyId??null,
    getDwellingId:id=>links.get(id)?.dwellingId??null,
    getFamilyResidents:familyId=>membersFor('familyId',familyId),
    getDwellingResidents:dwellingId=>membersFor('dwellingId',dwellingId),
    kinshipBetween:(fromId,toId)=>relatives.get(fromId+'|'+toId)??null
  });
}
