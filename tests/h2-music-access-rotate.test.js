import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold,chooseResidentAction,getActor,
  tickHousehold,furnitureAvailable} from '../src/household.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {proposeFurnitureMove} from '../src/furniture-layout.js';
import {createFurnitureEditor} from '../src/furniture-editor.js';
import {enqueueAction,dispatchActionQueues,pendingActions} from '../src/action-queue.js';
import {MUSIC_ACTIVITY_ID,MUSIC_CONTENT_IDS} from '../src/hobby-reading.js';
import {findPath,isWalkable} from '../src/navigation.js';
import {arrive} from '../src/simulation.js';
import {MUSIC_LOCAL_SPOTS,musicListeningSpots,validMusicListeningSpot,
  chooseMusicListeningSpot} from '../src/music-listening.js';

const copy=x=>JSON.parse(JSON.stringify(x));
function buyMusic(root){
  const residents=[getActor(root,'alex').position,getActor(root,'mira').position];
  const context={residents};
  const pose=findMarketPlacement(root.world.furniture,root.shop,'music.starter',context);
  assert.ok(pose,'music must have a reachable placement');
  const bought=buyMarketItem(root.world.furniture,root.shop,'music.starter',pose,context);
  assert.equal(bought.ok,true,JSON.stringify(bought));
  root.world.furniture=bought.world;root.shop=bought.shop;
  return bought.instanceId;
}

test('music approach offers four 90-degree-aware alternatives without getting inside cabinet',()=>{
  assert.equal(MUSIC_LOCAL_SPOTS.length,4);
  const world={schema:1,revision:1,instances:[
    {instanceId:'shop-music-1',prefabId:'music',x:0,z:0,yaw:0,location:'home'},
    {instanceId:'shop-plant-2',prefabId:'plant',x:0,z:.84,yaw:0,location:'home'}
  ]};
  const front=furnitureActionApproach(world,'music','shop-music-1');
  assert.equal(isWalkable(front.x,front.z,world),false,'front is blocked by real furniture');
  const alternatives=musicListeningSpots(world,'shop-music-1');
  assert.ok(alternatives.length>=1);
  const from={x:2,z:2},plan=chooseMusicListeningSpot(world,from,'shop-music-1');
  assert.ok(plan,'other side must remain reachable despite blocked front');
  assert.equal(validMusicListeningSpot(world,'shop-music-1',plan.point),true);
  assert.notDeepEqual(plan.point,front);
  assert.ok(plan.path,'A* route must be real, not teleport');
  assert.deepEqual(plan.path,findPath(from,plan.point,world));
  const rotated=copy(world);
  rotated.instances[0].yaw=90;
  assert.ok(musicListeningSpots(rotated,'shop-music-1').length);
});

test('queued music launches with actual route, completes arrival and generates Fun',()=>{
  const root=newHousehold(),id=buyMusic(root),who='alex',actor=getActor(root,who);
  const command={type:'activity',activityId:MUSIC_ACTIVITY_ID,
    contentId:MUSIC_CONTENT_IDS[1],targetInstanceId:id};
  assert.ok(enqueueAction(root.actionQueues,who,command));
  assert.equal(pendingActions(root.actionQueues,who).length,1);
  let plan;
  const dispatched=dispatchActionQueues(root.actionQueues,{
    canStart:(residentId,task)=>furnitureAvailable(root,'music',residentId,task.targetInstanceId),
    start:(residentId,task)=>{
      plan=chooseMusicListeningSpot(root.world,getActor(root,residentId).position,
        task.targetInstanceId);
      return !!plan&&chooseResidentAction(root,'music',false,residentId,
        task.targetInstanceId,task.activityId,task.contentId,plan);
    }
  });
  assert.equal(dispatched.length,1,'manual task must actually leave the queue');
  assert.equal(pendingActions(root.actionQueues,who).length,0);
  assert.equal(actor.action?.phase,'walking');
  assert.deepEqual(actor.action.musicSpot,plan.point);
  assert.ok(Array.isArray(plan.path),'the route must exist before action starts');
  assert.deepEqual(plan.path.at(-1),plan.point);
  const before=actor.needs.fun;
  tickHousehold(root,1);
  assert.equal(actor.action.phase,'walking');
  assert.ok(actor.needs.fun<=before,'no Fun earned while walking');
  actor.position={...plan.point}; // arrive at the verified A* route endpoint
  arrive(actor);
  tickHousehold(root,3);
  assert.equal(actor.activitySession?.phase,'using');
  assert.ok(actor.needs.fun>before);
});

test('H2 previously queued commands on valid old 1.2u households remain startable',()=>{
  const root=newHousehold(),id=buyMusic(root),actor=getActor(root,'alex');
  const command={type:'activity',activityId:MUSIC_ACTIVITY_ID,
    contentId:MUSIC_CONTENT_IDS[2],targetInstanceId:id};
  enqueueAction(root.actionQueues,'alex',command);
  const restored=loadHousehold(copy(root));
  assert.equal(restored.actionQueues.byResident.alex.length,1);
  const pending=restored.actionQueues.byResident.alex[0];
  const spot=chooseMusicListeningSpot(restored.world,actor.position,pending.targetInstanceId);
  assert.ok(spot,'1.2u task can recover without resetting household');
  assert.equal(chooseResidentAction(restored,'music',false,'alex',
    pending.targetInstanceId,pending.activityId,pending.contentId,spot),true);
});

test('old active H2 actions without musicSpot migrate only the optional anchor',()=>{
  const root=newHousehold(),id=buyMusic(root),actor=getActor(root,'mira');
  const planned=chooseMusicListeningSpot(root.world,actor.position,id);
  assert.ok(planned);
  assert.equal(chooseResidentAction(root,'music',false,'mira',id,
    MUSIC_ACTIVITY_ID,MUSIC_CONTENT_IDS[0],planned),true);
  actor.position={...planned.point};arrive(actor);tickHousehold(root,2);
  const old=copy(root);
  delete old.otherSim.action.musicSpot; // old H2 save format
  const loaded=loadHousehold(old),newActor=getActor(loaded,'mira');
  assert.equal(newActor.action?.id,'music');
  assert.deepEqual(newActor.action.musicSpot,planned.point);
  assert.equal(loaded.world.furniture.instances.some(i=>i.instanceId===id),true);
  tickHousehold(loaded,1);
  assert.equal(newActor.action?.elapsed,3);
});

test('music placement rejects fully blocked console before spending and saves rotation',()=>{
  const station={instanceId:'shop-music-1',prefabId:'music',x:0,z:0,yaw:0,
    location:'home',itemDefinitionId:'music.starter',purchasePriceCredits:390};
  const plants=MUSIC_LOCAL_SPOTS.map((spot,i)=>({
    instanceId:'shop-plant-'+(i+2),prefabId:'plant',
    x:spot.x,z:spot.z,yaw:0,location:'home'
  }));
  const blocked={schema:1,revision:0,instances:[station,...plants]};
  assert.equal(musicListeningSpots(blocked,station.instanceId).length,0);
  const cannot=proposeFurnitureMove(blocked,station.instanceId,
    {x:0,z:0,yaw:0});
  assert.equal(cannot.ok,false);
  assert.equal(cannot.reason,'unreachable-music');

  const clean={schema:1,revision:0,instances:[station]};
  const editor=createFurnitureEditor(clean);
  const turned=editor.commit(station.instanceId,{x:0,z:0,yaw:90});
  assert.equal(turned.ok,true,JSON.stringify(turned));
  assert.equal(editor.state().world.instances[0].yaw,90);
  assert.equal(editor.undo().world.instances[0].yaw,0);
  assert.equal(editor.redo().world.instances[0].yaw,90);
});

test('iPhone code wires a visible turn control and unlocks music only on direct Listen tap',()=>{
  const read=x=>readFileSync(new URL(x,import.meta.url),'utf8');
  const html=read('../index.html'),ui=read('../src/game.js'),
    css=read('../styles.css'),pages=read('../.github/workflows/pages.yml');
  assert.match(html,/id="furnish-room-tools"/);
  assert.match(html,/id="furnish-item-select"/);
  assert.match(html,/id="furnish-rotate"/);
  assert.match(html,/Повернуть 90°/);
  assert.match(ui,/picker\.replaceChildren\(\.\.\.options\)/);
  assert.match(ui,/\$\('furnish-item-select'\)\.addEventListener\('change'/);
  assert.match(ui,/chooseFurniture\(event\.currentTarget\.value\|\|null\)/);
  assert.match(ui,/musicPlan=id==='music'/);
  assert.match(ui,/musicPlan\?\.path/);
  assert.match(ui,/person\.action\.musicSpot/);
  assert.match(ui,/musicAudio\.enable\(\)\.then/);
  assert.match(ui,/!musicMutedByPlayer/);
  assert.match(ui,/const lockedFurnitureIds=\(includePending=true\)/);
  assert.match(ui,/lockedInstanceIds:lockedFurnitureIds\(!allowQueuedReposition\)/);
  assert.match(ui,/editSession\.commit\(instanceId,pose,editorContext\(true\)\)/);
  assert.match(ui,/storeMarketItem\(game\.world\.furniture,game\.shop,[\s\S]*?editSelectedId,editorContext\(\)\)/);

  assert.match(css,/\.furnish-room-tools\[hidden\]\{display:none!important;/);
  assert.match(pages,/node --check src\/music-listening\.js/);
  assert.match(pages,/cp src\/music-listening\.js site\/src\//);
});

test('Safari import map busts every modified H2 dependency, not only the game entry',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const match=html.match(/<script type="importmap">\s*([\s\S]*?)\s*<\/script>/);
  assert.ok(match,'browser must receive import map before JS entry');
  const imports=JSON.parse(match[1]).imports;
  assert.equal(imports.playcanvas,'./vendor/playcanvas.mjs');
  const base='https://example.org/lifesim-prototype/';
  for(const name of ['household','furniture-layout','furniture-editor','furniture-shop']){
    const key='./src/'+name+'.js';
    assert.ok(imports[key],key+' must be independently cache-busted');
    const expected={'household':'?v=1.2w-h2b-f4d-h3-f4e-h4-h5-f4f',
      'furniture-layout':'?v=1.2v-f4d-f4e',
      'furniture-editor':'?v=1.2u-h2fix1-f4c',
      'furniture-shop':'?v=1.2v-f4d-f4e'};
    assert.equal(new URL(imports[key],base).search,expected[name]);
    // A nested ./foo.js import in an ES module beneath src/ resolves to
    // precisely this import-map key, irrespective of the parent module URL.
    assert.equal(new URL(key,base).href,
      new URL('./'+name+'.js',new URL('./src/game.js',base)).href);
  }
  assert.match(html,/src\/game\.js\?v=1\.2u-h2-music-fix1-cache/);
});


test('F4C iPhone import map refreshes every changed furniture core ES module',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const match=html.match(/<script type="importmap">\s*([\s\S]*?)\s*<\/script>/);
  assert.ok(match);
  const imports=JSON.parse(match[1]).imports;
  for(const name of ['furniture-products','furniture-catalog','object-legacy-adapter',
      'shop-catalog-selector','furniture-value','furniture-procedural-library',
      'furniture-thumbnails']){
    const key='./src/'+name+'.js';
    const version=['furniture-products','furniture-catalog','object-legacy-adapter'].includes(name)
      ?'1.2v-f4d-f4e'+(['furniture-products','furniture-catalog'].includes(name)?'-h5':'')
      :'1.2u-f4c'+(name==='furniture-procedural-library'?'-h5':'');
    assert.equal(imports[key],key+'?v='+version);
  }
  assert.match(html,/src\/game\.js\?v=1\.2u-h2-music-fix1-cache-f4c/);
});
