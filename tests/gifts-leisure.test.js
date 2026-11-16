import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GIFT_CATALOG,LEISURE_CATALOG,GIFT_DURATION,INVENTORY_LIMIT,
  starterInventory,restoreInventory,inventoryFor,createSharedSession,
  restoreSharedSession,sharedDuration,evaluateGift,evaluateLeisure} from '../src/gifts-leisure.js';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {startSharedSocial,arriveSocial,cancelSocial,startSocial,
  tickSocial,SOCIAL_ACTIONS,startConversation,chooseSocialLine,finishSocialConversation} from '../src/relationships.js';
import {SAVE_KEY} from '../src/simulation.js';
import {createProfile} from '../src/trait-catalog.js';

const point={x:-.2,z:1.85},copy=v=>JSON.parse(JSON.stringify(v));
function start(s,mode,choiceId,id='alex'){
  assert.equal(startSharedSocial(s,id,point,mode,choiceId),true);
  assert.equal(arriveSocial(s),true);
}
function finish(s,minutes){
  tickHousehold(s,minutes);
  assert.equal(s.socialAction,null);
}
test('small original catalog contains gifts and three shared activities with valid durations',()=>{
  assert.deepEqual(Object.keys(GIFT_CATALOG),['book','postcard','sketch','boardgame']);
  assert.deepEqual(Object.keys(LEISURE_CATALOG),['music','books','games','tv']);
  assert.equal(GIFT_DURATION,12);
  assert.equal(sharedDuration({mode:'gift',choiceId:'a1'}),12);
  assert.equal(sharedDuration({mode:'leisure',choiceId:'games'}),36);
  assert.equal(sharedDuration({mode:'leisure',choiceId:'unknown'}),null);
});
test('fresh game has independently owned, uniquely identified physical items',()=>{
  const s=newHousehold(),all=[...s.inventory.alex,...s.inventory.mira];
  assert.equal(all.length,4);
  assert.equal(new Set(all.map(x=>x.id)).size,4);
  assert.equal(s.inventory.alex[0].type,'postcard');
  assert.equal(s.inventory.mira[0].type,'book');
  assert.notEqual(s.inventory.alex,s.inventory.mira);
  assert.deepEqual(inventoryFor(s,'alien'),[]);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
});
test('old v1 save without an inventory receives the starter collection without changing other fields',()=>{
  const s=newHousehold();s.relationship.affinity=77;
  s.needs.energy=15;s.otherSim.needs.hunger=22;
  delete s.inventory;
  const loaded=loadHousehold(copy(s));
  assert.deepEqual(loaded.inventory,starterInventory());
  assert.equal(loaded.relationship.affinity,77);
  assert.equal(loaded.needs.energy,15);
  assert.equal(loaded.otherSim.needs.hunger,22);
  assert.equal(loaded.version,1);
});
test('present empty inventory stays empty on reload and never respawns gifts',()=>{
  const s=newHousehold();
  s.inventory={alex:[],mira:[]};
  const r=loadHousehold(copy(s));
  assert.deepEqual(r.inventory,s.inventory);
  assert.equal(createSharedSession(r,'alex','gift','a1'),null);
});
test('untrusted inventory is bounded, duplicates across residents removed, labels never accepted',()=>{
  const raw={alex:[{id:'a1',type:'postcard',label:'<script>'},
    {id:'a1',type:'book'},{id:'other',type:'book'},
    {id:'a2',type:'<b>'},...Array.from({length:40},(_,i)=>({id:'a'+(i+3),type:'sketch'}))],
  mira:[{id:'a1',type:'postcard'},{id:'m1',type:'book'}]};
  const validated=restoreInventory(raw);
  assert.equal(validated.alex.length,INVENTORY_LIMIT);
  assert.deepEqual(validated.alex[0],{id:'a1',type:'postcard'});
  assert.deepEqual(validated.mira,[{id:'m1',type:'book'}]);
  assert.equal(restoreInventory({alex:[],mira:[]}).alex.length,0);
  assert.deepEqual(restoreInventory(false),{alex:[],mira:[]});
});
test('gift route reserves both residents and does not transfer an item until completion',()=>{
  const s=newHousehold();
  assert.equal(startSharedSocial(s,'alex',point,'gift','a1'),true);
  assert.equal(startSharedSocial(s,'mira',point,'leisure','music'),false);
  assert.equal(s.socialAction.phase,'walking');
  assert.ok(s.inventory.alex.some(x=>x.id==='a1'));
  tickHousehold(s,90);
  assert.ok(s.inventory.alex.some(x=>x.id==='a1'));
  assert.equal(s.relationship.affinity,50);
  assert.equal(s.mind.memories.length,0);
  arriveSocial(s);tickHousehold(s,6);
  assert.ok(s.inventory.alex.some(x=>x.id==='a1'));
});
test('liked postcard transfers to Mira once and produces personal feelings and memories',()=>{
  const s=newHousehold(),affinity=s.relationship.affinity;
  start(s,'gift','a1');finish(s,GIFT_DURATION+1);
  assert.equal(s.inventory.alex.some(x=>x.id==='a1'),false);
  assert.equal(s.inventory.mira.filter(x=>x.id==='a1').length,1);
  assert.equal(s.relationship.affinity,affinity+5);
  assert.equal(s.mind.memories.at(-1).id,'gift.given');
  assert.equal(s.otherSim.mind.memories.at(-1).id,'gift.liked');
  assert.equal(s.otherSim.mind.emotions.at(-1).source,'gift.liked');
  assert.equal(s.relationship.views.mira.sentiments.at(-1).id,'gift.liked');
  tickHousehold(s,100);
  assert.equal(s.inventory.mira.filter(x=>x.id==='a1').length,1);
  assert.equal(s.otherSim.mind.memories.filter(m=>m.id==='gift.liked').length,1);
  assert.equal(s.relationship.affinity,affinity+5);
});
test('Mira can give a loved book to Alex, without tying recipient preference to gender',()=>{
  const s=newHousehold();
  const reaction=evaluateGift(s,'mira',{id:'m1',type:'book'});
  assert.equal(reaction.liked,true);
  start(s,'gift','m1','mira');finish(s,13);
  assert.equal(s.inventory.alex.some(x=>x.id==='m1'),true);
  assert.equal(s.mind.memories.at(-1).id,'gift.liked');
  assert.equal(s.otherSim.mind.memories.at(-1).id,'gift.given');
});
test('unwanted gift is declined, remains with the original owner, and leaves a negative impression',()=>{
  const s=newHousehold();
  s.otherSim.personality=createProfile(['temperament.cheerful','social.outgoing'],
    {likes:['music'],dislikes:['drawing']});
  s.relationship.views.mira.trust=0;
  s.relationship.views.mira.tension=95;
  const evaluation=evaluateGift(s,'alex',{id:'a2',type:'sketch'});
  assert.equal(evaluation.accepted,false);
  start(s,'gift','a2');finish(s,13);
  assert.equal(s.inventory.alex.some(x=>x.id==='a2'),true);
  assert.equal(s.inventory.mira.some(x=>x.id==='a2'),false);
  assert.equal(s.relationship.affinity,48);
  assert.equal(s.mind.memories.at(-1).id,'gift.rejected');
  assert.equal(s.otherSim.mind.memories.at(-1).id,'gift.refused');
  assert.equal(s.otherSim.mind.emotions.at(-1).source,'gift.refused');
});
test('neutral gift can be accepted politely without a guaranteed liked bonus',()=>{
  const s=newHousehold();
  const reaction=evaluateGift(s,'alex',{id:'a2',type:'sketch'});
  assert.equal(reaction.accepted,true);
  assert.equal(reaction.liked,false);
  start(s,'gift','a2');finish(s,13);
  assert.equal(s.otherSim.mind.memories.at(-1).id,'gift.neutral');
  assert.equal(s.relationship.affinity,51);
  assert.equal(s.inventory.mira.some(x=>x.id==='a2'),true);
});
test('gift remains with giver if action cancelled before or after reaching partner',()=>{
  for(const use of [false,true]){
    const s=newHousehold();
    assert.equal(startSharedSocial(s,'alex',point,'gift','a1'),true);
    if(use){arriveSocial(s);tickHousehold(s,8);}
    assert.equal(cancelSocial(s),true);
    tickHousehold(s,100);
    assert.ok(s.inventory.alex.some(x=>x.id==='a1'));
    assert.ok(!s.inventory.mira.some(x=>x.id==='a1'));
    assert.equal(s.mind.memories.length,0);
    assert.equal(s.relationship.affinity,50);
  }
});
test('pause freezes transfer, time, need changes and inventory',()=>{
  const s=newHousehold();start(s,'gift','a1');
  s.paused=true;const original=copy(s);
  tickHousehold(s,500);
  assert.deepEqual(s,original);
  s.paused=false;finish(s,13);
  assert.equal(s.inventory.mira.some(x=>x.id==='a1'),true);
});
test('x3 uses elapsed in-game minutes and neither skips nor doubles gift effects',()=>{
  const s=newHousehold();start(s,'gift','a1');
  s.speed=3;tickHousehold(s,6);
  assert.ok(s.socialAction);
  assert.equal(s.socialAction.elapsed,6);
  finish(s,7);
  assert.equal(s.inventory.mira.filter(x=>x.id==='a1').length,1);
  assert.equal(s.relationship.affinity,55);
});
test('saved in-progress gift (using) resumes and completes with exactly one transfer',()=>{
  const s=newHousehold();start(s,'gift','a1');
  tickHousehold(s,5);
  const r=loadHousehold(copy(s));
  assert.equal(r.socialAction.shared.choiceId,'a1');
  assert.equal(r.socialAction.elapsed,5);
  assert.ok(r.inventory.alex.some(x=>x.id==='a1'));
  finish(r,8);
  const saved=loadHousehold(copy(r));
  assert.equal(saved.socialAction,null);
  assert.equal(saved.inventory.mira.filter(x=>x.id==='a1').length,1);
  assert.equal(saved.mind.memories.filter(m=>m.id==='gift.given').length,1);
});
test('saved walking leisure and long leisure >18 game minutes reload safely',()=>{
  const s=newHousehold();
  assert.equal(startSharedSocial(s,'alex',point,'leisure','games'),true);
  let r=loadHousehold(copy(s));
  assert.equal(r.socialAction.phase,'walking');
  arriveSocial(r);tickHousehold(r,22);
  assert.ok(r.socialAction);
  assert.equal(r.socialAction.elapsed,22);
  r=loadHousehold(copy(r));
  assert.equal(r.socialAction.elapsed,22);
  finish(r,15);
  assert.equal(r.relationship.affinity,54);
});
test('music and leisure improve BOTH fun meters and record individual impressions',()=>{
  const s=newHousehold();
  const a=s.needs.fun,b=s.otherSim.needs.fun;
  start(s,'leisure','music');finish(s,29);
  assert.equal(s.needs.fun>a,true);
  assert.equal(s.otherSim.needs.fun>b,true);
  assert.equal(s.mind.memories.at(-1).id,'leisure.music');
  assert.equal(s.otherSim.mind.memories.at(-1).id,'leisure.music');
  assert.equal(s.relationship.views.alex.sentiments.at(-1).id,'leisure.music');
  assert.equal(s.relationship.affinity,54);
});
test('high personal tension can make recipient decline shared leisure without need bonuses',()=>{
  const s=newHousehold();s.relationship.views.mira.trust=0;
  s.relationship.views.mira.tension=100;
  const effect=evaluateLeisure(s,'alex','music');
  assert.equal(effect.accepted,false);
  const before=copy(s.needs),beforeOther=copy(s.otherSim.needs);
  start(s,'leisure','music');finish(s,29);
  assert.equal(s.relationship.affinity,49);
  assert.equal(s.mind.memories.at(-1).id,'leisure.refused');
  assert.equal(s.otherSim.mind.memories.at(-1).id,'leisure.refused');
  assert.ok(s.needs.fun<=before.fun);
  assert.ok(s.otherSim.needs.fun<=beforeOther.fun);
});
test('refusal never destroys goods, and no infinite gift minting is possible',()=>{
  const s=newHousehold();
  start(s,'gift','a1');finish(s,13);
  assert.equal(startSharedSocial(s,'alex',point,'gift','a1'),false);
  const total=inventoryFor(s,'alex').length+inventoryFor(s,'mira').length;
  assert.equal(total,4);
  start(s,'gift','a1','mira');finish(s,13);
  assert.equal(inventoryFor(s,'alex').length+inventoryFor(s,'mira').length,4);
});
test('corrupt shared sessions never become free one-click talk on restore',()=>{
  const s=newHousehold();start(s,'gift','a1');
  for(const shared of [
    {mode:'gift',choiceId:'<script>'},{mode:'gift',choiceId:'m1'},
    {mode:'leisure',choiceId:'unknown'},
    {mode:'gift',choiceId:'a1',label:'fake'},
    {mode:'gift',choiceId:'a1',automatic:true}
  ]){
    const forged=copy(s);forged.socialAction.shared=shared;
    assert.equal(loadHousehold(forged).socialAction,null);
  }
  const forged=copy(s);forged.socialAction.conversation={topic:'daily',phase:'opening',turns:[],score:0};
  assert.equal(loadHousehold(forged).socialAction,null);
});
test('a long-running leisure task does not block later original manual social interactions',()=>{
  const s=newHousehold();
  start(s,'leisure','books');finish(s,31);
  assert.equal(startSocial(s,'talk','alex',point),true);
  arriveSocial(s);tickSocial(s,SOCIAL_ACTIONS.talk.duration+1);
  assert.equal(s.mind.memories.at(-1).id,'talk');
  assert.equal(startConversation(s,'alex',point,'daily'),true);
  arriveSocial(s);
  assert.ok(chooseSocialLine(s,'daily.listen'));
  assert.ok(finishSocialConversation(s));
});
test('UI exposes one social hub with safe buttons and full static Pages bundle',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  for(const id of ['shared-btn','shared-panel','shared-title','shared-close','shared-options','shared-subtitle'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok(game.includes('renderSharedPanel(false)'));
  assert.ok(game.includes('sharedDisplayKey'));
  assert.ok(game.includes('startSharedSocial(game,actorId,best.goal,shared.mode,shared.choiceId,automatic)'));
  assert.ok(game.includes('textContent'),'UI labels never injected from user save HTML');
  assert.ok(css.includes('#shared-btn'));
  assert.ok(workflow.includes('src/gifts-leisure.js src/household.js'));
  assert.ok(workflow.includes('node --check src/gifts-leisure.js'));
});
