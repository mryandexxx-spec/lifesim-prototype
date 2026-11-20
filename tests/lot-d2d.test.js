/** LOT-D2d regression: canonical two-person water lifecycle, save and mood. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold,setHouseholdAutonomy} from '../src/household.js';
import {beginPoolSwim,arrivePoolApproach,requestPoolExit,SWIM_MINUTES} from '../src/pool-swim-runtime.js';
import {poolSwimVisualFrame} from '../src/pool-swim-visual.js';
import {poolAutoDraw,poolAutoChance,considerAutonomousPool,
  recordAutonomousPoolStart,POOL_AUTO_POLICY} from '../src/pool-autonomy.js';
import {outdoorCellAt} from '../src/lot-surface.js';
import {isWalkable} from '../src/navigation.js';
const base=outdoorCellAt(18.25,8.25),copy=x=>JSON.parse(JSON.stringify(x));
const cells=(w=4,h=4)=>Array.from({length:w*h},(_,i)=>
  base+Math.floor(i/w)*64+i%w).sort((a,b)=>a-b);
const fixture=(kind,edgeCell=base,side='west',index=1)=>({
  fixtureId:'fixture-'+index,poolId:'pool-1',kind,edgeCell,side,
  purchasePriceCredits:{ladder:120,steps:180,board:400}[kind]
});
const sim=(s,id)=>id==='alex'?s:s.otherSim;
function home({w=4,h=4,fixtures=[fixture('ladder')]}={}){
  const s=newHousehold();
  s.world.outdoors={...s.world.outdoors,revision:s.world.outdoors.revision+1,
    pools:[{poolId:'pool-1',cells:cells(w,h)}],poolFixtures:fixtures};
  return s;
}
function approach(s,id='alex',command={poolId:'pool-1',actionId:'swim'}){
  const plan=beginPoolSwim(s,id,command);
  assert.ok(plan,'real dry and wet admission');
  sim(s,id).position={...plan.action.dryApproach};
  assert.ok(arrivePoolApproach(s,id));
  return plan.action;
}
function toStage(s,id,stage,limit=100){
  for(let i=0;i<limit&&sim(s,id).action?.stage!==stage;i++)tickHousehold(s,1);
  assert.equal(sim(s,id).action?.stage,stage);
  return sim(s,id).action;
}
function complete(s,id,limit=150){
  for(let i=0;i<limit&&sim(s,id).action;i++)tickHousehold(s,1);
  assert.equal(sim(s,id).action,null,'bounded dry exit');
  assert.ok(isWalkable(sim(s,id).position.x,sim(s,id).position.z,s.world));
}
function memory(s,id){return sim(s,id).mind.memories.filter(m=>m.id==='pool.firstSwim');}

test('D2d Alex and Mira earn independent, single first-swim memory only on dry completion',()=>{
  const s=home();approach(s,'alex');toStage(s,'alex','swimming');
  approach(s,'mira');toStage(s,'mira','swimming');
  assert.equal(memory(s,'alex').length,0);
  assert.equal(memory(s,'mira').length,0);
  assert.ok(poolSwimVisualFrame(s.world,s.action));
  assert.ok(poolSwimVisualFrame(s.world,s.otherSim.action));
  complete(s,'alex');complete(s,'mira');
  for(const id of ['alex','mira']){
    assert.equal(memory(s,id).length,1);
    assert.ok(Number.isFinite(sim(s,id).poolFirstSwimAt));
    assert.equal(sim(s,id).mind.emotions.some(e=>e.source==='pool.firstSwim'),true);
  }
  const oldAt=s.poolFirstSwimAt;
  approach(s,'alex');toStage(s,'alex','swimming');complete(s,'alex');
  assert.equal(s.poolFirstSwimAt,oldAt);
  assert.equal(memory(s,'alex').length,1,'no duplicated mood receipt');
  const loaded=loadHousehold(copy(s));
  assert.equal(loaded.poolFirstSwimAt,oldAt);
  assert.equal(memory(loaded,'alex').length,1);
  assert.equal(loaded.version,1);
});

test('D2d cancellation, missing exit and removed bowl grant no completion memory',()=>{
  for(const mode of ['cancel','lost-exit','lost-pool']){
    const s=home();approach(s);toStage(s,'alex','swimming');
    tickHousehold(s,5);
    if(mode==='cancel')requestPoolExit(s,'alex','player');
    if(mode==='lost-exit')s.world.outdoors.poolFixtures=[];
    if(mode==='lost-pool')s.world.outdoors.pools=[];
    complete(s,'alex');
    assert.equal(memory(s,'alex').length,0,mode);
    assert.equal(s.poolFirstSwimAt,undefined);
  }
});

test('D2d ladder, steps and feet-first board use the existing full contract',()=>{
  const cases=[
    {kind:'ladder',fixtures:[fixture('ladder')]},
    {kind:'steps',fixtures:[fixture('steps')]},
    {kind:'board',fixtures:[fixture('board',base+64,'west',2),
      fixture('ladder',base,'north',1)]}
  ];
  for(const {kind,fixtures} of cases){
    const s=home({fixtures}),request={poolId:'pool-1',actionId:kind==='board'?'jump':'swim',
      ...(kind==='board'?{fixtureId:'fixture-2'}:{})};
    const a=approach(s,'alex',request);
    assert.equal(a.entryKind,kind);
    toStage(s,'alex','swimming',70);
    assert.equal(s.action.waterElapsed,0);
    tickHousehold(s,SWIM_MINUTES);
    assert.equal(s.action.stage,'exiting');
    complete(s,'alex');
    assert.equal(memory(s,'alex').length,1);
  }
});

test('D2d crossing pause, 3x and all stage reloads retains canonical water state',()=>{
  const s=home();approach(s);
  for(const stage of ['waiting','entering','swimming','exiting']){
    if(stage==='entering')tickHousehold(s,1);
    if(stage==='swimming')toStage(s,'alex','swimming');
    if(stage==='exiting')requestPoolExit(s,'alex','player');
    const loaded=loadHousehold(copy(s));
    assert.equal(loaded.action?.stage,stage);
    assert.equal(loaded.action?.waterCell,s.action.waterCell);
    assert.equal(loaded.shop.credits,s.shop.credits);
  }
  const copyPaused=copy(s);
  s.paused=true;tickHousehold(s,10);
  assert.equal(s.action.waterCell,copyPaused.action.waterCell);
  s.paused=false;
  const alternate=loadHousehold(copy(s));
  tickHousehold(s,3);
  for(let i=0;i<3;i++)tickHousehold(alternate,1);
  assert.equal(s.action?.stage,alternate.action?.stage);
  complete(s,'alex');
  assert.equal(memory(s,'alex').length,0,'cancelled exit never counts');
});

test('D2d one lane blocks overlapping admission; absent fixture recovers rather than hangs',()=>{
  const s=home({w:2,h:4});
  approach(s);toStage(s,'alex','swimming');
  assert.equal(beginPoolSwim(s,'mira',{poolId:'pool-1',actionId:'swim'}),null);
  s.world.outdoors.poolFixtures=[];
  const saved=copy(s);
  const restored=loadHousehold(saved);
  assert.equal(restored.action?.id,'swim');
  complete(restored,'alex',95);
  assert.equal(memory(restored,'alex').length,0);
});

test('D2d autonomous swimming is bounded per resident, deterministic, and cancelable',()=>{
  const s=home();
  assert.equal(poolAutoDraw('alex',4,'pool-1'),poolAutoDraw('alex',4,'pool-1'));
  assert.ok(poolAutoChance(s.personality)>=.12);
  assert.equal(considerAutonomousPool(s,'alex'),null,'the initial wait cannot force a swim');
  // A successful accepted automatic swim uses the same canonical runtime.
  approach(s);
  s.action.automatic=true;
  assert.equal(recordAutonomousPoolStart(s,'alex'),true);
  assert.equal(s.poolAutoRoutine.byResident.alex.count,1);
  const restored=loadHousehold(copy(s));
  assert.equal(restored.action?.automatic,true);
  assert.equal(restored.poolAutoRoutine.byResident.alex.count,1);
  setHouseholdAutonomy(restored,false);
  assert.equal(restored.action.exitRequested,'autonomy-off');
  const disabled=loadHousehold(copy(restored));
  assert.equal(disabled.action?.automatic,true,'pending safe exit survives disabled-autonomy reload');
  toStage(disabled,'alex','exiting');
  complete(disabled,'alex');
  assert.equal(memory(disabled,'alex').length,0);
  assert.equal(disabled.poolAutoRoutine.byResident.alex.count,1);
});

test('D2d v1 old saves and malicious optional memory/autonomy data fail closed',()=>{
  const s=home();
  const old=copy(s);
  delete old.poolAutoRoutine;delete old.poolFirstSwimAt;
  const loaded=loadHousehold(old);
  assert.equal(loaded.version,1);
  assert.equal(loaded.poolFirstSwimAt,null);
  assert.equal(loaded.poolAutoRoutine.schema,1);
  const corrupt=copy(s);
  corrupt.poolFirstSwimAt=999999999;
  corrupt.otherSim.poolFirstSwimAt=-99;
  corrupt.poolAutoRoutine={schema:1,dayIndex:0,byResident:{
    alex:{lastSlot:999999,count:999,lastStart:-100},
    mira:{lastSlot:'oops',count:10,lastStart:Infinity}
  }};
  const recovered=loadHousehold(corrupt);
  assert.equal(recovered.poolFirstSwimAt,null);
  assert.equal(recovered.otherSim.poolFirstSwimAt,null);
  assert.equal(recovered.poolAutoRoutine.byResident.alex.count,0);
  assert.equal(recovered.poolAutoRoutine.byResident.mira.count,0);
});

test('D2d prolonged two-person swim/cancel/reload never overlaps slots or leaks actions',()=>{
  let s=home();
  for(let session=0;session<8;session++){
    for(const id of ['alex','mira']){
      const a=sim(s,id);
      a.needs.energy=95;a.needs.bladder=95;a.needs.hunger=95;
      a.needs.hygiene=95;a.needs.fun=35;
    }
    approach(s,'alex');toStage(s,'alex','swimming');
    approach(s,'mira');toStage(s,'mira','swimming');
    assert.equal(s.action.slotCells.some(c=>s.otherSim.action.slotCells.includes(c)),false);
    s=loadHousehold(copy(s));
    if(session%3===0)requestPoolExit(s,'mira','player');
    for(let i=0;i<140&&(s.action||s.otherSim.action);i++)tickHousehold(s,1);
    assert.equal(s.action,null,'Alex still exits');
    assert.equal(s.otherSim.action,null,'Mira still exits');
    assert.ok(isWalkable(s.position.x,s.position.z,s.world));
    assert.ok(isWalkable(s.otherSim.position.x,s.otherSim.position.z,s.world));
  }
  assert.equal(memory(s,'alex').length,1);
  assert.equal(s.version,1);
});
