/** H0: authorable activity content, distinct from furniture SKU and gift items. */
export const HOBBY_CONTENT_SCHEMA=1;
const ID=/^[a-z][a-z0-9._-]{1,79}$/;
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const valid=(value,label)=>typeof value==='string'&&ID.test(value)
  ?value:(()=>{throw new TypeError('Hobby content: invalid '+label);})();
export function createHobbyContentCatalog({entries=[]}={}){
  if(!Array.isArray(entries)||entries.length>256)
    throw new TypeError('Hobby content: invalid entries');
  const contents={},kinds=new Set();
  for(const entry of entries){
    if(!record(entry))throw new TypeError('Hobby content: invalid entry');
    const id=valid(entry.id,'content id'),kind=valid(entry.kind,'kind');
    if(Object.hasOwn(contents,id))throw new TypeError('Hobby content: duplicate '+id);
    if(typeof entry.label!=='string'||!entry.label.trim())
      throw new TypeError('Hobby content: empty label');
    if(!Number.isSafeInteger(entry.difficulty)||entry.difficulty<1||entry.difficulty>10)
      throw new TypeError('Hobby content: invalid difficulty');
    if(!Array.isArray(entry.tags)||entry.tags.length>24)
      throw new TypeError('Hobby content: invalid tags');
    const tags=entry.tags.map(v=>valid(v,'tag'));
    if(new Set(tags).size!==tags.length)
      throw new TypeError('Hobby content: duplicate tag');
    const skillTags=entry.skillTags??[];
    if(!Array.isArray(skillTags)||skillTags.length>16)
      throw new TypeError('Hobby content: invalid skill tags');
    const skills=skillTags.map(v=>valid(v,'skill tag'));
    if(new Set(skills).size!==skills.length)
      throw new TypeError('Hobby content: duplicate skill tag');
    contents[id]=Object.freeze({id,kind,label:entry.label,difficulty:entry.difficulty,
      tags:Object.freeze(tags),skillTags:Object.freeze(skills)});
    kinds.add(kind);
  }
  return Object.freeze({schema:HOBBY_CONTENT_SCHEMA,
    entries:Object.freeze(contents),kinds:Object.freeze([...kinds].sort())});
}
export function getHobbyContent(catalog,id){
  return catalog?.schema===HOBBY_CONTENT_SCHEMA&&typeof id==='string'&&
    Object.hasOwn(catalog.entries||{},id)?catalog.entries[id]:null;
}
export function contentByKind(catalog,kind){
  if(catalog?.schema!==HOBBY_CONTENT_SCHEMA)return [];
  return Object.values(catalog.entries).filter(entry=>entry.kind===kind);
}
