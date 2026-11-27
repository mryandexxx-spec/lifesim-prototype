import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,enableArtMarketPilot} from '../src/household.js';
import {enqueueAction,parkQueuedHead} from '../src/action-queue.js';
import {PAINT_ACTIVITY_ID} from '../src/painting.js';
import {labelQueuedTask} from '../src/qsk-11-task-labels.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('blocked old painting defers migration; price intent is explicit in the plan',()=>{
 const h=newHousehold();
 const old=enqueueAction(h.actionQueues,'alex',{type:'activity',activityId:PAINT_ACTIVITY_ID,contentId:'painting.hills',targetInstanceId:'home-easel-1'});
 assert.ok(old);assert.ok(parkQueuedHead(h.actionQueues,'alex',old.seq,'unreachable-route',h.minutes));
 assert.equal(enableArtMarketPilot(h),false);
 assert.match(labelQueuedTask(h,{type:'activity',paintMode:'commission',paintExpectedPrice:20}),/20 кр. при начале/);
 assert.match(labelQueuedTask(h,{type:'activity',paintMode:'practice',paintExpectedPrice:0}),/бесплатно/);
});
test('C2b wires three modes, saved quote and dispatch revalidation, atomic sale rollback',()=>{
 const js=read('src/game.js'),html=read('index.html');
 for(const mode of ['practice','speculative','commission'])assert.match(html,new RegExp('value="'+mode+'"'));
 assert.match(js,/const tx=projectArtSale\(game,owner,work.id,offer\)/);
 assert.match(js,/game.artMarket=old.artMarket;a.createdWorks=old.works/);
 assert.match(js,/command.paintMode\?\?null,command.paintExpectedPrice\?\?null/);
 assert.match(js,/if\(!q.ok\|\|q.price!==command.paintExpectedPrice\)return artReason/);
 assert.match(js,/if\(!save\(true\)\)\{delete game.artMarket;return false;\}/);
});
