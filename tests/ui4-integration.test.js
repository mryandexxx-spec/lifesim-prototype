import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const html=read('../index.html'),css=read('../styles.css'),src=read('../src/game.js');
const pages=read('../.github/workflows/pages.yml');
test('UI4: View exposes old controls in a single optional popover, not permanently on the tray',()=>{
 const tray=html.slice(html.indexOf('<aside class="control-tray"'),html.indexOf('</aside>')+8);
 assert.match(tray,/id="view-toggle"[^>]*aria-controls="view-panel"[^>]*aria-expanded="false"/);
 assert.doesNotMatch(tray,/id="item-labels-btn"/);
 assert.doesNotMatch(tray,/id="mesh-model-btn"/);
 assert.match(html,/<section id="view-panel" class="view-panel" hidden /);
 assert.match(html,/id="item-labels-btn"[^>]*aria-pressed="false"/);
 assert.match(html,/id="mesh-model-btn"[^>]*aria-pressed="true"/);
 assert.match(src,/\$\('view-toggle'\).addEventListener\('click',\(\)=>setViewOpen\(!viewOpen\)\)/);
 assert.match(src,/setViewOpen\(false,\{restoreFocus:true\}\)/);
 assert.match(src,/dialogueNeedsDecision\(game\)\)return;/);
});
test('UI4: social categories anchor to clicked world resident and reuse placement for submenu',()=>{
 assert.match(src,/function openSocialContext\(pos\)/);
 assert.match(src,/if\(target\?\.kind==='resident'\)openSocialContext\(pos\)/);
 assert.match(src,/socialAnchor=pos\?\{x:pos.x-rect.left,y:pos.y-rect.top\}:null/);
 assert.match(src,/function placeSocialPopover\(panel\)/);
 assert.match(src,/const pos=contextualPlacement\(/);
 assert.match(src,/scheduleSocialPosition\(\);/);
 assert.match(css,/#social-context\.context-popover,/);
 assert.match(css,/right:auto!important;bottom:auto!important/);
 assert.match(css,/max-height:var\(--context-max-height,50dvh\)/);
});
test('UI4: no silent switch of selected sim when a social category is tapped',()=>{
 assert.ok(!src.includes("game.selectedSim='alex'?'mira':'alex'"));
 assert.match(src,/const peer=game.selectedSim==='alex'\?'mira':'alex';/);
 const start=src.indexOf('function showSocialCategory(category){');
 const end=src.indexOf('for(const [id,category] of [',start);
 assert.ok(start>=0&&end>start);
 for(const actorId of ['alex','mira']){
   const game={selectedSim:actorId};
   const seen=[];
   const scope={game,relationSummary:(graph,actor,peer)=>{
     seen.push([actor,peer]);return {friendship:'none'};
   },toast:()=>{},};
   runInNewContext(src.slice(start,end),scope);
   scope.showSocialCategory('friendship');
   assert.equal(game.selectedSim,actorId);
   assert.equal(seen[0][0],actorId);
   assert.equal(seen[0][1],actorId==='alex'?'mira':'alex');
 }
});
test('UI4: a mandatory dialogue is a genuine modal with no keyboard/scene bypass',()=>{
 assert.match(src,/const requiredChoiceFocus=createRequiredChoiceFocus\(/);
 assert.match(src,/requiredChoiceFocus.activate\(required\)/);
 assert.match(src,/requiredChoiceFocus.focusChoice\(enteringRequired\?0:formerFocusIndex\)/);
 assert.match(src,/panel.setAttribute\('aria-describedby','conversation-subtitle'\)/);
 assert.match(src,/if\(dialogueNeedsDecision\(game\)\)return; \/\/ Mandatory decisions have no close path/);
 assert.match(css,/#conversation-panel\.dialogue-required\{/);
 assert.match(css,/#conversation-panel\.dialogue-required #conversation-close\{display:none!important;\}/);
});
test('UI4: visible touch controls have accessible minimum hit areas',()=>{
 assert.match(css,/\.view-panel-head button\{width:44px;height:44px;min-width:44px/);
 assert.match(css,/#social-context \.social-dismiss,[\s\S]*min-width:44px;min-height:44px/);
 assert.match(css,/#social-context \.social-controls button\{min-height:46px/);
});
test('UI4: save schema untouched and Pages packages both new modules',()=>{
 assert.match(pages,/node --check src\/ui-layout\.js/);
 assert.match(pages,/node --check src\/required-choice-focus\.js/);
 assert.match(pages,/cp src\/plan-preview\.js src\/ui-layout\.js src\/required-choice-focus\.js site\/src\//);
 assert.match(src,/localStorage.getItem\(SAVE_KEY\)/);
 assert.match(html,/сборка \/ 1\.2s/);
 assert.match(html,/styles\.css\?v=1\.2s/);
 assert.match(html,/src\/game\.js\?v=1\.2s/);
});
