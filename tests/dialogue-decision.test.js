import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {dialogueNeedsDecision,applyDialogueDecision} from '../src/dialogue-decision.js';
import {newHousehold,loadHousehold} from '../src/household.js';
import {startConversation,arriveSocial,chooseSocialLine,nextSocialLine,
  finishSocialConversation,cancelSocial} from '../src/relationships.js';
import {conversationOptions,CONVERSATION_MAX_TURNS} from '../src/conversation-engine.js';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const gameSource=read('../src/game.js'),html=read('../index.html'),
  css=read('../styles.css'),workflow=read('../.github/workflows/pages.yml');
const clone=x=>JSON.parse(JSON.stringify(x)),position={x:-.2,z:1.85};
function started(){
  const root=newHousehold();
  assert.equal(startConversation(root,'alex',position,'daily'),true);
  assert.equal(arriveSocial(root),true);
  assert.ok(dialogueNeedsDecision(root));
  return root;
}
const choose=root=>applyDialogueDecision(root,r=>chooseSocialLine(r,
  conversationOptions(r.socialAction.conversation)[0].id));
const proceed=root=>applyDialogueDecision(root,r=>nextSocialLine(r));
const end=root=>applyDialogueDecision(root,r=>r.socialAction?.conversation?.turns?.length
  ?finishSocialConversation(r):cancelSocial(r));
function extract(start,end){
  const a=gameSource.indexOf(start),b=gameSource.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'UI snippet missing: '+start);
  return gameSource.slice(a,b);
}
function fakeDom(){
  const nodes=new Map();
  const $=id=>{
    if(!nodes.has(id)){
      const classes=new Set(),attrs=new Map();
      nodes.set(id,{hidden:false,textContent:'',children:[],attrs,
        classList:{contains:name=>classes.has(name),toggle:(name,on)=>
          on?classes.add(name):classes.delete(name)},
        setAttribute:(key,value)=>attrs.set(key,value),
        removeAttribute:key=>attrs.delete(key),
        querySelectorAll(){return this.children;},
        replaceChildren(){this.children=[];},
        append(...els){this.children.push(...els);},
        focus(){this.focused=true;},
        addEventListener(key,handler){this.events??={};this.events[key]=handler;}
      });
    }
    return nodes.get(id);
  };
  return $;
}
test('1.0q: mandatory choice applies only to a real using-phase multi-turn social action',()=>{
  const root=newHousehold();
  assert.equal(dialogueNeedsDecision(root),false);
  startConversation(root,'alex',position,'daily');
  assert.equal(dialogueNeedsDecision(root),false);
  arriveSocial(root);
  for(const phase of ['opening','response','followUp']){
    root.socialAction.conversation.phase=phase;
    assert.equal(dialogueNeedsDecision(root),true);
  }
  root.socialAction.conversation.phase='invalid';
  assert.equal(dialogueNeedsDecision(root),false);
});
test('1.0q: simulation time and animation stop while player has decisions',()=>{
  assert.ok(gameSource.includes('const active=!game.paused&&!dialogueNeedsDecision(game);'));
  assert.ok(gameSource.includes('const animDt=active?dt:0;'));
  assert.ok(gameSource.includes('tickHousehold(game,.30 * game.speed)'));
  assert.ok(gameSource.includes('renderPauseButton();'));
});
test('1.0q: UI choice can be confirmed despite manual pause without lifting saved pause',()=>{
  const root=started(),choice=conversationOptions(root.socialAction.conversation)[0].id;
  root.paused=true;
  assert.equal(chooseSocialLine(root,choice),null,'normal headless pause guard holds');
  const before=root.minutes;
  assert.ok(choose(root));
  assert.equal(root.paused,true);
  assert.equal(root.minutes,before);
  assert.equal(root.socialAction.conversation.phase,'response');
});
test('1.0q: every step remains gated until explicit completion',()=>{
  const root=started(),minutes=root.minutes;
  assert.ok(choose(root));
  assert.equal(dialogueNeedsDecision(root),true);
  assert.equal(proceed(root),true);
  assert.equal(root.socialAction.conversation.phase,'followUp');
  assert.equal(dialogueNeedsDecision(root),true);
  assert.ok(choose(root));
  assert.ok(end(root));
  assert.equal(root.socialAction,null);
  assert.equal(dialogueNeedsDecision(root),false);
  assert.equal(root.minutes,minutes);
});
test('1.0q: end at first dialogue screen adds no friendship, memory or social receipt',()=>{
  const root=started(),affinity=root.relationship.affinity,
    seq=root.socialGraph.nextSeq,memories=root.mind.memories.length;
  assert.equal(end(root),true);
  assert.equal(root.socialAction,null);
  assert.equal(root.relationship.affinity,affinity);
  assert.equal(root.socialGraph.nextSeq,seq);
  assert.equal(root.mind.memories.length,memories);
});
test('1.0q: finished spoken line applies once, cannot be replayed',()=>{
  const root=started(),seq=root.socialGraph.nextSeq;
  assert.ok(choose(root));assert.ok(end(root));
  assert.equal(root.socialGraph.nextSeq,seq+1);
  assert.equal(end(root),null);
  assert.equal(root.socialGraph.nextSeq,seq+1);
});
test('1.0q: mid-dialogue save restores required screen and preserves manual pause',()=>{
  const root=started();assert.ok(choose(root));root.paused=true;
  const loaded=loadHousehold(clone(root));
  // The existing v1 loader intentionally resets manual pause on page reload.
  // The restored active conversation independently reestablishes the gate.
  assert.equal(loaded.paused,false);
  assert.equal(dialogueNeedsDecision(loaded),true);
  loaded.paused=true; // A user pause during this session must be respected.
  assert.equal(loaded.socialAction.conversation.phase,'response');
  assert.equal(proceed(loaded),true);
  assert.equal(loaded.paused,true);
  assert.ok(choose(loaded));assert.ok(end(loaded));
  assert.equal(loaded.paused,true);
  assert.equal(loaded.socialAction,null);
  assert.equal(loaded.version,1);
  assert.equal(loaded.socialGraph.schema,1);
  assert.equal(loaded.actionQueues.schema,1);
});
test('1.0q: exception in decision restores manual pause and session',()=>{
  for(const paused of [false,true]){
    const root=started();root.paused=paused;
    assert.throws(()=>applyDialogueDecision(root,()=>{throw Error('broken UI');}),/broken UI/);
    assert.equal(root.paused,paused);
    assert.ok(dialogueNeedsDecision(root));
  }
  let called=false;
  assert.equal(applyDialogueDecision(newHousehold(),()=>{called=true;}),null);
  assert.equal(called,false);
});
test('1.0q: three-turn limit remains completable, not infinite',()=>{
  const root=started();
  for(let n=0;n<CONVERSATION_MAX_TURNS;n++){
    assert.ok(choose(root));
    assert.ok(dialogueNeedsDecision(root));
    if(n<CONVERSATION_MAX_TURNS-1)assert.equal(proceed(root),true);
    else assert.equal(proceed(root),false);
  }
  assert.ok(end(root));
  assert.equal(root.socialAction,null);
});
test('1.0s: actual browser panel is compact, modal, unclosable and has end action',()=>{
  const $=fakeDom();
  const scope={
    $,game:{selectedSim:'alex',paused:false,socialAction:{
      phase:'using',initiator:'alex',partner:'mira',
      conversation:{topic:'daily',phase:'opening',turns:[]}}},
    dialogueNeedsDecision:()=>true,conversationTopicPicker:false,
    socialMenuCategory:'conversation',conversationDisplayKey:'',
    CONVERSATION_TOPICS:{daily:{label:'Разговор о дне'}},
    conversationTranscript:()=>[],getActorName:id=>id,
    conversationOptions:()=>[{id:'daily.ask',label:'Как прошёл день?'}],
    conversationButton:(label,handler,secondary=false)=>({label,handler,secondary}),
    document:{createElement:()=>({textContent:'',className:''})},
    endPlayerConversation:()=>{},CONVERSATION_MAX_TURNS:3,
    requiredChoiceFocus:{activate:required=>{if(required)$('conversation-panel').focus();},focusChoice:()=>{}},
    setViewOpen:()=>{},closeInsightPanel:()=>{},
    renderSocialContext:()=>{},renderSocialMenu:()=>{},
    renderSharedPanel:()=>{},renderBranchPanel:()=>{},
    socialContextVisible:false,socialAnchor:null,sharedPicker:false,branchPicker:false
  };
  runInNewContext(extract('function renderConversationPanel(force=true){',
    'renderConversationPanel();\nrenderSharedPanel();'),scope);
  scope.renderConversationPanel(true);
  assert.equal($('conversation-panel').hidden,false);
  assert.equal($('conversation-close').hidden,true);
  assert.equal($('dialogue-backdrop').hidden,false);
  assert.equal($('conversation-panel').classList.contains('dialogue-required'),true);
  assert.equal($('conversation-panel').attrs.get('aria-modal'),'true');
  assert.equal($('conversation-panel').focused,true);
  assert.match($('conversation-subtitle').textContent,/Игровое время остановлено/);
  assert.deepEqual($('conversation-options').children.map(x=>x.label),
    ['Как прошёл день?','Завершить разговор']);
});
test('1.0q: even a synthetic click on hidden X cannot dismiss a required prompt',()=>{
  const $=fakeDom(),root=started();let rerender=0;
  const scope={$ ,game:root,dialogueNeedsDecision,conversationTopicPicker:true,
    renderConversationPanel:()=>rerender++};
  runInNewContext(extract("$('conversation-close').addEventListener",
    "$('shared-close').addEventListener"),scope);
  $('conversation-close').events.click();
  assert.equal(scope.conversationTopicPicker,true);
  assert.equal(rerender,0);
  assert.ok(dialogueNeedsDecision(root));
});
test('1.0s: Safari safe-area, compact modal, Pages copy, mood M1 still present',()=>{
  assert.match(html,/сборка \/ 1\.0aa/);
  assert.match(html,/styles\.css\?v=1\.0aa/);
  assert.match(html,/src\/game\.js\?v=1\.0aa/);
  assert.match(html,/id="conversation-panel"[^>]+tabindex="-1"/);
  assert.match(css,/#conversation-panel\.dialogue-required\{/);
  assert.match(css,/width:min\(440px,calc\(100vw - 28px\)\)/);
  assert.match(css,/\.dialogue-backdrop\{position:fixed/);
  assert.ok(!css.includes('width:100vw;height:100vh;height:100dvh'),'required choice must not become a fullscreen sheet');
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/#conversation-panel\.dialogue-required #conversation-close\{display:none!important;\}/);
  assert.match(workflow,/node --check src\/dialogue-decision\.js/);
  assert.match(workflow,/node --check src\/world-interactions\.js/);
  assert.match(workflow,/src\/conversation-engine\.js src\/dialogue-decision\.js src\/world-interactions\.js/);
  assert.ok(gameSource.includes("options.append(conversationButton('Завершить разговор',endPlayerConversation,true));"));
  assert.ok(gameSource.includes("import {needPresentation,moodPresentation,moodOrbitPoint}"));
  assert.match(html,/id="mood-overview"/);
  assert.match(css,/\.mood-orbit/);
  assert.ok(gameSource.includes("stop.textContent='Прервать текущее действие'"));
});
