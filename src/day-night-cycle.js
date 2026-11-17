/** W1-A.2 — stylized, deterministic day/night lighting.
 * Pure domain logic: no PlayCanvas, DOM, device time, timezone, or save writes.
 * The real shared root.minutes plus root.calendar decide every scene light.
 */
import {calendarAt,civilToSerial} from './calendar-core.js';

const TROPICAL_YEAR=365.2425;
const SUMMER_SOLSTICE_SERIAL=civilToSerial('2000-06-21');
const TWO_PI=2*Math.PI;
export const DAY_NIGHT_PHASES=Object.freeze({
  dawn:'Рассвет',day:'День',sunset:'Закат',dusk:'Сумерки',night:'Ночь'
});
const NIGHT_AMBIENT=Object.freeze([0.23,0.27,0.36]);
const DAY_AMBIENT=Object.freeze([0.69,0.70,0.70]);
const NIGHT_SKY=Object.freeze([0.065,0.096,0.185]);
const DAY_SKY=Object.freeze([0.85,0.91,0.86]);
const NIGHT_FILL=Object.freeze([0.52,0.64,0.9]);
const DAY_FILL=Object.freeze([0.76,0.87,1]);
const MIDDAY_SUN=Object.freeze([1,0.94,0.84]);
const GOLDEN_SUN=Object.freeze([1,0.59,0.38]);
const GOLDEN_SKY=Object.freeze([1,0.63,0.44]);

const clamp01=x=>Math.max(0,Math.min(1,x));
const mix=(a,b,x)=>a+(b-a)*x;
const smooth=(start,end,x)=>{
  const t=clamp01((x-start)/(end-start));
  return t*t*(3-2*t);
};
const rgb=(a,b,t)=>Object.freeze(a.map((v,i)=>mix(v,b[i],t)));
const gaussian=(distance,spread)=>Math.exp(-Math.pow(distance/spread,2));

/** Artistic northern-hemisphere light: summer ≈05:00–21:00,
 * winter ≈08:00–17:00, equinox ≈06:30–18:30.
 * Continuous by serial-day difference, including 29 Feb and Dec/Jan rollover.
 */
export function sunSchedule(civilDate){
  const serial=civilToSerial(civilDate);
  const season=Math.cos(TWO_PI*(serial-SUMMER_SOLSTICE_SERIAL)/TROPICAL_YEAR);
  const sunriseMinute=390-90*season;
  const sunsetMinute=1110+120*season+30*season*season;
  return Object.freeze({sunriseMinute,sunsetMinute,twilightSpan:75,season});
}

/** Returns an immutable snapshot sampled at the exact fractional game minute.
 * No random color flicker, synthetic calendar ticks or implicit floor-lamp commands.
 */
export function sampleDaylight(civilDate,minuteOfDay){
  if(!Number.isFinite(minuteOfDay)||minuteOfDay<0||minuteOfDay>=1440)
    throw new RangeError('Expected game minute within 00:00..23:59:59');
  const schedule=sunSchedule(civilDate);
  const {sunriseMinute:rise,sunsetMinute:set,twilightSpan:twilight}=schedule;
  const m=minuteOfDay;

  const morning=smooth(rise-twilight,rise+95,m);
  const evening=1-smooth(set-95,set+twilight,m);
  const normalizedDaylight=clamp01(morning*evening);
  const dayProgress=clamp01((m-rise)/(set-rise));
  const sunHeight=Math.max(0,Math.sin(Math.PI*dayProgress));
  const sunlightGate=smooth(rise-25,rise+50,m)*(1-smooth(set-50,set+25,m));
  const sunlightIntensity=1.4*Math.pow(sunHeight,0.48)*sunlightGate;
  const warmStrength=Math.max(gaussian(m-rise,95),gaussian(m-set,95));
  const glow=warmStrength*(0.22+0.18*normalizedDaylight);
  const ambientColor=rgb(NIGHT_AMBIENT,DAY_AMBIENT,normalizedDaylight);
  const fillColor=rgb(NIGHT_FILL,DAY_FILL,normalizedDaylight);
  const sunColor=rgb(MIDDAY_SUN,GOLDEN_SUN,warmStrength*0.97);
  const backdropColor=rgb(rgb(NIGHT_SKY,DAY_SKY,normalizedDaylight),GOLDEN_SKY,glow);

  let phase='night';
  if(m>=rise-twilight&&m<rise+65)phase='dawn';
  else if(m>=rise+65&&m<set-75)phase='day';
  else if(m>=set-75&&m<set+15)phase='sunset';
  else if(m>=set+15&&m<set+twilight)phase='dusk';

  // Downward-pointing directional light: low angle near the horizon,
  // high sun at noon. The yaw keeps circling overnight rather than flipping.
  const sunPitch=85-66*sunHeight;
  const sunYaw=-95+360*(((m-rise+1440)%1440)/1440);
  return Object.freeze({
    phase,phaseLabel:DAY_NIGHT_PHASES[phase],
    sunriseMinute:rise,sunsetMinute:set,twilightSpan:twilight,
    normalizedDaylight,solarElevationVisual:sunHeight,
    sunlightIntensity,sunlightColor:sunColor,
    fillIntensity:mix(0.30,0.60,normalizedDaylight),fillColor,
    ambientColor,backdropColor,sunPitch,sunYaw,
    artificialLightSuggestion:normalizedDaylight<0.26
  });
}

/** Exactly the same authoritative household clock that drives needs and dates. */
export function sampleWorldLighting(calendar,absoluteGameMinutes){
  const gameDate=calendarAt(calendar,absoluteGameMinutes);
  return sampleDaylight(gameDate.iso,absoluteGameMinutes%1440);
}
