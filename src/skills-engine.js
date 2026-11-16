/** H0: per-resident XP proposals and atomic session+XP credit; not live-wired. */
import {getSkillDefinition,deriveSkillLevel} from './skill-registry.js';
import {getActivityDefinition} from './activity-registry.js';
import {restoreActivitySession} from './activity-session.js';
export const SKILL_PROGRESS_SCHEMA=1;
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const round=v=>Math.round(v*1000000)/1000000;
export function newSkillProgress(){
  return {schema:SKILL_PROGRESS_SCHEMA,xpById:{}};
}
export function restoreSkillProgress(raw,registry){
  const state=newSkillProgress();
  if(!record(raw)||raw.schema!==SKILL_PROGRESS_SCHEMA||
    !record(raw.xpById))return state;
  for(const [id,xp] of Object.entries(raw.xpById).slice(0,256)){
    const def=getSkillDefinition(registry,id);
    if(!def||!Number.isFinite(xp)||xp<0)continue;
    const cap=def.xpThresholds.at(-1);
    state.xpById[id]=round(Math.min(xp,cap));
  }
  return state;
}
export function currentSkillLevel(progress,registry,id){
  const xp=progress?.xpById?.[id]??0;
  return deriveSkillLevel(registry,id,xp);
}
/** Only credited active-use time can become XP. Both results must be persisted
 * in ONE household state commit, or none. Award watermark blocks re-credit.
 * The caller must verify ownership, reservation, A* arrival and consent.
 */
export function creditActivityPractice(progress,skillRegistry,activityRegistry,session,
  {authorized=false,resourceAvailable=false,content=null}={}){
  if(authorized!==true||resourceAvailable!==true||
    !['using','ready'].includes(session?.phase))return null;
  const checked=restoreActivitySession(activityRegistry,session,content);
  const activity=getActivityDefinition(activityRegistry,session?.activityId);
  if(!checked||!activity||!record(progress)||progress.schema!==SKILL_PROGRESS_SCHEMA||
    !record(progress.xpById))return null;
  const minutes=checked.elapsed-checked.awardedMinutes;
  if(minutes<=0)return null;
  const next=restoreSkillProgress(progress,skillRegistry),changes=[];
  for(const line of activity.skillPractice){
    const def=getSkillDefinition(skillRegistry,line.skillId);
    if(!def)return null;
    const cap=def.xpThresholds.at(-1);
    const before=next.xpById[line.skillId]??0;
    const xp=round(Math.min(cap,before+minutes*line.xpPerMinute));
    next.xpById[line.skillId]=xp;
    changes.push(Object.freeze({skillId:line.skillId,
      delta:round(xp-before),xp,level:deriveSkillLevel(skillRegistry,line.skillId,xp)}));
  }
  return {progress:next,session:{...checked,awardedMinutes:checked.elapsed},
    usedMinutes:minutes,changes};
}
