import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHudPanel,HUD_COMPACT_KEY} from '../src/hud-panel.js';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const html=read('../index.html'),css=read('../styles.css'),game=read('../src/game.js');
test('C2 keeps one real handler per major action and six authentic needs',()=>{
 for(const id of ['pause-btn','speed-btn','career-phone-toggle','view-toggle',
  'home-open','home-furnish','home-build','furnish-toggle','build-toggle',
  'auto-btn','rotate-camera-btn','reset-camera-btn','save-btn','reset-btn',
  'hud-toggle','pick-alex','pick-mira','plan-peek','queue-panel',
  'home-panel','view-panel','urgent-needs','mind-toggle','insight-toggle',
  'music-audio-toggle','tour-replay','item-labels-btn','mesh-model-btn']){
   assert.equal(html.split('id="'+id+'"').length-1,1,id+' must be unique');
 }
 for(const name of ['hunger','energy','hygiene','fun','social','bladder'])
   assert.equal(html.split('id="bar-'+name+'"').length-1,1,name);
 assert.match(html,/id="dashboard" class="dashboard" data-collapsed="true"/);
 assert.match(html,/id="hud-toggle"[^>]*aria-expanded="false"/);
 assert.match(game,/for\(const need of NEEDS\)/);
 assert.match(game,/\$\('urgent-needs'\)\.textContent/);
 assert.match(css,/\.life-clock-controls button\{min-width:44px;min-height:44px/);
 assert.match(css,/\.life-nav button\{min-height:50px/);
 assert.match(css,/#dashboard \.resident-switch button\{min-height:44px/);
 assert.match(css,/\.home-panel\[hidden\]\{display:none!important\}/);
});
test('C2 defers secondary navigation and retains protected gameplay/save flow',()=>{
 assert.match(game,/function setHomeOpen\(/);
 assert.match(game,/setHomeOpen\(false\);\$\('furnish-toggle'\)\.click\(\)/);
 assert.match(game,/setHomeOpen\(false\);\$\('build-toggle'\)\.click\(\)/);
 assert.match(game,/dialogueNeedsDecision\(game\)/);
 assert.match(game,/if \(!window\.confirm\('Начать новую жизнь\?/);
  assert.match(game,/writeV1Save\(localStorage,SAVE_KEY,game\)/,
    'manual save must use QSK-09 protected v1 write boundary');
 assert.match(game,/readPreference:\(\)=>localStorage\.getItem\(HUD_COMPACT_KEY\)/);
 assert.match(game,/from '\.\/camera-gestures\.js'/);
 assert.match(game,/from '\.\/hud-panel\.js'/);
 assert.match(html,/id="view-panel"[^>]*hidden/);
 assert.match(html,/id="home-panel"[^>]*hidden/);
 assert.equal(HUD_COMPACT_KEY,'blins.ui.hud.compact.v1');
});
test('C2 legacy HUD preference full/compact, new first visit and storage denial',()=>{
 for(const [pref,expected] of [[null,true],['compact',true],['full',false]]){
  const attrs={},listeners={};
  const panel={dataset:{}};
  const toggle={setAttribute:(key,value)=>{attrs[key]=value;},addEventListener:(key,fn)=>{listeners[key]=fn;},textContent:''};
  createHudPanel({panel,toggle,readPreference:()=>pref});
  assert.equal(panel.dataset.collapsed,String(expected));
  assert.equal(attrs['aria-expanded'],String(!expected));
  listeners.click();
  assert.equal(panel.dataset.collapsed,String(!expected));
 }
 const panel={dataset:{}};
 createHudPanel({panel,toggle:{setAttribute(){},addEventListener(){},textContent:''},
  readPreference:()=>{throw Error('Safari private mode');}});
 assert.equal(panel.dataset.collapsed,'true');
});
