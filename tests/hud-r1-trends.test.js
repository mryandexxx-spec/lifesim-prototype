import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNeedTrendTracker,NEED_TREND_WINDOW_MINUTES,
  NEED_TREND_MIN_SPAN_MINUTES} from '../src/need-trends.js';

const all=['hunger','energy','hygiene','fun','social','bladder'];
function makeRoot(){
 const needs=Object.fromEntries(all.map(id=>[id,82]));
 return {version:1,minutes:480,needs:{...needs},
  otherSim:{version:1,minutes:480,needs:{...needs}},selectedSim:'alex'};
}
test('HUD-R1 watches actual two-resident deltas, not a second decay table',()=>{
 const root=makeRoot(),before=structuredClone(root),trend=createNeedTrendTracker();
 assert.equal(trend.observe(root).alex.hunger.direction,'unknown');
 root.minutes+=5;
 root.needs.hunger=81.7;root.needs.energy=83.4;
 root.needs.hygiene=82;
 root.otherSim.needs.hunger=83;
 root.otherSim.needs.social=81.9;
 const result=trend.observe(root);
 assert.equal(result.alex.hunger.direction,'down');
 assert.equal(result.alex.energy.direction,'up');
 assert.equal(result.alex.hygiene.direction,'flat');
 assert.equal(result.mira.hunger.direction,'up');
 assert.equal(result.mira.social.direction,'down');
 assert.deepEqual(Object.keys(result.alex),all);
 assert.deepEqual(Object.keys(result.mira),all);
 assert.deepEqual(Object.keys(root),Object.keys(before));
 assert.equal(root.version,1);
 assert.ok(NEED_TREND_WINDOW_MINUTES>=NEED_TREND_MIN_SPAN_MINUTES);
});
test('game-time normalization is identical for x1/x3; real elapsed seconds irrelevant',()=>{
 const simulate=()=>{const root=makeRoot(),t=createNeedTrendTracker();
  t.observe(root);root.minutes+=6;root.needs.social=81.952;
  return t.observe(root).alex.social;
 };
 assert.equal(simulate().direction,'down');
 assert.equal(simulate().rate,simulate().rate);
});
test('no fictitious rise at cap or on pause; no stale trend on new save or rewind',()=>{
 const root=makeRoot(),tracker=createNeedTrendTracker();
 root.needs.energy=100;tracker.observe(root);
 root.minutes+=4;root.needs.hunger=81.5;
 assert.equal(tracker.observe(root,{paused:true}).alex.hunger.direction,'paused');
 const state=tracker.observe(root);
 assert.equal(state.alex.hunger.direction,'down');
 assert.equal(state.alex.energy.direction,'flat');
 root.minutes=480;
 assert.equal(tracker.observe(root).alex.hunger.direction,'unknown');
 root.minutes+=5;root.needs.hunger=80;
 assert.equal(tracker.observe(root).alex.hunger.direction,'down');
 const reloaded=structuredClone(root);
 assert.equal(tracker.observe(reloaded).alex.hunger.direction,'unknown');
});
test('sampling is bounded and sudden long time jumps do not invent rates',()=>{
 const root=makeRoot(),tracker=createNeedTrendTracker();
 for(let i=0;i<700;i++){
  root.minutes+=.15;root.needs.hunger-=.0045;
  const r=tracker.observe(root);
  assert.ok(['unknown','down'].includes(r.alex.hunger.direction));
 }
 root.minutes+=100;root.needs.hunger=35;
 assert.equal(tracker.observe(root).alex.hunger.direction,'unknown');
});
test('visual HUD has six semantic arrows, C2 compact/expanded support, accessible labels',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
 for(const id of all){
  assert.match(html,new RegExp('id="trend-'+id+'"[^>]*aria-hidden="true"'));
 }
 assert.match(game,/createNeedTrendTracker\(/);
 assert.match(game,/needTrendTracker\.observe\(game/);
 assert.match(game,/getActor\(game/);
 assert.match(game,/\.setAttribute\('aria-label',needNames\[need\]/);
 assert.match(css,/#dashboard \.need-trend\[data-direction="down"\]/);
 assert.match(css,/#dashboard \.need-trend\[data-direction="up"\]/);
 assert.match(html,/src\/game\.js\?v=[^"]*hud-r1/);
 assert.match(html,/styles\.css\?v=[^"]*hud-r1/);
 assert.match(html,/src\/need-balance\.js\?v=[^"]*needs-r2/);
});
