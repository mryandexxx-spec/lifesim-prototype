import {compatibleFurnitureProduct} from './furniture-products.js';

/**
 * Physical + social needs economy: positive 0..100 reserves, per IN-GAME minute.
 * A complete 1x browser second equals 3 in-game minutes (game.js fixed step
 * .30 game min / .10 s). The simulation clock and action durations DO NOT
 * change when tuning consumption: x3 still multiplies all game time equally.
 *
 * R2 owner target: moderate ongoing care, not perpetual crises (from 90).
 * - all six needs remain >=75 for at least 450 in-game minutes
 *   (150 real seconds at 1x; ordinary activities can fit between care).
 * - bladder is the shortest green reserve; sleep and work still have genuine
 *   costs and rewards, while ordinary free time allows additional stories.
 * - after a full in-game day without any care, several needs need attention.
 * Q3a/R1 headless social diagnostics exclude the actual dialogue UI and are
 * only a lower-bound social stress test, not a runtime social refill target.
 * Tune this single table with headless multi-hour / full-activity tests.
 */
export const NEED_DECAY_PER_MINUTE=Object.freeze({
  hunger:.023,   // R2: 33.12 points / 24 game h
  energy:.028,   // R2: 40.32 points / 24 game h while awake
  hygiene:.020,  // R2: 28.80 points / 24 game h
  fun:.026,      // R2: 37.44 points / 24 game h
  bladder:.030,  // R2: 43.20 points / 24 game h
  social:.016    // R2: 23.04 points / 24 game h before temperament
});
export const SOCIAL_DECAY_PERSONALITY_SPREAD=.008;
// NEEDS-FIX-R1: default sleep lasts 8–9 game hours; only a verified premium
// bed reduces the minimum/maximum. No second need clock or persisted multiplier.
export const SLEEP_MIN_MINUTES=480;
export const SLEEP_MAX_MINUTES=540;
export const SLEEP_WAKE_ENERGY=100;
export const SLEEP_RECOVERY_PER_MINUTE=.19;
export const SLEEP_PREMIUM_PROFILE=Object.freeze({
  minMinutes:360,maxMinutes:450,recoveryPerMinute:.24
});
export const SLEEP_STANDARD_PROFILE=Object.freeze({
  minMinutes:SLEEP_MIN_MINUTES,maxMinutes:SLEEP_MAX_MINUTES,
  recoveryPerMinute:SLEEP_RECOVERY_PER_MINUTE
});
export function sleepBedProfile(world,targetInstanceId=null){
  const items=world?.furniture?.instances;
  const bed=Array.isArray(items)?items.find(item=>
    item.instanceId===targetInstanceId&&item.prefabId==='bed'&&
    item.location==='home'):null;
  const product=bed?compatibleFurnitureProduct('bed',bed.itemDefinitionId):null;
  return product?.sleepQuality==='premium'
    ?SLEEP_PREMIUM_PROFILE:SLEEP_STANDARD_PROFILE;
}
export const SELF_CARE_WISH_MAX_NEED=72;
export const SELF_CARE_REPEAT_COOLDOWN_MINUTES=180;
export const NEED_COMFORT_START=90;
export const NEED_GREEN_BOUNDARY=75;
export const NEED_MINIMUM_COMFORT_MINUTES=450;

/** A simple deterministic balancing probe, never a runtime UI timer.
 * At a constant consumption rate, how long until the next band threshold?
 */
export function minutesUntilNeedThreshold(rate,from=NEED_COMFORT_START,
  threshold=NEED_GREEN_BOUNDARY){
  if(!Number.isFinite(rate)||rate<=0||!Number.isFinite(from)||
    !Number.isFinite(threshold)||from<0||from>100||threshold<0||
    threshold>100)return null;
  return Math.max(0,from-threshold)/rate;
}
