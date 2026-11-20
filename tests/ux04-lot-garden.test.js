/** UX-04: approved lot/plant UI contract, using canonical domain prices. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold} from '../src/household.js';
import {previewOutdoorPaint,commitOutdoorPreview,
  previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {gardenActionSheet} from '../src/garden-presentation.js';
import {OUTDOOR_PALETTE,describeOutdoorSelection} from '../src/outdoor-ux04.js';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
test('UX04 exact four-category palette, quote/confirm/cancel and safe queued actions',()=>{
  assert.deepEqual(OUTDOOR_PALETTE.map(p=>p.id),['ground','plants','garden','objects']);
  for(const p of OUTDOOR_PALETTE)assert.match(html,
    new RegExp('data-outdoor-palette="'+p.id+'"'));
  assert.match(html,/id="outdoor-selection-summary"/);
  assert.match(html,/id="ground-walk-primary-reason"/);
  assert.match(css,/\.outdoor-editor-actions\{position:sticky/);
  assert.match(game,/primaryReason:first\.reason/);
  assert.match(game,/confirmWorldOffer\(groundWalkOffer,choice\.command\)/);
});
test('UX04 four new stone half-metre cells cost 32 credits; existing are free',()=>{
  const root=newHousehold();
  const from={x:19,z:-9},to={x:19.5,z:-8.5};
  const p=previewOutdoorPaint(root,{from,to,kind:'stone'});
  assert.equal(p.ok,true,p.reason);
  assert.equal(p.changedCells,4);
  assert.equal(p.cost,32);
  assert.match(describeOutdoorSelection({category:'ground',groundKind:'stone',proposal:p}),
    /4 кл\. · 1 м² · 32 кр/);
  assert.equal(root.shop.credits,newHousehold().shop.credits,
    'mere preview never spends credits');
  const applied=commitOutdoorPreview(root,p);
  assert.equal(applied.ok,true,applied.reason);
  const partial=previewOutdoorPaint(applied.root,{
    from:{x:19,z:-9},to:{x:20,z:-8.5},kind:'stone'});
  assert.equal(partial.ok,true,partial.reason);
  assert.equal(partial.changedCells,2);
  assert.equal(partial.cost,16);
  const duplicate=previewOutdoorPaint(applied.root,{from,to,kind:'stone'});
  assert.deepEqual({ok:duplicate.ok,reason:duplicate.reason},
    {ok:false,reason:'unchanged'});
  const restored=loadHousehold(JSON.parse(JSON.stringify(applied.root)));
  assert.equal(restored.version,1);
  assert.equal(restored.shop.credits,applied.root.shop.credits);
  assert.deepEqual(restored.world.outdoors.ground,applied.root.world.outdoors.ground);
});
test('UX04 garden sheet selects water, mature plant actions and never auto-queues',()=>{
  const root=newHousehold();
  const preview=previewOutdoorFeatureEdit(root,{operation:'place',
    itemId:'garden.herb.mint',pose:{x:8,z:-7,yaw:0}});
  assert.equal(preview.ok,true,preview.reason);
  const planted=commitOutdoorFeatureEdit(root,preview);
  assert.equal(planted.ok,true,planted.reason);
  const game=planted.root;
  const id=game.world.outdoors.features.find(f=>f.itemId==='garden.herb.mint').instanceId;
  const sheet=gardenActionSheet(game,'alex',id);
  assert.ok(sheet);
  assert.ok(sheet.actions.some(a=>a.actionId==='water'&&a.available));
  assert.equal(sheet.actions.find(a=>a.actionId==='water').command.type,'garden');
  assert.equal(game.actionQueues.byResident.alex.length,0);
  assert.equal(game.actionQueues.byResident.mira.length,0);
  game.world.outdoors.gardens[id].progressWetMinutes=4320;
  game.world.outdoors.gardens[id].hydratedUntil=game.minutes+100;
  const mature=gardenActionSheet(game,'alex',id);
  assert.ok(mature.actions.some(a=>a.actionId==='harvest'));
  assert.match(mature.info,/Созрело/);
  assert.equal(game.version,1);
});
