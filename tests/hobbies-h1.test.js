import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {HOBBY_ACTIVITIES,HOBBY_SKILLS,HOBBY_CONTENT,
  READING_ACTIVITY_ID,READING_CONTENT_ID,READING_SKILL_ID} from '../src/hobby-reading.js';
import {getActivityDefinition,activitiesForItem} from '../src/activity-registry.js';
import {getSkillDefinition} from '../src/skill-registry.js';
import {currentSkillLevel} from '../src/skills-engine.js';
import {getHobbyContent} from '../src/hobby-content.js';
import {FURNITURE_PRODUCTS} from '../src/furniture-products.js';
import {legacyObjectRegistry} from '../src/object-legacy-adapter.js';
import {selectShopCatalog,shopCategoryOptions} from '../src/shop-catalog-selector.js';
import {FURNITURE_CATALOG,newFurnitureWorld,restoreFurnitureWorld,furnitureRenderOrigin,
  furnitureActionApproach,resolveActionFurniture} from '../src/furniture-catalog.js';
import {findPath} from '../src/navigation.js';
import {newFurnitureShop,findMarketPlacement,buyMarketItem,
  storeMarketItem,sellMarketItem} from '../src/furniture-shop.js';
import {enqueueAction,pendingActions,restoreActionQueues} from '../src/action-queue.js';
import {newHousehold,loadHousehold,chooseResidentAction,
  furnitureAvailable,tickHousehold,getActor} from '../src/household.js';
import {arrive,ACTIONS,SAVE_KEY} from '../src/simulation.js';
import {arriveReadingJourney,readingStage} from '../src/reading-journey.js';
import {stepAnimation,createAnimationState} from '../src/animations.js';
const copy=value=>JSON.parse(JSON.stringify(value));
const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const buy=(root,opts={})=>{
  const pose=findMarketPlacement(root.world.furniture,root.shop,'bookcase.starter',opts);
  assert.ok(pose,'bookcase needs a valid 3D placement');
  const bought=buyMarketItem(root.world.furniture,root.shop,'bookcase.starter',pose,opts);
  assert.equal(bought.ok,true,JSON.stringify(bought));
  root.world.furniture=bought.world;root.shop=bought.shop;
  return bought.instanceId;
};
const command=(id)=>({type:'activity',activityId:READING_ACTIVITY_ID,
  contentId:READING_CONTENT_ID,targetInstanceId:id});
const startReading=(root,who,id)=>{
  assert.equal(chooseResidentAction(root,'hobby',false,who,id,
    READING_ACTIVITY_ID,READING_CONTENT_ID),true);
  const resident=getActor(root,who);
  const anchor=furnitureActionApproach(root.world,'hobby',id);
  assert.ok(findPath(resident.position,anchor,root.world));
  resident.position={...anchor};
  assert.equal(arriveReadingJourney(resident.action),true);
  tickHousehold(root,2.4); // take the closed book
  const seat=furnitureActionApproach(root.world,'sofa',resident.action.readingSeatInstanceId);
  assert.ok(seat);
  assert.ok(findPath(resident.position,seat,root.world));
  resident.position={...seat};
  assert.equal(arriveReadingJourney(resident.action),true);
  tickHousehold(root,6);   // physically sit (no reading XP)
  tickHousehold(root,2.4); // open the book (no reading XP)
  assert.equal(readingStage(resident.action),'reading');
  assert.equal(resident.action.phase,'using');
};
const finishReturn=(root,who='alex')=>{
  const resident=getActor(root,who);
  assert.equal(readingStage(resident.action),'closing');
  tickHousehold(root,2.4); // close
  tickHousehold(root,5.4); // stand
  const shelf=furnitureActionApproach(root.world,'hobby',resident.action.targetInstanceId);
  resident.position={...shelf};
  assert.equal(arriveReadingJourney(resident.action),true);
  tickHousehold(root,2.4); // put back
};
test('H1 contains one authored content and skill, with independent capability item bridge',()=>{
  const skill=getSkillDefinition(HOBBY_SKILLS,READING_SKILL_ID);
  const activity=getActivityDefinition(HOBBY_ACTIVITIES,READING_ACTIVITY_ID);
  const content=getHobbyContent(HOBBY_CONTENT,READING_CONTENT_ID);
  assert.equal(skill.maxLevel,10);
  assert.equal(content.kind,'book');
  assert.deepEqual(activity.requiredCapabilities,['books.borrow']);
  assert.deepEqual(activity.skillPractice.map(x=>x.skillId),[READING_SKILL_ID]);
  assert.equal(activity.timeBudget.targetMinutes,36);
  const items=legacyObjectRegistry().items;
  assert.deepEqual(activitiesForItem(HOBBY_ACTIVITIES,items['bookcase.starter']).map(x=>x.id),
    [READING_ACTIVITY_ID]);
  assert.deepEqual(activitiesForItem(HOBBY_ACTIVITIES,items['legacy.sofa']),[]);
});
test('H1 new bookcase SKU is in shop and room/function filters without changing old 10 fixtures',()=>{
  assert.equal(newFurnitureWorld().instances.length,10);
  assert.equal(newFurnitureWorld().instances.some(x=>x.prefabId==='bookcase'),false);
  assert.equal(FURNITURE_CATALOG.bookcase.capabilities[0],'books.borrow');
  assert.equal(FURNITURE_CATALOG.bookcase.actionId,'hobby');
  const product=FURNITURE_PRODUCTS.find(x=>x.itemId==='bookcase.starter');
  assert.equal(product.price,320);
  assert.deepEqual(selectShopCatalog({functionCategoryId:'function.books.borrow'}).map(x=>x.itemId),
    ['bookcase.starter']);
  assert.ok(shopCategoryOptions('function').some(x=>x.id==='function.books.borrow'));
});
test('H1 buys one physical bookcase via atomic F4b2 transaction and preserves price snapshot',()=>{
  const r=newHousehold(),before=copy(r);
  const pose=findMarketPlacement(r.world.furniture,r.shop,'bookcase.starter');
  assert.ok(pose);
  assert.deepEqual(r,before);
  const id=buy(r);
  const physical=resolveActionFurniture(r.world,'hobby',id);
  assert.ok(physical);
  assert.equal(physical.itemDefinitionId,'bookcase.starter');
  assert.equal(physical.purchasePriceCredits,320);
  assert.equal(r.shop.credits,5000-320);
  assert.equal(r.world.furniture.instances.length,11);
  const restored=restoreFurnitureWorld(copy(r.world.furniture));
  assert.deepEqual(restored,r.world.furniture);
});
test('H1 reading cannot begin without purchased bookshelf or without exact matching content',()=>{
  const r=newHousehold();
  assert.equal(resolveActionFurniture(r.world,'hobby'),null);
  assert.equal(chooseResidentAction(r,'hobby',false,'alex',null,
    READING_ACTIVITY_ID,READING_CONTENT_ID),false);
  const id=buy(r);
  assert.equal(chooseResidentAction(r,'hobby',false,'alex',id,
    READING_ACTIVITY_ID,'book.unknown'),false);
  assert.equal(chooseResidentAction(r,'hobby',false,'alex','shop-bookcase-999',
    READING_ACTIVITY_ID,READING_CONTENT_ID),false);
  assert.equal(r.action,null);
  assert.equal(r.skills.xpById.literature,undefined);
});
test('H1 queue serializes exact bookshelf target and invalid requests fail closed',()=>{
  const r=newHousehold(),id=buy(r);
  const task=enqueueAction(r.actionQueues,'alex',command(id));
  assert.equal(task.type,'activity');
  assert.equal(task.targetInstanceId,id);
  assert.equal(task.contentId,READING_CONTENT_ID);
  assert.equal(enqueueAction(r.actionQueues,'alex',{...command(id),contentId:'unknown'}),null);
  assert.equal(enqueueAction(r.actionQueues,'alex',{...command(id),targetInstanceId:'*bad'}),null);
  const q=restoreActionQueues(copy(r.actionQueues),['alex','mira']);
  assert.deepEqual(pendingActions(q,'alex')[0],task);
  assert.equal(pendingActions(q,'mira').length,0);
});
test('H1 walking to bookshelf gives no fun from use, no XP, no phantom arrival',()=>{
  const r=newHousehold(),id=buy(r);
  const fun=r.needs.fun;
  assert.equal(chooseResidentAction(r,'hobby',false,'alex',id,READING_ACTIVITY_ID,READING_CONTENT_ID),true);
  tickHousehold(r,5);
  assert.equal(r.action.phase,'walking');
  assert.equal(r.action.elapsed,0);
  assert.equal(r.activitySession.elapsed,0);
  assert.equal(r.needs.fun<fun,true,'only existing fun decay');
  assert.equal(r.skills.xpById.literature,undefined);
});
test('H1 only the real owner reading at real approach gains fun and skill experience',()=>{
  const r=newHousehold(),id=buy(r),before=r.needs.fun,miraBefore=r.otherSim.needs.fun;
  startReading(r,'alex',id);
  tickHousehold(r,10);
  assert.equal(r.action.phase,'using');
  assert.equal(r.action.elapsed,10);
  assert.equal(r.activitySession.elapsed,10);
  assert.equal(r.activitySession.awardedMinutes,10);
  assert.equal(r.skills.xpById.literature,10);
  assert.equal(currentSkillLevel(r.skills,HOBBY_SKILLS,'literature'),0);
  assert.ok(r.needs.fun>before);
  assert.ok(r.otherSim.needs.fun<miraBefore);
  assert.equal(r.otherSim.skills.xpById.literature,undefined);
});
test('H1 one station has single occupancy; manual queues do not steal it',()=>{
  const r=newHousehold(),id=buy(r);
  assert.equal(chooseResidentAction(r,'hobby',false,'alex',id,READING_ACTIVITY_ID,READING_CONTENT_ID),true);
  assert.equal(furnitureAvailable(r,'hobby','mira',id),false);
  assert.equal(chooseResidentAction(r,'hobby',false,'mira',id,READING_ACTIVITY_ID,READING_CONTENT_ID),false);
  assert.ok(enqueueAction(r.actionQueues,'mira',command(id)));
  assert.equal(r.action.phase,'walking');
  assert.equal(r.otherSim.action,null);
});
test('H1 finite time and 3x chunks account same per-resident XP and session progress',()=>{
  const a=newHousehold(),id=buy(a);
  startReading(a,'alex',id);
  const b=loadHousehold(copy(a));
  tickHousehold(a,18);
  tickHousehold(a,18);
  for(let i=0;i<12;i++)tickHousehold(b,3);
  assert.equal(readingStage(a.action),'closing');
  assert.equal(readingStage(b.action),'closing');
  finishReturn(a);finishReturn(b);
  assert.equal(a.action,null);
  assert.equal(b.action,null);
  assert.equal(a.skills.xpById.literature,36);
  assert.equal(b.skills.xpById.literature,36);
  assert.deepEqual(a.skills,b.skills);
});
test('H1 old v1 saves, book gifts and shop identities survive optional skill migrations',()=>{
  const old=newHousehold();
  const raw=copy(old);
  delete raw.skills;delete raw.otherSim.skills;
  delete raw.activitySession;delete raw.otherSim.activitySession;
  const loaded=loadHousehold(raw);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(loaded.version,1);
  assert.deepEqual(loaded.skills,{schema:1,xpById:{}});
  assert.deepEqual(loaded.otherSim.skills,{schema:1,xpById:{}});
  assert.equal(loaded.inventory.mira.some(item=>item.type==='book'),true);
  assert.equal(loaded.world.furniture.instances.length,10);
  assert.equal(loaded.shop.credits,5000);
});
test('H1 save/reload mid-reading does not duplicate previous XP award',()=>{
  const r=newHousehold(),id=buy(r);
  startReading(r,'alex',id);
  tickHousehold(r,9);
  const loaded=loadHousehold(copy(r));
  assert.equal(loaded.action.id,'hobby');
  assert.equal(loaded.activitySession.elapsed,9);
  assert.equal(loaded.activitySession.awardedMinutes,9);
  assert.equal(loaded.skills.xpById.literature,9);
  tickHousehold(loaded,0);
  assert.equal(loaded.skills.xpById.literature,9);
  tickHousehold(loaded,3);
  assert.equal(loaded.skills.xpById.literature,12);
});
test('H1 pause freezes reading time, XP and all six existing needs',()=>{
  const r=newHousehold(),id=buy(r);
  startReading(r,'alex',id);
  tickHousehold(r,7);
  r.paused=true;
  const before=copy(r);
  tickHousehold(r,99);
  assert.deepEqual(r,before);
});
test('H1 manual cancellation never creates a completion receipt or new XP',()=>{
  const r=newHousehold(),id=buy(r);
  startReading(r,'alex',id);
  tickHousehold(r,4);
  r.action=null;r.activitySession=null;
  tickHousehold(r,12);
  assert.equal(r.skills.xpById.literature,4);
  assert.equal(r.activitySession,null);
  assert.equal(r.needs.fun<100,true);
});
test('H1 removing the station while busy does not grant XP or fun and loses only that job',()=>{
  const r=newHousehold(),id=buy(r);
  startReading(r,'alex',id);
  const extra=enqueueAction(r.actionQueues,'mira',{type:'object',actionId:'shower',
    targetInstanceId:'home-shower-1'});
  assert.ok(extra);
  const before=r.needs.fun;
  const stored=storeMarketItem(r.world.furniture,r.shop,id);
  assert.equal(stored.ok,true,'domain only commits once caller checks editor reservation');
  r.world.furniture=stored.world;
  tickHousehold(r,6);
  assert.equal(r.action,null);
  assert.equal(r.activitySession,null);
  assert.equal(r.skills.xpById.literature,undefined);
  assert.ok(r.needs.fun<before);
  assert.equal(pendingActions(r.actionQueues,'mira').length,1);
});
test('H1 storing or selling a booked station is refused by editor reservations',()=>{
  const r=newHousehold(),id=buy(r);
  const locked={lockedInstanceIds:[id]};
  assert.equal(storeMarketItem(r.world.furniture,r.shop,id,locked).reason,'reserved');
  assert.equal(sellMarketItem(r.world.furniture,r.shop,id,locked).reason,'reserved');
  assert.ok(enqueueAction(r.actionQueues,'mira',command(id)));
  assert.equal(pendingActions(r.actionQueues,'mira')[0].targetInstanceId,id);
});
test('H1 restore discards forged or mismatched activity without resetting skills/house',()=>{
  const r=newHousehold(),id=buy(r);
  startReading(r,'alex',id);
  tickHousehold(r,5);
  const saved=copy(r);
  saved.activitySession.awardedMinutes=1000;
  const loaded=loadHousehold(saved);
  assert.equal(loaded.action,null);
  assert.equal(loaded.activitySession,null);
  assert.equal(loaded.skills.xpById.literature,5);
  assert.equal(loaded.world.furniture.instances.find(x=>x.instanceId===id).itemDefinitionId,
    'bookcase.starter');
});
test('H1 a sold station cannot be silently replaced by another shop bookcase',()=>{
  const r=newHousehold(),first=buy(r);
  assert.ok(first.startsWith('shop-bookcase-'));
  const second=buy(r);
  const queued=enqueueAction(r.actionQueues,'alex',command(first));
  assert.ok(queued);
  const stored=storeMarketItem(r.world.furniture,r.shop,first);
  assert.ok(stored.ok);
  r.world.furniture=stored.world;
  const reloaded=loadHousehold(copy(r));
  assert.equal(chooseResidentAction(reloaded,'hobby',false,'alex',first,
    READING_ACTIVITY_ID,READING_CONTENT_ID),false);
  assert.equal(resolveActionFurniture(reloaded.world,'hobby',first),null);
  assert.ok(resolveActionFurniture(reloaded.world,'hobby',second));
});
test('H1 procedural arms support active reading without altering romance pose paths',()=>{
  let state=createAnimationState();
  for(let i=0;i<80;i++)state=stepAnimation(state,{
    id:'alex',walking:false,using:'hobby',social:null,gait:0,mood:75,energy:80},.016);
  assert.ok(state.arms[0]<-30);
  assert.ok(state.arms[1]<-35);
  assert.ok(state.elbows[0]<-35);
  assert.ok(ACTIONS.sofa.need==='fun'&&ACTIONS.tv.need==='fun');
});
test('H1 Safari integration exposes real touch, store, session, personal XP and Pages',()=>{
  const game=source('../src/game.js'),html=source('../index.html'),workflow=source('../.github/workflows/pages.yml');
  assert.match(game,/withDecor\('bookcase'/);
  assert.match(game,/item\.prefabId==='bookcase'/);
  assert.match(game,/type:'activity',activityId:READING_ACTIVITY_ID/);
  assert.match(game,/beginAction\('hobby',false,residentId,true,command\.targetInstanceId/);
  assert.match(game,/readingHasBook\(game\.action\)/);
  assert.match(html,/id="mind-reading-skill"/);
  assert.match(game,/currentSkillLevel\(current\.skills,HOBBY_SKILLS,READING_SKILL_ID\)/);
  assert.match(workflow,/node --check src\/hobby-reading\.js/);
  assert.match(workflow,/cp src\/hobby-reading\.js site\/src\//);
  assert.match(html,/src\/game\.js\?v=1\.2t/);
  assert.match(html,/styles\.css\?v=1\.2t/);
  const pkg=JSON.parse(source('../package.json'));
  assert.equal(pkg.version,'1.0.0-alpha.72');
});

test('H1 browser boot builds hidden bookcase prefab without an installed origin.instanceId',()=>{
  const world=newFurnitureWorld();
  assert.equal(world.instances.some(item=>item.prefabId==='bookcase'),false);
  assert.equal(FURNITURE_CATALOG.bookcase.templateOnly,true);
  const authored=furnitureRenderOrigin('bookcase');
  assert.deepEqual(authored,{instanceId:'template-bookcase-1',prefabId:'bookcase',
    x:0,z:0,yaw:0,location:'template'});
  assert.equal(furnitureRenderOrigin('plant').location,'home');
  assert.equal(furnitureRenderOrigin('missing.prefab'),null);

  // Run the actual renderer factory from game.js, not a duplicate test helper.
  // H1 previously crashed here before Safari could render a single frame.
  const gameSource=source('../src/game.js');
  const start=gameSource.indexOf('  const decorNodes=new Map();');
  const end=gameSource.indexOf('  const updateDecorNodes=',start);
  assert.ok(start>=0&&end>start,'renderer factory remains available');
  const added=[];
  class Entity {
    constructor(name){this.name=name;this.enabled=true;}
    setPosition(x,y,z){this.position={x,y,z};}
    setEulerAngles(x,y,z){this.rotation={x,y,z};}
  }
  const factory=runInNewContext(gameSource.slice(start,end)+
    '\n({withDecor,decorNodes,decorTemplates})',{
      pc:{Entity},app:{root:{addChild:node=>added.push(node)}},
      game:{world:{furniture:world}},furnitureRenderOrigin
    });
  assert.doesNotThrow(()=>factory.withDecor('bookcase',()=>{}));
  assert.equal(factory.decorNodes.has(authored.instanceId),false);
  assert.equal(factory.decorTemplates.get('bookcase').enabled,false);
  assert.equal(factory.decorTemplates.get('bookcase').position.x,0);
  assert.doesNotThrow(()=>factory.withDecor('plant',()=>{}));
  assert.equal(factory.decorNodes.has('home-plant-1'),true);
  assert.equal(factory.decorTemplates.get('plant').enabled,true);
  assert.equal(added.length,2);
  assert.equal(world.instances.length,10,'template cannot add free furniture');
});
