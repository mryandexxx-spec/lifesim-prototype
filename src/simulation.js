/** Pure game rules: no PlayCanvas or browser imports. */
export const NEEDS = ['hunger', 'energy', 'hygiene', 'fun'];
export const ACTIONS = Object.freeze({
  bed: { label: 'Поспать', need: 'energy', duration: 60, benefitPerMinute: 0.74, location: [-0.82, -1.05] },
  fridge: { label: 'Перекусить', need: 'hunger', duration: 26, benefitPerMinute: 1.65, location: [3.48, -1.76] },
  shower: { label: 'Принять душ', need: 'hygiene', duration: 32, benefitPerMinute: 1.48, location: [-2.18, 2.10] },
  sofa: { label: 'Отдохнуть', need: 'fun', duration: 42, benefitPerMinute: 0.96, location: [-0.48, 1.46] }
});
const DECAY = { hunger: 0.12, energy: 0.085, hygiene: 0.068, fun: 0.094 };
export const SAVE_KEY = 'lifesim.room01.v1';
const clamp = value => Math.max(0, Math.min(100, value));

export function newGame() {
  return {
    version: 1, minutes: 8 * 60, speed: 1, paused: false,
    needs: { hunger: 78, energy: 67, hygiene: 82, fun: 58 },
    position: { x: -0.25, z: 0.35 }, action: null, event: 'Свободное время',
    autonomy: { nextAt: 480 }
  };
}

export function loadGame(data) {
  if (!data || data.version !== 1 || !Number.isFinite(data.minutes) || !data.needs || !data.position) return newGame();
  const next = newGame();
  next.minutes = Math.max(0, Math.min(data.minutes, 10000000));
  for (const key of NEEDS) if (Number.isFinite(data.needs[key])) next.needs[key] = clamp(data.needs[key]);
  if (Number.isFinite(data.position.x) && Number.isFinite(data.position.z)) {
    next.position.x = Math.max(-4.5, Math.min(4.5, data.position.x));
    next.position.z = Math.max(-3.7, Math.min(3.7, data.position.z));
  }
  if (Number.isFinite(data.autonomy?.nextAt)) next.autonomy.nextAt = Math.max(0, Math.min(data.autonomy.nextAt, 10000000));
  if (data.action && ACTIONS[data.action.id] && ['walking', 'using'].includes(data.action.phase)) {
    next.action = { id: data.action.id, phase: data.action.phase, elapsed: Math.max(0, Math.min(1000, Number(data.action.elapsed) || 0)), automatic: Boolean(data.action.automatic) };
  }
  return next;
}

export function chooseAction(state, id, automatic = false) {
  if (!ACTIONS[id] || (automatic && state.minutes < state.autonomy.nextAt)) return false;
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
  if (state.action?.phase === 'using') {
    const definition = ACTIONS[state.action.id];
    const amount = Math.min(minutes, Math.max(0, definition.duration - state.action.elapsed));
    state.needs[definition.need] = clamp(state.needs[definition.need] + definition.benefitPerMinute * amount);
    state.action.elapsed += amount;
    if (state.action.elapsed >= definition.duration || state.needs[definition.need] >= 99.9) {
      state.event = definition.label + ' — готово';
      state.autonomy.nextAt = state.minutes + 7; // short break between autonomous tasks
      state.action = null;
    }
  }
}

export function autonomousChoice(state) {
  if (state.paused || state.action || state.minutes < state.autonomy.nextAt) return null;
  const hour = Math.floor(state.minutes % 1440 / 60);
  const night = hour >= 22 || hour < 6;
  const options = [
    { id: 'fridge', need: 'hunger', threshold: 43, weight: 1.25 },
    { id: 'bed', need: 'energy', threshold: 42, weight: 1.12 },
    { id: 'shower', need: 'hygiene', threshold: 40, weight: 0.95 },
    { id: 'sofa', need: 'fun', threshold: 37, weight: 0.90 }
  ];
  const scored=options.map(option=>{
    const value=state.needs[option.need];
    const urgency=Math.max(0, option.threshold-value)*option.weight;
    // During late evening, Alex is more likely to go to bed before exhaustion.
    const bedtime=night && option.id==='bed' && value < 67 ? (67-value)*0.48 : 0;
    return { id:option.id, score:urgency+bedtime };
  }).sort((a,b)=>b.score-a.score);
  return scored[0].score > 0 ? scored[0].id : null;
}

export function readableTime(minutes) {
  const whole = Math.floor(minutes);
  const day = Math.floor(whole / 1440) + 1;
  const hh = String(Math.floor(whole % 1440 / 60)).padStart(2, '0');
  const mm = String(whole % 60).padStart(2, '0');
  return { day: `День ${day}`, time: `${hh}:${mm}` };
}
