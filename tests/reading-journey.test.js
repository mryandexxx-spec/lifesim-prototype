import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,chooseResidentAction,loadHousehold,tickHousehold,
  getActor,furnitureAvailable} from '../src/household.js';
import {findMarketPlacement,buyMarketItem,storeMarketItem} from '../src/furniture-shop.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {enqueueAction} from '../src/action-queue.js';
import {READING_ACTIVITY_ID,READING_CONTENT_ID} from '../src/hobby-reading.js';
import {chooseReadingSeat,readingSeatId,readingStage,
  readingRouteId,readingIsSeated,readingHasBook,arriveReadingJourney,
  validReadingJourneyAction,advanceReadingJourney} from '../src/reading-journey.js';
const copy=v=>JSON.parse(JSON.stringify(v));
function buyShelf(r){
  const pose=findMarketPlacement(r.world.furniture,r.shop,'bookcase.starter');
  assert.ok(pose);
  const done=buyMarketItem(r.world.furniture,r.shop,'bookcase.starter',pose);
  assert.equal(done.ok,true);
  r.world.furniture=done.world;r.shop=done.shop;
  return done.instanceId;
}
function start(r,id,who='alex'){
  assert.equal(chooseResidentAction(r,'hobby',false,who,id,READING_ACTIVITY_ID,
    READING_CONTENT_ID),true);
  const actor=getActor(r,who);
  assert.equal(readingStage(actor.action),'toShelf');
  assert.equal(actor.action.phase,'walking');
  return actor;
}
function arriveAt(r,who,where,stage){
  const actor=getActor(r,who);
  const id=where==='sofa'?actor.action.readingSeatInstanceId:actor.action.targetInstanceId;
  const destination=furnitureActionApproach(r.world,where==='sofa'?'sofa':'hobby',id);
  assert.ok(destination);
  actor.position={...destination};
  assert.equal(arriveReadingJourney(actor.action),true);
  assert.equal(readingStage(actor.action),stage);
  return actor;
}
function beginActualReading(r,who='alex'){
  arriveAt(r,who,'hobby','taking');
  tickHousehold(r,2.4);
  assert.equal(readingStage(getActor(r,who).action),'toSeat');
  arriveAt(r,who,'sofa','sitting');
  tickHousehold(r,6);
  assert.equal(readingStage(getActor(r,who).action),'opening');
  tickHousehold(r,2.4);
  assert.equal(readingStage(getActor(r,who).action),'reading');
  assert.equal(getActor(r,who).action.phase,'using');
}
function returnBook(r,who='alex'){
  tickHousehold(r,2.4);
  assert.equal(readingStage(getActor(r,who).action),'standing');
  tickHousehold(r,5.4);
  assert.equal(readingStage(getActor(r,who).action),'returnShelf');
  arriveAt(r,who,'hobby','returning');
  tickHousehold(r,2.4);
  assert.equal(getActor(r,who).action,null);
  assert.equal(getActor(r,who).activitySession,null);
}
test('H1n only a reachable free real sofa is chosen after the original purchased shelf',()=>{
  const r=newHousehold(),id=buyShelf(r);
  assert.equal(chooseReadingSeat(r,'alex',id)?.instanceId,'home-sofa-1');
  const actor=start(r,id);
  assert.equal(readingSeatId(actor.action),'home-sofa-1');
  assert.equal(furnitureAvailable(r,'sofa','mira','home-sofa-1'),false);
  assert.equal(chooseReadingSeat(r,'mira',id),null);
  assert.equal(chooseReadingSeat(r,'alex','missing-shelf-1'),null);
  assert.equal(chooseReadingSeat(r,'alex',id,'missing-seat-1'),null);
  assert.equal(validReadingJourneyAction(actor.action),true);
  assert.equal(readingRouteId(actor.action),'hobby:toShelf');
  assert.equal(readingIsSeated(actor.action),false);
  assert.equal(readingHasBook(actor.action),false);
});
test('H1n no sofa means reading waits rather than awarding standing XP',()=>{
  const r=newHousehold(),id=buyShelf(r);
  assert.equal(chooseResidentAction(r,'sofa',false,'mira','home-sofa-1'),true);
  assert.equal(chooseReadingSeat(r,'alex',id),null);
  assert.equal(chooseResidentAction(r,'hobby',false,'alex',id,READING_ACTIVITY_ID,
    READING_CONTENT_ID),false);
  assert.equal(r.action,null);
  assert.ok(enqueueAction(r.actionQueues,'alex',{type:'activity',activityId:READING_ACTIVITY_ID,
    contentId:READING_CONTENT_ID,targetInstanceId:id}));
  tickHousehold(r,5);
  assert.equal(r.skills.xpById.literature,undefined);
});
test('H1n all stages preserve shelf identity and only real seated time earns literature XP',()=>{
  const r=newHousehold(),id=buyShelf(r),actor=start(r,id);
  const before=r.needs.fun;
  tickHousehold(r,10);
  assert.equal(actor.action.elapsed,0);
  assert.equal(actor.skills.xpById.literature,undefined);
  assert.ok(r.needs.fun<before);
  arriveAt(r,'alex','hobby','taking');
  tickHousehold(r,1.2);
  assert.equal(readingStage(actor.action),'taking');
  assert.equal(readingHasBook(actor.action),false);
  tickHousehold(r,1.2);
  assert.equal(readingRouteId(actor.action),'hobby:toSeat');
  assert.equal(readingHasBook(actor.action),true);
  arriveAt(r,'alex','sofa','sitting');
  assert.equal(readingIsSeated(actor.action),true);
  tickHousehold(r,6);
  assert.equal(readingStage(actor.action),'opening');
  tickHousehold(r,2.4);
  assert.equal(actor.action.phase,'using');
  assert.equal(actor.action.elapsed,0,'opening does not credit its transition tick');
  assert.equal(actor.skills.xpById.literature,undefined);
  tickHousehold(r,9);
  assert.equal(actor.skills.xpById.literature,9);
  assert.equal(actor.activitySession.awardedMinutes,9);
  assert.equal(actor.action.targetInstanceId,id);
  tickHousehold(r,27);
  assert.equal(readingStage(actor.action),'closing');
  assert.equal(actor.action.phase,'walking');
  assert.equal(actor.action.elapsed,36);
  assert.equal(actor.activitySession.phase,'ready');
  assert.equal(actor.skills.xpById.literature,36);
  returnBook(r);
  assert.equal(actor.skills.xpById.literature,36);
  assert.equal(actor.event,'Книга возвращена в шкаф');
});
test('H1n pause and v1 reload of sitting, reading and returning cannot create extra XP',()=>{
  const r=newHousehold(),id=buyShelf(r);
  start(r,id);arriveAt(r,'alex','hobby','taking');tickHousehold(r,2.4);
  arriveAt(r,'alex','sofa','sitting');tickHousehold(r,6);
  let loaded=loadHousehold(copy(r));
  assert.equal(readingStage(loaded.action),'opening');
  loaded.paused=true;
  const frozen=copy(loaded);
  tickHousehold(loaded,99);
  assert.deepEqual(loaded,frozen);
  loaded.paused=false;
  tickHousehold(loaded,2.4);tickHousehold(loaded,11);
  assert.equal(loaded.skills.xpById.literature,11);
  loaded=loadHousehold(copy(loaded));
  assert.equal(readingStage(loaded.action),'reading');
  assert.equal(loaded.skills.xpById.literature,11);
  tickHousehold(loaded,25);
  assert.equal(readingStage(loaded.action),'closing');
  loaded=loadHousehold(copy(loaded));
  assert.equal(readingStage(loaded.action),'closing');
  returnBook(loaded);
  assert.equal(loaded.skills.xpById.literature,36);
  assert.equal(loaded.action,null);
});
test('H1n lost/warehoused seat or shelf cannot become a ghost reading session',()=>{
  const r=newHousehold(),id=buyShelf(r);
  start(r,id);beginActualReading(r);tickHousehold(r,4);
  assert.equal(r.skills.xpById.literature,4);
  const saved=copy(r);
  saved.action.readingSeatInstanceId='home-toilet-1';
  assert.equal(loadHousehold(saved).action,null,'forged seat ID cannot inherit the session');
  const actor=getActor(r,'alex');
  actor.action.readingStage='reading';
  const moved=storeMarketItem(r.world.furniture,r.shop,id);
  assert.equal(moved.ok,true);
  r.world.furniture=moved.world;
  tickHousehold(r,6);
  assert.equal(actor.action,null);
  assert.equal(actor.skills.xpById.literature,4);
});
test('H1n safe stage validation rejects forged time, bogus stage and eager use',()=>{
  const base={id:'hobby',phase:'walking',readingStage:'toShelf',
    readingStepElapsed:0,readingSeatInstanceId:'home-sofa-1'};
  assert.equal(validReadingJourneyAction(base),true);
  for(const change of [{readingStage:'teleport'},{readingStepElapsed:-1},
    {readingStepElapsed:Infinity},{readingSeatInstanceId:'home-*&'},
    {phase:'using'},{readingStepElapsed:100}])
    assert.equal(validReadingJourneyAction({...base,...change}),false);
  assert.deepEqual(advanceReadingJourney({...base},1),{done:false,stage:'toShelf'});
  const code=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  assert.match(code,/readingRouteId\(resident\.action\)/);
  assert.match(code,/arriveReadingJourney\(resident\.action\)/);
  assert.match(code,/readingSeatInstanceId/);
  const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(workflow,/node --check src\/reading-journey\.js/);
  assert.match(workflow,/cp src\/reading-journey\.js site\/src\//);
});
