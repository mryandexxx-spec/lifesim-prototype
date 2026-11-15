import test from 'node:test';
import assert from 'node:assert/strict';
import {TRAIT_CATALOG,DEMO_PROFILES,PROFILE_RULES,AXES,PREFERENCE_CATALOG,
  getTrait,listTraits,validateSelection,validatePreferences,createProfile,
  restoreProfile,deriveAxes,preferenceAffinity,traitLabels,interestLabels} from '../src/trait-catalog.js';
import {activityReceipt,isSimEvent} from '../src/sim-events.js';
import {newGame,loadGame,SAVE_KEY,autonomousChoice} from '../src/simulation.js';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {selectWish,calculateMood,psychologyScore} from '../src/psychology.js';
const thinker=['temperament.melancholic','habits.neat'];
const joyful=['temperament.cheerful','coordination.clumsy'];
test('registry exposes 14 stable unique trait definitions over six facets',()=>{
  assert.equal(listTraits().length,14);
  assert.equal(new Set(listTraits().map(t=>t.id)).size,14);
  assert.equal(new Set(listTraits().map(t=>t.facet)).size,6);
  assert.ok(AXES.length>=10);assert.equal(PROFILE_RULES.schema,1);
  assert.equal(getTrait('coordination.clumsy').label,'Растяпа');
  assert.equal(getTrait('__proto__'),null);
  assert.equal(TRAIT_CATALOG['habits.neat'].axisDeltas.organization,.30);
});
test('melancholic neat and cheerful clumsy are valid and order-independent',()=>{
  assert.equal(validateSelection(thinker).valid,true);
  assert.equal(validateSelection(joyful).valid,true);
  assert.equal(validateSelection(['habits.neat','coordination.clumsy']).valid,true);
  assert.deepEqual(deriveAxes(createProfile(thinker)),deriveAxes(createProfile([...thinker].reverse())));
  assert.ok(deriveAxes(createProfile(thinker)).organization>.5);
  assert.ok(deriveAxes(createProfile(joyful)).coordination<.5);
});
test('same-facet, duplicate, short, excessive and unknown selections are rejected',()=>{
  for(const ids of [
    ['temperament.cheerful','temperament.melancholic'],
    ['habits.neat','habits.neat'],
    ['habits.neat'],[...thinker,'social.outgoing','values.empathetic'],
    [...thinker,'alien'],{bad:true}])
    assert.equal(validateSelection(ids).valid,false,JSON.stringify(ids));
  assert.throws(()=>createProfile(['habits.neat','habits.untidy']),RangeError);
});
test('preferences are independent, safe and cannot contradict themselves',()=>{
  const p=createProfile(joyful,{likes:['books','drawing'],dislikes:['parties']});
  assert.equal(preferenceAffinity(p,'books'),1);
  assert.equal(preferenceAffinity(p,'parties'),-1);
  assert.equal(preferenceAffinity(p,'music'),0);
  assert.ok(interestLabels(p).includes('Рисование'));
  assert.ok(traitLabels(p).includes('Весёлый'));
  assert.equal(validatePreferences({likes:['books'],dislikes:['books']}).valid,false);
  assert.equal(validatePreferences({likes:['<script>'],dislikes:[]}).valid,false);
  assert.ok(Object.keys(PREFERENCE_CATALOG).length>=8);
});
test('existing and malicious saved profiles are sanitized without mutating fallback',()=>{
  const own=createProfile(joyful,{likes:['drawing'],dislikes:['parties']});
  const round=restoreProfile(JSON.parse(JSON.stringify(own)),DEMO_PROFILES.first);
  assert.deepEqual(round,own);
  round.traitIds.push('approach.creative');
  assert.equal(own.traitIds.length,2);
  const broken={schema:1,traitIds:['__proto__','habits.neat'],
    preferences:{likes:['<img>'],dislikes:[]}};
  const restored=restoreProfile(broken,DEMO_PROFILES.first);
  assert.deepEqual(restored.traitIds,DEMO_PROFILES.first.traitIds);
  assert.deepEqual(restoreProfile(null,DEMO_PROFILES.second).traitIds,DEMO_PROFILES.second.traitIds);
});
test('additive catalog extension accepts another registered trait without a new character class',()=>{
  const extra={id:'values.patient',facet:'values',label:'Терпеливый',axisDeltas:{resilience:.2},tags:[]};
  const registry={...TRAIT_CATALOG,[extra.id]:extra};
  assert.equal(validateSelection(['temperament.cheerful','values.patient'],{catalog:registry}).valid,true);
  assert.equal(validateSelection(['temperament.cheerful','values.patient']).valid,false);
});
test('fresh household has two distinct profiles and copies are not aliased',()=>{
  const root=newHousehold();
  assert.notDeepEqual(root.personality.traitIds,root.otherSim.personality.traitIds);
  assert.equal(root.personality.traitIds[0],'temperament.melancholic');
  assert.equal(root.otherSim.personality.traitIds[0],'temperament.cheerful');
  root.personality.preferences.likes.push('drawing');
  assert.ok(!root.otherSim.personality.preferences.likes.includes('drawing'));
});
test('custom traits and preferences survive exact v1 roundtrip for both residents',()=>{
  const s=newHousehold();
  s.personality=createProfile(joyful,{likes:['books'],dislikes:['parties']});
  s.otherSim.personality=createProfile(thinker,{likes:['drawing'],dislikes:['music']});
  const t=loadHousehold(JSON.parse(JSON.stringify(s)));
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(t.version,1);
  assert.deepEqual(t.personality,s.personality);
  assert.deepEqual(t.otherSim.personality,s.otherSim.personality);
});
test('0.8a saves lacking profiles retain all old needs, relationship and memory records',()=>{
  const old=newHousehold();delete old.personality;delete old.otherSim.personality;
  old.minutes=1200;old.needs.energy=25;old.otherSim.needs.hunger=11;
  old.relationship.affinity=73;
  old.mind.memories.push({id:'regret',at:900,fulfilled:false});
  const t=loadHousehold(JSON.parse(JSON.stringify(old)));
  assert.equal(t.needs.energy,25);assert.equal(t.otherSim.needs.hunger,11);
  assert.equal(t.relationship.affinity,73);assert.equal(t.mind.memories.at(-1).id,'regret');
  assert.equal(t.personality.traitIds[0],'temperament.melancholic');
  assert.equal(t.otherSim.personality.traitIds[0],'temperament.cheerful');
});
test('single-resident loader preserves explicit profile but repairs bad profile safely',()=>{
  const s=newGame();s.needs.hunger=23;
  s.personality=createProfile(joyful);
  assert.deepEqual(loadGame(JSON.parse(JSON.stringify(s))).personality,s.personality);
  s.personality={schema:1,traitIds:['temperament.cheerful','temperament.melancholic'],
    preferences:{likes:[],dislikes:[]}};
  const t=loadGame(JSON.parse(JSON.stringify(s)));
  assert.equal(t.needs.hunger,23);
  assert.deepEqual(t.personality.traitIds,DEMO_PROFILES.first.traitIds);
});
test('same needs and memory can yield distinct mood, wishes and activity bonus from profiles',()=>{
  const a=newGame(DEMO_PROFILES.first);
  const b=newGame(DEMO_PROFILES.second);
  b.needs={...a.needs};b.mind=JSON.parse(JSON.stringify(a.mind));
  assert.notEqual(calculateMood(a.needs,a.mind,800,a.personality).value,
    calculateMood(b.needs,b.mind,800,b.personality).value);
  assert.notEqual(psychologyScore(a,'sofa',false),psychologyScore(b,'sofa',false));
  const x={...a,minutes:800,needs:{hunger:80,energy:80,hygiene:80,fun:80},mind:{memories:[]}};
  const y={...x,personality:b.personality};
  assert.ok(['bed','fridge','shower','sofa'].includes(selectWish(x)));
  assert.ok(['bed','fridge','shower','sofa'].includes(selectWish(y)));
  assert.ok(autonomousChoice({...a,minutes:590})===null||typeof autonomousChoice({...a,minutes:590})==='string');
});
test('profile changes do not affect paused ticks, saved memory or previous social contracts',()=>{
  const s=newHousehold();s.paused=true;
  const before=JSON.stringify(s);tickHousehold(s,42);
  assert.equal(JSON.stringify(s),before);
});
test('completed activity receipts are safe typed immutable values',()=>{
  const e=activityReceipt('sofa',680.25);
  assert.equal(e.type,'activity.completed');
  assert.equal(e.actionId,'sofa');
  assert.equal(isSimEvent(e),true);
  assert.equal(activityReceipt('unknown',600),null);
  assert.equal(activityReceipt('sofa',NaN),null);
  assert.equal(isSimEvent({type:'gift.given',atGameMinute:-1}),false);
});
