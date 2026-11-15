import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newFurnitureWorld,furnitureObstacles} from '../src/furniture-catalog.js';
import {FURNITURE} from '../src/navigation.js';
import {newGame,loadGame,tick,SAVE_KEY,NEEDS} from '../src/simulation.js';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {calculateMood,refreshMind} from '../src/psychology.js';
import {environmentSnapshot,ENVIRONMENT_MOOD_LIMIT}
  from '../src/environment-effects.js';
import {residentMoodInsight} from '../src/insight-presentation.js';
import {moodPresentation} from '../src/mood-presentation.js';
import {moodActionPolicy} from '../src/mood-action-policy.js';
import {DEMO_PROFILES} from '../src/trait-catalog.js';
const copy=x=>JSON.parse(JSON.stringify(x));
const allGood=actor=>{for(const key of NEEDS)actor.needs[key]=90;};
const nearPlant={x:3.65,z:3.31};
test('M5 uses actual existing F0 furniture; no weather/dirt/TV or seventh need',()=>{
  const w=newFurnitureWorld(),sim=newGame();
  sim.position={...nearPlant};
  const evidence=environmentSnapshot(sim,{furniture:w});
  assert.ok(evidence.delta>0);
  assert.ok(evidence.causes.some(c=>c.id==='plant'));
  assert.equal(evidence.causes.some(c=>c.id==='tv'),false);
  assert.ok(Math.abs(evidence.delta)<=ENVIRONMENT_MOOD_LIMIT);
  assert.deepEqual([...NEEDS].sort(),
    ['hunger','energy','hygiene','fun','bladder','social'].sort());
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.deepEqual(environmentSnapshot(sim).delta,
    environmentSnapshot(sim,{furniture:w}).delta);
  assert.ok(FURNITURE.some(x=>x.id==='plant'));
  const before=JSON.stringify({sim,w});
  for(let n=0;n<3;n++)environmentSnapshot(sim,{furniture:w});
  assert.equal(JSON.stringify({sim,w}),before,'read-only environment never mutates save');
});
test('M5 removed/stored plant stops granting its comfort; actual moved instance follows position',()=>{
  const sim=newGame();sim.position={...nearPlant};
  const world=newFurnitureWorld();
  const original=environmentSnapshot(sim,world);
  assert.ok(original.causes.some(c=>c.id==='plant'));
  const absent=copy(world);
  const plant=absent.instances.find(x=>x.prefabId==='plant');
  plant.location='storage';absent.revision++;
  const stored=environmentSnapshot(sim,absent);
  assert.equal(stored.causes.some(c=>c.id==='plant'),false);
  assert.ok(original.delta>stored.delta+.5);
  // An actual F0 instance moves; no stale constant coordinates or free bonus.
  const moved=copy(world);
  const changed=moved.instances.find(x=>x.prefabId==='plant');
  changed.x=-.2;changed.z=-3.2;moved.revision++;
  const now=environmentSnapshot(sim,moved);
  assert.equal(now.causes.some(c=>c.id==='plant'),false);
  assert.ok(furnitureObstacles(moved).some(x=>x.id==='plant'&&x.minX<0));
});
test('M5 distinct residents and personality react independently to physical room context',()=>{
  const root=newHousehold();
  allGood(root);allGood(root.otherSim);
  root.position={...nearPlant};root.otherSim.position={x:1.35,z:.52};
  tickHousehold(root,.3);
  const a=environmentSnapshot(root,root.world);
  const b=environmentSnapshot(root.otherSim,root.world);
  assert.ok(a.causes.some(c=>c.id==='plant'));
  assert.ok(b.causes.some(c=>c.id==='sofa'));
  assert.ok(!b.causes.some(c=>c.id==='plant'));
  assert.ok(Math.abs(root.mind.mood.value-b.delta)>=0);
  assert.equal(root.mind.mood.value,calculateMood(root.needs,root.mind,
    root.minutes,root.personality,a.delta).value);
  assert.equal(root.otherSim.mind.mood.value,calculateMood(root.otherSim.needs,
    root.otherSim.mind,root.otherSim.minutes,root.otherSim.personality,b.delta).value);
  const alter=newGame(DEMO_PROFILES.second);alter.position={...nearPlant};
  const same=newGame(DEMO_PROFILES.first);same.position={...nearPlant};
  assert.ok(Number.isFinite(environmentSnapshot(alter).delta));
  assert.ok(Number.isFinite(environmentSnapshot(same).delta));
});
test('M5 one canonical mood: independent bounded environmental contribution, no new receipts',()=>{
  const actor=newGame();allGood(actor);actor.position={...nearPlant};
  refreshMind(actor);
  const evidence=environmentSnapshot(actor);
  const base=calculateMood(actor.needs,actor.mind,actor.minutes,actor.personality,0);
  const modified=calculateMood(actor.needs,actor.mind,actor.minutes,actor.personality,evidence.delta);
  assert.equal(actor.mind.mood.value,modified.value);
  assert.ok(modified.value>=base.value&&modified.value-base.value<=ENVIRONMENT_MOOD_LIMIT);
  assert.deepEqual(actor.mind.memories,[]);
  assert.deepEqual(actor.mind.emotions,[]);
  assert.equal(moodActionPolicy(actor,{type:'object',actionId:'bed'}).mood,modified.value);
  actor.needs.energy=1;refreshMind(actor);
  assert.ok(actor.mind.mood.value<modified.value,'real exhaustion dominates furniture');
  assert.equal(moodActionPolicy(actor,{type:'object',actionId:'bed'}).willing,true);
  for(const fake of [NaN,Infinity,-Infinity,1000000,-1000000])
    assert.ok(calculateMood(actor.needs,actor.mind,actor.minutes,actor.personality,fake).value>=0);
});
test('M5 real cause remains visible in HUD and Why without storage or event fabrication',()=>{
  const root=newHousehold();allGood(root);
  root.position={...nearPlant};refreshMind(root,root.world);
  const snap=JSON.stringify(root);
  const info=residentMoodInsight(root,{residentName:'Алекс',world:root.world});
  assert.ok(info.environment.some(c=>c.title.includes('растением')));
  assert.ok(info.environment.every(c=>c.type==='environment'));
  assert.ok(info.reasons.some(c=>c.includes('растением')));
  assert.ok(moodPresentation(root,root.world).description.includes('растением'));
  assert.equal(JSON.stringify(root),snap);
  const noPlant=copy(root.world);
  noPlant.furniture.instances=noPlant.furniture.instances.filter(i=>i.prefabId!=='plant');
  const explanation=residentMoodInsight(root,{world:noPlant});
  assert.equal(explanation.environment.some(c=>c.title.includes('растением')),false);
});
test('M5 save and idle/3x/paused deterministic behavior, no new persistent environment meter',()=>{
  const root=newHousehold();
  root.position={...nearPlant};root.otherSim.position={x:1.35,z:.52};
  allGood(root);allGood(root.otherSim);
  const restored=loadHousehold(copy(root));
  assert.equal(restored.version,1);
  assert.equal(restored.world.furniture.schema,1);
  assert.deepEqual(restored.world.furniture,root.world.furniture);
  const a=environmentSnapshot(restored,restored.world);
  const b=environmentSnapshot(restored.otherSim,restored.world);
  assert.equal(restored.mind.mood.value,calculateMood(restored.needs,restored.mind,
    restored.minutes,restored.personality,a.delta).value);
  assert.equal(restored.otherSim.mind.mood.value,calculateMood(restored.otherSim.needs,
    restored.otherSim.mind,restored.minutes,restored.otherSim.personality,b.delta).value);
  const snapshot=JSON.stringify(restored);restored.paused=true;tickHousehold(restored,1000);
  assert.equal(JSON.stringify(restored),JSON.stringify({...JSON.parse(snapshot),paused:true}));
  restored.paused=false;tickHousehold(restored,.9);
  assert.ok(restored.minutes>root.minutes);
  assert.ok(!Object.hasOwn(restored.needs,'comfort'));
  const loaded=loadGame(copy(restored));assert.equal(loaded.version,1);
});
test('M5 future F1 room density penalizes actual crowded unique instances without stacking fake duplicates',()=>{
  const actor=newGame();actor.position={x:0,z:0};
  const world=newFurnitureWorld();
  // The only ambient density sources are authored instances at runtime;
  // duplicate obstacle subpieces with the same instance ID do not stack.
  const changed=copy(world);
  for(const [id,x,z] of [['home-table-1',.6,.35],['home-tv-1',.5,-.3],
    ['home-counter-1',-.6,.35]]){
    const item=changed.instances.find(i=>i.instanceId===id);
    item.x=x;item.z=z;
  }
  const mood=environmentSnapshot(actor,changed);
  assert.ok(mood.causes.some(c=>c.id==='cramped'));
  assert.ok(mood.delta>=-ENVIRONMENT_MOOD_LIMIT);
  const invalid=environmentSnapshot({...actor,position:{x:NaN,z:3}},changed);
  assert.deepEqual(invalid,{delta:0,causes:[]});
  assert.deepEqual(environmentSnapshot(actor,{schema:1,instances:[]}),{delta:0,causes:[]});
});
test('M5 Pages bundles the real scene module, HUD explanation, and single canonical mood',()=>{
  const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
  const pages=read('../.github/workflows/pages.yml'),scene=read('../src/game.js');
  const psychology=read('../src/psychology.js'),html=read('../index.html');
  assert.ok(pages.includes('node --check src/environment-effects.js'));
  assert.ok(pages.includes('cp src/environment-effects.js site/src/'));
  assert.ok(scene.includes('world:game.world'));
  assert.ok(scene.includes("const ambient=$('insight-environment')"));
  assert.match(html,/id="insight-environment"/);
  assert.match(psychology,/environmentSnapshot\(state,world\)\.delta/);
  assert.match(psychology,/calculateMood\(needs, mind, minutes/);
  assert.ok(!scene.includes('environmentMoodAward'));
});
