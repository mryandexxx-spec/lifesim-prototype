import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('UX09: approved cross-surface real WebGL and accessibility acceptance gate exists',()=>{
 const browser=read('tests/ux09-browser-smoke.mjs');
 const flow=read('.github/workflows/ux09-mobile-acceptance.yml');
 for(const size of ['390,844','375,667','320,568','844,390'])
  assert.ok(browser.includes('['+size+']'),size);
 for(const control of ['#pick-mira','#plan-peek','#furnish-place-cancel',
  '#career-phone-toggle','#calendar-anchor-toggle','#save-btn']){
  assert.ok(browser.includes(control),control);
 }
 for(const contract of ['actionQueues','shop.credits','otherSim','world.furniture',
  'before.selectedSim','root text','reducedMotion','report.json']){
  assert.ok(browser.includes(contract),contract);
 }
 assert.match(browser,/page\.reload/);
 assert.match(browser,/page\.setViewportSize/);
 assert.match(browser,/getContext|game-canvas/);
 assert.match(browser,/UI_TOUR_STORAGE_KEY/);
 assert.match(browser,/NOT DONE: real Safari, VoiceOver/);
 assert.match(flow,/npm test/);
 assert.match(flow,/node tests\/ux09-browser-smoke\.mjs/);
 assert.match(flow,/if: always\(\)/);
});
test('UX09: retains old save root and actual UI ownership',()=>{
 const html=read('index.html'),pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.type,'module');
 assert.ok(html.includes('id="game-canvas"'));
 assert.ok(html.includes('id="calendar-anchor-toggle"'));
 assert.ok(html.includes('id="family-balance-chip"'));
 assert.ok(html.includes('id="view-toggle"'));
 assert.match(read('src/simulation.js'),/lifesim\.room01\.v1/);
});
