import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NEED_LABELS,needPresentation,moodTone,moodReasons,
  moodPresentation,moodOrbitPoint} from '../src/mood-presentation.js';
import {newGame,loadGame,SAVE_KEY,NEEDS,tick} from '../src/simulation.js';
import {newHousehold,loadHousehold,getActor} from '../src/household.js';
import {refreshMind} from '../src/psychology.js';

test('M1 palettes cover every boundary with predictable accessible bands',()=>{
  assert.equal(NEED_LABELS.hunger,'Сытость');
  assert.deepEqual(NEEDS,['hunger','energy','hygiene','fun','social']);
  assert.equal(NEED_LABELS.social,'Общение');
  for(const [n,label] of [[0,'Критично'],[19,'Критично'],[20,'Низко'],
    [44,'Низко'],[45,'Норма'],[74,'Норма'],[75,'Хорошо'],[100,'Хорошо']])
    assert.equal(needPresentation(n).label,label);
  for(const [n,label] of [[0,'На пределе'],[19,'На пределе'],
    [20,'Не в духе'],[39,'Не в духе'],[40,'Ровное'],[59,'Ровное'],
    [60,'Доволен'],[79,'Доволен'],[80,'Окрылён'],[100,'Окрылён']])
    assert.equal(moodTone(n).label,label);
  assert.equal(needPresentation(-99).value,0);
  assert.equal(moodTone(500).value,100);
  assert.equal(moodTone(NaN).value,50);
  assert.match(needPresentation(18).color,/^#[0-9a-f]{6}$/i);
});

test('M1 reasons come from current needs and canonically validated emotions',()=>{
  const s=newGame();
  s.needs.hunger=8;s.needs.energy=36;s.needs.hygiene=90;s.needs.fun=88;
  refreshMind(s);
  assert.deepEqual(moodReasons(s),['Очень голоден','Нуждается в отдыхе']);
  assert.equal(moodPresentation(s).description,'Очень голоден · Нуждается в отдыхе');
  const before=JSON.stringify(s);
  moodPresentation(s);moodReasons(s);
  assert.equal(JSON.stringify(s),before,'render views must be read-only');
  s.needs={hunger:95,energy:96,hygiene:88,fun:93,social:92};
  refreshMind(s);
  assert.deepEqual(moodReasons(s),['Основные потребности удовлетворены']);
});

test('M1 mood display does not trust forged saved labels or create imaginary memories',()=>{
  const s=newGame();
  const raw=JSON.parse(JSON.stringify(s));
  raw.mind.mood={value:999,label:'<script>alert(1)</script>'};
  raw.needs.energy=3;
  const loaded=loadGame(raw);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(loaded.version,1);
  assert.notEqual(loaded.mind.mood.label,raw.mind.mood.label);
  assert.ok(moodPresentation(loaded).description.includes('Сильно устал'));
  assert.equal(loaded.mind.memories.length,0);
});

test('M1 display reads selected resident independently and cannot change v1 saves',()=>{
  const root=newHousehold();
  getActor(root,'alex').needs.hunger=6;
  getActor(root,'mira').needs.hunger=91;
  refreshMind(getActor(root,'alex'));refreshMind(getActor(root,'mira'));
  assert.ok(moodReasons(getActor(root,'alex')).includes('Очень голоден'));
  assert.ok(!moodReasons(getActor(root,'mira')).includes('Очень голоден'));
  const snap=JSON.stringify(root);
  moodPresentation(root);moodPresentation(root.otherSim);
  assert.equal(JSON.stringify(root),snap);
  const loaded=loadHousehold(JSON.parse(snap));
  assert.equal(loaded.needs.hunger,6);
  assert.equal(loaded.otherSim.needs.hunger,91);
  loaded.paused=true;
  const snapshot=JSON.stringify(loaded);
  tick(loaded,60);
  assert.equal(JSON.stringify(loaded),snapshot);
});

test('M1 orbit point respects private/offscreen/behind-camera constraints',()=>{
  assert.deepEqual(moodOrbitPoint({x:150,y:180},{z:-2},320,650),{x:150,y:180});
  assert.equal(moodOrbitPoint({x:150,y:180},{z:2},320,650),null);
  assert.equal(moodOrbitPoint({x:15,y:180},{z:-2},320,650),null);
  assert.equal(moodOrbitPoint({x:150,y:80},{z:-2},320,650),null);
  assert.equal(moodOrbitPoint({x:150,y:520},{z:-2},320,650),null);
});

test('M1 browser contracts are mobile-safe and reaction layer independent',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/mood-m1-checks.yml',import.meta.url),'utf8');
  for(const id of ['mood-overview','mood-overview-title','mood-overview-bar',
    'mood-overview-reason','mood-orbit','mind-mood-reasons'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/role="meter" aria-label="Настроение выбранного персонажа"/);
  assert.match(html,/class="reaction-layer"/);
  assert.match(css,/\.mood-orbit\[hidden\]\{display:none;\}/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/pointer-events:none/);
  assert.match(game,/reactionBadges\.count\(\)>0/);
  assert.match(game,/showerStates\[game\.selectedSim\]\?\.active/);
  assert.match(game,/moodOrbitPoint\(camera\.camera\.worldToScreen/);
  assert.match(game,/moodView=moodPresentation\(current\)/);
  assert.match(workflow,/npm test/);
  assert.doesNotMatch(workflow,/deploy-pages|upload-pages|pages: write/);
});
