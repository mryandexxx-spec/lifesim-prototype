/** H0: authored activities refer to capabilities, never concrete prefab or actor names. */
import {getSkillDefinition} from './skill-registry.js';
export const ACTIVITY_REGISTRY_SCHEMA=1;
const ID=/^[a-z][a-z0-9._-]{1,79}$/;
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fail=why=>{throw new TypeError('Activity registry: '+why);};
const id=(v,label)=>typeof v==='string'&&ID.test(v)?v:fail('invalid '+label);
const arr=(v,label,n)=>Array.isArray(v)&&v.length<=n?v:fail('invalid '+label);
const kindSet=new Set(['leisure','practice','creative','social']);
const sourceSet=new Set(['item','inventory']);
export function createActivityRegistry({activities=[],skills=null,content=null}={}){
  const result={};
  for(const raw of arr(activities,'activities',256)){
    if(!record(raw))fail('invalid activity');
    const activityId=id(raw.id,'id');
    if(Object.hasOwn(result,activityId))fail('duplicate '+activityId);
    if(typeof raw.label!=='string'||!raw.label.trim())fail('missing label');
    if(!kindSet.has(raw.kind)||!sourceSet.has(raw.source)||
      !['solo','paired'].includes(raw.participation))fail('invalid activity kind/source/participation');
    const capabilities=arr(raw.requiredCapabilities,'capabilities',32)
      .map(value=>id(value,'capability'));
    if(!capabilities.length||new Set(capabilities).size!==capabilities.length)
      fail('missing or duplicate capability');
    const time=raw.timeBudget;
    if(!record(time)||!Number.isFinite(time.minMinutes)||
      !Number.isFinite(time.targetMinutes)||time.minMinutes<=0||
      time.targetMinutes<time.minMinutes||time.targetMinutes>1440)
      fail('invalid timeBudget');
    const contentKind=raw.contentKind==null?null:id(raw.contentKind,'content kind');
    if(contentKind&&(!content||!Array.isArray(content.kinds)||
      !content.kinds.includes(contentKind)))fail('unknown content kind');
    const practice=arr(raw.skillPractice??[],'practice',16).map(line=>{
      if(!record(line)||!getSkillDefinition(skills,line.skillId))fail('unknown skill');
      if(!Number.isFinite(line.xpPerMinute)||line.xpPerMinute<=0||
        line.xpPerMinute>100)fail('invalid XP rate');
      return Object.freeze({skillId:line.skillId,xpPerMinute:line.xpPerMinute});
    });
    if(new Set(practice.map(x=>x.skillId)).size!==practice.length)
      fail('duplicate practice skill');
    const needEffects=arr(raw.needEffects??[],'needs',12).map(effect=>{
      if(!record(effect)||typeof effect.statId!=='string'||
        !/^needs\.[a-z][a-z0-9._-]{0,63}$/.test(effect.statId)||
        !Number.isFinite(effect.perMinute)||Math.abs(effect.perMinute)>100)
        fail('invalid need effect');
      return Object.freeze({statId:effect.statId,perMinute:effect.perMinute});
    });
    if(new Set(needEffects.map(v=>v.statId)).size!==needEffects.length)
      fail('duplicate need effect');
    result[activityId]=Object.freeze({id:activityId,label:raw.label,kind:raw.kind,
      source:raw.source,participation:raw.participation,
      requiredCapabilities:Object.freeze(capabilities),
      timeBudget:Object.freeze({minMinutes:time.minMinutes,targetMinutes:time.targetMinutes}),
      contentKind,skillPractice:Object.freeze(practice),
      needEffects:Object.freeze(needEffects),
      poseKey:raw.poseKey==null?null:id(raw.poseKey,'poseKey'),
      audioCue:raw.audioCue==null?null:id(raw.audioCue,'audioCue')});
  }
  return Object.freeze({schema:ACTIVITY_REGISTRY_SCHEMA,activities:Object.freeze(result)});
}
export function getActivityDefinition(registry,activityId){
  return registry?.schema===ACTIVITY_REGISTRY_SCHEMA&&typeof activityId==='string'&&
    Object.hasOwn(registry.activities||{},activityId)?registry.activities[activityId]:null;
}
export function activityFitsItem(activity,item){
  return activity?.source==='item'&&Array.isArray(activity.requiredCapabilities)&&
    Array.isArray(item?.capabilities)&&
    activity.requiredCapabilities.every(cap=>item.capabilities.includes(cap));
}
export function activitiesForItem(registry,item){
  if(registry?.schema!==ACTIVITY_REGISTRY_SCHEMA)return [];
  return Object.values(registry.activities).filter(activity=>activityFitsItem(activity,item));
}
