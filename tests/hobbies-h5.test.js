import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HOBBY_SKILLS,HOBBY_CONTENT,HOBBY_ACTIVITIES} from '../src/hobby-reading.js';
import {PAINT_ACTIVITY_ID,PAINT_SKILL_ID,PAINT_CONTENT_IDS,PAINT_SUBJECTS,
  PAINT_WORKS_LIMIT,PAINT_CANVAS_BOUNDS,PAINT_COMPOSITION_SHAPES,
  restoreCreatedWorks,finishPainting} from '../src/painting.js';
import {getActivityDefinition} from '../src/activity-registry.js';
import {getHobbyContent} from '../src/hobby-content.js';
import {currentSkillLevel} from '../src/skills-engine.js';
import {FURNITURE_CATALOG,furnitureRenderOrigin,furnitureActionApproach}
  from '../src/furniture-catalog.js';
import {FURNITURE_PRODUCTS} from '../src/furniture-products.js';
import {proceduralFurnitureModel} from '../src/furniture-procedural-library.js';
import {findMarketPlacement,buyMarketItem,storeMarketItem} from '../src/furniture-shop.js';
import {newHousehold,loadHousehold,chooseResidentAction,getActor,tickHousehold,
  furnitureAvailable} from '../src/household.js';
import {arrive,SAVE_KEY} from '../src/simulation.js';
import {enqueueAction,restoreActionQueues} from '../src/action-queue.js';
const copy=x=>JSON.parse(JSON.stringify(x));
const file=p=>readFileSync(new URL(p,import.meta.url),'utf8');
function buy(root){
  const pose=findMarketPlacement(root.world.furniture,root.shop,'easel.starter');
  assert.ok(pose,'Easel needs a valid space in the expanded house');
  const purchase=buyMarketItem(root.world.furniture,root.shop,'easel.starter',pose);
  assert.equal(purchase.ok,true,purchase.reason);
  root.world.furniture=purchase.world;root.shop=purchase.shop;
  return purchase.instanceId;
}
function start(root,id,residentId='alex',contentId=PAINT_CONTENT_IDS[0]){
  assert.equal(chooseResidentAction(root,'paint',false,residentId,id,PAINT_ACTIVITY_ID,contentId),true);
  return getActor(root,residentId);
}
function reach(root,actor,id){
  const destination=furnitureActionApproach(root.world,'paint',id);
  assert.ok(destination,'A* uses a real easel-local anchor');
  actor.position={...destination};arrive(actor);
}
test('H5.1 all authored 3D strokes stay inside the easel canvas at every yaw',()=>{
  // Base easel.starter blank canvas: width .78, height .99 at y=1.37.
  // Shrink by a safety margin so hill silhouettes cannot overrun frame edges.
  const canvas={minX:-.39,maxX:.39,minY:.875,maxY:1.865};
  assert.ok(PAINT_CANVAS_BOUNDS.minX>canvas.minX);
  assert.ok(PAINT_CANVAS_BOUNDS.maxX<canvas.maxX);
  assert.ok(PAINT_CANVAS_BOUNDS.minY>canvas.minY);
  assert.ok(PAINT_CANVAS_BOUNDS.maxY<canvas.maxY);
  assert.deepEqual(Object.keys(PAINT_COMPOSITION_SHAPES).sort(),[...PAINT_CONTENT_IDS].sort());
  for(const id of PAINT_CONTENT_IDS){
    const strokes=PAINT_COMPOSITION_SHAPES[id];
    assert.ok(strokes.length>0,id);
    for(const [kind,x,y,width,height,paletteIndex] of strokes){
      assert.ok(['box','sphere'].includes(kind),id);
      assert.ok([x,y,width,height].every(Number.isFinite),id);
      assert.ok(width>0&&height>0,id);
      assert.ok(Number.isInteger(paletteIndex)&&paletteIndex>=0&&
        paletteIndex<PAINT_SUBJECTS[id].palette.length,id);
      assert.ok(x-width/2>=PAINT_CANVAS_BOUNDS.minX-1e-9,id+' overflows left');
      assert.ok(x+width/2<=PAINT_CANVAS_BOUNDS.maxX+1e-9,id+' overflows right');
      assert.ok(y-height/2>=PAINT_CANVAS_BOUNDS.minY-1e-9,id+' overflows bottom');
      assert.ok(y+height/2<=PAINT_CANVAS_BOUNDS.maxY+1e-9,id+' overflows top');
    }
  }
  const source=file('../src/game.js');
  assert.match(source,/primitive\('box','H5 paint surface',0,1.37,-.166,.76,.96/);
  assert.doesNotMatch(source,/const paintingShapes=/,'avoid duplicate untested shapes');
});

test('H5 physical purchased easel, capability and original 3D model',()=>{
  const root=newHousehold();
  assert.equal(FURNITURE_CATALOG.easel.templateOnly,true);
  assert.equal(furnitureRenderOrigin('easel').location,'template');
  assert.ok(FURNITURE_PRODUCTS.some(x=>x.itemId==='easel.starter'&&x.price===460));
  assert.ok(proceduralFurnitureModel('easel.starter').parts.length>=8);
  assert.equal(root.world.furniture.instances.some(x=>x.prefabId==='easel'),false);
  const id=buy(root);
  assert.ok(root.world.furniture.instances.some(x=>x.instanceId===id&&x.itemDefinitionId==='easel.starter'));
  assert.ok(furnitureActionApproach(root.world,'paint',id));
});
test('H5 authored skill, capabilities and three genuinely distinct painting themes',()=>{
  const def=getActivityDefinition(HOBBY_ACTIVITIES,PAINT_ACTIVITY_ID);
  assert.deepEqual(def.requiredCapabilities,['art.paint']);
  assert.equal(def.timeBudget.targetMinutes,45);
  assert.equal(def.skillPractice[0].skillId,PAINT_SKILL_ID);
  assert.equal(HOBBY_SKILLS.skills.painting.maxLevel,10);
  for(const id of PAINT_CONTENT_IDS){
    assert.equal(getHobbyContent(HOBBY_CONTENT,id)?.kind,'painting');
    assert.equal(PAINT_SUBJECTS[id].palette.length,5);
  }
});
test('H5 walking, pause, inaccessible station never create XP or work',()=>{
  const root=newHousehold(),id=buy(root),actor=start(root,id);
  const fun=actor.needs.fun;
  tickHousehold(root,4);
  assert.equal(actor.action.phase,'walking');
  assert.equal(actor.skills.xpById.painting,undefined);
  assert.deepEqual(actor.createdWorks,[]);
  assert.ok(actor.needs.fun<=fun);
  reach(root,actor,id);
  tickHousehold(root,2);
  assert.ok(actor.skills.xpById.painting>0);
  const before=actor.skills.xpById.painting;
  root.paused=true;tickHousehold(root,10);
  assert.equal(actor.skills.xpById.painting,before);
  root.paused=false;
  const stored=storeMarketItem(root.world.furniture,root.shop,id);
  assert.equal(stored.ok,true);
  root.world.furniture=stored.world;
  tickHousehold(root,4);
  assert.equal(actor.action,null);
  assert.equal(actor.activitySession,null);
  assert.equal(actor.skills.xpById.painting,before);
  assert.equal(actor.createdWorks.length,0);
});
test('H5 genuine finishing creates exactly one personal bounded deterministic result',()=>{
  const root=newHousehold(),id=buy(root),actor=start(root,id,'alex',PAINT_CONTENT_IDS[1]);
  reach(root,actor,id);
  tickHousehold(root,20);
  assert.equal(actor.createdWorks.length,0);
  assert.equal(actor.skills.xpById.painting,12);
  const partial=loadHousehold(copy(root));
  assert.equal(partial.action.contentId,PAINT_CONTENT_IDS[1]);
  assert.equal(partial.activitySession.awardedMinutes,20);
  tickHousehold(partial,25);
  assert.equal(partial.action,null);
  assert.equal(partial.activitySession,null);
  assert.equal(partial.createdWorks.length,1);
  const work=partial.createdWorks[0];
  assert.equal(work.ownerId,'alex');
  assert.equal(work.easelInstanceId,id);
  assert.equal(work.contentId,PAINT_CONTENT_IDS[1]);
  assert.ok(work.quality>=1&&work.quality<=100);
  assert.ok(work.seed>=0);
  assert.equal(partial.otherSim.createdWorks.length,0);
  tickHousehold(partial,5);
  assert.equal(partial.createdWorks.length,1,'no replay reward');
  assert.deepEqual(loadHousehold(copy(partial)).createdWorks,partial.createdWorks);
});
test('H5 individual actors have exclusive easel reservations and separate personal XP',()=>{
  const root=newHousehold(),id=buy(root);
  const alex=start(root,id);
  assert.equal(furnitureAvailable(root,'paint','mira',id),false);
  assert.equal(chooseResidentAction(root,'paint',false,'mira',id,PAINT_ACTIVITY_ID,PAINT_CONTENT_IDS[2]),false);
  assert.equal(root.otherSim.skills.xpById.painting,undefined);
  reach(root,alex,id);tickHousehold(root,45);
  assert.equal(alex.createdWorks.length,1);
  assert.equal(root.otherSim.createdWorks.length,0);
  const mira=start(root,id,'mira',PAINT_CONTENT_IDS[2]);
  reach(root,mira,id);tickHousehold(root,45);
  assert.equal(mira.createdWorks.length,1);
  assert.equal(mira.createdWorks[0].ownerId,'mira');
  assert.notEqual(mira.createdWorks[0].id,alex.createdWorks[0].id);
  assert.equal(alex.skills.xpById.painting,27);
  assert.equal(currentSkillLevel(alex.skills,HOBBY_SKILLS,'painting'),0);
  assert.equal(mira.skills.xpById.painting,27);
  assert.equal(currentSkillLevel(mira.skills,HOBBY_SKILLS,'painting'),0);
});
test('H5 saved queue, invalid themes and corrupted sessions fail closed',()=>{
  const root=newHousehold(),id=buy(root);
  const command={type:'activity',activityId:PAINT_ACTIVITY_ID,
    contentId:PAINT_CONTENT_IDS[2],targetInstanceId:id};
  assert.ok(enqueueAction(root.actionQueues,'alex',command));
  assert.equal(enqueueAction(root.actionQueues,'mira',{...command,contentId:'painting.untrusted'}),null);
  assert.equal(restoreActionQueues(copy(root.actionQueues),['alex','mira'])
    .byResident.alex[0].contentId,PAINT_CONTENT_IDS[2]);
  const actor=start(root,id,'mira');reach(root,actor,id);tickHousehold(root,3);
  const raw=copy(root);raw.otherSim.activitySession.contentId='painting.fake';
  const loaded=loadHousehold(raw);
  assert.equal(loaded.otherSim.action,null);
  assert.equal(loaded.otherSim.createdWorks.length,0);
  assert.ok(loaded.world.furniture.instances.some(x=>x.instanceId===id));
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
});
test('H5 rollback keeps optional authored artwork location across autosave',()=>{
  const old={id:'work:painting:alex:1:480000',ownerId:'alex',
    easelInstanceId:'shop-easel-1',contentId:PAINT_CONTENT_IDS[0],
    seed:1234,quality:35,createdAt:480};
  const incoming={...old,kind:'artwork',location:'studio',
    origin:{x:3.25,z:-1.5,yaw:90}};
  const state=newHousehold();state.createdWorks=[incoming];
  const loaded=loadHousehold(copy(state));
  assert.deepEqual(loaded.createdWorks,[incoming]);
  assert.deepEqual(loadHousehold(copy(loaded)).createdWorks,[incoming]);
  assert.deepEqual(restoreCreatedWorks([old],'alex'),[old]);
  assert.equal(restoreCreatedWorks([{...incoming,origin:{x:Infinity,z:0,yaw:90}}],'alex')[0].origin,null);
});
test('H5 old v1 saves load without fictional works; invalid works are rejected and capped',()=>{
  const initial=newHousehold();
  const old=copy(initial);
  delete old.createdWorks;delete old.otherSim.createdWorks;delete old.skills;
  const loaded=loadHousehold(old);
  assert.deepEqual(loaded.createdWorks,[]);
  assert.deepEqual(loaded.otherSim.createdWorks,[]);
  const work={id:'work:painting:alex:1:480000',ownerId:'alex',
    easelInstanceId:'shop-easel-1',contentId:PAINT_CONTENT_IDS[0],
    seed:1234,quality:35,createdAt:480};
  const raw=Array.from({length:PAINT_WORKS_LIMIT+4},(_,i)=>({
    ...work,id:'work:painting:alex:'+i+':480000'
  }));
  assert.equal(restoreCreatedWorks([...raw, {...work,ownerId:'mira'},
    {...work,quality:Infinity}], 'alex').length,PAINT_WORKS_LIMIT);
  assert.equal(restoreCreatedWorks([work], 'mira').length,0);
  assert.equal(finishPainting({session:null,actor:loaded,actorId:'alex'}),null);
});
test('H5 Safari chooser, physical canvas, mesh gesture and Pages files are wired',()=>{
  const html=file('../index.html'),game=file('../src/game.js');
  const pages=file('../.github/workflows/pages.yml');
  assert.match(html,/id="painting-theme-select"/);
  assert.match(html,/id="mind-painting-works"/);
  assert.match(game,/H5 paint /);
  assert.match(game,/PAINT_ACTIVITY_ID/);
  assert.match(game,/easelInstanceId/);
  assert.match(pages,/node --check src\/painting\.js/);
  assert.match(pages,/cp src\/painting\.js site\/src\//);
  assert.match(pages,/cp src\/hobby-reading\.js site\/src\//);
});
