import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold,chooseResidentAction,tickHousehold,getActor} from '../src/household.js';
import {findMarketPlacement,buyMarketItem,storeMarketItem} from '../src/furniture-shop.js';
import {planPairedHobby,validPairedHobbyPlan,livePairedHobby} from '../src/paired-hobby.js';
import {startSharedSocial,arriveSocial,cancelSocial} from '../src/relationships.js';
import {restoreSharedSession} from '../src/gifts-leisure.js';
import {enqueueAction,restoreActionQueues} from '../src/action-queue.js';
import {READING_ACTIVITY_ID,READING_CONTENT_ID,READING_SKILL_ID} from '../src/hobby-reading.js';
const copy=v=>JSON.parse(JSON.stringify(v));
function buy(root,sku){
  const pose=findMarketPlacement(root.world.furniture,root.shop,sku);
  assert.ok(pose,'must find reachable room placement for '+sku);
  const result=buyMarketItem(root.world.furniture,root.shop,sku,pose);
  assert.equal(result.ok,true,JSON.stringify(result));
  root.world.furniture=result.world;root.shop=result.shop;
  return result.instanceId;
}
function pair(root,choiceId,station){
  const plan=planPairedHobby(root,'alex',choiceId,station);
  assert.ok(plan,'two distinct A* positions required for '+choiceId);
  assert.equal(validPairedHobbyPlan(root,plan,'alex'),true);
  assert.equal(startSharedSocial(root,'alex',plan.places.alex,'leisure',choiceId,false,plan),true);
  return plan;
}
function arrivePair(root,plan){
  root.position={...plan.places.alex};root.otherSim.position={...plan.places.mira};
  assert.equal(arriveSocial(root),true);
  assert.equal(root.socialAction.shared.pairConsent,true);
  assert.ok(livePairedHobby(root));
}
test('H3 no phantom equipment or legacy abstract joint book/music session',()=>{
  const root=newHousehold();
  assert.equal(planPairedHobby(root,'alex','music'),null);
  assert.equal(planPairedHobby(root,'alex','books'),null);
  assert.equal(startSharedSocial(root,'alex',{x:0,z:0},'leisure','music'),false);
  assert.equal(restoreSharedSession({mode:'leisure',choiceId:'books'},root,'alex'),null);
});
test('H3 shared music requires real arrival, gives Fun to both and restores without replay',()=>{
  const root=newHousehold(),id=buy(root,'music.starter');
  const plan=pair(root,'music',id);
  const fun=root.needs.fun,peerFun=root.otherSim.needs.fun;
  tickHousehold(root,2);
  assert.equal(root.socialAction.phase,'walking');
  assert.ok(root.needs.fun<=fun&&root.otherSim.needs.fun<=peerFun);
  arrivePair(root,plan);
  tickHousehold(root,6);
  assert.ok(root.needs.fun>fun&&root.otherSim.needs.fun>peerFun);
  assert.equal(root.skills.xpById[READING_SKILL_ID]||0,0);
  assert.equal(root.socialAction.shared.creditedMinutes,6);
  const loaded=loadHousehold(copy(root));
  assert.equal(loaded.socialAction.shared.creditedMinutes,6);
  tickHousehold(loaded,22);
  assert.equal(loaded.socialAction,null);
  assert.equal(loaded.mind.memories.at(-1).id,'leisure.music');
  assert.equal(loaded.otherSim.mind.memories.at(-1).id,'leisure.music');
  const count=loaded.mind.memories.length;
  tickHousehold(loaded,4);
  assert.equal(loaded.mind.memories.length,count);
});
test('H3 shared books give personal literature XP only for physical reading time',()=>{
  const root=newHousehold(),id=buy(root,'bookcase.starter'),plan=pair(root,'books',id);
  tickHousehold(root,3);
  assert.equal(root.skills.xpById[READING_SKILL_ID]||0,0);
  arrivePair(root,plan);
  tickHousehold(root,7);
  assert.equal(root.skills.xpById[READING_SKILL_ID],3.5);
  assert.equal(root.otherSim.skills.xpById[READING_SKILL_ID],3.5);
  const loaded=loadHousehold(copy(root));
  assert.equal(loaded.socialAction.shared.creditedMinutes,7);
  tickHousehold(loaded,3);
  assert.equal(loaded.skills.xpById[READING_SKILL_ID],5);
  cancelSocial(loaded);
  tickHousehold(loaded,20);
  assert.equal(loaded.skills.xpById[READING_SKILL_ID],5);
});
test('H3 removed station cancels active leisure and cannot create social receipt',()=>{
  const root=newHousehold(),id=buy(root,'music.starter'),plan=pair(root,'music',id);
  arrivePair(root,plan);tickHousehold(root,3);
  const fun=root.needs.fun,affinity=root.relationship.affinity;
  const stored=storeMarketItem(root.world.furniture,root.shop,id);
  assert.equal(stored.ok,true);
  root.world.furniture=stored.world;
  tickHousehold(root,3);
  assert.equal(root.socialAction,null);
  assert.ok(root.needs.fun<=fun);
  assert.equal(root.relationship.affinity,affinity);
});
test('H3 gifted physical book can be queued and reread by its owner without transfer',()=>{
  const root=newHousehold(),id=buy(root,'bookcase.starter');
  const cmd={type:'activity',activityId:READING_ACTIVITY_ID,
    contentId:READING_CONTENT_ID,targetInstanceId:id,inventoryItemId:'m1'};
  assert.ok(enqueueAction(root.actionQueues,'mira',cmd));
  const queue=restoreActionQueues(copy(root.actionQueues),['alex','mira']);
  assert.equal(queue.byResident.mira[0].inventoryItemId,'m1');
  assert.equal(enqueueAction(root.actionQueues,'mira',{...cmd,inventoryItemId:'<bad>'}),null);
  assert.equal(chooseResidentAction(root,'hobby',false,'alex',id,
    READING_ACTIVITY_ID,READING_CONTENT_ID,null,'m1'),false);
  assert.equal(chooseResidentAction(root,'hobby',false,'mira',id,
    READING_ACTIVITY_ID,READING_CONTENT_ID,null,'m1'),true);
  assert.equal(getActor(root,'mira').action.inventoryItemId,'m1');
  const loaded=loadHousehold(copy(root));
  assert.equal(loaded.otherSim.action.inventoryItemId,'m1');
  assert.equal(loaded.inventory.mira.filter(x=>x.id==='m1').length,1);
  loaded.inventory.mira=[];
  tickHousehold(loaded,1);
  assert.equal(loaded.otherSim.action,null);
  assert.equal(loaded.otherSim.skills.xpById[READING_SKILL_ID]||0,0);
});
test('H3 shipped new pure JS planner into Pages and wired actual UI',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(game.includes('planPairedHobby(game,actorId,shared.choiceId'));
  assert.ok(game.includes('pairedHobby=livePairedHobby(game)'));
  assert.ok(game.includes('inventoryItemId:item.id'));
  assert.ok(html.includes('./src/paired-hobby.js?v=1.2x-h3'));
  assert.ok(pages.includes('cp src/paired-hobby.js site/src/'));
});
