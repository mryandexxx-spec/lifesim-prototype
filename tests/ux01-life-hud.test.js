import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planButtonLabel,queueViewerResident,commandReceipt,offerForName}
 from '../src/ux01-plan-ui.js';
import {newHousehold} from '../src/household.js';
import {enqueueAction,pendingActions,removeQueuedAction} from '../src/action-queue.js';
const src=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=src('index.html'),css=src('styles.css'),game=src('src/game.js');
test('UX-01 formats only display data, never serializes or changes a queue',()=>{
 assert.equal(planButtonLabel(0),'План · 0');
 assert.equal(planButtonLabel(3),'План · 3');
 assert.equal(planButtonLabel(-20),'План · 0');
 assert.equal(queueViewerResident('alex','mira'),'mira');
 assert.equal(queueViewerResident('mira','invalid'),'mira');
 assert.equal(commandReceipt('Мира','Идти сюда',2),'Мира · в плане №2: Идти сюда');
 assert.match(offerForName('Алекс'),/Алекс/);
});
test('UX-01 inspect other queue does not change selectedSim, FIFO or save v1',()=>{
 const root=newHousehold('2026-11-20');
 root.selectedSim='alex';
 const a1=enqueueAction(root.actionQueues,'alex',{type:'object',actionId:'bed'});
 const a2=enqueueAction(root.actionQueues,'alex',{type:'object',actionId:'fridge'});
 const m1=enqueueAction(root.actionQueues,'mira',{type:'object',actionId:'sofa'});
 const before=JSON.stringify(root);
 const viewer=queueViewerResident(root.selectedSim,'mira');
 assert.equal(viewer,'mira');
 assert.equal(JSON.stringify(root),before,'view-only state belongs outside the save');
 assert.equal(root.selectedSim,'alex');
 assert.deepEqual(pendingActions(root.actionQueues,'alex').map(x=>x.seq),[a1.seq,a2.seq]);
 assert.deepEqual(pendingActions(root.actionQueues,'mira').map(x=>x.seq),[m1.seq]);
 assert.equal(removeQueuedAction(root.actionQueues,'mira',m1.seq),true);
 assert.deepEqual(pendingActions(root.actionQueues,'alex').map(x=>x.seq),[a1.seq,a2.seq]);
 assert.equal(root.version,1);
});
test('UX-01 real DOM and handlers target inspected queues, not a resident switch',()=>{
 for(const id of ['plan-label','plan-resident','queue-alex','queue-mira',
  'queue-person-note','queue-receipt','ground-walk-recipient','action-recipient']){
  assert.equal(html.split('id="'+id+'"').length-1,1,'unique '+id);
 }
 assert.match(html,/id="queue-panel"[^>]*hidden/);
 assert.match(html,/id="plan-peek"[^>]*aria-controls="queue-panel"/);
 assert.match(game,/const residentId=queueViewerResident\(game.selectedSim,queueInspectResident\)/);
 assert.match(game,/queueInspectResident=id;\s*renderQueuePanel\(true\)/);
 assert.match(game,/removeQueuedAction\(game.actionQueues,residentId,task.seq\)/);
 assert.match(game,/if\(dialogueNeedsDecision\(game\)\)return;/);
 assert.match(game,/preemptAutomaticForManual\(game,residentId\)/);
 assert.match(game,/function scheduleCommand\(command,residentId=game.selectedSim\)/);
 assert.match(game,/const receipt=commandReceipt/);
 assert.match(game,/offerWorldAction\(point,'Действия на земле'/);
 assert.match(game,/offerWorldAction\(point,def.name,'🪑 Отдохнуть'/);
 assert.match(css,/#plan-peek #plan-label/);
 assert.match(css,/\.queue-resident-tabs button\[aria-pressed="true"\]/);
 assert.match(css,/\.queue-items li button\{min-width:62px;min-height:44px/);
});
