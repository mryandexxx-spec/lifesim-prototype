import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold,chooseResidentAction,tickHousehold} from '../src/household.js';
import {FURNITURE_CATALOG,furnitureActionApproach} from '../src/furniture-catalog.js';
import {findMarketPlacement,buyMarketItem,storeMarketItem} from '../src/furniture-shop.js';
import {PAINT_ACTIVITY_ID,PAINT_CONTENT_IDS,restoreCreatedWorks} from '../src/painting.js';
import {easelPaintingPose,paintingStrokeFrame,studioArtworkPose} from '../src/painting-visual.js';
import {createMeshyPaintingController} from '../src/meshy-painting-runtime.js';
import {canShowMeshy} from '../src/meshy-visual-policy.js';
import {canShowMiraMeshy} from '../src/meshy-mira-policy.js';
import {arrive,SAVE_KEY} from '../src/simulation.js';
const copy=x=>JSON.parse(JSON.stringify(x));
const text=p=>readFileSync(new URL(p,import.meta.url),'utf8');
function studio(){
  const home=newHousehold();
  const pose=findMarketPlacement(home.world.furniture,home.shop,'easel.starter');
  assert.ok(pose,'purchased easel has a reachable physical location');
  const tx=buyMarketItem(home.world.furniture,home.shop,'easel.starter',pose);
  assert.equal(tx.ok,true,tx.reason);
  home.world.furniture=tx.world;home.shop=tx.shop;
  return {home,instanceId:tx.instanceId};
}
function finish(home,instanceId,owner='alex',theme=PAINT_CONTENT_IDS[0]){
  assert.equal(chooseResidentAction(home,'paint',false,owner,instanceId,
    PAINT_ACTIVITY_ID,theme),true);
  const actor=owner==='alex'?home:home.otherSim;
  actor.position={...furnitureActionApproach(home.world,'paint',instanceId)};
  arrive(actor);
  tickHousehold(home,45);
  assert.equal(actor.createdWorks.length>0,true);
  return actor.createdWorks.at(-1);
}
test('H5a: face the true canvas in ALL four saved quarter-turns, never last walk heading',()=>{
  const {home,instanceId}=studio();
  const easel=home.world.furniture.instances.find(i=>i.instanceId===instanceId);
  for(const [yaw,expected] of [[0,0],[90,-90],[180,180],[270,90]]){
    easel.yaw=yaw;
    const position=furnitureActionApproach(home.world,'paint',instanceId);
    const pose=easelPaintingPose(home.world,instanceId,position);
    assert.ok(pose);
    // Safari render contract: undefined height/pitch previously caused NaN
    // and made Alex disappear, followed by frozen camera/scene updates.
    for(const field of ['x','y','z','yaw','pitch','roll'])
      assert.ok(Number.isFinite(pose[field]),yaw+' '+field+' must be finite');
    const damp=(from,to)=>from+(to-from)*(1-Math.exp(-10*.016));
    assert.ok(Number.isFinite(damp(0,pose.y)));
    assert.ok(Number.isFinite(damp(0,pose.pitch)));
    assert.equal(Math.abs(pose.yaw-expected)<.001,true,yaw+' facing');
    assert.deepEqual({x:pose.x,z:pose.z},position);
  }
  assert.equal(easelPaintingPose(home.world,'shop-easel-999'),null);
  assert.equal(easelPaintingPose(home.world,'shop-easel-999',{x:0,z:0}),null);
});
test('H5a brush stroke is a pure frame, not a script mutating game time',()=>{
  assert.equal(paintingStrokeFrame(null),null);
  assert.equal(paintingStrokeFrame({phase:'walking',elapsed:3}),null);
  assert.equal(paintingStrokeFrame({phase:'using',elapsed:-1}),null);
  const a=paintingStrokeFrame({phase:'using',elapsed:4.5});
  assert.ok(a.weight>0&&a.weight<=1);
  assert.ok(Math.abs(a.strokeX)<=.115&&Math.abs(a.strokeY)<=.085);
  assert.notDeepEqual(a,paintingStrokeFrame({phase:'using',elapsed:4.9}));
  assert.equal(createMeshyPaintingController({}).ready,false);
});
test('H5a: both imported skins stay visible ONLY with an actual brush controller',()=>{
  assert.equal(canShowMeshy({preferred:true,ready:true,actionId:'paint'}),false);
  assert.equal(canShowMiraMeshy({preferred:true,ready:true,actionId:'paint'}),false);
  assert.equal(canShowMeshy({preferred:true,ready:true,actionId:'paint',paintingReady:true}),true);
  assert.equal(canShowMiraMeshy({preferred:true,ready:true,actionId:'paint',paintingReady:true}),true);
  assert.equal(canShowMeshy({preferred:true,ready:false,actionId:'paint',paintingReady:true}),false);
});
test('H5a: completed artwork is its own stable object with an original floor pose',()=>{
  const {home,instanceId}=studio();
  const base=home.world.furniture.instances.find(i=>i.instanceId===instanceId);
  const work=finish(home,instanceId);
  assert.equal(work.kind,'artwork');
  assert.equal(work.location,'studio');
  assert.deepEqual(work.origin,{x:base.x,z:base.z,yaw:base.yaw});
  assert.ok(work.id.startsWith('work:'));
  assert.equal(home.activitySession,null);
  const position=studioArtworkPose(work);
  assert.ok(position&&Number.isFinite(position.x)&&Number.isFinite(position.z));
  assert.equal(position.yaw,base.yaw);
  const persisted=loadHousehold(copy(home));
  assert.deepEqual(persisted.createdWorks[0],work);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
});
test('H5a: moving/storing the source easel never destroys completed artwork',()=>{
  const {home,instanceId}=studio();
  const work=finish(home,instanceId);
  const before=studioArtworkPose(work);
  const stored=storeMarketItem(home.world.furniture,home.shop,instanceId);
  assert.equal(stored.ok,true);
  home.world.furniture=stored.world;home.shop=stored.shop;
  tickHousehold(home,10);
  const loaded=loadHousehold(copy(home));
  assert.equal(loaded.createdWorks.length,1);
  assert.deepEqual(loaded.createdWorks[0],work);
  assert.deepEqual(studioArtworkPose(loaded.createdWorks[0]),before);
  assert.equal(loaded.world.furniture.instances.find(i=>i.instanceId===instanceId).location,'storage');
});
test('H5a: old collection-only works migrate without invented positions',()=>{
  const raw={id:'work:painting:alex:1:480000',ownerId:'alex',
    easelInstanceId:'shop-easel-1',contentId:PAINT_CONTENT_IDS[0],
    seed:1234,quality:35,createdAt:480};
  const [work]=restoreCreatedWorks([raw],'alex');
  assert.equal(work.kind,undefined);
  assert.equal(work.location,undefined);
  assert.equal(work.origin,undefined);
  assert.equal(studioArtworkPose(work),null);
  const unsafe=restoreCreatedWorks([{...raw,origin:{x:Infinity,z:2,yaw:90}}],'alex');
  assert.equal(unsafe[0].origin,undefined);
  assert.equal(restoreCreatedWorks([raw],'mira').length,0);
});
test('H5a: two personal paintings are separate objects; no phantom creation on walking',()=>{
  const {home,instanceId}=studio();
  assert.equal(chooseResidentAction(home,'paint',false,'alex',instanceId,PAINT_ACTIVITY_ID,PAINT_CONTENT_IDS[1]),true);
  tickHousehold(home,5);
  assert.deepEqual(home.createdWorks,[]);
  const actor=home;
  actor.position={...furnitureActionApproach(home.world,'paint',instanceId)};
  arrive(actor);
  tickHousehold(home,45);
  const first=actor.createdWorks[0];
  const second=finish(home,instanceId,'mira',PAINT_CONTENT_IDS[2]);
  assert.notEqual(first.id,second.id);
  assert.deepEqual(home.createdWorks.map(x=>x.ownerId),['alex']);
  assert.deepEqual(home.otherSim.createdWorks.map(x=>x.ownerId),['mira']);
  const pos=[studioArtworkPose(first,0),studioArtworkPose(second,1)];
  assert.notDeepEqual(pos[0],pos[1]);
});
test('H5a: Safari artwork pick, brush, cached imports and Pages deploy are connected',()=>{
  const game=text('../src/game.js'),alex=text('../src/meshy-visual.js'),
    mira=text('../src/meshy-mira-visual.js'),
    yml=text('../.github/workflows/pages.yml'),html=text('../index.html');
  assert.match(game,/easelPaintingPose\(game\.world,game\.action\?\.targetInstanceId,game\.position\)/);
  assert.match(game,/easelPaintingPose\(game\.world,game\.otherSim\.action\?\.targetInstanceId,game\.otherSim\.position\)/);
  assert.match(game,/H5a artwork \/ /);
  assert.match(game,/H5a preserved brush stroke/);
  assert.match(game,/kind:'artwork'/);
  assert.match(game,/updateArtworkNodes\(\)/);
  assert.match(game,/paintingFrame:useId==='paint'/);
  assert.match(game,/paintingFrame:miraUseId==='paint'/);
  assert.match(alex,/createMeshyPaintingController/);
  assert.match(mira,/createMeshyPaintingController/);
  assert.match(alex,/paintingRuntime\?\.setFrame/);
  assert.match(mira,/paintingRuntime\?\.setFrame/);
  assert.match(yml,/cp src\/painting\.js site\/src\//);
  assert.match(yml,/cp src\/painting-visual\.js src\/meshy-painting-runtime\.js site\/src\//);
  assert.ok(html.includes('1.2u.15 · H5b / F4G / H5a-safe / H5.1 / F4F.2'));
  assert.match(game,/PAINT_COMPOSITION_SHAPES\[work.contentId\]/);
  assert.ok(html.includes('painting-visual.js?v=1.2u-h5asafe'));
});
