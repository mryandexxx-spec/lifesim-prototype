import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNeedTrendTracker,NEED_TREND_FLASH_MS} from '../src/need-trends.js';
const all=['hunger','energy','hygiene','fun','social','bladder'];
function root(){
 const needs=Object.fromEntries(all.map(x=>[x,82]));
 return {version:1,minutes:480,needs:{...needs},
  otherSim:{version:1,minutes:480,needs:{...needs}},selectedSim:'alex'};
}
test('no arrow on boot, stationary bar, or sub-pixel need change',()=>{
 const game=root(),t=createNeedTrendTracker();
 let v=t.observe(game,{nowMs:100});
 assert.deepEqual(Object.keys(v.alex),all);
 for(const id of all)assert.deepEqual(v.alex[id],
  {direction:'idle',symbol:'',label:'',visible:false});
 game.minutes+=2;game.needs.hunger=81.8; // Still rounded 82.
 v=t.observe(game,{nowMs:200});
 assert.equal(v.alex.hunger.visible,false);
 game.needs.hunger=81.49; // Actually displayed 81.
 v=t.observe(game,{nowMs:300});
 assert.deepEqual(v.alex.hunger,{direction:'down',symbol:'↓',
  label:'Снижается',visible:true});
 assert.equal(game.version,1);
});
test('flash disappears when the scale is no longer visibly changing',()=>{
 const game=root(),t=createNeedTrendTracker();
 t.observe(game,{nowMs:0});
 game.minutes+=1;game.needs.energy=83.2;
 assert.equal(t.observe(game,{nowMs:300}).alex.energy.symbol,'↑');
 assert.equal(t.observe(game,{nowMs:300+NEED_TREND_FLASH_MS-1}).alex.energy.visible,true);
 assert.equal(t.observe(game,{nowMs:300+NEED_TREND_FLASH_MS}).alex.energy.visible,false);
 assert.equal(t.observe(game,{nowMs:300+NEED_TREND_FLASH_MS}).alex.energy.symbol,'');
});
test('real change in both residents, including recovery, never changes saved root',()=>{
 const game=root(),snapshot=structuredClone(game),t=createNeedTrendTracker();
 t.observe(game,{nowMs:0});
 game.minutes+=1;
 game.needs.fun=83;
 game.otherSim.needs.hunger=80;
 const state=t.observe(game,{nowMs:200});
 assert.equal(state.alex.fun.direction,'up');
 assert.equal(state.mira.hunger.direction,'down');
 assert.equal(state.alex.hunger.visible,false);
 assert.deepEqual(Object.keys(game),Object.keys(snapshot));
 assert.equal(game.selectedSim,'alex');
 assert.equal(game.otherSim.version,1);
 assert.equal(game.version,1);
});
test('pause hides any arrow immediately and resume never replays stale step',()=>{
 const game=root(),t=createNeedTrendTracker();
 t.observe(game,{nowMs:0});
 game.needs.hunger=81;
 assert.equal(t.observe(game,{nowMs:100}).alex.hunger.direction,'down');
 assert.equal(t.observe(game,{nowMs:120,paused:true}).alex.hunger.visible,false);
 assert.equal(t.observe(game,{nowMs:220}).alex.hunger.visible,false);
 game.needs.hunger=82;
 assert.equal(t.observe(game,{nowMs:260}).alex.hunger.direction,'up');
});
test('rounding at 0/100 avoids invented arrows, but genuine integer step appears',()=>{
 const game=root(),t=createNeedTrendTracker();
 game.needs.energy=100;game.needs.bladder=0;
 t.observe(game,{nowMs:0});
 game.needs.energy=99.8;game.needs.bladder=.1;
 const state=t.observe(game,{nowMs:100});
 assert.equal(state.alex.energy.visible,false);
 assert.equal(state.alex.bladder.visible,false);
 game.needs.energy=99.4;
 assert.equal(t.observe(game,{nowMs:220}).alex.energy.direction,'down');
});
test('reset, reload/actor replacement, game-time rewind and tab gap clear the signal',()=>{
 const game=root(),t=createNeedTrendTracker();
 t.observe(game,{nowMs:0});
 game.needs.hunger=81;
 assert.equal(t.observe(game,{nowMs:100}).alex.hunger.direction,'down');
 const cloned=structuredClone(game);
 assert.equal(t.observe(cloned,{nowMs:120}).alex.hunger.visible,false);
 cloned.needs.hunger=80;
 assert.equal(t.observe(cloned,{nowMs:140}).alex.hunger.direction,'down');
 cloned.minutes-=60;
 assert.equal(t.observe(cloned,{nowMs:200}).alex.hunger.visible,false);
 cloned.needs.hunger=79;
 assert.equal(t.observe(cloned,{nowMs:9000}).alex.hunger.visible,false);
 t.reset();
 assert.equal(t.observe(cloned,{nowMs:9010}).alex.hunger.visible,false);
});
test('flash durations depend on visible steps, not 1x/3x seconds or passive rates',()=>{
 for(const clockSpeed of [1,3]){
  const game=root(),t=createNeedTrendTracker();t.observe(game,{nowMs:0});
  game.minutes+=clockSpeed*3;game.needs.hygiene=81.4;
  assert.equal(t.observe(game,{nowMs:200}).alex.hygiene.direction,'down');
 }
});
test('HUD uses only event arrows; smooth bars and accessibility retain reduced motion',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
 for(const id of all){
  assert.match(html,new RegExp('id="trend-'+id+'"[^>]*aria-hidden="true" data-direction="idle"'));
 }
 assert.doesNotMatch(html,/id="trend-(hunger|energy|hygiene|fun|social|bladder)"[^>]*>→/);
 assert.match(game,/createNeedTrendTracker\(/);
 assert.match(game,/needTrendTracker\.observe\(game/);
 assert.match(game,/nowMs:performance\.now\(\)/);
 assert.match(game,/line\.dataset\.trend=trend\.direction/);
 assert.match(game,/trend\.visible\?'\. '\+trend\.label:''/);
 assert.match(css,/#dashboard \.need-trend\[data-direction="down"\]/);
 assert.match(css,/#dashboard \.need-trend\[data-direction="up"\]/);
 assert.match(css,/need-fill-recover/);
 assert.match(css,/need-fill-shimmer/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(html,/src\/game\.js\?v=[^"]*hud-r1/);
 assert.match(html,/styles\.css\?v=[^"]*hud-r1/);
 assert.match(html,/src\/need-balance\.js\?v=[^"]*needs-r2/);
});
