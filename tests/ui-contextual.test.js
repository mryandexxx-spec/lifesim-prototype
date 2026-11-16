import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('../index.html'),css=read('../styles.css'),src=read('../src/game.js');
test('1.0s: social controls are not permanently visible on the 3D scene',()=>{
  assert.match(html,/<section class="social-bar" id="social-context" hidden /);
  assert.match(html,/id="social-context-close"/);
  assert.match(css,/#social-context\[hidden\],\.dialogue-backdrop\[hidden\]\{display:none!important;\}/);
});
test('1.0s: tapping ONLY the inactive resident opens social categories',()=>{
  assert.match(src,/return pickWorldRayTarget\(near,far,\s*\[\.\.\.residents,\.\.\.sofaCopies,\.\.\.bedCopies,\.\.\.tvCopies,\.\.\.movedVolumes,\.\.\.blockers\]\)/);
  assert.match(src,/if\(target\?\.kind==='resident'\)openSocialContext\(pos\)/);
  assert.match(src,/if\(dialogueNeedsDecision\(game\)\)return;/);
  assert.match(src,/\$\('social-context-close'\).addEventListener\('click',closeSocialContext\)/);
});
test('1.0s: furniture labels hidden by default, reversible via side control',()=>{
  assert.match(html,/<div id="hotspots"[^>]+ hidden><\/div>/);
  assert.match(html,/id="item-labels-btn"[^>]+aria-pressed="false"/);
  assert.match(src,/let itemLabelsVisible=false;/);
  assert.match(src,/\$\('hotspots'\).hidden=!itemLabelsVisible/);
  assert.match(src,/localStorage.setItem\(ITEM_LABELS_PREF/);
});
test('1.0u: hidden labels do not remove depth-aware furniture tap actions',()=>{
  assert.match(src,/const hitVolumes=\[\];/);
  assert.match(src,/const movedVolumes=hitVolumes\.map\(volume=>/);
  assert.match(src,/const touchBox=\(id,name,x,y,z,sx,sy,sz,material\)=>/);
  assert.match(src,/return pickWorldRayTarget\(near,far,\s*\[\.\.\.residents,\.\.\.sofaCopies,\.\.\.bedCopies,\.\.\.tvCopies,\.\.\.movedVolumes,\.\.\.blockers\]\)/);
  assert.match(src,/else if\(target\?\.kind==='object'\)select\(target.id,target.instanceId\)/);
  assert.ok(!src.includes('if(btn.hidden)continue;'));
});
test('1.0s: modal is a compact centred window over a non-dismissable backdrop',()=>{
  assert.match(html,/id="dialogue-backdrop"[^>]+hidden/);
  assert.match(src,/\$\('dialogue-backdrop'\).hidden=!required/);
  assert.match(css,/#conversation-panel\.dialogue-required\{[\s\S]*?width:min\(440px,calc\(100vw - 28px\)\)/);
  assert.match(css,/\.dialogue-backdrop\{position:fixed/);
  assert.ok(!css.includes('width:100vw;height:100vh;height:100dvh'));
});
test('1.0s: mandatory dialogue still freezes time and allows Finish',()=>{
  assert.match(src,/const active=!game.paused&&!furnishMode&&!dialogueNeedsDecision\(game\)/);
  assert.match(src,/options.append\(conversationButton\('Завершить разговор',endPlayerConversation,true\)\)/);
  assert.match(src,/if\(dialogueNeedsDecision\(game\)\)return; \/\/ Mandatory decisions have no close path/);
});
test('1.0s: choice panel has safe-area layout and usable touch targets',()=>{
  assert.match(css,/max-height:calc\(100dvh - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\) - 34px\)/);
  assert.match(css,/min-height:47px/);
  assert.match(css,/border-radius:23px/);
});
