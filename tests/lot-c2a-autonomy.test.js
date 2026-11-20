import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold,tickHousehold,getActor,
  preemptAutomaticForManual} from '../src/household.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {enqueueAction,pendingActions} from '../src/action-queue.js';
import {gardenApproach,gardenActionAllowed,gardenBusy} from '../src/gardening.js';
import {GARDEN_AUTO_POLICY as P,restoreGardenRoutine,gardenAutoChance,
  gardenAutoDraw,autonomousGardenEligible,autonomousGardenQuota,
  considerAutonomousGarden,noteAutonomousGardenStart,playerMayClaimGarden} from '../src/garden-autonomy.js';

const copy=x=>JSON.parse(JSON.stringify(x));
function gardenHousehold(){
  const root=newHousehold();
  const proposal=previewOutdoorFeatureEdit(root,{operation:'place',
    itemId:'garden.herb.mint',pose:{x:19,z:8,yaw:0}});
  assert.equal(proposal.ok,true,proposal.reason);
  const result=commitOutdoorFeatureEdit(root,proposal);
  assert.equal(result.ok,true,result.reason);
  const game=result.root;
  const id=game.world.outdoors.features.find(f=>f.itemId==='garden.herb.mint').instanceId;
  return {game,id};
}
function ready(game,minutes=600,id='alex'){
  game.minutes=minutes;game.otherSim.minutes=minutes;
  const person=getActor(game,id);
  for(const k of Object.keys(P.needs))person.needs[k]=96;
  person.mind.mood={value:85,label:'Доволен'};
  person.autonomy.nextAt=minutes;
  return person;
}
test('C2a: numerical gates follow approved design and personalities have different inclinations',()=>{
  assert.equal(P.considerMinutes,180);
  assert.equal(P.waterRemainingMinutes,360);
  assert.equal(P.workBufferMinutes,120);
  assert.equal(P.perResidentDaily,2);
  assert.equal(P.householdDaily,4);
  assert.equal(P.householdCooldown,90);
  const root=newHousehold();
  assert.ok(gardenAutoChance(root.personality)>gardenAutoChance(root.otherSim.personality));
  assert.equal(gardenAutoDraw('alex',4,'out-1'),gardenAutoDraw('alex',4,'out-1'));
  assert.ok(gardenAutoDraw('alex',4,'out-1')>=0&&gardenAutoDraw('alex',4,'out-1')<1);
});
test('C2a: legacy and malformed routine restore safely in root v1',()=>{
  const root=newHousehold();
  assert.equal(root.gardenRoutine.schema,1);
  const legacy=loadHousehold(copy({...root,gardenRoutine:undefined}));
  assert.equal(legacy.gardenRoutine.schema,1);
  assert.equal(legacy.version,1);
  const bad=restoreGardenRoutine({schema:1,dayIndex:0,householdCount:9999,
    lastHouseholdAt:Infinity,byResident:{alex:{count:9999,lastSlot:1e20,
      nextAt:-2,lastAutoAt:NaN}}},root.minutes);
  assert.equal(bad.householdCount,0);
  assert.equal(bad.byResident.alex.count,0);
  assert.equal(bad.byResident.alex.lastSlot,-1);
  assert.equal(bad.byResident.alex.lastAutoAt,null);
  assert.equal(bad.byResident.mira.count,0);
  assert.equal(loadHousehold(copy(root)).gardenRoutine.dayIndex,0);
});
test('C2a: idle availability yields to needs, night, shift, social, manual FIFO and pause',()=>{
  const {game,id}=gardenHousehold();
  const person=ready(game);
  assert.equal(autonomousGardenEligible(game,'alex'),true);
  for(const [need,floor] of Object.entries(P.needs)){
    person.needs[need]=floor-.01;
    assert.equal(autonomousGardenEligible(game,'alex'),false,need);
    person.needs[need]=96;
  }
  game.minutes=1260;person.autonomy.nextAt=0;
  assert.equal(autonomousGardenEligible(game,'alex'),false,'night');
  ready(game,600);
  game.paused=true;assert.equal(autonomousGardenEligible(game,'alex'),false);game.paused=false;
  game.careerSystem.byResident.alex={currentShift:{phase:'pending',start:game.minutes+60}};
  assert.equal(autonomousGardenEligible(game,'alex'),false,'work soon');
  game.careerSystem.byResident.alex=null;
  game.socialAction={automatic:true,initiator:'mira',partner:'alex'};
  assert.equal(autonomousGardenEligible(game,'alex'),false,'relationship');
  game.socialAction=null;
  enqueueAction(game.actionQueues,'alex',{type:'garden',instanceId:id,actionId:'water'});
  assert.equal(autonomousGardenEligible(game,'alex'),false,'manual queued');
  assert.equal(gardenBusy(game,id),true);
  game.actionQueues.byResident.alex=[];
  person.workRecovery={until:game.minutes+30};
  assert.equal(autonomousGardenEligible(game,'alex'),false,'shift recovery');
  person.workRecovery=null;
  person.mind.mood={value:49,label:'Не в настроении'};
  assert.equal(autonomousGardenEligible(game,'alex'),false,'low mood');
});
test('C2a: autonomous watering cannot claim a reserved, mature or still-wet bed',()=>{
  const {game,id}=gardenHousehold();
  ready(game,600);
  game.world.outdoors.gardens[id].hydratedUntil=game.minutes+420;
  assert.equal(considerAutonomousGarden(game,'alex'),null,'still wet');
  ready(game,900);
  game.actionQueues.byResident.mira=[{seq:1,type:'garden',instanceId:id,actionId:'water'}];
  assert.equal(gardenActionAllowed(game,'alex',id,'water'),false);
  assert.equal(considerAutonomousGarden(game,'alex'),null,'reserved');
  game.actionQueues.byResident.mira=[];
  ready(game,1080);
  game.world.outdoors.gardens[id].progressWetMinutes=4320;
  assert.equal(considerAutonomousGarden(game,'alex'),null,'mature');
});
test('C2a: manual FIFO may take over only automatic (never manual) garden reservation',()=>{
  const {game,id}=gardenHousehold();
  ready(game,600);
  assert.equal(playerMayClaimGarden(game,'mira',id,'water'),true);
  game.action={id:'garden',automatic:true,phase:'walking',elapsed:0,
    targetInstanceId:id,gardenActionId:'water',gardenGoal:{x:19,z:7}};
  assert.equal(gardenActionAllowed(game,'mira',id,'water'),false);
  assert.equal(playerMayClaimGarden(game,'mira',id,'water'),true);
  enqueueAction(game.actionQueues,'mira',{type:'garden',actionId:'water',instanceId:id});
  assert.equal(playerMayClaimGarden(game,'alex',id,'water'),false,'manual queue owns bed');
  game.actionQueues.byResident.mira=[];
  game.action.automatic=false;
  assert.equal(playerMayClaimGarden(game,'mira',id,'water'),false,'manual active owns bed');
  game.action=null;
  assert.equal(playerMayClaimGarden(game,'mira',id,'water'),true);
});
test('C2a: persisted opportunity slot cannot be rolled repeatedly on reload or time acceleration',()=>{
  const {game}=gardenHousehold();
  ready(game,600);
  considerAutonomousGarden(game,'alex');
  const prior=copy(game.gardenRoutine);
  assert.equal(considerAutonomousGarden(game,'alex'),null);
  const saved=loadHousehold(copy(game));
  assert.equal(saved.gardenRoutine.byResident.alex.lastSlot,prior.byResident.alex.lastSlot);
  assert.equal(saved.gardenRoutine.byResident.alex.nextAt,prior.byResident.alex.nextAt);
  ready(saved,600);
  assert.equal(considerAutonomousGarden(saved,'alex'),null);
});
test('C2a: real automatic action uses same C1 physical settlement and manual preemption',()=>{
  const {game,id}=gardenHousehold();
  const person=ready(game,600);
  const plan=gardenApproach(game.world,id,person.position);
  assert.ok(plan);
  person.action={id:'garden',automatic:true,phase:'walking',elapsed:0,
    targetInstanceId:id,gardenActionId:'water',gardenGoal:plan.goal};
  assert.equal(noteAutonomousGardenStart(game,'alex',id),true);
  assert.equal(game.gardenRoutine.householdCount,1);
  assert.equal(gardenBusy(game,id),true);
  assert.equal(gardenActionAllowed(game,'mira',id,'water'),false);
  enqueueAction(game.actionQueues,'alex',{type:'move',x:19,z:7});
  preemptAutomaticForManual(game,'alex');
  assert.equal(person.action,null);
  assert.equal(game.world.outdoors.gardens[id].lastWateredAt,null);
  assert.equal(pendingActions(game.actionQueues,'alex').length,1);
  // Separate completed physical session, not the cancelled one, grants C1 water.
  game.actionQueues.byResident.alex=[];
  person.position={...plan.goal};
  person.action={id:'garden',automatic:false,phase:'using',elapsed:0,
    targetInstanceId:id,gardenActionId:'water',gardenGoal:plan.goal};
  const before=person.needs.energy;
  tickHousehold(game,15);
  assert.equal(game.world.outdoors.gardens[id].lastWateredAt,game.minutes);
  assert.ok(person.needs.energy<before);
  const time=game.world.outdoors.gardens[id].lastWateredAt;
  tickHousehold(game,1);
  assert.equal(game.world.outdoors.gardens[id].lastWateredAt,time);
});
test('C2a: quotas are per resident and household, reset after day; 7-day simulation is bounded',()=>{
  const {game,id}=gardenHousehold();
  const nearBed=gardenApproach(game.world,id,game.position);
  assert.ok(nearBed);
  // Keep the actor physically beside the bed: the approved 45-minute route
  // cap intentionally excludes a long cross-lot journey from the starter house.
  game.position={...nearBed.goal};
  let accepted=0;
  for(let step=0;step<7*8;step++){
    const at=480+step*180;
    if(game.minutes<at)tickHousehold(game,at-game.minutes);
    ready(game,at);
    const idea=considerAutonomousGarden(game,'alex');
    if(idea){
      assert.equal(idea.instanceId,id);
      const plan=gardenApproach(game.world,id,game.position);
      game.action={id:'garden',automatic:true,phase:'walking',elapsed:0,
        targetInstanceId:id,gardenActionId:'water',gardenGoal:plan.goal};
      assert.equal(noteAutonomousGardenStart(game,'alex',id),true);
      accepted++;
      const r=game.gardenRoutine;
      assert.ok(r.byResident.alex.count<=2);
      assert.ok(r.householdCount<=4);
      game.position={...plan.goal};
      game.action.phase='using';
      tickHousehold(game,15);
    }
    assert.ok(game.gardenRoutine.byResident.alex.count<=2);
    assert.ok(game.gardenRoutine.householdCount<=4);
  }
  assert.ok(accepted>0,'at least one real autonomous water must finish in seven days');
  const restored=loadHousehold(copy(game));
  assert.equal(restored.gardenRoutine.schema,1);
  assert.equal(restored.version,1);
});
test('C2a: published static bundle includes exact garden autonomy import and CI checks',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(html,/\.\/src\/garden-autonomy\.js/);
  assert.match(pages,/node --check src\/garden-autonomy\.js/);
  assert.match(pages,/cp src\/garden-autonomy\.js site\/src\//);
});
