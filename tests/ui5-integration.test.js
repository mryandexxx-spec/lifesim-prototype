import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {newHousehold,getActor} from '../src/household.js';
import {refreshMind} from '../src/psychology.js';
import {getPerspective} from '../src/social-perspective.js';
import {relationSummary} from '../src/social-graph.js';
import {residentMoodInsight} from '../src/insight-presentation.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('../index.html'),css=read('../styles.css'),src=read('../src/game.js');
const workflow=read('../.github/workflows/pages.yml');
test('UI5 keeps meter accessibility separate from Why button',()=>{
  assert.match(html,/<div class="mood-overview">\s*<div id="mood-overview" role="meter"/);
  assert.match(html,/<button id="insight-toggle"[^>]*aria-controls="insight-panel"[^>]*aria-expanded="false"/);
  assert.match(html,/<section id="insight-panel" class="insight-panel" hidden aria-labelledby="insight-title"/);
  assert.match(html,/id="insight-causes"/);
  assert.match(html,/id="insight-relationship"[^>]*hidden/);
  assert.match(css,/\.insight-toggle\{[^}]*min-height:44px/);
});
test('UI5 shows only completed canonical receipts and hides when covered',()=>{
  assert.match(src,/const reactions=consumeSocialReactions\(game\)/);
  assert.match(src,/reactionBadges.show\(reactions\)/);
  assert.match(src,/socialReactionInsight\(newest,getActorName\)/);
  assert.match(src,/const layers=insightLayerPolicy\(/);
  assert.match(src,/\$\('social-result'\).hidden=!layers.showFeedback/);
  assert.match(html,/id="social-result"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(css,/\.social-result\{[^}]*pointer-events:none/);
  assert.ok(!src.includes('emitSocialReaction(game,'));
});
test('UI5 prevents popover stacking without cancelling real actions',()=>{
  const panel=src.slice(src.indexOf('function closeInsightPanel(){'),
    src.indexOf('function closeMindPanel()'));
  assert.ok(!panel.includes('cancelSocial('));
  assert.ok(!panel.includes('removeQueuedAction('));
  assert.ok(!panel.includes('enqueueAction('));
  assert.match(src,/if\(enteringRequired\)\{[\s\S]*?closeInsightPanel\(\)/);
  assert.match(src,/function openSocialContext\(pos\)\{[\s\S]*?closeInsightPanel\(\)/);
  assert.match(src,/\$\('plan-peek'\).addEventListener\('click',[\s\S]*?closeInsightPanel\(\)/);
  assert.match(src,/\$\('queue-toggle'\).addEventListener\('click',[\s\S]*?closeInsightPanel\(\)/);
});
test('UI5 inspector genuinely renders current resident only, textContent prevents markup execution',()=>{
  const game=newHousehold();
  getActor(game,'alex').needs.hunger=8;
  getActor(game,'mira').needs.hunger=93;
  refreshMind(getActor(game,'alex'));refreshMind(getActor(game,'mira'));
  const before=JSON.stringify(game);
  const nodes=new Map();
  const create=()=>({children:[],hidden:false,textContent:'',
    append(...items){this.children.push(...items);},
    replaceChildren(){this.children=[];},
    setAttribute(){},className:''});
  const $=id=>{if(!nodes.has(id))nodes.set(id,create());return nodes.get(id);};
  const scope={game,document:{createElement:create},$,insightOpen:true,insightDisplayKey:'',
    HOUSEHOLD_IDS:['alex','mira'],selectedActor:()=>getActor(game,game.selectedSim),
    selectedName:()=>game.selectedSim==='alex'?'Алекс':'Мира',
    getActorName:id=>id==='alex'?'Алекс':'Мира',
    relationSummary,getPerspective,residentMoodInsight};
  const a=src.indexOf('function renderInsightPanel(force=true){');
  const z=src.indexOf("$('insight-toggle').addEventListener",a);
  assert.ok(a>=0&&z>a);
  runInNewContext(src.slice(a,z),scope);
  scope.renderInsightPanel(true);
  assert.match($('insight-summary').textContent,/голоден/i);
  assert.equal($('insight-causes').children.length,1);
  assert.equal($('insight-relationship').hidden,false);
  game.selectedSim='mira';
  scope.renderInsightPanel(false);
  assert.ok(!$('insight-summary').textContent.includes('голоден'));
  assert.equal($('insight-causes').children.length,0);
  assert.equal(JSON.stringify(game),before.replace('"selectedSim":"alex"','"selectedSim":"mira"'));
});
test('UI5 release keeps Safari and both new presenter files deployed',()=>{
  assert.match(html,/сборка \/ 1\.1n/);
  assert.match(html,/styles\.css\?v=1\.1n/);
  assert.match(html,/src\/game\.js\?v=1\.1n/);
  assert.match(workflow,/node --check src\/insight-presentation\.js/);
  assert.match(workflow,/cp src\/insight-presentation\.js site\/src\//);
  assert.ok(html.includes('id="bar-social"'));
  assert.ok(html.includes('id="plan-peek"'));
});
