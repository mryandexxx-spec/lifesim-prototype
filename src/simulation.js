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
import {validOutdoorId} from './outdoor-catalog.js';
import {NEED_DECAY_PER_MINUTE,SLEEP_MIN_MINUTES,SLEEP_MAX_MINUTES,SLEEP_WAKE_ENERGY,
  SELF_CARE_WISH_MAX_NEED,SELF_CARE_REPEAT_COOLDOWN_MINUTES} from './need-balance.js';
import {insideLot} from './lot-surface.js';
import {sanitizeSwimAction} from './pool-swim-runtime.js';
import {GARDEN_ACTIONS,GARDEN_DURATION} from './gardening.js';
import {TV_APPROACH,TV_WATCH_DURATION} from './tv-interaction.js';
import {HOBBY_ACTIVITIES} from './hobby-reading.js';
import {kitchenRecipe} from './kitchen.js';
import {validReadingJourneyAction,finishReadingMinutes} from './reading-journey.js';
import {getActivityDefinition} from './activity-registry.js';
import {preferenceAffinity} from './trait-catalog.js';
export const PHYSICAL_NEEDS = Object.freeze(['hunger','energy','hygiene','fun','bladder']);
export const NEEDS = Object.freeze([...PHYSICAL_NEEDS,'social']);
export const ACTIONS = Object.freeze({
  swim: {label:'Плавать в бассейне',need:'fun',duration:45,
    benefitPerMinute:0,location:[0,0]},
  bed: { label: 'Поспать', need: 'energy', duration: SLEEP_MAX_MINUTES, benefitPerMinute: 0.102, location: [BED_SLOTS.right.approach.x,BED_SLOTS.right.approach.z] },
  fridge: { label: 'Быстро перекусить', need: 'hunger', duration: 26, benefitPerMinute: 0.68, location: [FRIDGE_LAYOUT.approach.x, FRIDGE_LAYOUT.approach.z] },
  shower: { label: 'Принять душ', need: 'hygiene', duration: 32, benefitPerMinute: 1.27, location: [SHOWER_LAYOUT.approach.x,SHOWER_LAYOUT.approach.z] },
  sofa: { label: 'Отдохнуть', need: 'fun', duration: 42, benefitPerMinute: 1.16, location: [1.35, 0.52] },
  // F4D: sitting is a real physical activity, not an unearned skill or need bonus.
  seat: { label: 'Посидеть', need: 'fun', duration: 42, benefitPerMinute: 0, location: [0,-1.03] },
  // LOT-B3: real timed outdoors leisure, never a grant for merely owning furniture.
  garden: {label:'Уход за садом',need:'fun',duration:15,benefitPerMinute:0,location:[0,0]},
  bench: {label:'Отдохнуть на садовой скамейке',need:'fun',duration:42,
    benefitPerMinute:.74,location:[0,0]},
  // F4F: a real fridge-to-purchased-chair dining journey; hunger only during bites.
  dining: { label:'Пообедать за столом',need:'hunger',duration:31,
    benefitPerMinute:1.00,location:[0,-1.5] },
  // F4G: cooking never directly feeds or rewards skills in the generic tick.
  cook: {label:'Приготовить блюдо',need:'fun',duration:32,
    benefitPerMinute:0,location:[0,-1.08]},
  prep: {label:'Осмотреть рабочую поверхность',need:'fun',duration:12,
    benefitPerMinute:0,location:[0,-1.04]},
  wash: {label:'Вымыть посуду',need:'fun',duration:14,
    benefitPerMinute:0,location:[0,-1.05]},
  // F4E: actual nearby utility interactions, no fictional need/XP boosts.
  lamp: { label:'Переключить свет',need:'fun',duration:5,benefitPerMinute:0,location:[0,-.90] },
  mirror: { label:'Причесаться у зеркала',need:'fun',duration:17,benefitPerMinute:0,location:[0,-.88] },
  dresser: { label:'Осмотреть комод',need:'fun',duration:16,benefitPerMinute:0,location:[0,-1.06] },
  wardrobe: { label:'Разобрать гардероб',need:'fun',duration:22,benefitPerMinute:0,location:[0,-1.20] },
  tv: { label: 'Смотреть телевизор', need: 'fun', duration: TV_WATCH_DURATION,
    benefitPerMinute: 1.08, location: [TV_APPROACH.x,TV_APPROACH.z] },
  toilet: { label: 'Сходить в туалет', need: 'bladder', duration: 26,
    benefitPerMinute: 1.2, location: [TOILET_LAYOUT.approach.x,TOILET_LAYOUT.approach.z] },
  // One compatibility bridge for every future item-driven hobby: the true
  // activity, timing and effects are authored in the H0 activity registry.
  hobby: { label: 'Читать книгу', need: 'fun', duration: 36, benefitPerMinute: 1.05,
    location: [0,.92] },
  paint: { label:'Рисовать картину',need:'fun',duration:45,benefitPerMinute:.82,
    location:[0,-1.00] },
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
    needs: { hunger: 82, energy: 85, hygiene: 80, fun: 76, social:SOCIAL_NEED_INITIAL, bladder:82 },
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
    next.position.x = Math.max(-8.73, Math.min(22.73, data.position.x));
    next.position.z = Math.max(-11.73, Math.min(11.73, data.position.z));
  }
  if (Number.isFinite(data.autonomy?.nextAt)) next.autonomy.nextAt = Math.max(0, Math.min(data.autonomy.nextAt, 10000000));
  if (typeof data.autonomy?.enabled === 'boolean') next.autonomy.enabled = data.autonomy.enabled;
  restoreMind(data.mind, next);
  if(data.action?.id==='move'&&data.action.phase==='walking'&&
    data.action.automatic===false&&insideLot(data.action.goal?.x,data.action.goal?.z)){
    next.action={id:'move',phase:'walking',automatic:false,elapsed:0,
      goal:{x:data.action.goal.x,z:data.action.goal.z}};
  }else if (data.action && ACTIONS[data.action.id] && ['walking', 'using'].includes(data.action.phase) && (next.autonomy.enabled || !data.action.automatic)) {
    next.action = { id: data.action.id, phase: data.action.phase, elapsed: Math.max(0, Math.min(1000, Number(data.action.elapsed) || 0)), automatic: Boolean(data.action.automatic) };
    if(data.action.id==='dining'){
      if(validFurnitureInstanceId(data.action.diningSeatInstanceId)&&
        ['toFridge','taking','toSeat','eating'].includes(data.action.diningStage)){
        next.action.diningSeatInstanceId=data.action.diningSeatInstanceId;
        next.action.diningStage=data.action.diningStage;
        if((next.action.phase==='using')!==['taking','eating'].includes(data.action.diningStage))
          next.action=null;
      }else next.action=null;
    }
    if(next.action&&data.action.id==='dining'&&kitchenRecipe(data.action.selectedRecipeId))
      next.action.selectedRecipeId=data.action.selectedRecipeId;
    if(next.action&&data.action.id==='dining'&&
      data.action.portionTaken===true&&kitchenRecipe(data.action.cookedRecipeId)){
      next.action.portionTaken=true;
      next.action.cookedRecipeId=data.action.cookedRecipeId;
    }
    // Kitchen journey is optional in the v1 save; malformed/stale state never
    // grants a dish, XP or phantom resources when restored.
    if(next.action&&data.action.id==='cook'){
      if(!kitchenRecipe(data.action.recipeId)||
        !validFurnitureInstanceId(data.action.prepInstanceId)||
        !['toFridge','taking','toPrep','preparing','toStove','cooking','toFridgeStore','storing']
          .includes(data.action.cookStage)||
        (data.action.phase==='using')!==
          ['taking','preparing','cooking','storing'].includes(data.action.cookStage))
        next.action=null;
      else{
        next.action.recipeId=data.action.recipeId;
        next.action.prepInstanceId=data.action.prepInstanceId;
        next.action.cookStage=data.action.cookStage;
      }
    }
    if(next.action&&data.action.id==='lamp'&&data.action.lampSwitched===true)
      next.action.lampSwitched=true;
    if(data.action.id==='bed'&&validBedSlot(data.action.bedSlot))
      next.action.bedSlot=data.action.bedSlot;
    if(next.action&&data.action.id==='garden'){
      if(!validOutdoorId(data.action.targetInstanceId)||
         !GARDEN_ACTIONS.includes(data.action.gardenActionId)||
         !insideLot(data.action.gardenGoal?.x,data.action.gardenGoal?.z)||
         !Number.isFinite(data.action.elapsed)||
         data.action.elapsed<0||data.action.elapsed>=
           GARDEN_DURATION[data.action.gardenActionId])next.action=null;
      else{
        next.action.gardenActionId=data.action.gardenActionId;
        next.action.gardenGoal={x:data.action.gardenGoal.x,z:data.action.gardenGoal.z};
        if(Number.isFinite(data.action.gardenPlantedAt)&&
          data.action.gardenPlantedAt>=0&&data.action.gardenPlantedAt<=next.minutes)
          next.action.gardenPlantedAt=data.action.gardenPlantedAt;
      }
    }
    if(validFurnitureInstanceId(data.action.targetInstanceId)||
       (['bench','garden'].includes(data.action.id)&&validOutdoorId(data.action.targetInstanceId)))
      next.action.targetInstanceId=data.action.targetInstanceId;
    if(['bench','garden'].includes(data.action.id)&&!validOutdoorId(data.action.targetInstanceId))
      next.action=null;
    // Optional H1 activity metadata. Unknown activities are not restorable.
    if(['hobby','music','paint'].includes(data.action.id)){
      const activity=getActivityDefinition(HOBBY_ACTIVITIES,data.action.activityId);
      if(!activity||activity.source!=='item'||
         (data.action.id==='music')!==activity.requiredCapabilities.includes('music.playback')||
         (data.action.id==='paint')!==activity.requiredCapabilities.includes('art.paint'))next.action=null;
      else{
        next.action.activityId=activity.id;
        if(typeof data.action.contentId==='string')next.action.contentId=data.action.contentId;
        if(data.action.id==='hobby'&&
          typeof data.action.inventoryItemId==='string'&&
          /^[am][0-9]{1,8}$/.test(data.action.inventoryItemId))
          next.action.inventoryItemId=data.action.inventoryItemId;
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
  if(data.action?.id==='swim')next.action=sanitizeSwimAction(data.action);
  return next;
}

/**
 * Player preference is saved, but the visible wait after reopening is session-local.
 * Disabling autonomy cancels only tasks selected by the simulation, never manual work.
 */
export function setAutonomyEnabled(state, enabled) {
  state.autonomy.enabled = enabled === true;
  if (!state.autonomy.enabled && state.action?.automatic) {
    if(state.action.id==='swim'){
      state.action.exitRequested='autonomy-off';
      return state.autonomy.enabled;
    }
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
    (state.action?.id==='bench'&&state.action.phase==='using')||
    (state.action?.id==='dining'&&state.action.phase==='using'&&state.action.diningStage==='eating')||
    (state.action?.id==='tv'&&Boolean(state.action.watchSeatInstanceId))||
    (state.action?.id==='hobby'&&state.action.readingStage==='reading'&&
      Boolean(state.action.readingSeatInstanceId));
  const sofaRestMinutes=sitting&&state.action?.phase==='using'
    ?Math.min(minutes,Math.max(0,ACTIONS[state.action.id].duration-state.action.elapsed))
    :0;
  // Q3b: sleep is restorative for 7–9 hours. At or after seven hours,
  // wake once Energy reaches 92; always wake at nine hours. Account for an
  // oversized tick without granting sleep beyond the natural wake boundary.
  const sleeping=state.action?.id==='bed'&&state.action.phase==='using';
  const sleepElapsed=sleeping?state.action.elapsed:0;
  const untilWake=sleeping?Math.max(0,Math.min(SLEEP_MAX_MINUTES-sleepElapsed,
    Math.max(SLEEP_MIN_MINUTES-sleepElapsed,
      (SLEEP_WAKE_ENERGY-state.needs.energy)/ACTIONS.bed.benefitPerMinute))):0;
  const sleepMinutes=Math.min(minutes,untilWake);
  for(const need of PHYSICAL_NEEDS){
    const elapsed=need==='energy'?Math.max(0,minutes-sofaRestMinutes-sleepMinutes):minutes;
    if(need==='energy'&&sleeping){
      // Credit sleep first, then spend ONLY genuinely awake leftover minutes.
      // Capping after the combined amount would create free Energy on big ticks.
      const restored=clamp(state.needs.energy+ACTIONS.bed.benefitPerMinute*sleepMinutes);
      state.needs.energy=clamp(restored-NEED_DECAY_PER_MINUTE.energy*elapsed);
    }else state.needs[need]=clamp(state.needs[need]-NEED_DECAY_PER_MINUTE[need]*elapsed);
  }
  // Social fulfilment changes only on a newly confirmed social receipt.
  const social=Number.isFinite(state.needs.social)?state.needs.social:SOCIAL_NEED_LEGACY_DEFAULT;
  state.needs.social=clamp(social-socialNeedDecayRate(state.personality)*minutes);
  refreshMind(state,world);
  // LOT-D2b swim stages and rewards are settled on the single household clock.
  if(state.action?.id==='swim')return;
  if (state.action?.phase === 'using') {
    const definition = ACTIONS[state.action.id];
    // F4G: three physical kitchen stages. No hunger rewards while cooking,
    // walking or preparing. Completion is committed atomically by household.
    if(state.action.id==='cook'){
      const stage=state.action.cookStage;
      const recipe=kitchenRecipe(state.action.recipeId);
      const budget=stage==='taking'?5:stage==='preparing'?8:
        stage==='cooking'?recipe?.cookMinutes:stage==='storing'?6:0;
      if(!budget){state.action=null;return;}
      state.action.elapsed+=Math.min(minutes,Math.max(0,budget-state.action.elapsed));
      if(state.action.elapsed>=budget){
        if(stage==='storing'){
          state.event='Убрал готовое блюдо в холодильник';
          rememberAction(state,'cook');
          state.autonomy.nextAt=state.minutes+7;
          state.action=null;
        }else{
          state.action.phase='walking';
          state.action.cookStage=stage==='taking'?'toPrep':
            stage==='preparing'?'toStove':'toFridgeStore';
          state.action.elapsed=0;
          state.event=stage==='taking'?'Несёт продукты к столешнице':
            stage==='preparing'?'Идёт к плите':'Несёт приготовленное в холодильник';
        }
      }
      return;
    }
    // F4F: collect a real portion at the fridge before walking to the chair.
    // No hunger reward during collection or transit.
    if(state.action.id==='dining'&&state.action.diningStage==='taking'){
      state.action.elapsed+=Math.min(minutes,Math.max(0,6-state.action.elapsed));
      if(state.action.elapsed>=6){
        state.action.phase='walking';state.action.diningStage='toSeat';
        state.action.elapsed=0;state.event='Несёт еду к обеденному столу';
      }
      return;
    }
    const hobby=['hobby','music','paint'].includes(state.action.id)
      ?getActivityDefinition(HOBBY_ACTIVITIES,state.action.activityId):null;
    if(['hobby','music'].includes(state.action.id)&&!hobby){state.action=null;return;}
    const duration=state.action.id==='garden'
      ?(GARDEN_DURATION[state.action.gardenActionId]??definition.duration):hobby?.timeBudget.targetMinutes??definition.duration;
    const amount = state.action.id==='bed'?sleepMinutes:
      Math.min(minutes, Math.max(0, duration - state.action.elapsed));
    // Hunger rises only when eating, not before taking food from the shelf.
    // Preserve the previous total benefit by concentrating it in the bite phase.
    let gained=(state.action.id==='bed'?0:
      (hobby?.needEffects.find(effect=>effect.statId==='needs.fun')?.perMinute
        ??definition.benefitPerMinute))*amount;
    if(state.action.id==='dining'&&state.action.portionTaken===true){
      const cooked=kitchenRecipe(state.action.cookedRecipeId);
      if(cooked)gained*=cooked.hungerFactor;
    }
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
    if(['sofa','tv','hobby','bench'].includes(state.action.id))gained*=voluntaryMoodEfficiency(state,
      {type:'object',actionId:state.action.id});
    // Enjoying books is a taste; literature XP is earned separately by work.
    if(hobby)gained*=1+preferenceAffinity(state.personality,
      state.action.id==='music'?'music':state.action.id==='paint'?'art':'books')*.12;
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
    const sleepWoke=sleeping&&sleepMinutes>=untilWake-1e-8;
    if (state.action.elapsed >= duration || sleepWoke ||
        (!['bed','seat','bench','dining','cook','prep','wash','lamp','mirror','dresser','wardrobe','fridge','shower','toilet','hobby','music','paint','garden'].includes(state.action.id) && state.needs[definition.need] >= 99.9)) {
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
  const night = hour >= 21 || hour < 6;
  const critical = Math.min(...PHYSICAL_NEEDS.map(id => state.needs[id])) < 24;
  // A lonely resident may still take care of basic needs or seek a real
  // social interaction; there is deliberately no imaginary 'social sofa'.
  const wishReady = !critical && state.minutes >= 540;
  const options = [
    { id: 'fridge', need: 'hunger', threshold: 55, weight: 1.25 },
    { id: 'bed', need: 'energy', threshold: 42, weight: 1.12 },
    { id: 'shower', need: 'hygiene', threshold: 58, weight: 0.95 },
    { id: 'toilet', need: 'bladder', threshold: 50, weight: 1.67 },
    { id: 'sofa', need: 'fun', threshold: 55, weight: 0.90 }
  ];
  const scored = options.map(option => {
    const value = state.needs[option.need];
    const urgency = Math.max(0, option.threshold - value) * option.weight;
    // Sleep is a physiological priority at night, even if a leisure wish
    // happens to be active. Temperament never overrides basic rest.
    const bedtime = night && option.id === 'bed' && value < 70 ? 10+(70-value)*1.60 : 0;
    const exhaustion=option.id==='bed'&&value<16?12:0;
    const base = urgency + bedtime + exhaustion;
    // No voluntary action at game start: let the player explore for the first hour.
    const recovery=state.workRecovery?.until>state.minutes&&
      ((option.id==='bed'&&value<45)||(option.id==='sofa'&&value<40));
    // Wishes never force repetitive green-zone self-care. Memories are
    // canonical save-v1 receipts, so cooldown survives reload without a new field.
    const urgent=value<24||(option.id==='bed'&&night&&value<42);
    const recent=(state.mind?.memories||[]).some(memory=>
      memory.id===option.id&&state.minutes-memory.at>=0&&
      state.minutes-memory.at<SELF_CARE_REPEAT_COOLDOWN_MINUTES);
    const wish=wishReady&&value<SELF_CARE_WISH_MAX_NEED&&
      state.mind?.wish?.id===option.id;
    const eligible=(base>0||recovery||wish)&&(!recent||urgent);
    const score=eligible ? base + psychologyScore(state,option.id,wishReady) : 0;
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
