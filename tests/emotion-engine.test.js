import test from 'node:test';
import assert from 'node:assert/strict';
import {EMOTION_KINDS,EMOTION_SOURCES,EMOTION_DURATION,EMOTION_LIMIT,
  emotionKindFor,emotionFromMemory,feelMemory,visibleEmotions,restoreEmotions,
  emotionMoodImpact,memoryEmotionKey} from '../src/emotion-engine.js';
import {DEMO_PROFILES,createProfile} from '../src/trait-catalog.js';
import {calculateMood,recentMemoryEffect,refreshMind} from '../src/psychology.js';
import {newGame,loadGame,chooseAction,arrive,tick,ACTIONS,SAVE_KEY} from '../src/simulation.js';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {startSocial,arriveSocial,SOCIAL_ACTIONS} from '../src/relationships.js';

const place={x:-.2,z:1.85};
const deep=value=>JSON.parse(JSON.stringify(value));
const complete=(root,kind='talk',id='alex')=>{
  assert.equal(startSocial(root,kind,id,place),true);
  assert.equal(arriveSocial(root),true);
  tickHousehold(root,SOCIAL_ACTIONS[kind].duration+1);
};
test('known emotion kinds and sources cover household and social events',()=>{
  for(const id of ['bed','fridge','shower','sofa','talk','argue','regret','hurt','reconcile'])
    assert.ok(EMOTION_SOURCES[id]);
  assert.deepEqual(Object.keys(EMOTION_KINDS).sort(),
    ['anxiety','calm','enthusiasm','inspiration','irritation','joy','sadness']);
  assert.equal(EMOTION_DURATION,360);
  assert.equal(EMOTION_LIMIT,5);
});
test('one identical quarrel impression can produce different emotion types and intensity',()=>{
  const hot=createProfile(['temperament.hotheaded','habits.neat']);
  const melancholic=createProfile(['temperament.melancholic','habits.neat']);
  assert.equal(emotionKindFor('regret',hot),'irritation');
  assert.equal(emotionKindFor('regret',melancholic),'sadness');
  const impression={id:'regret',at:500,fulfilled:false};
  const a=emotionFromMemory(impression,hot),b=emotionFromMemory(impression,melancholic);
  assert.notEqual(a.intensity,b.intensity);
  assert.equal(a.at,500);assert.equal(a.until,860);
  assert.equal(emotionKindFor('nonsense',hot),null);
});
test('a completed activity adds exactly one short-lived feeling and one persistent memory',()=>{
  const s=newGame();chooseAction(s,'sofa');arrive(s);tick(s,ACTIONS.sofa.duration+1);
  assert.equal(s.mind.memories.length,1);
  assert.equal(s.mind.emotions.length,1);
  assert.equal(s.mind.emotions[0].source,'sofa');
  const before=deep(s.mind.emotions);
  tick(s,2);
  assert.deepEqual(s.mind.emotions,before,'time passing derives strength without mutating emotion');
  assert.equal(s.mind.memories.length,1);
});
test('social regret and hurt create independent emotions with different strength',()=>{
  const s=newHousehold();complete(s,'argue','alex');
  assert.equal(s.mind.emotions.at(-1).source,'regret');
  assert.equal(s.otherSim.mind.emotions.at(-1).source,'hurt');
  assert.ok(emotionMoodImpact(s.otherSim.mind,s.minutes).delta<
    emotionMoodImpact(s.mind,s.minutes).delta);
  assert.equal(s.relationship.affinity,38);
});
test('reconciliation creates positive feelings once and does not repeat on later ticks',()=>{
  const s=newHousehold();complete(s,'argue','alex');
  complete(s,'talk','mira');
  assert.equal(s.mind.memories.at(-1).id,'reconcile');
  assert.equal(s.mind.emotions.at(-1).source,'reconcile');
  assert.equal(s.relationship.affinity,50);
  tickHousehold(s,10);
  assert.equal(s.mind.memories.filter(m=>m.id==='reconcile').length,1);
  assert.equal(s.mind.emotions.filter(m=>m.source==='reconcile').length,1);
});
test('a source is replaced rather than counted twice toward mood, unmatched old memory remains',()=>{
  const s=newGame();s.minutes=600;
  s.needs={hunger:70,energy:70,hygiene:70,fun:70};
  const memory={id:'hurt',at:600,fulfilled:false};
  s.mind.memories=[memory];s.mind.emotions=[];
  const legacy=recentMemoryEffect(s.mind,600);
  assert.equal(legacy,-22);
  const legacyMood=calculateMood(s.needs,s.mind,600,s.personality);
  assert.equal(feelMemory(s,memory),true);
  assert.equal(feelMemory(s,memory),false);
  const impact=emotionMoodImpact(s.mind,600);
  assert.equal(impact.covered.has(memoryEmotionKey(memory)),true);
  assert.equal(recentMemoryEffect(s.mind,600,impact.covered),0);
  assert.ok(impact.delta<0);
  const changed=calculateMood(s.needs,s.mind,600,s.personality);
  assert.ok(Math.abs(legacyMood.value-changed.value)<9,'one new replacement, not two penalties');
});
test('strength decays continuously by game minutes and disappears at 360 minutes',()=>{
  const s=newGame();s.minutes=600;
  const memory={id:'talk',at:600,fulfilled:false};
  s.mind.memories=[memory];feelMemory(s,memory);
  const [a]=visibleEmotions(s.mind,600,s.personality);
  const [b]=visibleEmotions(s.mind,780,s.personality);
  assert.ok(a.intensity>b.intensity);
  assert.ok(b.intensity>0);
  assert.deepEqual(visibleEmotions(s.mind,960,s.personality),[]);
  assert.equal(emotionMoodImpact(s.mind,960).delta,0);
  s.minutes=960;refreshMind(s);
  assert.equal(s.mind.emotions.length,0);
});
test('paused game does not alter emotions, memories, clock or mood',()=>{
  const s=newHousehold();complete(s,'talk','alex');s.paused=true;
  const saved=JSON.stringify(s);
  tickHousehold(s,800);
  assert.equal(JSON.stringify(s),saved);
});
test('x3 acceleration uses ordinary in-game minutes and not wall clock',()=>{
  const s=newGame();const memory={id:'talk',at:480,fulfilled:false};
  s.mind.memories=[memory];feelMemory(s,memory);
  s.speed=3;tick(s,60);
  const e=visibleEmotions(s.mind,s.minutes,s.personality)[0];
  assert.equal(e.remaining,300);
  tick(s,300);
  assert.deepEqual(s.mind.emotions,[]);
});
test('old 0.8a save memories materialize bounded explainable emotions without losing memory',()=>{
  const s=newHousehold();s.minutes=800;s.otherSim.minutes=800;
  s.mind.memories=[{id:'regret',at:740,fulfilled:false}];
  s.otherSim.mind.memories=[{id:'hurt',at:740,fulfilled:false}];
  delete s.mind.emotions;delete s.otherSim.mind.emotions;
  const loaded=loadHousehold(deep(s));
  assert.equal(loaded.mind.emotions.length,1);
  assert.equal(loaded.mind.emotions[0].intensity,60,'legacy mood strength matches historical v1');
  assert.equal(loaded.otherSim.mind.emotions[0].source,'hurt');
  assert.deepEqual(loaded.mind.memories,s.mind.memories);
  assert.equal(loaded.version,1);assert.equal(SAVE_KEY,'lifesim.room01.v1');
});
test('saved emotion intensity/expiry is stable across reload for both residents',()=>{
  const s=newHousehold();complete(s,'talk','mira');
  const r=loadHousehold(deep(s));
  assert.deepEqual(r.mind.emotions,s.mind.emotions);
  assert.deepEqual(r.otherSim.mind.emotions,s.otherSim.mind.emotions);
  assert.deepEqual(r.personality,s.personality);
});
test('hostile emotion payload never injects UI cause labels or outlives expiry',()=>{
  const s=newGame();s.minutes=1000;
  s.mind.memories=[{id:'hurt',at:990,fulfilled:false}];
  s.mind.emotions=[
    {source:'<script>alert(1)</script>',at:990,until:1350,intensity:90},
    {source:'hurt',at:990,until:Infinity,intensity:90},
    {source:'hurt',at:990,until:1350,intensity:999},
    {source:'hurt',at:990,until:1350,intensity:60,fulfilled:false},
    {source:'hurt',at:990,until:1350,intensity:60,fulfilled:false}
  ];
  const t=loadGame(deep(s));
  assert.equal(t.mind.emotions.length,1);
  const [emotion]=visibleEmotions(t.mind,t.minutes,t.personality);
  assert.ok(!emotion.cause.includes('<'));
  assert.ok(!emotion.label.includes('<'));
  assert.equal(emotion.source,'hurt');
});
test('a malicious emotion with no matching memory is ignored, including on reload',()=>{
  const s=newGame();s.minutes=1000;
  s.mind.emotions=[{source:'hurt',at:990,until:1350,intensity:70,fulfilled:false}];
  const t=loadGame(deep(s));
  assert.deepEqual(t.mind.emotions,[]);
  assert.equal(emotionMoodImpact(t.mind,t.minutes).delta,0);
});
test('emotion storage never grows without bound after many completed interactions',()=>{
  const s=newHousehold();
  for(let i=0;i<15;i++)complete(s,'talk','alex');
  assert.ok(s.mind.emotions.length<=EMOTION_LIMIT);
  assert.ok(s.otherSim.mind.emotions.length<=EMOTION_LIMIT);
  const t=loadHousehold(deep(s));
  assert.ok(t.mind.emotions.length<=EMOTION_LIMIT);
  assert.equal(t.mind.memories.length,12);
});
test('critical physical needs override even a strong happy feeling',()=>{
  const s=newGame();s.minutes=600;s.needs.energy=6;
  const memory={id:'reconcile',at:600,fulfilled:false};
  s.mind.memories=[memory];feelMemory(s,memory);
  assert.equal(calculateMood(s.needs,s.mind,600,s.personality).label,'Измотан');
});
test('calm and creative characters interpret familiar leisure differently',()=>{
  const calm=createProfile(['temperament.calm','approach.pragmatic']);
  const creative=createProfile(['temperament.cheerful','approach.creative']);
  assert.equal(emotionKindFor('sofa',calm),'enthusiasm');
  assert.equal(emotionKindFor('sofa',creative),'inspiration');
});
test('interrupted actions generate no new feelings',()=>{
  const s=newGame();chooseAction(s,'fridge');tick(s,1);
  chooseAction(s,'bed');
  assert.equal(s.mind.emotions.length,0);
  assert.equal(s.mind.memories.length,0);
});
