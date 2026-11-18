import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HUD_COMPACT_KEY,isHudCompact,createHudPanel} from '../src/hud-panel.js';

function fakeButton(){
  const attrs={};
  let onClick;
  return {
    attrs,textContent:'',
    setAttribute(name,value){attrs[name]=value;},
    addEventListener(name,callback){assert.equal(name,'click');onClick=callback;},
    click(){onClick();}
  };
}
test('C2 starts compact, expands needs without modifying household data',()=>{
  const panel={dataset:{}},toggle=fakeButton();
  const pref=[],events=[];
  const controller=createHudPanel({panel,toggle,readPreference:()=>null,
    writePreference:value=>pref.push(value),onChange:value=>events.push(value)});
  assert.equal(HUD_COMPACT_KEY,'blins.ui.hud.compact.v1');
  assert.equal(isHudCompact('done'),false);
  assert.equal(isHudCompact('compact'),true);
  assert.equal(panel.dataset.collapsed,'true');
  assert.equal(toggle.attrs['aria-expanded'],'false');
  assert.equal(controller.isCompact(),true);
  toggle.click();
  assert.equal(panel.dataset.collapsed,'false');
  assert.equal(toggle.attrs['aria-expanded'],'true');
  assert.match(toggle.attrs['aria-label'],/Свернуть/);
  assert.equal(toggle.textContent,'Свернуть');
  toggle.click();
  assert.equal(panel.dataset.collapsed,'true');
  assert.match(toggle.attrs['aria-label'],/Показать/);
  assert.deepEqual(pref,['full','compact']);
  assert.deepEqual(events,[true,false,true]);
});
test('compact UI preference survives reload, Safari storage denial is harmless',()=>{
  const panel={dataset:{}},toggle=fakeButton();
  createHudPanel({panel,toggle,readPreference:()=> 'compact',
    writePreference:()=>{throw Error('storage denied');}});
  assert.equal(panel.dataset.collapsed,'true');
  assert.doesNotThrow(()=>toggle.click());
  assert.equal(panel.dataset.collapsed,'false');
  const fallback={dataset:{}};
  createHudPanel({panel:fallback,toggle:fakeButton(),readPreference:()=>{throw Error('denied');}});
  assert.equal(fallback.dataset.collapsed,'true');
  const legacyFull={dataset:{}};
  createHudPanel({panel:legacyFull,toggle:fakeButton(),readPreference:()=> 'full'});
  assert.equal(legacyFull.dataset.collapsed,'false');
});
test('bottom-docked compact HUD retains both residents, all six actual needs and mood',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  for(const id of ['dashboard','hud-toggle','pick-alex','pick-mira','mood-overview','mood-overview-bar'])
    assert.ok(html.includes('id="'+id+'"'),id);
  for(const id of ['hunger','energy','hygiene','fun','social','bladder'])
    assert.ok(html.includes('id="bar-'+id+'"'),id);
  assert.match(html,/id="hud-toggle"[^>]*aria-controls="dashboard"[^>]*aria-expanded="false"/);
  assert.match(css,/#dashboard\.dashboard\{\s*bottom:0;left:0;right:0/);
  assert.match(css,/#dashboard\[data-collapsed="true"\] \.character-tag,/);
  assert.match(css,/#dashboard\[data-collapsed="true"\] \.footer-actions,/);
  assert.match(css,/#dashboard\[data-collapsed="true"\] \.insight-toggle\{display:none!important;/);
  assert.match(css,/#dashboard\[data-collapsed="true"\] \.mood-overview\{/);
  assert.doesNotMatch(css,/#dashboard\[data-collapsed="true"\] \.needs\s*\{[^}]*display\s*:\s*none/);
  assert.match(game,/from '\.\/hud-panel\.js'/);
  assert.match(game,/readPreference:\(\)=>localStorage\.getItem\(HUD_COMPACT_KEY\)/);
  assert.match(game,/Math\.ceil\(\$\('dashboard'\)\.getBoundingClientRect\(\)\.height\)\+12/);
});
