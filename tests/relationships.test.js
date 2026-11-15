import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_KEY } from '../src/simulation.js';
import { newHousehold,loadHousehold,chooseResidentAction,setHouseholdAutonomy,tickHousehold } from '../src/household.js';
import { SOCIAL_ACTIONS,canStartSocial,startSocial,arriveSocial,
  relationshipLabel,autonomousSocialChoice,cancelSocial,
  canReconcile,RECONCILIATION_WINDOW_MINUTES } from '../src/relationships.js';
const place={x:-.2,z:1.85};
function complete(root,kind='talk',id='alex') {
  assert.equal(startSocial(root,kind,id,place),true);
  assert.equal(arriveSocial(root),true);
  tickHousehold(root,SOCIAL_ACTIONS[kind].duration+1);
}
test('legacy saves retain Alex, Mira, autoplay and gain a neutral relationship',()=>{
  const old=newHousehold();
  old.needs.hunger=21;old.otherSim.needs.fun=31;old.autonomy.enabled=false;
  delete old.relationship;delete old.socialAction;
  const s=loadHousehold(JSON.parse(JSON.stringify(old)));
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(s.version,1);assert.equal(s.needs.hunger,21);
  assert.equal(s.otherSim.needs.fun,31);assert.equal(s.autonomy.enabled,false);
  assert.equal(s.relationship.affinity,50);assert.equal(s.socialAction,null);
});
test('talk changes relationship, mood, fun and memory for both exactly once',()=>{
  const s=newHousehold(),before=s.mind.mood.value;
  complete(s);
  assert.equal(s.relationship.affinity,58);assert.equal(s.socialAction,null);
  assert.equal(s.mind.memories.at(-1).id,'talk');
  assert.equal(s.otherSim.mind.memories.at(-1).id,'talk');
  assert.ok(s.mind.mood.value>=before);
  tickHousehold(s,20);assert.equal(s.relationship.affinity,58);
  const restored=loadHousehold(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.relationship.affinity,58);
  assert.equal(restored.otherSim.mind.memories.at(-1).id,'talk');
});
test('disagreement hurts relationship and both moods',()=>{
  const s=newHousehold(),before=s.mind.mood.value;
  complete(s,'argue','mira');
  assert.equal(s.relationship.affinity,38);
  assert.equal(s.mind.memories.at(-1).id,'hurt',
    'when Mira starts an argument, Alex feels hurt');
  assert.equal(s.otherSim.mind.memories.at(-1).id,'regret',
    'the one who started the argument regrets it');
  assert.ok(s.mind.mood.value<before);
});
test('score clamps 0–100 and memories are bounded to 12',()=>{
  const s=newHousehold();
  for(let i=0;i<14;i++)complete(s,'talk');
  assert.equal(s.relationship.affinity,100);assert.equal(s.mind.memories.length,12);
  for(let i=0;i<15;i++)complete(s,'argue');
  assert.equal(s.relationship.affinity,0);
  assert.equal(relationshipLabel(0),'Напряжённо');
  assert.equal(relationshipLabel(50),'Нейтрально');
  assert.equal(relationshipLabel(80),'Дружески');
});
test('player may invite a busy partner, while overlapping social actions remain blocked',()=>{
  const s=newHousehold();
  assert.equal(chooseResidentAction(s,'sofa',false,'mira'),true);
  assert.equal(canStartSocial(s,'talk','alex'),true);
  assert.equal(startSocial(s,'talk','alex',place),true);
  assert.equal(s.otherSim.action,null,'manual interaction interrupts busy partner');
  assert.equal(startSocial(s,'argue','mira',place),false);
  assert.equal(cancelSocial(s),true);
  assert.equal(s.mind.memories.length,0);
});
test('paused, walking and interrupted events do not count',()=>{
  const s=newHousehold();
  startSocial(s,'talk','alex',place);
  tickHousehold(s,60);assert.equal(s.relationship.affinity,50);
  arriveSocial(s);s.paused=true;tickHousehold(s,60);
  assert.equal(s.relationship.affinity,50);
  s.paused=false;
  assert.equal(chooseResidentAction(s,'bed',false,'alex'),true);
  assert.equal(s.socialAction,null);assert.equal(s.mind.memories.length,0);
});
test('autonomy OFF cancels automatic social but allows manual social',()=>{
  const s=newHousehold();s.minutes=650;s.relationship.nextSocialAt=480;
  assert.equal(startSocial(s,'talk','mira',place,true),true);
  setHouseholdAutonomy(s,false);
  assert.equal(s.socialAction,null);
  assert.equal(s.relationship.affinity,50);
  assert.equal(startSocial(s,'talk','mira',place,true),false);
  assert.equal(startSocial(s,'talk','mira',place),true);
  setHouseholdAutonomy(s,false);
  assert.ok(s.socialAction);
});
test('automatic conversation obeys needs, cooldown and autonomy preference',()=>{
  const s=newHousehold();s.minutes=600;s.relationship.nextSocialAt=590;s.needs.fun=34;
  assert.equal(autonomousSocialChoice(s,'alex'),'talk');
  s.relationship.nextSocialAt=750;
  assert.equal(autonomousSocialChoice(s,'alex'),null);
  s.relationship.nextSocialAt=590;s.needs.hunger=9;
  assert.equal(autonomousSocialChoice(s,'alex'),null);
  s.needs.hunger=80;setHouseholdAutonomy(s,false);
  assert.equal(autonomousSocialChoice(s,'alex'),null);
});
test('saved conversation completes once; invalid social data is rejected',()=>{
  const s=newHousehold();startSocial(s,'talk','alex',place);arriveSocial(s);
  tickHousehold(s,8);
  const restored=loadHousehold(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.socialAction.phase,'using');
  tickHousehold(restored,11);
  assert.equal(restored.relationship.affinity,58);
  tickHousehold(restored,20);
  assert.equal(restored.relationship.affinity,58);
  const hostile={...s,relationship:{affinity:900,nextSocialAt:-40,lastKind:'evil'},
    socialAction:{kind:'evil',initiator:'alex',partner:'mira',phase:'using',elapsed:1,target:place}};
  const sanitized=loadHousehold(hostile);
  assert.equal(sanitized.relationship.affinity,100);
  assert.equal(sanitized.relationship.lastKind,null);
  assert.equal(sanitized.socialAction,null);
});
test('invalid social targets or IDs are rejected',()=>{
  const s=newHousehold();
  assert.equal(startSocial(s,'talk','unknown',place),false);
  assert.equal(startSocial(s,'talk','alex',{x:Infinity,z:1}),false);
  assert.equal(startSocial(s,'argue','alex',{x:55,z:0}),false);
  assert.equal(startSocial(s,'bad','alex',place),false);
});

test('argument memories distinguish initiator regret from partner hurt',()=>{
  const s=newHousehold();
  complete(s,'argue','alex');
  assert.equal(s.mind.memories.at(-1).id,'regret');
  assert.equal(s.otherSim.mind.memories.at(-1).id,'hurt');
  assert.ok(s.otherSim.mind.mood.value<s.mind.mood.value,
    'hurt partner feels a stronger negative effect than the initiator');
  assert.equal(canReconcile(s),true);
  assert.equal(s.relationship.lastKind,'argue');
});
test('a follow-up conversation remembers reconciliation, restores trust and mood',()=>{
  const s=newHousehold();
  complete(s,'argue','mira');
  assert.equal(s.relationship.affinity,38);
  const beforeA=s.mind.mood.value,beforeM=s.otherSim.mind.mood.value;
  assert.equal(canReconcile(s),true);
  complete(s,'talk','alex');
  assert.equal(s.relationship.affinity,50,'reconciliation adds 12 instead of 8');
  assert.equal(s.relationship.lastKind,'talk');
  assert.equal(s.mind.memories.at(-1).id,'reconcile');
  assert.equal(s.otherSim.mind.memories.at(-1).id,'reconcile');
  assert.equal(canReconcile(s),false,'do not reconcile the same fight twice');
  assert.ok(s.mind.mood.value>beforeA);
  assert.ok(s.otherSim.mind.mood.value>beforeM);
  const saved=loadHousehold(JSON.parse(JSON.stringify(s)));
  assert.equal(saved.mind.memories.at(-1).id,'reconcile');
  assert.equal(saved.otherSim.mind.memories.at(-1).id,'reconcile');
  assert.equal(saved.relationship.affinity,50);
  complete(saved,'talk','alex');
  assert.equal(saved.relationship.affinity,58,'normal talk returns to +8');
  assert.equal(saved.mind.memories.at(-1).id,'talk');
});
test('reconciliation expires; old v1 argument saves can still make peace',()=>{
  const old=newHousehold();
  old.minutes=800;old.otherSim.minutes=800;
  old.relationship.lastKind='argue';
  old.mind.memories.push({id:'argue',at:790,fulfilled:false});
  old.otherSim.mind.memories.push({id:'argue',at:790,fulfilled:false});
  assert.equal(canReconcile(old),true);
  const loaded=loadHousehold(JSON.parse(JSON.stringify(old)));
  assert.equal(canReconcile(loaded),true);
  complete(loaded,'talk');
  assert.equal(loaded.mind.memories.at(-1).id,'reconcile');
  const expired=newHousehold();
  expired.minutes=1000;expired.otherSim.minutes=1000;
  expired.relationship.lastKind='argue';
  expired.mind.memories=[{id:'argue',at:1000-RECONCILIATION_WINDOW_MINUTES-1}];
  expired.otherSim.mind.memories=[{id:'argue',at:1000-RECONCILIATION_WINDOW_MINUTES-1}];
  assert.equal(canReconcile(expired),false);
  complete(expired,'talk');
  assert.equal(expired.relationship.affinity,58);
  assert.equal(expired.mind.memories.at(-1).id,'talk');
});
test('initiator may autonomously repair an argument after cooldown without ignoring needs',()=>{
  const s=newHousehold();
  complete(s,'argue','mira');
  s.minutes=s.relationship.nextSocialAt+1;s.otherSim.minutes=s.minutes;
  s.needs={hunger:87,energy:85,hygiene:90,fun:91};
  s.otherSim.needs={hunger:88,energy:85,hygiene:92,fun:91};
  assert.equal(autonomousSocialChoice(s,'mira'),'talk');
  assert.equal(autonomousSocialChoice(s,'alex'),null,
    'hurt partner is not forced into a talk just because the other regrets');
  s.otherSim.needs.energy=12;
  assert.equal(autonomousSocialChoice(s,'mira'),null);
  s.otherSim.needs.energy=88;
  setHouseholdAutonomy(s,false);
  assert.equal(autonomousSocialChoice(s,'mira'),null);
});
test('an interrupted or paused reconciliation adds no memories or bonus',()=>{
  const s=newHousehold();
  complete(s,'argue','alex');
  const before=s.relationship.affinity;
  assert.equal(startSocial(s,'talk','mira',place),true);
  arriveSocial(s);
  s.paused=true;tickHousehold(s,45);
  assert.equal(s.relationship.affinity,before);
  assert.equal(s.mind.memories.length,1);
  s.paused=false;
  cancelSocial(s);
  tickHousehold(s,120);
  assert.equal(s.relationship.affinity,before);
  assert.equal(s.mind.memories.length,1);
  assert.equal(canReconcile(s),true);
});
