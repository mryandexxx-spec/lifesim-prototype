import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,chooseResidentAction,tickHousehold} from '../src/household.js';
import {arrive,actionDuration,SHOWER_SINGING_XP_PER_MINUTE,SHOWER_SINGING_FUN} from '../src/simulation.js';
import {SHOWER_WASH_START,SHOWER_WASH_END} from '../src/shower-interaction.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {enqueueAction,pendingActions} from '../src/action-queue.js';
import {labelQueuedTask,labelActiveTask} from '../src/qsk-11-task-labels.js';
import {HOBBY_SKILLS,MUSIC_SKILL_ID} from '../src/hobby-reading.js';
import {scaleSkillXP} from '../src/skills-engine.js';
import {audibleMusicStyle} from '../src/music-audio.js';
const actor=(root,id)=>id==='alex'?root:root.otherSim;
const xp=(a)=>a.skills.xpById.music||0;
const close=(a,b)=>assert.ok(Math.abs(a-b)<.0001,a+' != '+b);
function seed(id,singing=true,hygiene=30){
 const root=newHousehold('2026-11-27');root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
 const a=actor(root,id);a.needs.hygiene=hygiene;a.needs.fun=30;
 assert.ok(chooseResidentAction(root,'shower',false,id,null,null,null,null,null,null,false,false,null,null,singing));
 a.position=furnitureActionApproach(root.world,'shower',a.action.targetInstanceId);
 arrive(a);return root;
}
for(const id of ['alex','mira'])test('LIFE-QOL shower singing genuine wash time and unchanged hygiene '+id,()=>{
 const s=seed(id),n=seed(id,false),a=actor(s,id),normal=actor(n,id);
 const duration=actionDuration(a.action);
 assert.equal(duration,actionDuration(normal.action));assert.equal(labelActiveTask(s,id),'Петь в душе');
 tickHousehold(s,5);tickHousehold(n,5);assert.equal(xp(a),0);
 close(a.needs.fun,normal.needs.fun);
 tickHousehold(s,duration-5);tickHousehold(n,duration-5);
 assert.equal(a.action,null);close(a.needs.hygiene,normal.needs.hygiene);
 close(a.needs.fun-normal.needs.fun,SHOWER_SINGING_FUN);
 close(xp(a),scaleSkillXP(duration*(SHOWER_WASH_END-SHOWER_WASH_START)*SHOWER_SINGING_XP_PER_MINUTE));
 assert.equal(xp(normal),0);assert.equal(xp(actor(s,id==='alex'?'mira':'alex')),0);
 assert.equal(a.skills.xpById.charisma,undefined);
});
test('LIFE-QOL shower pause, reload, cancellation and remote target',()=>{
 let root=seed('alex'),a=root;
 tickHousehold(root,18);const before=xp(a);assert.ok(before>0);
 root.paused=true;tickHousehold(root,30);close(xp(root),before);root.paused=false;
 root=loadHousehold(structuredClone(root));assert.equal(root.action.showerSinging,true);close(xp(root),before);
 tickHousehold(root,2);const after=xp(root);assert.ok(after>before);root.action=null;
 tickHousehold(root,30);close(xp(root),after);
 const distant=seed('alex');distant.position={x:0,z:0};tickHousehold(distant,32);
 assert.equal(xp(distant),0);assert.equal(distant.action,null);
});
test('LIFE-QOL short shower remains short and scales fun/XP',()=>{
 const s=seed('alex',true,90),n=seed('alex',false,90);
 const duration=actionDuration(s.action);assert.equal(duration,16);
 tickHousehold(s,duration);tickHousehold(n,duration);
 close(s.needs.fun-n.needs.fun,SHOWER_SINGING_FUN/2);
 close(xp(s),scaleSkillXP(duration*(SHOWER_WASH_END-SHOWER_WASH_START)*SHOWER_SINGING_XP_PER_MINUTE));
});
test('LIFE-QOL queue flag is type-safe and survives v1 save',()=>{
 let root=newHousehold();assert.ok(enqueueAction(root.actionQueues,'alex',{type:'object',actionId:'shower',showerSinging:true}));
 root=loadHousehold(structuredClone(root));let task=pendingActions(root.actionQueues,'alex')[0];
 assert.equal(task.showerSinging,true);assert.equal(labelQueuedTask(root,task),'Петь в душе');
 assert.equal(enqueueAction(root.actionQueues,'mira',{type:'object',actionId:'bed',showerSinging:true}),null);
});
test('LIFE-QOL sound is gated to private active wash and changes with skill',()=>{
 const root=seed('alex');assert.equal(audibleMusicStyle([root]),null);
 root.action.elapsed=actionDuration(root.action)*.5;
 assert.equal(audibleMusicStyle([root]),'shower.beginner');
 root.skills.xpById.music=HOBBY_SKILLS.skills[MUSIC_SKILL_ID].xpThresholds[2];
 assert.equal(audibleMusicStyle([root]),'shower.confident');
 assert.equal(audibleMusicStyle([root],{paused:true}),null);
 assert.equal(audibleMusicStyle([root],{hidden:true}),null);
 root.action.elapsed=actionDuration(root.action)*.9;assert.equal(audibleMusicStyle([root]),null);
});
