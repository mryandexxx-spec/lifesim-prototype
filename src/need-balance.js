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
  hunger:.035,   // 50.4 points / 24 game h
  energy:.028,   // 40.32 points / 24 game h
  hygiene:.018,  // 25.92 points / 24 game h
  fun:.034,      // 48.96 points / 24 game h
  bladder:.046,  // 66.24 points / 24 game h
  social:.024    // 34.56 points / 24 game h before temperament
});
export const SOCIAL_DECAY_PERSONALITY_SPREAD=.012;
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
