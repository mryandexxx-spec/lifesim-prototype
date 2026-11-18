import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCalendar,calendarAt} from '../src/calendar-core.js';
import {sunSchedule,sampleDaylight,sampleWorldLighting,DAY_NIGHT_PHASES} from '../src/day-night-cycle.js';
import {createDayNightRenderer} from '../src/day-night-render.js';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';

const sum=rgb=>rgb[0]+rgb[1]+rgb[2];
const difference=(a,b)=>Math.max(...a.map((x,i)=>Math.abs(x-b[i])));
const allColors=s=>[s.ambientColor,s.sunlightColor,s.fillColor,s.backdropColor];
const byTime=(date,hour,minute=0)=>sampleDaylight(date,hour*60+minute);

test('W1-A.2 canonical sunrise/sunset: summer 05–21, winter 08–17, equinox ~06:30–18:30',()=>{
  const summer=sunSchedule('2026-06-21');
  const winter=sunSchedule('2026-12-21');
  const equinox=sunSchedule('2026-03-20');
  assert.ok(Math.abs(summer.sunriseMinute-300)<4,JSON.stringify(summer));
  assert.ok(Math.abs(summer.sunsetMinute-1260)<4,JSON.stringify(summer));
  assert.ok(Math.abs(winter.sunriseMinute-480)<4,JSON.stringify(winter));
  assert.ok(Math.abs(winter.sunsetMinute-1020)<4,JSON.stringify(winter));
  assert.ok(Math.abs(equinox.sunriseMinute-390)<9,JSON.stringify(equinox));
  assert.ok(Math.abs(equinox.sunsetMinute-1110)<12,JSON.stringify(equinox));
  assert.ok(summer.sunsetMinute-summer.sunriseMinute>winter.sunsetMinute-winter.sunriseMinute+400);
});

test('W1-A.2 five distinct phases and readable moonlit interiors',()=>{
  const date='2026-06-21',s=sunSchedule(date);
  assert.equal(sampleDaylight(date,60).phase,'night');
  assert.equal(sampleDaylight(date,s.sunriseMinute-30).phase,'dawn');
  assert.equal(sampleDaylight(date,13*60).phase,'day');
  assert.equal(sampleDaylight(date,s.sunsetMinute-25).phase,'sunset');
  assert.equal(sampleDaylight(date,s.sunsetMinute+35).phase,'dusk');
  const night=byTime(date,1),day=byTime(date,13),twilight=sampleDaylight(date,s.sunsetMinute);
  assert.equal(night.phaseLabel,'Ночь');
  assert.equal(night.sunlightIntensity,0);
  assert.ok(night.fillIntensity>=0.28);
  assert.ok(Math.min(...night.ambientColor)>.15,'objects remain visible by ambient/fill');
  assert.ok(day.sunlightIntensity>1.2,'day actually lights mesh surfaces');
  assert.ok(sum(day.ambientColor)>sum(night.ambientColor)+.75);
  assert.ok(sum(day.backdropColor)>sum(night.backdropColor)+1.5);
  assert.ok(twilight.sunlightColor[1]<day.sunlightColor[1],'sunset sun is golden');
  assert.equal(DAY_NIGHT_PHASES.dusk,'Сумерки');
});

test('W1-A.2 continuously interpolates colors at seasonal and phase boundaries',()=>{
  for(const iso of ['2024-02-28','2024-02-29','2024-03-01','2026-01-01',
    '2026-03-20','2026-06-21','2026-09-22','2026-12-21','2026-12-31','2027-01-01']){
    const schedule=sunSchedule(iso);
    for(const point of [schedule.sunriseMinute,schedule.sunsetMinute]){
      const a=sampleDaylight(iso,point-1);
      const b=sampleDaylight(iso,point);
      const c=sampleDaylight(iso,point+1);
      assert.ok(Math.abs(a.sunlightIntensity-b.sunlightIntensity)<.15);
      assert.ok(Math.abs(c.sunlightIntensity-b.sunlightIntensity)<.15);
      for(let i=0;i<4;i++){
        assert.ok(difference(allColors(a)[i],allColors(b)[i])<.045);
        assert.ok(difference(allColors(b)[i],allColors(c)[i])<.045);
      }
    }
    for(const minute of [0,240,480,720,1020,1260,1439.999]){
      const s=sampleDaylight(iso,minute);
      assert.ok(s.normalizedDaylight>=0&&s.normalizedDaylight<=1);
      assert.ok(s.sunlightIntensity>=0&&s.sunlightIntensity<=1.401);
      assert.ok(s.fillIntensity>=.299&&s.fillIntensity<=.601);
      assert.ok(Number.isFinite(s.sunPitch)&&Number.isFinite(s.sunYaw));
      for(const color of allColors(s))for(const ch of color)
        assert.ok(Number.isFinite(ch)&&ch>=0&&ch<=1.001);
    }
  }
  const jan1=sunSchedule('2027-01-01'),dec31=sunSchedule('2026-12-31');
  assert.ok(Math.abs(jan1.sunriseMinute-dec31.sunriseMinute)<1);
  assert.ok(Math.abs(jan1.sunsetMinute-dec31.sunsetMinute)<1);
  const feb29=sunSchedule('2024-02-29'),feb28=sunSchedule('2024-02-28');
  assert.ok(Math.abs(feb29.sunriseMinute-feb28.sunriseMinute)<2);
});

test('W1-A.2 midnight/paused/reloaded world samples derive only from shared root minutes',()=>{
  const root=newHousehold('2024-02-28');
  root.minutes=1439.7;root.otherSim.minutes=root.minutes;
  const prior=sampleWorldLighting(root.calendar,root.minutes);
  root.paused=true;tickHousehold(root,10);
  assert.equal(root.minutes,1439.7);
  assert.deepEqual(sampleWorldLighting(root.calendar,root.minutes),prior);
  root.paused=false;tickHousehold(root,.3);
  assert.equal(root.minutes,1440);
  assert.equal(root.otherSim.minutes,root.minutes);
  assert.equal(calendarAt(root.calendar,root.minutes).iso,'2024-02-29');
  const newDay=sampleWorldLighting(root.calendar,root.minutes);
  assert.ok(difference(prior.backdropColor,newDay.backdropColor)<.005);
  const saved=JSON.parse(JSON.stringify(root));
  const reloaded=loadHousehold(saved,'2030-06-21');
  assert.deepEqual(sampleWorldLighting(reloaded.calendar,reloaded.minutes),newDay);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(reloaded.version,1);
  assert.equal(reloaded.otherSim.minutes,reloaded.minutes);
  assert.equal(reloaded.shop.credits,root.shop.credits);
});

test('W1-A.2 PlayCanvas light adapter reuses original lights and fixed colors, not lamps',()=>{
  class Color{constructor(){this.r=0;this.g=0;this.b=0;}
    set(r,g,b){this.r=r;this.g=g;this.b=b;return this;}}
  const scene={ambientLight:null};
  const sun={light:{color:null,intensity:1.4,castShadows:false},
    setEulerAngles(...angles){this.angles=angles;}};
  const fill={light:{color:null,intensity:.6,castShadows:false}};
  const camera={camera:{clearColor:null}};
  const lamp={light:{enabled:true,intensity:.75},manualState:true};
  const renderer=createDayNightRenderer({scene,sun,fill,camera,Color});
  const calendar=createCalendar('2026-06-21');
  const midday=renderer.update(calendar,780);
  assert.equal(midday.phase,'day');
  assert.equal(renderer.getUpdateCount(),1);
  const originalBuffers=[scene.ambientLight,sun.light.color,fill.light.color,camera.camera.clearColor];
  assert.strictEqual(renderer.update(calendar,780),midday);
  assert.equal(renderer.getUpdateCount(),1);
  const night=renderer.update(calendar,60);
  assert.equal(night.phase,'night');
  assert.equal(sun.light.intensity,0);
  assert.deepEqual([scene.ambientLight,sun.light.color,fill.light.color,camera.camera.clearColor],originalBuffers);
  assert.deepEqual(sun.angles,[night.sunPitch,night.sunYaw,0]);
  assert.equal(sun.light.castShadows,false);
  assert.equal(fill.light.castShadows,false);
  assert.equal(lamp.light.enabled,true);
  assert.equal(lamp.manualState,true);
  // Calendar anchor edit must change a given clock time's season immediately.
  renderer.update(createCalendar('2026-12-21'),780);
  assert.equal(renderer.getUpdateCount(),3);
  assert.notEqual(renderer.getSnapshot().sunriseMinute,night.sunriseMinute);
  assert.equal(lamp.light.enabled,true);
  assert.equal(renderer.getUpdateCount(),3);
});

test('W1-A.2 mobile HUD and Pages include the render bridge, no costly new scene entities',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(game,/createDayNightRenderer\(\{scene:app\.scene,sun,fill,camera,Color:pc\.Color\}\)/);
  assert.match(game,/dayNightRenderer\.update\(game\.calendar,game\.minutes\)/);
  assert.match(game,/\$\('light-phase-label'\)\.textContent=daylight\.phaseLabel/);
  assert.match(html,/id="light-phase-label"/);
  assert.match(css,/#light-phase-label/);
  assert.match(pages,/node --check src\/day-night-cycle\.js/);
  assert.match(pages,/node --check src\/day-night-render\.js/);
  assert.match(pages,/cp src\/day-night-cycle\.js src\/day-night-render\.js site\/src\//);
  assert.doesNotMatch(game,/dayNightRenderer\..*new pc\.Entity/);
  assert.match(game,/if\(on\)litUtilityCount\+\+/); // preserve manual lamp cap
});

test('Comfort C1: moonlit 00:00 and 03:00 are brighter, day stays intact, and lamps are not controlled',()=>{
  for(const date of ['2026-06-21','2026-12-21','2024-02-29']){
    for(const minute of [0,180,1439]){
      const scene=sampleDaylight(date,minute);
      assert.equal(scene.phase,'night');
      assert.equal(scene.sunlightIntensity,0);
      assert.deepEqual(scene.ambientColor,[.29,.32,.40]);
      assert.equal(scene.fillIntensity,.38);
      assert.deepEqual(scene.backdropColor,[.09,.12,.20]);
      assert.equal(scene.artificialLightSuggestion,true);
    }
    const day=sampleDaylight(date,12*60);
    assert.equal(day.phase,'day');
    assert.deepEqual(day.ambientColor,[.69,.70,.70]);
    assert.equal(day.fillIntensity,.60);
    assert.equal(day.sunlightIntensity>1.0,true);
  }
  const source=readFileSync(new URL('../src/day-night-render.js',import.meta.url),'utf8');
  assert.match(source,/Do not mutate floor-lamp on\/off states/);
  assert.doesNotMatch(source,/lampOn\s*=/);
});

test('Comfort C1: every twilight transition stays smooth and monotonic in scene brightness',()=>{
  for(const date of ['2026-06-21','2026-12-21','2026-03-20']){
    const {sunriseMinute,sunsetMinute}=sunSchedule(date);
    for(const around of [sunriseMinute,sunsetMinute]){
      const samples=Array.from({length:241},(_,i)=>sampleDaylight(date,around-120+i));
      for(let i=1;i<samples.length;i++){
        const before=samples[i-1],after=samples[i];
        assert.ok(Math.abs(sum(after.ambientColor)-sum(before.ambientColor))<.04);
        assert.ok(Math.abs(after.fillIntensity-before.fillIntensity)<.01);
        assert.ok(Math.abs(sum(after.backdropColor)-sum(before.backdropColor))<.07);
      }
    }
  }
});
