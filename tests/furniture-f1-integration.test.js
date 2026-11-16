import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const game=read('../src/game.js');
const html=read('../index.html');
const css=read('../styles.css');
const workflow=read('../.github/workflows/pages.yml');
test('F1 mobile UI has real mode enter/exit, four actual movable objects and accessible touch controls',()=>{
  for(const id of ['furnish-toggle','furnish-exit','furniture-editor','furnish-items',
    'furnish-left','furnish-right','furnish-up','furnish-down','furnish-rotate',
    'furnish-undo','furnish-redo','furnish-feedback'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(html,/id="furnish-toggle"[^>]+aria-pressed="false"/);
  assert.ok(html.indexOf('id="furnish-toggle"')>html.indexOf('id="pause-btn"'));
  assert.ok(html.indexOf('id="furnish-toggle"')<html.indexOf('id="speed-btn"'),
    'F1 entrance remains visible on a short landscape iPhone');
  assert.match(html,/id="furniture-editor"[^>]+hidden/);
  assert.match(css,/\.furniture-editor\[hidden\]\{display:none!important;/);
  assert.match(css,/\.app-shell\[data-furnish-mode="true"\] #dashboard/);
  assert.match(css,/\.furnish-commands button\{min-width:44px;min-height:44px/);
  assert.match(game,/game\.world\.furniture\.instances\.filter\(i=>F1_MOVEABLE_PREFABS\.includes\(i\.prefabId\)\)/);
});
test('F1 edit mode freezes sim without overwriting persisted manual pause or queuing actions',()=>{
  assert.match(game,/let furnishMode=false/);
  assert.match(game,/const active=!game.paused&&!furnishMode&&!dialogueNeedsDecision\(game\)/);
  assert.match(game,/if\(dialogueNeedsDecision\(game\)\)\{\s*toast\('Сначала выбери ответ/);
  assert.match(game,/editSession=createFurnitureEditor\(game\.world\.furniture,game\.shop\)/);
  assert.match(game,/game.world.furniture=result.world/);
  assert.match(game,/editorContext\(\)/);
  assert.match(game,/paths\[id\]=\{points:null,index:0,id:null\}/);
  assert.doesNotMatch(game,/furnishMode=true;\s*game\.paused=true/);
  assert.match(game,/if\(dialogueNeedsDecision\(game\)\|\|furnishMode\)return/);
});
test('F1 groups real multi-part primitives under saved instance nodes and rewires table occlusion',()=>{
  for(const type of ['nightstand','table','tv','plant','bed','sofa','fridge','shower','toilet']){
    assert.ok(game.includes("withDecor('"+type+"'"),type);
  }
  assert.match(game,/entity\.setLocalPosition\(grouped\?x-decorDrawing\.origin\.x:x,y,/);
  assert.match(game,/node\.setEulerAngles\(0,-pose\.yaw,0\)/);
  assert.match(game,/const table=game\.world\.furniture\.instances\.find\(i=>i\.prefabId==='table'\)/);
  assert.match(game,/kind:'blocker',id:'coffee-table'/);
  assert.match(game,/furnitureFloorPoint\(near,far\)/);
  assert.match(game,/editDrag=\{pointerId:event\.pointerId,instanceId:id/);
  assert.match(game,/if\(furnishMode&&endEditorDrag\(event\)\)return/);
});
test('F1 static deploy includes module and retains critical needs/assets',()=>{
  assert.match(workflow,/node --check src\/furniture-editor\.js/);
  assert.match(workflow,/cp src\/furniture-catalog\.js src\/furniture-layout\.js src\/furniture-editor\.js src\/furniture-transform\.js src\/furniture-hold\.js site\/src\//);
  assert.match(workflow,/cp src\/need-balance\.js site\/src\//);
  assert.ok(read('../src/household.js').includes('root.world={furniture:restoreFurnitureWorld'));
  assert.ok(read('../src/toilet-interaction.js').includes('TOILET_LAYOUT'));
});
