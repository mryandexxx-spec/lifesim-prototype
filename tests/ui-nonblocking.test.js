import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {enqueueAction,newActionQueues,pendingActions} from '../src/action-queue.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const game=read('../src/game.js');
const html=read('../index.html');
const css=read('../styles.css');

function extract(start,end){
  const from=game.indexOf(start);
  const to=game.indexOf(end,from+start.length);
  assert.ok(from>=0&&to>from,'expected game UI section: '+start);
  return game.slice(from,to);
}
function elements(){
  const nodes=new Map();
  const $=id=>{
    if(!nodes.has(id)){
      const names=new Set();
      nodes.set(id,{
        hidden:false,textContent:'',handlers:{},setAttribute(){},
        removeAttribute(){},focus(){},
        classList:{contains:cls=>names.has(cls),toggle:(cls,on)=>{
          if(on)names.add(cls);else names.delete(cls);
        }},
        addEventListener(type,callback){this.handlers[type]=callback;}
      });
    }
    return nodes.get(id);
  };
  return $;
}
test('1.0o: successful enqueue is acknowledged in queue counter and never makes a large toast',()=>{
  const $=elements(),queues=newActionQueues(['alex','mira']);
  const calls={queue:0,saves:0,toasts:[],priority:0};
  const scope={
    $,ACTIONS:{bed:{label:'Спать'}},getActorName:()=> 'Алекс',
    game:{selectedSim:'alex',actionQueues:queues},enqueueAction,pendingActions,
    preemptAutomaticForManual:()=>{calls.priority++;return null;},
    onManualCommandQueued:()=>{},
    resolveActionFurniture:()=>({instanceId:'home-bed-1'}),
    renderQueuePanel:()=>calls.queue++,
    save:()=>calls.saves++,toast:msg=>calls.toasts.push(msg)
  };
  runInNewContext(extract('function taskLabel(task){','function queuedSocial('),scope);
  assert.equal(scope.scheduleCommand({type:'object',actionId:'bed'}),true);
  assert.equal(pendingActions(queues,'alex').length,1);
  assert.equal(calls.queue,1);
  assert.equal(calls.saves,1);
  assert.equal(calls.priority,1,'manual priority is triggered after successful enqueue');
  assert.deepEqual(calls.toasts,[],'success does not create a toast over social controls');
  assert.match($('queue-feedback').textContent,/Алекс.*Спать/);
});
test('1.0o: active relationship diagnostics are not displayed without explicit debug action',()=>{
  const $=elements();
  const scope={
    $,game:{selectedSim:'alex',socialAction:{
      branchAction:{id:'acquaint.chat'},phase:'using'
    },socialGraph:{pairs:{}},paused:false},
    branchPicker:false,branchDisplayKey:'',
    relationSummary:()=>({label:'Друзья'})
  };
  runInNewContext(extract('function renderBranchPanel(force=true){',
    '/** Browser-safe, stable controls:'),scope);
  scope.renderBranchPanel(true);
  assert.equal($('branch-panel').hidden,true,
    'an ordinary friendship conversation should not show the debug overlay');
});
test('1.0o: running gift/leisure interaction does not automatically open its panel',()=>{
  const $=elements(),scope={
    $,game:{selectedSim:'alex',socialAction:{
      phase:'using',shared:{mode:'leisure',choiceId:'books'}
    },paused:false},
    sharedPicker:false,sharedDisplayKey:'',socialMenuCategory:null
  };
  runInNewContext(extract('function renderSharedPanel(force=true){',
    'function conversationButton('),scope);
  scope.renderSharedPanel(true);
  assert.equal($('shared-panel').hidden,true);
});
test('1.0q: a walking conversation stays nonblocking until choices are actually required',()=>{
  const $=elements(),scope={
    $,game:{selectedSim:'alex',socialAction:{
      phase:'walking',conversation:{topic:'daily',phase:'opening',turns:[]}
    },paused:false},
    dialogueNeedsDecision:()=>false,conversationTopicPicker:false,
    conversationDisplayKey:'',socialMenuCategory:null,
    requiredChoiceFocus:{activate:()=>{},focusChoice:()=>{}}
  };
  runInNewContext(extract('function renderConversationPanel(force=true){',
    'renderConversationPanel();\nrenderSharedPanel();'),scope);
  scope.renderConversationPanel(true);
  assert.equal($('conversation-panel').hidden,true);
  assert.equal($('conversation-btn').textContent,'Продолжить беседу');
});
test('1.0o: all three close buttons only dismiss presentation and preserve active tasks and FIFOs',()=>{
  const $=elements(),queues=newActionQueues(['alex','mira']);
  const task=enqueueAction(queues,'alex',{type:'branch',targetId:'mira',
    actionId:'acquaint.chat'});
  assert.ok(task);
  const running={branchAction:{id:'acquaint.chat'},phase:'using',initiator:'alex',partner:'mira'};
  let canceled=0;
  const rendered=[];
  const scope={
    $,game:{socialAction:running,actionQueues:queues},conversationTopicPicker:true,
    sharedPicker:true,branchPicker:true,
    renderConversationPanel:()=>rendered.push('conversation'),
    renderSharedPanel:()=>rendered.push('shared'),
    renderBranchPanel:()=>rendered.push('branch'),
    dialogueNeedsDecision:()=>false,
    cancelSocial:()=>{canceled++;}
  };
  runInNewContext(extract("$('conversation-close').addEventListener",
    '// An unobtrusive seven-tap gesture'),scope);
  $('conversation-close').handlers.click();
  $('shared-close').handlers.click();
  $('branch-close').handlers.click();
  assert.equal(canceled,0,'close buttons may not cancel actions');
  assert.equal(scope.game.socialAction,running);
  assert.equal(pendingActions(queues,'alex')[0].seq,task.seq);
  assert.equal(scope.conversationTopicPicker,false);
  assert.equal(scope.sharedPicker,false);
  assert.equal(scope.branchPicker,false);
  assert.deepEqual(rendered,['conversation','shared','branch']);
  // The deliberate queue control still has the sole user-facing stop command.
  assert.ok(game.includes("stop.textContent='Прервать текущее действие'"));
  assert.ok(game.includes("if(social&&(social.initiator===residentId||social.partner===residentId))"));
});
test('1.0o: tapping Беседа reopens an active multi-turn conversation on demand',()=>{
  const scope={
    game:{selectedSim:'alex',socialAction:{
      conversation:{topic:'daily',phase:'choice',turns:[]}
    }},
    conversationTopicPicker:false,selected:'bed',
    closeSocialPickers:()=>{},select:()=>{},closeMindPanel:()=>{},
    renderConversationPanel:()=>{scope.wasShown=true;},
    renderSocialContext:()=>{},
    wasShown:false
  };
  runInNewContext(extract('function showSocialCategory(category){',
    'for(const [id,category] of ['),scope);
  scope.showSocialCategory('conversation');
  assert.equal(scope.conversationTopicPicker,true);
  assert.equal(scope.wasShown,true,'the player can continue a dialog after closing its window');
});
test('1.0o: a toast is compact, tap-through and cannot occlude lower mobile conversation',()=>{
  const block=css.match(/\.toast\{([^}]+)\}/)?.[1]||'';
  assert.match(block,/top:calc\(env\(safe-area-inset-top\) \+ 155px\)/);
  assert.match(block,/bottom:auto/);
  assert.match(block,/pointer-events:none/);
  assert.ok(!css.includes('.toast{bottom:calc(env(safe-area-inset-bottom) + 255px)'),
    'old mobile centered toast position must be gone');
  assert.ok(!game.includes("toast(getActorName(residentId)+': запланировано"));
});
test('1.0o: closure semantics and browser cache-busting are discoverable on iPhone',()=>{
  assert.match(html,/сборка \/ 1\.1r/);
  assert.match(html,/styles\.css\?v=1\.1r/);
  assert.match(html,/src\/game\.js\?v=1\.1r/);
  assert.match(html,/id="queue-feedback"[^>]+aria-live="polite"/);
  assert.match(html,/id="branch-close"[^>]+aria-label="Закрыть окно, не прерывая действие"/);
  assert.match(html,/id="conversation-close"[^>]+aria-label="Свернуть беседу, не прерывая действие"/);
  assert.ok(!game.includes('if(game.socialAction?.branchAction)cancelSocial(game);'));
  assert.ok(!game.includes('if(game.socialAction?.conversation)cancelSocial(game);'));
  assert.ok(!game.includes('if(game.socialAction?.shared)cancelSocial(game);'));
});
