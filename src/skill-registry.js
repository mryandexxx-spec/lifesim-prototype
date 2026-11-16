/** H0: immutable skill authoring data. Not attached to household saves yet. */
export const SKILL_REGISTRY_SCHEMA=1;
const ID=/^[a-z][a-z0-9._-]{1,79}$/;
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fail=why=>{throw new TypeError('Skill registry: '+why);};
const validId=(value,label)=>typeof value==='string'&&ID.test(value)?value:fail('invalid '+label);
const array=(value,label,max)=>Array.isArray(value)&&value.length<=max?value:fail('invalid '+label);
export function createSkillRegistry({skills=[]}={}){
  const definitions={};
  for(const raw of array(skills,'skills',128)){
    if(!record(raw))fail('invalid skill');
    const id=validId(raw.id,'skill id');
    if(Object.hasOwn(definitions,id))fail('duplicate skill '+id);
    if(typeof raw.label!=='string'||!raw.label.trim())fail('missing label '+id);
    if(!Number.isSafeInteger(raw.maxLevel)||raw.maxLevel<1||raw.maxLevel>20)
      fail('invalid maxLevel '+id);
    const thresholds=array(raw.xpThresholds,'XP thresholds',20);
    if(thresholds.length!==raw.maxLevel)fail('level threshold count '+id);
    let previous=0;
    for(const threshold of thresholds){
      if(!Number.isFinite(threshold)||threshold<=previous||threshold>100000000)
        fail('invalid XP threshold '+id);
      previous=threshold;
    }
    const tags=array(raw.practiceTags??[],'practice tags',32)
      .map(tag=>validId(tag,'practice tag'));
    if(new Set(tags).size!==tags.length)fail('duplicate practice tag '+id);
    const unlocks=array(raw.unlocks??[],'unlocks',64).map(unlock=>{
      if(!record(unlock))fail('invalid unlock '+id);
      const key=validId(unlock.id,'unlock id');
      if(!Number.isSafeInteger(unlock.minLevel)||unlock.minLevel<1||
        unlock.minLevel>raw.maxLevel)fail('invalid unlock level '+id);
      return Object.freeze({id:key,minLevel:unlock.minLevel});
    });
    if(new Set(unlocks.map(v=>v.id)).size!==unlocks.length)fail('duplicate unlock '+id);
    definitions[id]=Object.freeze({id,label:raw.label,group:validId(raw.group,'group'),
      maxLevel:raw.maxLevel,xpThresholds:Object.freeze([...thresholds]),
      practiceTags:Object.freeze(tags),unlocks:Object.freeze(unlocks)});
  }
  return Object.freeze({schema:SKILL_REGISTRY_SCHEMA,skills:Object.freeze(definitions)});
}
export function getSkillDefinition(registry,id){
  return registry?.schema===SKILL_REGISTRY_SCHEMA&&typeof id==='string'&&
    Object.hasOwn(registry.skills||{},id)?registry.skills[id]:null;
}
export function deriveSkillLevel(registry,id,xp){
  const def=getSkillDefinition(registry,id);
  if(!def||!Number.isFinite(xp)||xp<0)return 0;
  let level=0;
  for(const threshold of def.xpThresholds){
    if(xp<threshold)break;
    level++;
  }
  return level;
}
export function skillUnlocksAtLevel(registry,id,level){
  const def=getSkillDefinition(registry,id);
  if(!def||!Number.isInteger(level)||level<0)return [];
  return def.unlocks.filter(v=>v.minLevel<=Math.min(level,def.maxLevel));
}
