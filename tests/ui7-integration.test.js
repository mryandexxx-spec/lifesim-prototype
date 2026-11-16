import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('../index.html'),css=read('../styles.css'),game=read('../src/game.js');
const workflow=read('../.github/workflows/pages.yml');
test('UI7 optional, keyboard dismissible, accessible three-step help without blocking 3D',()=>{
 for(const id of ['tour-panel','tour-replay','tour-progress','tour-title','tour-body',
  'tour-tip','tour-close','tour-skip','tour-next'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(html,/id="tour-panel"[^>]*hidden aria-labelledby="tour-title" aria-describedby="tour-body"/);
 assert.match(html,/id="tour-replay"[^>]*aria-controls="tour-panel"/);
 assert.match(css,/\.tour-panel\[hidden\]\{display:none!important;\}/);
 assert.match(css,/\.tour-panel h2\{font-size:20px/);
 assert.match(css,/\.tour-actions button\{min-height:48px/);
 assert.match(game,/if\(event.key==='Escape'&&tourOpen/);
});
test('UI7 reads only separate UI preference, does not alter household save',()=>{
 assert.match(game,/localStorage\.getItem\(UI_TOUR_STORAGE_KEY\)/);
 assert.match(game,/localStorage\.setItem\(UI_TOUR_STORAGE_KEY,'done'\)/);
 assert.match(game,/shouldShowTour\(seen\)&&!dialogueNeedsDecision\(game\)/);
 assert.match(game,/if\(enteringRequired\)\{\s*closeTour\(\);/);
 const begin=game.indexOf('const uiTour=createUITour();');
 const end=game.indexOf('// View is a presentation-only popover',begin);
 const section=game.slice(begin,end);
 assert.ok(begin>=0&&end>begin);
 assert.doesNotMatch(section,/save\(|tick\(|cancelSocial\(|enqueueAction\(|game\.needs\s*=/);
});
test('UI7 six real bars and camera gestures are retained from concurrently released M4/UI6',()=>{
 for(const need of ['hunger','energy','hygiene','fun','social','bladder'])
  assert.match(html,new RegExp('id="bar-'+need+'"'));
 assert.match(game,/from '\.\/toilet-interaction\.js'/);
 assert.match(game,/from '\.\/camera-gestures\.js'/);
 assert.match(css,/@media\(max-height:560px\) and \(orientation:landscape\)\{/);
 assert.match(css,/\.needs\{grid-column:2;grid-row:1;grid-template-columns:repeat\(3,/);
 assert.match(css,/\.need-copy>span\{font-size:11px/);
 assert.match(css,/\.tour-panel\{top:48%;max-height:/);
 assert.match(workflow,/node --check src\/toilet-interaction\.js/);
 assert.match(workflow,/cp src\/toilet-interaction\.js site\/src\//);
});
test('UI7 Pages ships onboarding module, current cache identity and no simulator fork',()=>{
 assert.match(workflow,/node --check src\/ui-onboarding\.js/);
 assert.match(workflow,/cp src\/ui-onboarding\.js site\/src\//);
 assert.match(html,/сборка \/ 1\.2s/);
 assert.match(html,/styles\.css\?v=1\.2s/);
 assert.match(html,/src\/game\.js\?v=1\.2s/);
});
