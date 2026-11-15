import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ACTIONS,NEEDS,PHYSICAL_NEEDS,BLADDER_LEGACY_DEFAULT,
  SAVE_KEY,newGame,loadGame,chooseAction,arrive,tick,
  autonomousChoice} from '../src/simulation.js';
import {newHousehold,loadHousehold,chooseResidentAction,
  furnitureAvailable,tickHousehold,getActor} from '../src/household.js';
import {TOILET_LAYOUT,TOILET_RELIEF_START,TOILET_RELIEF_END,
  toiletSequence,createToiletTransition,advanceToiletTransition,
  toiletPrivacyInvariant} from '../src/toilet-interaction.js';
import {ROOM,FURNITURE,isWalkable,findPath,isClearLine} from '../src/navigation.js';
import {refreshMind,calculateMood,MEMORY_TEXT} from '../src/psychology.js';
import {NEED_LABELS,moodReasons} from '../src/mood-presentation.js';
import {moodActionPolicy} from '../src/mood-action-policy.js';
import {newActionQueues,enqueueAction,pendingActions,
  restoreActionQueues,dispatchActionQueues} from '../src/action-queue.js';
import {activityReceipt} from '../src/sim-events.js';
import {createAnimationState,stepAnimation} from '../src/animations.js';
import {DEMO_PROFILES} from '../src/trait-catalog.js';
const copy=v=>JSON.parse(JSON.stringify(v));
const near=(a,b,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<=epsilon,
  `${a} differs from ${b}`);
const bath={type:'object',actionId:'toilet'};
const lows=state=>Object.assign(state.needs,
  {hunger:90,energy:88,hygiene:83,fun:90,social:80,bladder:7});

test('M4: SIX actual positive needs and toilet action exist together, independent of renderer',()=>{
  const a=newGame(),b=newGame(),h=newHousehold();
  assert.deepEqual(NEEDS,['hunger','energy','hygiene','fun','bladder','social']);
  assert.deepEqual(PHYSICAL_NEEDS,['hunger','energy','hygiene','fun','bladder']);
  assert.equal(NEED_LABELS.bladder,'Туалет');
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(BLADDER_LEGACY_DEFAULT,75);
  assert.equal(a.needs.bladder,76);
  assert.equal(h.otherSim.needs.bladder,78);
  a.needs.bladder=0;assert.equal(b.needs.bladder,76);
  assert.equal(ACTIONS.toilet.need,'bladder');
  assert.deepEqual(ACTIONS.toilet.location,
    [TOILET_LAYOUT.approach.x,TOILET_LAYOUT.approach.z]);
  assert.equal(h.version,1);
});

test('M4: old v1 saves with five, four or fewer need axes migrate both residents safely',()=>{
  const s=newHousehold();
  s.needs.hunger=13;s.otherSim.needs.energy=22;s.needs.social=31;
  const seq=s.socialGraph.nextSeq;
  delete s.needs.bladder;delete s.otherSim.needs.bladder;
  const old=loadHousehold(copy(s));
  assert.equal(old.needs.bladder,75);
  assert.equal(old.otherSim.needs.bladder,75);
  assert.equal(old.needs.hunger,13);
  assert.equal(old.otherSim.needs.energy,22);
  assert.equal(old.needs.social,31);
  assert.equal(old.socialGraph.nextSeq,seq);
  assert.deepEqual(old.mind.memories,[]);
  assert.deepEqual(loadHousehold(copy(old)).needs,old.needs);
  const ancient=loadGame({version:1,minutes:600,needs:{
    hunger:40,energy:35,hygiene:70,fun:55},position:{x:0,z:0}});
  assert.equal(ancient.needs.social,75);
  assert.equal(ancient.needs.bladder,75);
  assert.equal(ancient.minutes,600);
});

test('M4: invalid and malicious saved bladder scores are normalized, no reset of save schema',()=>{
  const s=newGame();
  for(const [v,expected] of [[-100,0],[1000,100],[23.25,23.25],
    [null,75],['100',75],[Infinity,75],[NaN,75]]){
    const raw=copy(s);raw.needs.bladder=v;
    const loaded=loadGame(raw);
    assert.equal(loaded.needs.bladder,expected);
    assert.equal(loaded.version,1);
    assert.ok(loaded.mind.mood.value>=0&&loaded.mind.mood.value<=100);
  }
});

test('M4: decay is deterministic in game minutes, never while paused',()=>{
  const s=newGame(),value=s.needs.bladder;
  tick(s,20);
  near(s.needs.bladder,value-20*.145);
  s.paused=true;
  const snapshot=JSON.stringify(s);
  tick(s,500);
  assert.equal(JSON.stringify(s),snapshot);
  s.paused=false;tick(s,1200);
  assert.equal(s.needs.bladder,0);
});

test('M4: toilet approach is free and accessible while seat is a real obstacle',()=>{
  const goal=TOILET_LAYOUT.approach;
  assert.ok(goal.x>ROOM.minX&&goal.x<ROOM.maxX);
  assert.ok(goal.z>ROOM.minZ&&goal.z<ROOM.maxZ);
  assert.equal(isWalkable(goal.x,goal.z),true);
  assert.equal(isWalkable(TOILET_LAYOUT.interior.x,TOILET_LAYOUT.interior.z),false);
  assert.ok(FURNITURE.some(x=>x.id==='toilet'));
  for(const start of [{x:-.25,z:.35},{x:-.8,z:2.95},{x:2.9,z:-2.1},
    {x:-2.18,z:2.1}]){
    const path=findPath(start,goal);
    assert.ok(path?.length>0,JSON.stringify(start));
    assert.deepEqual(path.at(-1),goal);
    let prev=start;
    for(const point of path){
      assert.ok(isWalkable(point.x,point.z));
      assert.ok(isClearLine(prev,point));
      prev=point;
    }
  }
});

test('M4: timeline yields a physically private seat, relief and flush, not a static magic meter',()=>{
  const p=t=>toiletSequence(t*ACTIONS.toilet.duration,ACTIONS.toilet.duration);
  assert.equal(p(0).relief,false);
  assert.equal(p(.12).privacy,false);
  assert.equal(p(.22).privacy,true);
  assert.equal(p(.22).relief,false);
  assert.ok(p(.28).pose.z>TOILET_LAYOUT.approach.z);
  assert.ok(p(.5).seated>.95);
  assert.equal(p(.5).relief,true);
  assert.equal(p(.5).privacy,true);
  assert.equal(p(.85).flush,true);
  assert.equal(p(.85).relief,false);
  assert.equal(p(.99).privacy,false);
  assert.deepEqual(p(1).pose,{
    x:TOILET_LAYOUT.approach.x,y:0,z:TOILET_LAYOUT.approach.z,
    pitch:0,yaw:TOILET_LAYOUT.yaw,roll:0
  });
  assert.equal(TOILET_RELIEF_START,.38);
  assert.equal(TOILET_RELIEF_END,.79);
});

test('M4: all entry/use/exit frames satisfy strong privacy invariant',()=>{
  for(let p=0;p<=100;p++){
    const frame=toiletSequence(ACTIONS.toilet.duration*p/100,ACTIONS.toilet.duration);
    assert.equal(toiletPrivacyInvariant(frame),true,'p='+p);
    assert.ok(frame.seated>=0&&frame.seated<=1);
    assert.ok(frame.walkWeight>=0&&frame.walkWeight<=1);
    assert.equal(frame.relief&&(!frame.privacy||frame.seated<.95),false);
  }
});

test('M4: after cancellation or completion, exit finishes without teleporting or replaying relief',()=>{
  let state=createToiletTransition();
  const frame=toiletSequence(ACTIONS.toilet.duration*.57,ACTIONS.toilet.duration);
  state=advanceToiletTransition(state,true,ACTIONS.toilet.duration*.57,
    ACTIONS.toilet.duration,0);
  assert.ok(state.active&&state.frame.privacy&&state.frame.relief);
  let paused=advanceToiletTransition(state,false,0,ACTIONS.toilet.duration,0);
  assert.equal(paused.active,true);
  assert.equal(paused.frame.relief,false);
  assert.ok(paused.frame.privacy);
  const pausedSnapshot=JSON.stringify(paused);
  paused=advanceToiletTransition(paused,false,0,ACTIONS.toilet.duration,0);
  assert.equal(JSON.stringify(paused),pausedSnapshot);
  for(let i=0;i<50;i++){
    paused=advanceToiletTransition(paused,false,0,ACTIONS.toilet.duration,.06);
    assert.ok(toiletPrivacyInvariant(paused.frame));
    assert.ok(!paused.frame?.relief);
  }
  assert.equal(paused.active,false);
  assert.equal(paused.frame,null);
  assert.ok(frame.seated>.95);
});

test('M4: walking and early entry never restore bladder; gain starts only after masked sitting',()=>{
  const s=newGame();s.needs.bladder=10;
  assert.equal(chooseAction(s,'toilet'),true);
  const before=s.needs.bladder;
  tick(s,4);
  assert.equal(s.action.phase,'walking');
  near(s.needs.bladder,before-4*.145);
  arrive(s);
  assert.equal(s.action.phase,'using');
  const t=ACTIONS.toilet.duration*TOILET_RELIEF_START;
  tick(s,t);
  near(s.needs.bladder,before-(4+t)*.145);
  const beforeRelief=s.needs.bladder;
  tick(s,3);
  assert.ok(s.needs.bladder>beforeRelief+5);
  assert.equal(s.action.phase,'using');
});

test('M4: completed toilet recovers once, adds a legitimate non-social memory, and frees activity',()=>{
  const s=newGame();s.needs.bladder=5;refreshMind(s);
  const m=s.mind.memories.length;
  assert.equal(chooseAction(s,'toilet'),true);arrive(s);
  tick(s,ACTIONS.toilet.duration);
  assert.equal(s.action,null);
  assert.ok(s.needs.bladder>60);
  assert.ok(s.mind.memories.length>=m+1);
  assert.equal(s.mind.memories.at(-1).id,'toilet');
  assert.ok(MEMORY_TEXT.toilet);
  const after=s.needs.bladder;
  tick(s,1);
  assert.ok(s.needs.bladder<after);
  assert.ok(activityReceipt('toilet',s.minutes));
});

test('M4: force cancellation before private relief gives no reward, no fabricated memory',()=>{
  const s=newGame();s.needs.bladder=11;
  chooseAction(s,'toilet');arrive(s);
  tick(s,ACTIONS.toilet.duration*.19);
  const prior=s.needs.bladder,mem=s.mind.memories.length;
  s.action=null;
  tick(s,10);
  assert.ok(s.needs.bladder<prior);
  assert.equal(s.mind.memories.length,mem);
});

test('M4: two residents share one toilet, but the other may still sleep/eat',()=>{
  const house=newHousehold();lows(house);lows(house.otherSim);
  assert.equal(furnitureAvailable(house,'toilet','alex'),true);
  assert.equal(chooseResidentAction(house,'toilet',false,'mira'),true);
  assert.equal(furnitureAvailable(house,'toilet','alex'),false);
  assert.equal(chooseResidentAction(house,'toilet',false,'alex'),false);
  assert.equal(furnitureAvailable(house,'bed','alex'),true);
  assert.equal(chooseResidentAction(house,'fridge',false,'alex'),true);
  assert.equal(house.otherSim.action.id,'toilet');
  assert.equal(house.action.id,'fridge');
  assert.equal(house.relationship.affinity,50);
});

test('M4: arbitrary-person FIFO persists a queued toilet and never skips blocked head',()=>{
  const ids=['nova','iris','ember'],q=newActionQueues(ids);
  const first=enqueueAction(q,'nova',bath);
  enqueueAction(q,'nova',{type:'object',actionId:'shower'});
  const second=enqueueAction(q,'ember',bath);
  assert.ok(first&&second);
  const restored=restoreActionQueues(copy(q),ids);
  const started=[];
  let occupied=true;
  const run=()=>dispatchActionQueues(restored,{
    canStart:(id,command)=>!occupied||command.actionId!=='toilet',
    start:(id,cmd)=>{started.push({id,seq:cmd.seq});return true;}
  });
  run();
  assert.deepEqual(started,[]);
  assert.equal(pendingActions(restored,'nova').length,2);
  assert.equal(pendingActions(restored,'ember').length,1);
  occupied=false;run();
  assert.equal(started.length,2);
  assert.equal(pendingActions(restored,'nova').length,1);
  assert.equal(pendingActions(restored,'nova')[0].actionId,'shower');
  assert.equal(q.schema,1);
});

test('M4: bladder urgency overrides discretionary wishes but essential care is never self-refused',()=>{
  const s=newGame();lows(s);refreshMind(s);
  s.minutes=600;s.autonomy.nextAt=480;
  assert.equal(autonomousChoice(s),'toilet');
  assert.equal(moodActionPolicy(s,bath).willing,true);
  const optional=moodActionPolicy(s,{type:'conversation',targetId:'iris',topicId:'humor'});
  assert.equal(optional.willing,false);
  assert.ok(optional.reason);
});

test('M4: severe bladder need lowers the one canonical mood, explains its cause',()=>{
  const s=newGame();
  Object.assign(s.needs,{hunger:95,energy:93,hygiene:94,fun:92,social:90,bladder:94});
  refreshMind(s);const good=s.mind.mood.value;
  s.needs.bladder=3;refreshMind(s);
  assert.ok(s.mind.mood.value<good);
  assert.ok(moodReasons(s).includes('Срочно нужно в туалет'));
  assert.equal(calculateMood(s.needs,s.mind,s.minutes,s.personality).value,
    s.mind.mood.value);
});

test('M4: restored running toilet keeps exact elapsed and needs, without a second save schema',()=>{
  const s=newHousehold();s.needs.bladder=9;
  assert.equal(chooseResidentAction(s,'toilet',false,'alex'),true);
  arrive(s);
  tickHousehold(s,ACTIONS.toilet.duration*.5);
  const saved=copy(s);
  const restored=loadHousehold(saved);
  assert.equal(restored.action.id,'toilet');
  assert.equal(restored.action.phase,'using');
  assert.equal(restored.action.elapsed,s.action.elapsed);
  assert.equal(restored.needs.bladder,s.needs.bladder);
  assert.equal(restored.otherSim.needs.bladder,s.otherSim.needs.bladder);
  assert.equal(restored.version,1);
  assert.equal(restored.actionQueues.schema,1);
  assert.equal(restored.socialGraph.schema,1);
  tickHousehold(restored,ACTIONS.toilet.duration);
  assert.equal(restored.action,null);
  assert.ok(restored.needs.bladder>s.needs.bladder);
});

test('M4: sitting transition bends hips and knees gradually and can stand back up',()=>{
  let animation=createAnimationState();
  const state=toiletSequence(ACTIONS.toilet.duration*.5,ACTIONS.toilet.duration);
  animation=stepAnimation(animation,{id:'alex',using:'toilet',
    toiletSitWeight:state.seated,toiletStep:state.walkWeight},.06);
  assert.ok(animation.legs.every(x=>x<0));
  assert.ok(animation.knees.every(x=>x>0));
  const seated=animation.legs[0];
  for(let i=0;i<30;i++)animation=stepAnimation(animation,{id:'alex',using:null,
    toiletSitWeight:0,toiletStep:0},.06);
  assert.ok(animation.legs[0]>seated);
});

test('M4: paused household is frozen even if a resident is on the toilet',()=>{
  const s=newHousehold();s.needs.bladder=15;
  assert.equal(chooseResidentAction(s,'toilet',false,'alex'),true);
  arrive(s);s.paused=true;
  const snapshot=JSON.stringify(s);
  tickHousehold(s,120);
  assert.equal(JSON.stringify(s),snapshot);
});

test('M4: UI3 ray picking and real toilet 3D/opaque timeline are integrated on both rigs',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const nav=readFileSync(new URL('../src/navigation.js',import.meta.url),'utf8');
  const animations=readFileSync(new URL('../src/animations.js',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/mood-m4-checks.yml',import.meta.url),'utf8');
  assert.match(game,/touchBox\('toilet','toilet porcelain pedestal'/);
  assert.match(game,/createToiletTransition\(\)/);
  assert.match(game,/advanceToiletTransition\(toiletStates.alex/);
  assert.match(game,/advanceToiletTransition\(toiletStates.mira/);
  assert.match(game,/toiletPrivacy.enabled=Boolean\(alexToilet\?\.privacy\|\|miraToilet\?\.privacy\)/);
  assert.match(game,/applyShowerAppearance\(alexRig,Boolean\(alexShower\?\.privacy\|\|alexToilet\?\.privacy\)/);
  assert.match(game,/applyShowerAppearance\(miraRig,Boolean\(miraShower\?\.privacy\|\|miraToilet\?\.privacy\)/);
  assert.match(game,/showerStates\[partnerId\]\.active\|\|toiletStates\[partnerId\]\.active/);
  assert.match(game,/toiletStates\[residentId\]\.active/);
  assert.match(game,/pickWorldRayTarget\(/);
  assert.match(game,/renderPlanPeek\(/);
  assert.match(game,/dialogueNeedsDecision\(game\)/);
  assert.match(ui,/id="bar-bladder"/);
  assert.match(ui,/id="value-bladder"/);
  assert.match(ui,/data-need="bladder"/);
  assert.match(ui,/id="plan-peek"/);
  assert.match(css,/M4 — six genuine needs/);
  assert.match(nav,/id: 'toilet'/);
  assert.match(animations,/toiletSitWeight/);
  assert.match(workflow,/npm test/);
  assert.doesNotMatch(workflow,/deploy-pages|upload-pages|pages: write/);
});
