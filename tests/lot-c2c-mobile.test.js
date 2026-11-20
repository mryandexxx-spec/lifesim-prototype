import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold} from '../src/household.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {gardenActionSheet} from '../src/garden-presentation.js';
import {enqueueAction} from '../src/action-queue.js';
import {contextualPlacement} from '../src/ui-layout.js';
const copy=x=>JSON.parse(JSON.stringify(x));
function garden(){
 const initial=newHousehold();
 const p=previewOutdoorFeatureEdit(initial,{operation:'place',
   itemId:'garden.flower.calendula',pose:{x:8,z:-7,yaw:0}});
 assert.ok(p.ok,p.reason);
 const root=commitOutdoorFeatureEdit(initial,p).root;
 const id=root.world.outdoors.features.find(f=>f.itemId.startsWith('garden.')).instanceId;
 root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
 return {root,id};
}
test('C2c: stage, hydration, cooldown and available action choices are read-only',()=>{
 const {root,id}=garden(),r=root.world.outdoors.gardens[id],before=copy(root);
 let s=gardenActionSheet(root,'alex',id);
 assert.match(s.info,/Посажено · 0\/72 ч роста · Нужен полив/);
 assert.equal(s.progress,0);
 assert.deepEqual(s.actions.map(a=>a.actionId),['water']);
 assert.equal(s.actions[0].available,true);
 assert.deepEqual(root,before);
 r.progressWetMinutes=1440;r.hydratedUntil=root.minutes+2160;
 s=gardenActionSheet(root,'alex',id);
 assert.match(s.info,/Росток · 24\/72 ч роста · Влаги на 36 ч/);
 assert.deepEqual(s.actions.map(a=>a.actionId),['water','inspect']);
 assert.equal(s.progress,33);
 r.lastWateredAt=root.minutes;
 s=gardenActionSheet(root,'alex',id);
 assert.equal(s.actions[0].actionId,'inspect');
 assert.match(s.actions[1].reason,/Повторный полив/);
 r.progressWetMinutes=4320;
 s=gardenActionSheet(root,'alex',id);
 assert.match(s.info,/Цветёт · 72\/72 ч роста · Созрело/);
 assert.deepEqual(s.actions.map(a=>a.actionId),['admire']);
 root.gardenRewards.alexLastAdmireAt=root.minutes;
 s=gardenActionSheet(root,'alex',id);
 assert.equal(s.actions[0].actionId,'approach');
 assert.equal(s.actions[1].available,false);
});
test('C2c: targeted desire identifies exact planted plot and never grants free memory',()=>{
 const {root,id}=garden(),r=root.world.outdoors.gardens[id];
 r.progressWetMinutes=1440;
 root.mind.wish={id:'garden.observe',targetInstanceId:id,
   plantedAt:r.plantedAt,since:root.minutes,until:root.minutes+480};
 const before=copy(root.mind);
 const sheet=gardenActionSheet(root,'alex',id);
 assert.match(sheet.wish,/Желание Алекса/);
 assert.equal(sheet.actions[0].actionId,'inspect');
 assert.deepEqual(root.mind,before);
 assert.equal(gardenActionSheet(root,'mira',id).wish,null);
 r.plantedAt+=1;
 assert.equal(gardenActionSheet(root,'alex',id).wish,null);
});
test('C2c: reserved garden has no second claim, deleted plot has no phantom menu',()=>{
 const {root,id}=garden(),cmd=gardenActionSheet(root,'alex',id).actions[0].command;
 assert.ok(enqueueAction(root.actionQueues,'alex',cmd));
 const sheet=gardenActionSheet(root,'mira',id);
 assert.equal(sheet.actions[0].actionId,'approach');
 assert.ok(sheet.actions.some(a=>a.actionId==='water'&&!a.available));
 root.world.outdoors.features=root.world.outdoors.features.filter(f=>f.instanceId!==id);
 delete root.world.outdoors.gardens[id];
 assert.equal(gardenActionSheet(root,'alex',id),null);
});
test('C2c: four viewport popup bounds allow a HUD-free region',()=>{
 for(const [w,h] of [[390,844],[375,667],[320,568],[844,390]]){
   const top=h<500?70:110,bottom=h<500?120:160;
   const pos=contextualPlacement({anchorX:w-2,anchorY:h-10,
     viewportWidth:w,viewportHeight:h,panelWidth:290,panelHeight:330,
     topInset:top,bottomInset:bottom,edge:8});
   assert.ok(pos.x>=8&&pos.x<=w-8-Math.min(290,w-16));
   assert.ok(pos.y>=top&&pos.y<=h-bottom);
   assert.ok(pos.maxHeight>0);
 }
});
test('C2c: legacy root.version=1 and old optional fields remain compatible',()=>{
 const {root,id}=garden(),saved=copy(root);
 delete saved.gardenRoutine;delete saved.gardenMilestones;
 const restored=loadHousehold(saved);
 assert.equal(restored.version,1);
 assert.ok(gardenActionSheet(restored,'alex',id));
 assert.equal(restored.world.outdoors.gardens[id].schema,1);
 assert.equal(restored.mind.memories.filter(x=>x.id.startsWith('garden.')).length,0);
});
