/**
 * Physical + social needs economy: positive 0..100 reserves, per IN-GAME minute.
 * A complete 1x browser second equals 3 in-game minutes (game.js fixed step
 * .30 game min / .10 s). The simulation clock and action durations DO NOT
 * change when tuning consumption: x3 still multiplies all game time equally.
 *
 * Gameplay target (sustained without care, starting at 90):
 * - all six needs remain in the >=75 green zone for at least 300 game minutes
 *   (100 real seconds at 1x, about 8 ordinary object activities).
 * - toilet is the shortest reserve; hygiene and social last longer.
 * - after roughly 800-1400 minutes, several needs should become actionable.
 * Tune this single table with headless multi-hour / full-activity tests.
 */
export const NEED_DECAY_PER_MINUTE=Object.freeze({
  hunger:.030,   // Q3b: 43.20 points / 24 game h
  energy:.041,   // Q3b: 59.04 points / 24 game h while awake
  hygiene:.027,  // Q3b: 38.88 points / 24 game h
  fun:.038,      // Q3b: 54.72 points / 24 game h
  bladder:.037,  // Q3b: 53.28 points / 24 game h
  social:.019    // Q3b: 27.36 points / 24 game h before temperament
});
export const SOCIAL_DECAY_PERSONALITY_SPREAD=.008;
// An uninterrupted nightly sleep is not an accelerated one-hour nap.
export const SLEEP_MIN_MINUTES=420;
export const SLEEP_MAX_MINUTES=540;
export const SLEEP_WAKE_ENERGY=92;
export const SELF_CARE_WISH_MAX_NEED=72;
export const SELF_CARE_REPEAT_COOLDOWN_MINUTES=180;
export const NEED_COMFORT_START=90;
export const NEED_GREEN_BOUNDARY=75;
export const NEED_MINIMUM_COMFORT_MINUTES=300;

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
