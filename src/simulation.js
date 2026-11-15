/** Pure game rules: no PlayCanvas or browser imports. */
import { createMind, restoreMind, refreshMind, rememberAction, psychologyScore } from './psychology.js';
import {DEMO_PROFILES,restoreProfile} from './trait-catalog.js';
import {validBedSlot,BED_SLOTS} from './bed-layout.js';
import {FRIDGE_EAT_START,FRIDGE_LAYOUT} from './fridge-interaction.js';
import {SHOWER_LAYOUT,SHOWER_WASH_START,SHOWER_WASH_END} from './shower-interaction.js';
export const NEEDS = ['hunger', 'energy', 'hygiene', 'fun'];
export const ACTIONS = Object.freeze({
  bed: { label: 'Поспать', need: 'energy', duration: 60, benefitPerMinute: 0.74, location: [BED_SLOTS.right.approach.x,BED_SLOTS.right.approach.z] },
  fridge: { label: 'Перекусить', need: 'hunger', duration: 26, benefitPerMinute: 1.65, location: [FRIDGE_LAYOUT.approach.x, FRIDGE_LAYOUT.approach.z] },
  shower: { label: 'Принять душ', need: 'hygiene', duration: 32, benefitPerMinute: 1.48, location: [SHOWER_LAYOUT.approach.x,SHOWER_LAYOUT.approach.z] },
  sofa: { label: 'Отдохнуть', need: 'fun', duration: 42, benefitPerMinute: 0.96, location: [1.35, 0.52] }
});
const DECAY = { hunger: 0.12, energy: 0.085, hygiene: 0.068, fun: 0.094 };
export const SAVE_KEY = 'lifesim.room01.v1';
export const AUTONOMY_WAIT_SECONDS = 12; // Real active-time seconds; x3 never shortens the wait.
const clamp = value => Math.max(0, Math.min(100, value));

export function newGame(profile=DEMO_PROFILES.first) {
  const state = {
    version: 1, minutes: 8 * 60, speed: 1, paused: false,
    needs: { hunger: 78, energy: 67, hygiene: 82, fun: 58 },
    position: { x: -0.25, z: 0.35 }, action: null, event: 'Свободное время',
    autonomy: { nextAt: 480, enabled: true },
    personality:restoreProfile(profile,DEMO_PROFILES.first),
    mind: createMind(480)
  };
  refreshMind(state);
  return state;
}

export function loadGame(data,profileFallback=DEMO_PROFILES.first) {
  if (!data || data.version !== 1 || !Number.isFinite(data.minutes) || !data.needs || !data.position) return newGame(profileFallback);
  const next = newGame(profileFallback);
  next.personality=restoreProfile(data.personality,profileFallback);
  next.minutes = Math.max(0, Math.min(data.minutes, 10000000));
  for (const key of NEEDS) if (Number.isFinite(data.needs[key])) next.needs[key] = clamp(data.needs[key]);
  if (Number.isFinite(data.position.x) && Number.isFinite(data.position.z)) {
    next.position.x = Math.max(-4.5, Math.min(4.5, data.position.x));
    next.position.z = Math.max(-3.7, Math.min(3.7, data.position.z));
  }
  if (Number.isFinite(data.autonomy?.nextAt)) next.autonomy.nextAt = Math.max(0, Math.min(data.autonomy.nextAt, 10000000));
  if (typeof data.autonomy?.enabled === 'boolean') next.autonomy.enabled = data.autonomy.enabled;
  restoreMind(data.mind, next);
  if (data.action && ACTIONS[data.action.id] && ['walking', 'using'].includes(data.action.phase) && (next.autonomy.enabled || !data.action.automatic)) {
    next.action = { id: data.action.id, phase: data.action.phase, elapsed: Math.max(0, Math.min(1000, Number(data.action.elapsed) || 0)), automatic: Boolean(data.action.automatic) };
    if(data.action.id==='bed'&&validBedSlot(data.action.bedSlot))
      next.action.bedSlot=data.action.bedSlot;
  }
  return next;
}

/**
 * Player preference is saved, but the visible wait after reopening is session-local.
 * Disabling autonomy cancels only tasks selected by the simulation, never manual work.
 */
export function setAutonomyEnabled(state, enabled) {
  state.autonomy.enabled = enabled === true;
  if (!state.autonomy.enabled && state.action?.automatic) {
    state.action = null;
    state.event = 'Алекс ждёт указаний';
  }
  return state.autonomy.enabled;
}

/**
 * Pure idle timer. Call once each rendered frame; never accelerate with game.speed.
 * Pausing freezes elapsed time, while an action or disabled autonomy resets it.
 */
export function advanceAutonomyWait(elapsed, seconds, state) {
  const previous = Number.isFinite(elapsed) ? Math.max(0, Math.min(AUTONOMY_WAIT_SECONDS, elapsed)) : 0;
  if (state.paused) return previous;
  if (!state.autonomy?.enabled || state.action) return 0;
  if (!Number.isFinite(seconds) || seconds <= 0) return previous;
  return Math.min(AUTONOMY_WAIT_SECONDS, previous + seconds);
}

export function chooseAction(state, id, automatic = false) {
  if (!ACTIONS[id] || state.action ||
    (automatic && (!state.autonomy.enabled || state.minutes < state.autonomy.nextAt))) return false;
  state.action = { id, phase: 'walking', elapsed: 0, automatic };
  state.event = automatic ? 'Алекс решил: ' + ACTIONS[id].label.toLowerCase() : ACTIONS[id].label;
  return true;
}

export function arrive(state) {
  if (state.action?.phase !== 'walking') return;
  state.action.phase = 'using';
  state.action.elapsed = 0;
}

export function tick(state, minutes) {
  if (state.paused || !Number.isFinite(minutes) || minutes <= 0) return;
  state.minutes += minutes;
  for (const need of NEEDS) state.needs[need] = clamp(state.needs[need] - DECAY[need] * minutes);
  refreshMind(state);
  if (state.action?.phase === 'using') {
    const definition = ACTIONS[state.action.id];
    const amount = Math.min(minutes, Math.max(0, definition.duration - state.action.elapsed));
    // Hunger rises only when eating, not before taking food from the shelf.
    // Preserve the previous total benefit by concentrating it in the bite phase.
    let gained=definition.benefitPerMinute*amount;
    if(state.action.id==='fridge'){
      const eatFrom=definition.duration*FRIDGE_EAT_START;
      const before=Math.max(0,state.action.elapsed-eatFrom);
      const after=Math.max(0,state.action.elapsed+amount-eatFrom);
      gained=definition.benefitPerMinute*(after-before)/(1-FRIDGE_EAT_START);
    }else if(state.action.id==='shower'){
      // Hygiene rises only under the closed privacy mask with the water on.
      const from=definition.duration*SHOWER_WASH_START;
      const to=definition.duration*SHOWER_WASH_END;
      const overlap=Math.max(0,Math.min(state.action.elapsed+amount,to)
        -Math.max(state.action.elapsed,from));
      gained=definition.benefitPerMinute*overlap/(SHOWER_WASH_END-SHOWER_WASH_START);
    }
    state.needs[definition.need] = clamp(state.needs[definition.need] + gained);
    state.action.elapsed += amount;
    if (state.action.elapsed >= definition.duration ||
        (!['fridge','shower'].includes(state.action.id) && state.needs[definition.need] >= 99.9)) {
      state.event = definition.label + ' — готово';
      rememberAction(state, state.action.id);
      state.autonomy.nextAt = state.minutes + 7; // short break between autonomous tasks
      state.action = null;
    }
  }
}

export function autonomousChoice(state) {
  if (state.paused || state.action || !state.autonomy.enabled || state.minutes < state.autonomy.nextAt) return null;
  const hour = Math.floor(state.minutes % 1440 / 60);
  const night = hour >= 22 || hour < 6;
  const critical = Math.min(...NEEDS.map(id => state.needs[id])) < 24;
  const wishReady = !critical && state.minutes >= 540;
  const options = [
    { id: 'fridge', need: 'hunger', threshold: 43, weight: 1.25 },
    { id: 'bed', need: 'energy', threshold: 42, weight: 1.12 },
    { id: 'shower', need: 'hygiene', threshold: 40, weight: 0.95 },
    { id: 'sofa', need: 'fun', threshold: 37, weight: 0.90 }
  ];
  const scored = options.map(option => {
    const value = state.needs[option.need];
    const urgency = Math.max(0, option.threshold - value) * option.weight;
    // Sleep is a physiological priority at night, even if a leisure wish
    // happens to be active. Temperament never overrides basic rest.
    const bedtime = night && option.id === 'bed' && value < 67 ? 10+(67-value)*1.60 : 0;
    const base = urgency + bedtime;
    // No voluntary action at game start: let the player explore for the first hour.
    const eligible = base > 0 || (wishReady && state.mind?.wish?.id === option.id);
    const score = eligible ? base + psychologyScore(state, option.id, wishReady) : 0;
    return { id: option.id, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0].score > 0 ? scored[0].id : null;
}

export function readableTime(minutes) {
  const whole = Math.floor(minutes);
  const day = Math.floor(whole / 1440) + 1;
  const hh = String(Math.floor(whole % 1440 / 60)).padStart(2, '0');
  const mm = String(whole % 60).padStart(2, '0');
  return { day: `День ${day}`, time: `${hh}:${mm}` };
}
