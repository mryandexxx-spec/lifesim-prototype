/** GARDEN-R1: pure bounded per-resident skill rules. Plot/save schema unchanged.
 * ONLY a verified household action completion is permitted to call creditGardenPractice.
 * Canonical watering cooldown, harvestedAt and paid replant are anti-farm guards.
 */
import {getSkillDefinition} from './skill-registry.js';
export const GARDENING_SKILL_ID='gardening';
export const GARDEN_PRACTICE_XP=Object.freeze({water:10,harvest:25,replant:12});
export function gardenSkillBenefits(level=0){
  const safe=Number.isInteger(level)&&level>=0&&level<=10?level:0;
  return Object.freeze({
    hydrationBonusMinutes:safe>=8?360:safe>=3?180:0,
    extraHarvestUnits:safe>=10?2:safe>=6?1:0
  });
}
export function gardenHarvestUnits(level,stock,limit,base=2){
  const capacity=Number.isSafeInteger(stock)&&stock>=0&&
    Number.isSafeInteger(limit)&&limit>=0?Math.max(0,limit-stock):0;
  return Math.min(capacity,base+gardenSkillBenefits(level).extraHarvestUnits);
}
/** Return a new state (or null), with no partial mutations or offline accrual. */
export function creditGardenPractice(progress,registry,actionId,{automatic=false}={}){
  const amount=GARDEN_PRACTICE_XP[actionId];
  const def=getSkillDefinition(registry,GARDENING_SKILL_ID);
  if(automatic||!amount||!def||progress?.schema!==1||
    !progress.xpById||typeof progress.xpById!=='object'||
    Array.isArray(progress.xpById))return null;
  const before=progress.xpById[GARDENING_SKILL_ID]??0;
  if(!Number.isFinite(before)||before<0)return null;
  const after=Math.min(def.xpThresholds.at(-1),before+amount);
  return {progress:{...progress,xpById:{...progress.xpById,
      [GARDENING_SKILL_ID]:after}},gained:after-before};
}
