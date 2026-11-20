import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {gardenApproach,gardenView,GARDEN_DURATION} from '../src/gardening.js';
import {restoreGardenMilestones,refreshGardenWishes,gardenWishCommand,
  gardenWishEligible,GARDEN_WISHES} from '../src/garden-psychology.js';
import {PREFERENCE_CATALOG,createProfile,restoreProfile} from '../src/trait-catalog.js';
import {gardenAutoChance} from '../src/garden-autonomy.js';
import {sanitizeQueueCommand,enqueueAction} from '../src/action-queue.js';
import {MEMORY_TEXT,WISHES} from '../src/psychology.js';
import {EMOTION_SOURCES,emotionMoodImpact} from '../src/emotion-engine.js';

const copy=x=>JSON.parse(JSON.stringify(x));
function place(root,itemId='garden.herb.mint',x=19,z=8){
  const preview=previewOutdoorFeatureEdit(root,{
    operation:'place',itemId,pose:{x,z,yaw:0}});
  assert.ok(preview.ok,preview.reason);
  const result=commitOutdoorFeatureEdit(root,preview);
  assert.ok(result.ok,result.reason);
  return result.root;
}
const gardenId=root=>root.world.outdoors.features.find(f=>f.itemId.startsWith('garden.')).instanceId;
function activeGarden(root,id,actionId,residentId='alex',elapsed=0){
  const actor=residentId==='mira'?root.otherSim:root;
  const plan=gardenApproach(root.world,id,actor.position);
  assert.ok(plan);
  actor.position={...plan.goal};
  actor.action={id:'garden',phase:'using',elapsed,automatic:false,
    targetInstanceId:id,gardenActionId:actionId,gardenGoal:{...plan.goal},
    gardenPlantedAt:root.world.outdoors.gardens[id].plantedAt};
  return actor;
}
function prepared(root,minutes=960){
  root.minutes=minutes;root.otherSim.minutes=minutes;
  root.mind.wish={id:'sofa',since:minutes,until:minutes+480};
  root.otherSim.mind.wish={id:'sofa',since:minutes-1,until:minutes+479};
  return root;
}
const notes=(root,id='alex')=>(id==='mira'?root.otherSim:root).mind.memories
  .filter(x=>x.id.startsWith('garden.'));
test('C2b: approved preference is additive to schema1 and changes autonomy by ±20pp',()=>{
  assert.equal(PREFERENCE_CATALOG.gardening,'Садоводство');
  const traits=['temperament.melancholic','habits.neat'];
  const base=createProfile(traits,{likes:[],dislikes:[]});
  const yes=createProfile(traits,{likes:['gardening'],dislikes:[]});
  const no=createProfile(traits,{likes:[],dislikes:['gardening']});
  assert.ok(Math.abs(gardenAutoChance(yes)-gardenAutoChance(base)-.20)<1e-9);
  assert.ok(Math.abs(gardenAutoChance(no)-gardenAutoChance(base)+.20)<1e-9);
  assert.deepEqual(restoreProfile(copy(yes)),yes);
  assert.equal(restoreProfile(copy(base)).preferences.likes.length,0);
  assert.ok(WISHES['garden.care']&&WISHES['garden.observe']&&WISHES['garden.bloom']);
});
test('C2b: physical 8-minute inspect has no free Fun, XP or memory',()=>{
  const game=place(newHousehold()),id=gardenId(game);
  game.world.outdoors.gardens[id].progressWetMinutes=1440;
  game.world.outdoors.gardens[id].evaluatedAt=game.minutes;
  assert.equal(GARDEN_DURATION.inspect,8);
  assert.deepEqual(sanitizeQueueCommand('alex',
    {type:'garden',instanceId:id,actionId:'inspect'},['alex','mira']),
    {type:'garden',instanceId:id,actionId:'inspect'});
  const before=game.needs.fun,skills=copy(game.skills);
  activeGarden(game,id,'inspect');
  tickHousehold(game,8);
  assert.equal(game.action,null);
  assert.ok(game.needs.fun<=before,'only ordinary decay');
  assert.deepEqual(game.skills,skills);
  assert.equal(notes(game).length,0);
  const rec=game.gardenMilestones.byResident.alex.plots.find(p=>p.instanceId===id);
  assert.equal(rec.lastObservedStage,1);
  assert.equal(game.gardenRewards.alexLastAdmireAt,null);
  const reload=loadHousehold(copy(game));
  assert.equal(reload.gardenMilestones.byResident.alex.plots[0].lastObservedStage,1);
});
test('C2b: first real watering grants exactly one memory/emotion, no duplicates on reload',()=>{
  let game=place(newHousehold()),id=gardenId(game);
  activeGarden(game,id,'water');
  tickHousehold(game,15);
  assert.deepEqual(notes(game).map(x=>x.id),['garden.firstCare']);
  assert.equal(game.mind.emotions.find(x=>x.source==='garden.firstCare')?.source,'garden.firstCare');
  assert.equal(EMOTION_SOURCES['garden.firstCare'].mood,3);
  const impact=emotionMoodImpact(game.mind,game.minutes);
  assert.equal(impact.covered.size,1,'same memory not counted twice');
  game=loadHousehold(copy(game));
  assert.deepEqual(notes(game).map(x=>x.id),['garden.firstCare']);
  tickHousehold(game,1440);
  if(gardenView(game.world.outdoors,id,game.minutes).mature)return;
  activeGarden(game,id,'water');
  tickHousehold(game,15);
  assert.equal(game.gardenMilestones.byResident.alex.plots.length,1);
  assert.equal(notes(game).length,0,'original milestone expired from 12-memory decay?');
});
test('C2b: bloom seen physically once per actor/planting, no extra C1 Fun rewards',()=>{
  const root=place(newHousehold()),id=gardenId(root);
  root.world.outdoors.gardens[id].progressWetMinutes=4320;
  root.world.outdoors.gardens[id].evaluatedAt=root.minutes;
  root.needs.fun=40;
  activeGarden(root,id,'admire','alex');
  tickHousehold(root,8);
  assert.equal(root.gardenMilestones.byResident.alex.plots[0].firstBloomSeen,true);
  assert.deepEqual(notes(root).map(x=>x.id),['garden.firstBloomSeen']);
  assert.equal(EMOTION_SOURCES['garden.firstBloomSeen'].mood,7);
  assert.ok(root.needs.fun>44&&root.needs.fun<=45);
  const saved=loadHousehold(copy(root));
  assert.equal(saved.gardenMilestones.byResident.alex.plots[0].firstBloomSeen,true);
  tickHousehold(saved,1440);
  activeGarden(saved,id,'admire','alex');
  tickHousehold(saved,8);
  assert.equal(saved.gardenMilestones.byResident.alex.plots[0].firstBloomSeen,true);
  assert.equal(notes(saved).filter(x=>x.id==='garden.firstBloomSeen').length,0);
  activeGarden(saved,id,'admire','mira');
  tickHousehold(saved,8);
  assert.equal(notes(saved,'mira').filter(x=>x.id==='garden.firstBloomSeen').length,1);
});
test('C2b: three wishes are tied to exact planting and complete through garden FIFO',()=>{
  for(const [progress,wishId,actionId,duration] of [
    [0,'garden.care','water',15],
    [1440,'garden.observe','inspect',8],
    [4320,'garden.bloom','admire',8]]){
    const root=prepared(place(newHousehold()));
    const id=gardenId(root),plot=root.world.outdoors.gardens[id];
    plot.progressWetMinutes=progress;plot.evaluatedAt=root.minutes;
    refreshGardenWishes(root);
    assert.equal(root.mind.wish.id,wishId,'offer valid '+wishId);
    assert.equal(root.mind.wish.targetInstanceId,id);
    assert.equal(gardenWishEligible(root,'alex',root.mind.wish),true);
    const command=gardenWishCommand(root,'alex');
    assert.deepEqual(command,{type:'garden',instanceId:id,actionId});
    assert.ok(enqueueAction(root.actionQueues,'alex',command));
    assert.equal(root.mind.wish.id,wishId,'click/queue not completion');
    root.actionQueues.byResident.alex=[];
    activeGarden(root,id,actionId);
    tickHousehold(root,duration);
    assert.notEqual(root.mind.wish.id,wishId,'only physical completion fulfills');
    assert.equal(root.gardenMilestones.byResident.alex.wishHistory.length,1);
    const reloaded=loadHousehold(copy(root));
    assert.equal(reloaded.gardenMilestones.byResident.alex.wishHistory[0].id,wishId);
  }
});
test('C2b: stale, wrong plant, removed target, failed action never fulfill or create memory',()=>{
  let root=prepared(place(newHousehold()));
  const id=gardenId(root);
  refreshGardenWishes(root);
  const wish=copy(root.mind.wish);
  assert.equal(gardenWishCommand(root,'mira'),null);
  root.world.outdoors.gardens[id].plantedAt=800;
  assert.equal(gardenWishEligible(root,'alex',wish),false,'replanted lifecycle');
  refreshGardenWishes(root);
  assert.notEqual(root.mind.wish.id,wish.id);
  assert.equal(notes(root).length,0);
  root=place(newHousehold());
  const id2=gardenId(root);
  activeGarden(root,id2,'water');
  root.action.gardenPlantedAt=-1;
  tickHousehold(root,15);
  assert.equal(root.world.outdoors.gardens[id2].lastWateredAt,null);
  assert.equal(notes(root).length,0);
  root=place(newHousehold());
  const id3=gardenId(root);
  activeGarden(root,id3,'water');
  root.position.x+=2;
  tickHousehold(root,15);
  assert.equal(root.world.outdoors.gardens[id3].lastWateredAt,null);
  assert.equal(notes(root).length,0);
});
test('C2b: malicious optional ledger fails closed, legacy v1 profiles and finance remain',()=>{
  const root=place(newHousehold()),saved=copy(root),id=gardenId(root);
  delete saved.gardenMilestones;
  const old=loadHousehold(saved);
  assert.equal(old.gardenMilestones.schema,1);
  assert.equal(old.version,1);
  assert.deepEqual(old.shop,root.shop);
  assert.deepEqual(old.world.outdoors.gardens,root.world.outdoors.gardens);
  assert.deepEqual(old.personality,root.personality);
  saved.gardenMilestones={schema:1,byResident:{
    alex:{plots:[{instanceId:id,plantedAt:1e100,firstCare:true,
      firstBloomSeen:true,lastObservedStage:99}],
      wishHistory:[{id:'__proto__',instanceId:id,at:90000000}],
      lastOfferSlot:1e99,lastMilestoneAt:Infinity}}};
  const corrupt=loadHousehold(saved);
  assert.equal(corrupt.gardenMilestones.byResident.alex.plots.length,0);
  assert.equal(corrupt.gardenMilestones.byResident.mira.plots.length,0);
  assert.equal(corrupt.gardenMilestones.byResident.alex.lastMilestoneAt,null);
  assert.equal(restoreGardenMilestones(null,480).schema,1);
  assert.equal(MEMORY_TEXT['garden.firstBloomSeen']!==undefined,true);
});
test('C2b: 30-day household tick with save/reload stays bounded and no passive rewards',()=>{
  let root=place(newHousehold()),id=gardenId(root);
  root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
  let completions=0;
  for(let day=0;day<30;day++){
    for(let h=0;h<24;h++)tickHousehold(root,60);
    if(day%3===0&&!gardenView(root.world.outdoors,id,root.minutes).mature){
      const view=gardenView(root.world.outdoors,id,root.minutes);
      if(view.lastWateredAt===null||root.minutes-view.lastWateredAt>=1440){
        activeGarden(root,id,'water');
        tickHousehold(root,15);completions++;
      }
    }
    if(day%5===0)root=loadHousehold(copy(root));
    assert.equal(root.version,1);
    for(const person of ['alex','mira']){
      const saved=root.gardenMilestones.byResident[person];
      assert.ok(saved.plots.length<=32);
      assert.ok(saved.wishHistory.length<=16);
      const actor=person==='alex'?root:root.otherSim;
      assert.ok(actor.mind.memories.length<=12);
      assert.ok(actor.mind.emotions.length<=5);
    }
  }
  assert.ok(completions>=1);
  assert.ok(root.gardenMilestones.byResident.alex.plots.length<=1);
  assert.ok(root.world.outdoors.gardens[id]);
});
test('C2b: static Pages carries garden psychology and exact cache lineage',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const page=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  assert.match(html,/src\/garden-psychology\.js\?v=lot-c2b/);
  assert.match(page,/node --check src\/garden-psychology\.js/);
  assert.match(page,/cp src\/garden-psychology\.js site\/src\//);
  assert.match(game,/gardenWishCommand\(game,game.selectedSim\)/);
  assert.match(game,/gardenPlantedAt=/);
});
