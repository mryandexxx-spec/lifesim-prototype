/** Headless LifeSim personality, emotions, wishes and event memory. No DOM, engine or I/O. */
import {deriveAxes,preferenceAffinity} from './trait-catalog.js';
import {activityReceipt} from './sim-events.js';
import {environmentSnapshot,ENVIRONMENT_MOOD_LIMIT} from './environment-effects.js';
import {feelMemory,pruneEmotions,restoreEmotions,emotionMoodImpact,memoryEmotionKey,visibleEmotions} from './emotion-engine.js';
/** Deprecated public snapshot retained for older test/API consumers; gameplay uses per-resident profiles. */
export const TRAITS = Object.freeze({
  neat: { label: 'Аккуратный', description: 'Любит чистоту и порядок', value: 0.82 },
  cozy: { label: 'Ценит уют', description: 'Любит спокойные вечера и комфорт', value: 0.73 },
  curious: { label: 'Любознательный', description: 'Предпочитает развлечения и новые впечатления', value: 0.78 }
});
export const WISHES = Object.freeze({
  bed: { label: 'Хорошенько выспаться', symbol: '☾' },
  fridge: { label: 'Вкусно перекусить', symbol: '◕' },
  shower: { label: 'Освежиться в душе', symbol: '✧' },
  sofa: { label: 'Устроить уютный отдых', symbol: '♫' }
});
export const MEMORY_TEXT = Object.freeze({
  bed: 'Выспался и набрался сил',
  fridge: 'Вкусно перекусил',
  shower: 'Порадовался свежести после душа',
  toilet: 'Почувствовал облегчение',
  sofa: 'Приятно отдохнул на диване',
  talk: 'Поговорил(а) с соседом',
  argue: 'Поспорил(а) с соседом', // compatibility: existing v1 saves
  regret: 'Сожалеет о споре',
  hurt: 'Обида после спора',
  reconcile: 'Помирились после спора',
  'gift.given':'Подарил(а) вещь другому жителю',
  'gift.liked':'Получил(а) приятный подарок',
  'gift.neutral':'Вежливо принял(а) подарок',
  'gift.rejected':'Подарок не приняли',
  'gift.refused':'Отказался(ась) от подарка',
  'leisure.music':'Послушали музыку вместе',
  'leisure.books':'Вместе читали и обсуждали книги',
  'leisure.games':'Играли вместе',
  'leisure.refused':'Совместный досуг не сложился',
  'work.pride':'Гордится решением на работе',
  'work.pressure':'Переживает напряжённую смену',
  'work.relief':'Нашёл спокойный выход из рабочей ситуации',
  'worklife.success':'Гордится удачной сменой',
  'worklife.exhaustedPride':'Успешно поработал, но сильно устал',
  'worklife.hard':'Переживает трудный рабочий день',
  'worklife.hardStrain':'Перенапрягся на сложной смене',
  'worklife.overloaded':'Устал от сильной нагрузки',
  'worklife.missed':'Сожалеет о пропущенной смене',
  'worklife.warning':'Переживает из-за рабочего предупреждения',
  'worklife.finalWarning':'Тревожится после последнего предупреждения',
  'worklife.dismissal':'Расстроен увольнением',
  'worklife.promotion':'Радуется повышению',
  'worklife.resignation':'Волнуется после смены работы',
  'worklife.sharedInterrupted':'Жалеет о прерванном совместном отдыхе',
  'worklife.sharedDisappointed':'Огорчился из-за прерванного совместного отдыха'
});
const IDS = Object.keys(WISHES);
const LIMIT = 12;
const finite = n => Number.isFinite(n);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const axesFor = state => deriveAxes(state?.personality);

/** Only known item IDs and timestamps enter saved memories. */
export function createMind(minutes = 480) {
  return {
    memories: [],
    emotions: [],
    wish: { id: 'sofa', since: minutes, until: minutes + 480 },
    mood: { value: 70, label: 'Спокоен' }
  };
}

const isWorkMemory=id=>typeof id==='string'&&
  (id.startsWith('work.')||id.startsWith('worklife.'));
export function recentMemoryEffect(mind, minutes, excluded=new Set(),scope='all') {
  return (mind.memories || []).reduce((sum, memory) => {
    if(excluded.has(memoryEmotionKey(memory))||
      (scope==='work'&&!isWorkMemory(memory.id))||
      (scope==='other'&&isWorkMemory(memory.id)))return sum;
    const elapsed = clamp(minutes - memory.at, 0, 10000000);
    const strength = Math.max(0, 1 - elapsed / 360);
    // Identical social event, different memories: the initiator regrets
    // starting a quarrel, while their partner feels hurt. Old saved
    // 'argue' events keep their original effect; reconciliation heals.
    const socialEffect={argue:-18,regret:-13,hurt:-22,talk:11,reconcile:18,
      'gift.given':7,'gift.liked':14,'gift.neutral':5,'gift.rejected':-9,
      'gift.refused':-5,'leisure.music':11,'leisure.books':11,
      'leisure.games':11,'leisure.refused':-5,
      'work.pride':8,'work.pressure':-7,'work.relief':4,
      'worklife.success':7,'worklife.exhaustedPride':2,
      'worklife.hard':-8,'worklife.hardStrain':-10,
      'worklife.overloaded':-5,'worklife.missed':-9,
      'worklife.warning':-6,'worklife.finalWarning':-10,
      'worklife.dismissal':-14,'worklife.promotion':11,
      'worklife.resignation':-3,'worklife.sharedInterrupted':-6,
      'worklife.sharedDisappointed':-4};
    const effect=Object.hasOwn(socialEffect,memory.id)
      ?socialEffect[memory.id]:memory.fulfilled?12:5;
    return sum+effect*strength;
  }, 0);
}

/** Mood is a derived snapshot, never trusted from localStorage. */
export function calculateMood(needs, mind, minutes, personality = null,environment=0,workContext=0) {
  const values = [needs.hunger, needs.energy, needs.hygiene, needs.fun,
    needs.social,needs.bladder].map((x,i) => clamp(finite(x) ? x : i>=4?75:50, 0, 100));
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const worst = Math.min(...values);
  const axes=deriveAxes(personality);
  const weights=[.5+axes.creativity*.3+axes.sociability*.1,.5+axes.organization*.4,.5+axes.resilience*.4];
  const comfort=(needs.fun*weights[0]+needs.hygiene*weights[1]+needs.energy*weights[2])/
    weights.reduce((a,b)=>a+b,0);
  // Divide the ONE existing emotion engine's outputs by source before capping
  // work. A strong family event must not be erased by an unrelated work cap.
  const entries=Array.isArray(mind?.emotions)?mind.emotions:[];
  const worker=emotionMoodImpact({...mind,emotions:entries.filter(e=>isWorkMemory(e.source))},minutes);
  const personal=emotionMoodImpact({...mind,emotions:entries.filter(e=>!isWorkMemory(e.source))},minutes);
  const work=clamp(recentMemoryEffect(mind,minutes,worker.covered,'work')+
    worker.delta,-14,12);
  const everyday=recentMemoryEffect(mind,minutes,personal.covered,'other')+personal.delta;
  const memories=(work+everyday)*(.75+axes.emotionalReactivity*.8);
  const optimism=(axes.optimism-.5)*14;
  const score=clamp(Math.round(20+average*.48+comfort*.27+
    clamp(memories,-24,17)+optimism-(worst<25?(25-worst)*.8:0)+
    clamp(finite(environment)?environment:0,-ENVIRONMENT_MOOD_LIMIT,ENVIRONMENT_MOOD_LIMIT)+
    clamp(finite(workContext)?workContext:0,-5,5)),0,100);
  let label = 'Спокоен';
  if (worst < 20) {
    const lowest = values.indexOf(worst);
    label = ['Очень голоден', 'Измотан', 'Не в духе', 'Скучает','Одиноко','Срочно в туалет'][lowest];
  } else if (score >= 83) label = 'Вдохновлён';
  else if (score >= 68) label = 'Доволен';
  else if (score < 40) label = 'Подавлен';
  else if (score < 56) label = 'Не в настроении';
  // Extreme needs stay readable. Otherwise a strong recent feeling explains
  // the mood without changing the legacy 0–100 score's meaning.
  if(worst>=20){
    const primary=visibleEmotions(mind,minutes,personality)[0];
    if(primary&&primary.intensity>=25)label=primary.label;
  }
  return { value: score, label };
}

/** Deterministic wish generation, allowing identical saves to produce identical behavior. */
export function selectWish(state, except = null) {
  const n = state.needs;
  const axes=axesFor(state),taste=tag=>preferenceAffinity(state.personality,tag);
  const hour = Math.floor((state.minutes % 1440) / 60);
  const night = hour >= 22 || hour < 6;
  const weights = {
    bed: 18+10*axes.resilience+(100-n.energy)*.16+(night?13:0)+taste('calm_leisure')*3,
    fridge: 15+(100-n.hunger)*.20+taste('cooking')*4,
    shower: 18+12*axes.organization+(100-n.hygiene)*.16,
    sofa: 22+10*axes.creativity+8*axes.sociability+(100-n.fun)*.17+
      taste('calm_leisure')*5+taste('socializing')*2
  };
  for (const memory of (state.mind?.memories || []).slice(-4)) {
    if (weights[memory.id]!==undefined && state.minutes - memory.at < 180) weights[memory.id] -= 8;
  }
  if (except && weights[except] !== undefined) weights[except] -= 22;
  return IDS.slice().sort((a, b) => weights[b] - weights[a] || IDS.indexOf(a) - IDS.indexOf(b))[0];
}

export function refreshMind(state,world=state?.world??null) {
  if (!state.mind || typeof state.mind !== 'object') state.mind = createMind(state.minutes);
  pruneEmotions(state.mind,state.minutes);
  if (!state.mind.wish || state.minutes >= state.mind.wish.until) {
    const id = selectWish(state);
    state.mind.wish = { id, since: state.minutes, until: state.minutes + 480 };
  }
  state.mind.mood = calculateMood(state.needs, state.mind, state.minutes,
    state.personality,environmentSnapshot(state,world).delta,state.workMoodContext??0);
}

export function rememberAction(state, id) {
  const receipt=activityReceipt(id,state.minutes);
  // Toilet is completed essential care, not a frivolous generated wish.
  // Still allow its actual completion memory, never auto-create a wish.
  if (!receipt || (!WISHES[receipt.actionId]&&receipt.actionId!=='toilet')) return;
  const mind = state.mind;
  const fulfilled = mind.wish?.id === id;
  const memory={ id, at: state.minutes, fulfilled };
  mind.memories.push(memory);
  mind.memories = mind.memories.slice(-LIMIT);
  feelMemory(state,memory);
  if (fulfilled) {
    const next = selectWish(state, id);
    mind.wish = { id: next, since: state.minutes, until: state.minutes + 480 };
  }
  refreshMind(state);
}

/** Saving invalid or foreign mind data may never crash the game or inject UI strings. */
export function restoreMind(raw, state) {
  const mind = createMind(state.minutes);
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    if (Array.isArray(raw.memories)) {
      mind.memories = raw.memories.filter(m => m && typeof m === 'object' &&
        Object.hasOwn(MEMORY_TEXT,m.id) && finite(m.at) && m.at >= 0 && m.at <= state.minutes
      ).slice(-LIMIT).map(m => ({ id: m.id, at: m.at, fulfilled: m.fulfilled === true }));
    }
    if (raw.wish && typeof raw.wish === 'object' && IDS.includes(raw.wish.id) &&
      finite(raw.wish.since) && finite(raw.wish.until) && raw.wish.since >= 0 &&
      raw.wish.since <= state.minutes && raw.wish.until > state.minutes &&
      raw.wish.until <= state.minutes + 480) {
      mind.wish = { id: raw.wish.id, since: raw.wish.since, until: raw.wish.until };
    } else if (mind.memories.length) {
      mind.wish = null; // regenerate against recent history
    }
  }
  mind.emotions=restoreEmotions(raw,mind.memories,state.minutes,state.personality);
  state.mind = mind;
  refreshMind(state);
  return mind;
}

/** Utility modifier used only when there is a legitimate base need or mature wish. */
export function psychologyScore(state, id, wishReady = true) {
  if (!WISHES[id]) return 0;
  const n = state.needs;
  const axes=axesFor(state),taste=tag=>preferenceAffinity(state.personality,tag);
  const critical = Math.min(n.energy, n.hunger, n.hygiene, n.fun,
    Number.isFinite(n.bladder)?n.bladder:75) < 24;
  let score = 0;
  if (id === 'shower') score += (axes.organization-.5)*7;
  if (id === 'bed') score += (axes.resilience-.5)*5;
  if (id === 'sofa') score += (axes.creativity+axes.sociability*.5-.75)*6+
    taste('calm_leisure')*4+taste('socializing')*2;
  if (id === 'fridge') score += taste('cooking')*3;
  if (!critical && wishReady && state.mind?.wish?.id === id) score += 11;
  if (id === 'sofa' && !critical && state.mind?.mood?.value < 48) score += 3;
  if (state.workRecovery?.until>state.minutes) {
    if(id==='bed'&&n.energy<45)score+=12;
    if(id==='sofa'&&n.fun<40)score+=6;
  }
  const last = state.mind?.memories?.at(-1);
  if (last && last.id === id && state.minutes - last.at < 90) score -= 4;
  return score;
}
