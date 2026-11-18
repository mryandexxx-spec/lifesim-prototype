import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {planPreview} from '../src/plan-preview.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('../index.html'),css=read('../styles.css'),gameSrc=read('../src/game.js');
test('1.0t mini-plan is a keyboard-usable, button-based accessible opener',()=>{
  assert.match(html,/<button id="plan-peek"[^>]*type="button"[^>]*aria-controls="queue-panel"/);
  assert.match(html,/id="plan-upcoming"[^>]*aria-hidden="true" hidden/);
  assert.match(css,/\.plan-peek\{[\s\S]*min-height:47px/);
  assert.match(gameSrc,/\$\('plan-peek'\).addEventListener\('click',\(\)=>\{/);
  assert.match(gameSrc,/renderQueuePanel\(true\)/);
  assert.ok(!html.includes('<div class="scene-badge"><span class="status-dot"'));
});
test('1.0t preview does not bypass existing social/physiological FIFO queue contract',()=>{
  assert.match(gameSrc,/pending:pendingActions\(game.actionQueues,residentId\)/);
  assert.match(gameSrc,/activeLabel:active/);
  assert.match(gameSrc,/needsReply:dialogueNeedsDecision\(game\)/);
  assert.match(gameSrc,/paused:game.paused/);
  assert.match(gameSrc,/const key=JSON.stringify\(\[residentId,plan.heading,plan.upcoming,plan.more,queueVisible\]\)/);
  const peek=gameSrc.slice(gameSrc.indexOf('function renderPlanPeek(){'),
    gameSrc.indexOf('function renderQueuePanel(force=true){'));
  assert.ok(!peek.includes('removeQueuedAction('));
  assert.ok(!peek.includes('enqueueAction('));
  assert.ok(!peek.includes('cancelSocial('));
});
function fakeDom(){
  const nodes=new Map();
  const create=()=>({
    children:[],attrs:{},textContent:'',hidden:false,className:'',
    append(...items){this.children.push(...items);},
    replaceChildren(){this.children=[];},
    setAttribute(k,v){this.attrs[k]=v;},
    handlers:{},addEventListener(k,v){this.handlers[k]=v;}
  });
  const $=id=>{if(!nodes.has(id))nodes.set(id,create());return nodes.get(id);};
  return {$,create};
}
test('live preview re-renders across residents and opens existing queue without touching tasks',()=>{
  const {$,create}=fakeDom();
  const game={
    selectedSim:'alex',paused:false,autonomy:{enabled:true},
    actionQueues:{alex:[{seq:1,type:'object',actionId:'fridge'}],
      mira:[{seq:2,type:'shared',actionId:'books'}]},
    actors:{alex:{event:'Размышляет'},mira:{event:'Гуляет'}}
  };
  const scope={
    $,document:{createElement:create},game,planPeekKey:'',queueVisible:false,
    getActor:(g,id)=>g.actors[id],getActorName:id=>id==='alex'?'Алекс':'Мира',
    selectedName:()=>game.selectedSim,activeTaskLabel:()=>null,
    pendingActions:(qs,id)=>qs[id],
    taskLabel:task=>task.actionId,
    planPreview,
    planTaskIcon:()=> '•',
    dialogueNeedsDecision:()=>false,
    closeInsightPanel:()=>{},setViewOpen:()=>{},setHomeOpen:()=>{},closeSocialContext:()=>{},
    select:()=>{},closeMindPanel:()=>{},
    ACTIONS:{},
    renderQueuePanel:()=>{scope.fullOpened=true;}
  };
  const start=gameSrc.indexOf('function renderPlanPeek(){');
  const end=gameSrc.indexOf('function renderQueuePanel(force=true){',start);
  assert.ok(start>=0&&end>start);
  runInNewContext(gameSrc.slice(start,end),scope);
  scope.renderPlanPeek();
  assert.match($('status-text').textContent,/Ожидает начала/);
  assert.equal($('plan-upcoming').children.length,1);
  assert.match($('plan-peek').attrs['aria-label'],/Алекс/);
  game.selectedSim='mira';
  scope.renderPlanPeek();
  assert.match($('plan-peek').attrs['aria-label'],/Мира/);
  assert.equal($('plan-upcoming').children.length,1);
  $('plan-peek').handlers.click();
  assert.equal(scope.queueVisible,true);
  assert.equal(scope.fullOpened,true);
  assert.deepEqual(game.actionQueues.alex,[{seq:1,type:'object',actionId:'fridge'}]);
});
