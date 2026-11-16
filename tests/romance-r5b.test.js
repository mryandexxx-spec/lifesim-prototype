import test from 'node:test';
import assert from 'node:assert/strict';
import {romanticEveningVignette} from '../src/romantic-evening-scene.js';
import {newHousehold,loadHousehold,setHouseholdAutonomy} from '../src/household.js';
import {applySocialEvent,observePairViews} from '../src/social-graph.js';
import {startBranchSocial,arriveSocial,tickSocial,cancelSocial} from '../src/relationships.js';
import {readFileSync} from 'node:fs';
const coords={alex:{x:1.2,z:.5},mira:{x:1.4,z:.7}};
function s(elapsed=10,consent=true){
 return {phase:'using',elapsed,branchAction:{id:'romance.evening',eveningConsent:consent}};
}
const world=(items=[])=>({furniture:{instances:items}});
const table=(id='home-table-1',x=1.3,z=-.2,location='home')=>
 ({instanceId:id,prefabId:'table',x,z,location,yaw:0});
const frame=(session,items=[table()],positions=coords,clock=12)=>
 romanticEveningVignette(session,world(items),positions,clock);
function couple(){
 const g=newHousehold();g.minutes=8000;g.otherSim.minutes=8000;
 setHouseholdAutonomy(g,false);
 for(const id of ['alex','mira']){
   Object.assign(g.relationship.views[id],{friendship:90,trust:92,tension:0});
   const actor=id==='alex'?g:g.otherSim;
   Object.assign(actor.needs,{energy:92,hunger:90,hygiene:90,fun:60,social:60});
   actor.mind.mood.value=90;
 }
 observePairViews(g.socialGraph,'alex','mira',g.relationship.views);
 for(const [actorId,targetId,type,at] of [
  ['alex','mira','romance.flirt',900],['mira','alex','romance.flirt',2400],
  ['alex','mira','romance.flirt',3900],['alex','mira','romance.confess',4200],
  ['alex','mira','romance.date',4500]]){
  assert.ok(applySocialEvent(g.socialGraph,{actorId,targetId,type,at}));
 }
 return g;
}
test('R5b is completely hidden before consent, after refusal, during walk, on cancellation and after completion',()=>{
 for(const x of [null,{},s(10,false),{...s(10),phase:'walking'},
   {...s(10),branchAction:{id:'romance.flirt',eveningConsent:true}},
   s(-1),s(NaN),s(30),s(Infinity)]){
   const v=frame(x);assert.equal(v.active,false);assert.equal(v.accents.length,0);
   assert.equal(v.tableInstanceId,null);assert.equal(v.weight,0);
 }
 const g=couple();
 assert.ok(startBranchSocial(g,'alex',{x:1.1,z:.52},'romance.evening'));
 assert.equal(frame(g.socialAction).active,false);
 assert.ok(cancelSocial(g));assert.equal(frame(g.socialAction).active,false);
 assert.ok(startBranchSocial(g,'alex',{x:1.1,z:.52},'romance.evening'));
 assert.ok(arriveSocial(g));
 assert.equal(g.socialAction.branchAction.eveningConsent,true);
 assert.equal(frame(g.socialAction).active,true);
 assert.equal(tickSocial(g,30),true);
 assert.equal(frame(g.socialAction).active,false);
});
test('R5b uses only a placed nearby table, including real purchased table variants',()=>{
 const near=table('shop-table-12',1.45,-.25),far=table('home-table-1',4,-3);
 const stored=table('shop-table-2',1.3,.1,'storage');
 const same=frame(s(),[far,stored,near]);
 assert.equal(same.tableInstanceId,'shop-table-12');
 assert.equal(frame(s(),[stored,far]).tableInstanceId,null);
 assert.equal(frame(s(),[near],{alex:{x:-3,z:-3},mira:{x:-3.3,z:-3}}).tableInstanceId,null);
 assert.equal(frame(s(),[near],{alex:{x:1,z:1},mira:{x:4,z:4}}).tableInstanceId,null);
 assert.equal(frame(s(),[table('bad',Infinity,0)]).tableInstanceId,null);
});
test('R5b restrained accents are finite, deterministic, spatially bounded, and never modify input state',()=>{
 const source=s(10),items=[table('home-table-1',1.3,-.2)];
 const old=JSON.stringify({source,items,coords});
 const a=frame(source,items,coords,13.5),b=frame(source,items,coords,13.5);
 assert.deepEqual(a,b);assert.equal(a.accents.length,5);
 assert.ok(a.weight>.5);assert.ok(a.gestureWeight<=1);
 for(const item of a.accents){
   assert.ok([item.x,item.y,item.z,item.size].every(Number.isFinite));
   assert.ok(item.size>0&&item.size<.10);
   assert.ok(Math.hypot(item.x-a.center.x,item.z-a.center.z)<.5);
 }
 assert.equal(JSON.stringify({source,items,coords}),old);
 assert.equal(frame(s(0)).accents.length,0);
 assert.ok(frame(s(29)).weight<frame(s(16)).weight);
 assert.equal(frame(s(10),items,{alex:{x:1,z:1},mira:{x:1,z:1}}).accents.length,0);
 assert.equal(frame(s(10),items,{alex:{x:NaN,z:1},mira:{x:1,z:1}}).active,false);
});
test('R5b pause and restore derive frame from v1 session with no extra saved property',()=>{
 const g=couple();
 assert.ok(startBranchSocial(g,'alex',{x:1.1,z:.52},'romance.evening'));
 assert.ok(arriveSocial(g));assert.equal(tickSocial(g,12),false);
 const snapshot=JSON.parse(JSON.stringify(g));
 const restored=loadHousehold(snapshot);
 assert.equal(restored.version,1);
 const current=frame(restored.socialAction);
 assert.equal(current.active,true);
 assert.equal(romanticEveningVignette(restored.socialAction,restored.world,coords,12,
   {eligible:false}).active,false);
 assert.equal(restored.socialAction.branchAction.eveningConsent,true);
 restored.paused=true;
 assert.equal(tickSocial(restored,8),false);
 assert.equal(frame(restored.socialAction).weight,current.weight);
 assert.equal(Object.keys(snapshot).includes('romanticEveningScene'),false);
});
test('R5b production scene has one frame-driven table set and ignores past romances',()=>{
 const g=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
 const wf=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
 assert.match(g,/romanticEveningVignette\(furnishMode\?null:game\.socialAction/);
 assert.match(g,/if\(item\.prefabId!=='table'/);
 assert.match(g,/eveningFrame\.tableInstanceId===item\.instanceId/);
 assert.match(g,/eveningFrame\.accents/);
 assert.match(g,/eveningWeight:eveningFrame\.gestureWeight/);
 assert.match(wf,/node --check src\/romantic-evening-scene\.js/);
 assert.match(wf,/cp src\/romantic-evening-scene\.js site\/src\//);
});
