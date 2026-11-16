/** Pure game rules: no PlayCanvas or browser imports. */
import { createMind, restoreMind, refreshMind, rememberAction, psychologyScore } from './psychology.js';
import {DEMO_PROFILES,restoreProfile} from './trait-catalog.js';
import {voluntaryMoodEfficiency} from './mood-action-policy.js';
import {SOCIAL_NEED_INITIAL,SOCIAL_NEED_LEGACY_DEFAULT,socialNeedDecayRate} from './social-need.js';
import {validBedSlot,BED_SLOTS} from './bed-layout.js';
import {FRIDGE_EAT_START,FRIDGE_LAYOUT} from './fridge-interaction.js';
import {SHOWER_LAYOUT,SHOWER_WASH_START,SHOWER_WASH_END} from './shower-interaction.js';
import {TOILET_LAYOUT,TOILET_RELIEF_START,TOILET_RELIEF_END} from './toilet-interaction.js';
import {validFurnitureInstanceId} from './furniture-catalog.js';
import {NEED_DECAY_PER_MINUTE} from './need-balance.js';
import {TV_APPROACH,TV_WATCH_DURATION} from './tv-interaction.js';
import {HOBBY_ACTIVITIES} from './hobby-reading.js';
import {validReadingJourneyAction,finishReadingMinutes} from './reading-journey.js';
import {getActivityDefinition} from './activity-registry.js';
import {preferenceAffinity} from './trait-catalog.js';
export const PHYSICAL_NEEDS = Object.freeze(['hunger','energy','hygiene','fun','bladder']);
export const NEEDS = Object.freeze([...PHYSICAL_NEEDS,'social']);
export const ACTIONS = Object.freeze({
  bed: { label: 'Поспать', need: 'energy', duration: 60, benefitPerMinute: 0.74, location: [BED_SLOTS.right.approach.x,BED_SLOTS.right.approach.z] },
  fridge: { label: 'Перекусить', need: 'hunger', duration: 26, benefitPerMinute: 1.65, location: [FRIDGE_LAYOUT.approach.x, FRIDGE_LAYOUT.approach.z] },
  shower: { label: 'Принять душ', need: 'hygiene', duration: 32, benefitPerMinute: 1.48, location: [SHOWER_LAYOUT.approach.x,SHOWER_LAYOUT.approach.z] },
  sofa: { label: 'Отдохнуть', need: 'fun', duration: 42, benefitPerMinute: 1.16, location: [1.35, 0.52] },
  // F4D: sitting is a real physical activity, not an unearned skill or need bonus.
  seat: { label: 'Посидеть', need: 'fun', duration: 42, benefitPerMinute: 0, location: [0,-1.03] },
  tv: { label: 'Смотреть телевизор', need: 'fun', duration: TV_WATCH_DURATION,
    benefitPerMinute: 1.08, location: [TV_APPROACH.x,TV_APPROACH.z] },
  toilet: { label: 'Сходить в туалет', need: 'bladder', duration: 26,
    benefitPerMinute: 2.7, location: [TOILET_LAYOUT.approach.x,TOILET_LAYOUT.approach.z] },
  // One compatibility bridge for every future item-driven hobby: the true
  // activity, timing and effects are authored in the H0 activity registry.
  hobby: { label: 'Читать книгу', need: 'fun', duration: 36, benefitPerMinute: 1.05,
    location: [0,.92] },
  music: { label: 'Слушать музыку', need: 'fun', duration: 35,
    benefitPerMinute: .94, location: [0,.84] }
});
// Keep consumption rates in one independent balance contract, not duplicated
// across simulation, social personality logic, the HUD or action handlers.
export const BLADDER_LEGACY_DEFAULT=75;
export const SAVE_KEY = 'lifesim.room01.v1';
export const AUTONOMY_WAIT_SECONDS = 12; // Real active-time seconds; x3 never shortens the wait.
const clamp = value => Math.max(0, Math.min(100, value));

export function newGame(profile=DEMO_PROFILES.first) {
  const state = {
    version: 1, minutes: 8 * 60, speed: 1, paused: false,
    needs: { hunger: 78, energy: 67, hygiene: 82, fun: 58, social:SOCIAL_NEED_INITIAL, bladder:76 },
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
  // Missing field in a pre-M3 v1 save is neutral, never a fabricated
  // completed conversation, a reset of progress, or sudden isolation.
  if (!Number.isFinite(data.needs.social)) next.needs.social=SOCIAL_NEED_LEGACY_DEFAULT;
  // M4 is an optional v1 field; don't reset old progress or invent accidents.
  if (!Number.isFinite(data.needs.bladder)) next.needs.bladder=BLADDER_LEGACY_DEFAULT;
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
    if(validFurnitureInstanceId(data.action.targetInstanceId))
      next.action.targetInstanceId=data.action.targetInstanceId;
    // Optional H1 activity metadata. Unknown activities are not restorable.
    if(['hobby','music'].includes(data.action.id)){
      const activity=getActivityDefinition(HOBBY_ACTIVITIES,data.action.activityId);
      if(!activity||activity.source!=='item'||
         (data.action.id==='music')!==activity.requiredCapabilities.includes('music.playback'))next.action=null;
      else{
        next.action.activityId=activity.id;
        if(typeof data.action.contentId==='string')next.action.contentId=data.action.contentId;
      }
    }
    // H1n is additive to the old household-v1 activity. Legacy H1 saves
    // without these optional fields still finish their original standing read.
    if(next.action?.id==='hobby'&&(
      Object.hasOwn(data.action,'readingStage')||
      Object.hasOwn(data.action,'readingSeatInstanceId'))){
      next.action.readingStage=data.action.readingStage;
      next.action.readingSeatInstanceId=data.action.readingSeatInstanceId;
      next.action.readingStepElapsed=data.action.readingStepElapsed;
      if(!validReadingJourneyAction(next.action))next.action=null;
    }
    // Optional F3b reservation. Older v1 TV saves remain standing.
    if(data.action.id==='tv'&&validFurnitureInstanceId(data.action.watchSeatInstanceId))
      next.action.watchSeatInstanceId=data.action.watchSeatInstanceId;
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

export function tick(state, minutes,world=state?.world??null) {
  if (state.paused || !Number.isFinite(minutes) || minutes <= 0) return;
  state.minutes += minutes;
  // Sitting at an actual occupied sofa (resting or watching television)
  // suspends Energy decay while using it; standing TV viewing does NOT.
  const sitting=state.action?.id==='sofa'||
    (state.action?.id==='tv'&&Boolean(state.action.watchSeatInstanceId))||
    (state.action?.id==='hobby'&&state.action.readingStage==='reading'&&
      Boolean(state.action.readingSeatInstanceId));
  const sofaRestMinutes=sitting&&state.action?.phase==='using'
    ?Math.min(minutes,Math.max(0,ACTIONS[state.action.id].duration-state.action.elapsed))
    :0;
  for(const need of PHYSICAL_NEEDS){
    const elapsed=need==='energy'?minutes-sofaRestMinutes:minutes;
    state.needs[need]=clamp(state.needs[need]-NEED_DECAY_PER_MINUTE[need]*elapsed);
  }
  // Social fulfilment changes only on a newly confirmed social receipt.
  const social=Number.isFinite(state.needs.social)?state.needs.social:SOCIAL_NEED_LEGACY_DEFAULT;
  state.needs.social=clamp(social-socialNeedDecayRate(state.personality)*minutes);
  refreshMind(state,world);
  if (state.action?.phase === 'using') {
    const definition = ACTIONS[state.action.id];
    const hobby=['hobby','music'].includes(state.action.id)
      ?getActivityDefinition(HOBBY_ACTIVITIES,state.action.activityId):null;
    if(['hobby','music'].includes(state.action.id)&&!hobby){state.action=null;return;}
    const duration=hobby?.timeBudget.targetMinutes??definition.duration;
    const amount = Math.min(minutes, Math.max(0, duration - state.action.elapsed));
    // Hunger rises only when eating, not before taking food from the shelf.
    // Preserve the previous total benefit by concentrating it in the bite phase.
    let gained=(hobby?.needEffects.find(effect=>effect.statId==='needs.fun')?.perMinute
      ??definition.benefitPerMinute)*amount;
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
    }else if(state.action.id==='toilet'){
      // Real relief only during the privacy-enclosed seated window.
      const from=definition.duration*TOILET_RELIEF_START;
      const to=definition.duration*TOILET_RELIEF_END;
      const overlap=Math.max(0,Math.min(state.action.elapsed+amount,to)
        -Math.max(state.action.elapsed,from));
      gained=definition.benefitPerMinute*overlap/(TOILET_RELIEF_END-TOILET_RELIEF_START);
    }
    // M2 affects enjoyment of optional rest, not animation time, eating,
    // sleep, shower privacy, or promises of physical self-care.
    if(['sofa','tv','hobby'].includes(state.action.id))gained*=voluntaryMoodEfficiency(state,
      {type:'object',actionId:state.action.id});
    // Enjoying books is a taste; literature XP is earned separately by work.
    if(hobby)gained*=1+preferenceAffinity(state.personality,
      state.action.id==='music'?'music':'books')*.12;
    state.needs[definition.need] = clamp(state.needs[definition.need] + gained);
    // All registry-defined additional need deltas apply only in the verified
    // using window. Dancing consumes a little extra energy; passive listening
    // has no extra cost. Walking never runs this branch.
    if(hobby)for(const effect of hobby.needEffects){
      const key=effect.statId.slice('needs.'.length);
      if(key!==definition.need&&Object.hasOwn(state.needs,key))
        state.needs[key]=clamp(state.needs[key]+effect.perMinute*amount);
    }
    refreshMind(state,world);
    state.action.elapsed += amount;
    if (state.action.elapsed >= duration ||
        (!['seat','fridge','shower','toilet','hobby','music'].includes(state.action.id) && state.needs[definition.need] >= 99.9)) {
      // H1n does not complete at the final earned page: the reader still
      // closes the book, rises and returns it to the original shelf.
      const returning=state.action.id==='hobby'&&
        validReadingJourneyAction(state.action)&&finishReadingMinutes(state.action);
      state.event=returning?'Закрывает книгу':(hobby?.label||definition.label)+' — готово';
      rememberAction(state, state.action.id);
      state.autonomy.nextAt = state.minutes + 7;
      if(!returning)state.action=null;
    }
  }
}

export function autonomousChoice(state) {
  if (state.paused || state.action || !state.autonomy.enabled || state.minutes < state.autonomy.nextAt) return null;
  const hour = Math.floor(state.minutes % 1440 / 60);
  const night = hour >= 22 || hour < 6;
  const critical = Math.min(...PHYSICAL_NEEDS.map(id => state.needs[id])) < 24;
  // A lonely resident may still take care of basic needs or seek a real
  // social interaction; there is deliberately no imaginary 'social sofa'.
  const wishReady = !critical && state.minutes >= 540;
  const options = [
    { id: 'fridge', need: 'hunger', threshold: 43, weight: 1.25 },
    { id: 'bed', need: 'energy', threshold: 42, weight: 1.12 },
    { id: 'shower', need: 'hygiene', threshold: 40, weight: 0.95 },
    { id: 'toilet', need: 'bladder', threshold: 53, weight: 1.67 },
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
