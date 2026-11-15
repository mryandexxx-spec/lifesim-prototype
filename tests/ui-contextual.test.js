import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('../index.html'),css=read('../styles.css'),src=read('../src/game.js');
test('1.0r: social controls are not permanently visible on the 3D scene',()=>{
  assert.match(html,/<section class="social-bar" id="social-context" hidden /);
  assert.match(html,/id="social-context-close"/);
  assert.match(css,/#social-context\[hidden\]\{display:none!important;\}/);
});
test('1.0r: tapping ONLY the inactive resident opens social categories',()=>{
  assert.match(src,/const peer=game.selectedSim==='alex'\?'mira':'alex';\s*return pickWorldTarget/);
  assert.match(src,/if\(target\?\.kind==='resident'\)openSocialContext\(\)/);
  assert.match(src,/if\(dialogueNeedsDecision\(game\)\)return;/);
  assert.match(src,/\$\('social-context-close'\).addEventListener\('click',closeSocialContext\)/);
});
test('1.0r: furniture labels hidden by default, reversible via side control',()=>{
  assert.match(html,/<div id="hotspots"[^>]+ hidden><\/div>/);
  assert.match(html,/id="item-labels-btn"[^>]+aria-pressed="false"/);
  assert.match(src,/let itemLabelsVisible=false;/);
  assert.match(src,/\$\('hotspots'\).hidden=!itemLabelsVisible/);
  assert.match(src,/localStorage.setItem\(ITEM_LABELS_PREF/);
});
test('1.0r: hidden labels do not remove projected furniture tap actions',()=>{
  assert.match(src,/const projectedObject=\(id,meta\)=>/);
  assert.match(src,/\.\.\.Object.entries\(META\).map/);
  assert.match(src,/else if\(target\?\.kind==='object'\)select\(target.id\)/);
  assert.ok(!src.includes('if(btn.hidden)continue;'));
});
test('1.0r: modal is a compact centred window over a non-dismissable backdrop',()=>{
  assert.match(html,/id="dialogue-backdrop"[^>]+hidden/);
  assert.match(src,/\$\('dialogue-backdrop'\).hidden=!required/);
  assert.match(css,/#conversation-panel\.dialogue-required\{[\s\S]*?width:min\(440px,calc\(100vw - 28px\)\)/);
  assert.match(css,/\.dialogue-backdrop\{position:fixed/);
  assert.ok(!css.includes('width:100vw;height:100vh;height:100dvh'));
});
test('1.0r: mandatory dialogue still freezes time and allows Finish',()=>{
  assert.match(src,/const active=!game.paused&&!dialogueNeedsDecision\(game\)/);
  assert.match(src,/options.append\(conversationButton\('Завершить разговор',endPlayerConversation,true\)\)/);
  assert.match(src,/if\(dialogueNeedsDecision\(game\)\)return; \/\/ Mandatory decisions have no close path/);
});
test('1.0r: choice panel has safe-area layout and usable touch targets',()=>{
  assert.match(css,/max-height:calc\(100dvh - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\) - 34px\)/);
  assert.match(css,/min-height:47px/);
  assert.match(css,/border-radius:23px/);
});
