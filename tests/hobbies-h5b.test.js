import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold,chooseResidentAction} from '../src/household.js';
import {restoreCreatedWorks,PAINT_CONTENT_IDS,PAINT_ACTIVITY_ID,PAINT_WORKS_LIMIT} from '../src/painting.js';
import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {PAINT_WALL_SLOTS,availablePaintingWallSlots,artworkDisplayPose,
  paintingResaleCredits,transactPainting} from '../src/painting-gallery.js';
import {SAVE_KEY} from '../src/simulation.js';
const copy=x=>JSON.parse(JSON.stringify(x));
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
function work(id,ownerId='alex',location='studio'){
  return {id:'work:painting:'+id,ownerId,easelInstanceId:'shop-easel-1',
    contentId:PAINT_CONTENT_IDS[0],seed:id==='a'?12:13,quality:80,
    createdAt:485,kind:'artwork',location,origin:{x:1,z:0,yaw:0}};
}
function setup(){
  const root=newHousehold();
  root.createdWorks=[work('a')];root.otherSim.createdWorks=[work('b','mira','inventory')];
  return root;
}
function commit(root,id,result){
  assert.equal(result.ok,true,result.reason);
  (id==='alex'?root:root.otherSim).createdWorks=result.works;
  root.shop=result.shop;
}
test('H5b: studio → inventory → reserved wall slot → inventory persists in v1',()=>{
  const root=setup(),original=root.createdWorks[0];
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  commit(root,'alex',transactPainting(root,'alex',original.id,'store'));
  assert.equal(artworkDisplayPose(root.createdWorks[0]),null);
  assert.equal(root.createdWorks[0].id,original.id);
  assert.equal(root.createdWorks[0].origin.x,1);
  commit(root,'alex',transactPainting(root,'alex',original.id,'hang',0));
  assert.equal(root.createdWorks[0].wallSlot,0);
  const pose=artworkDisplayPose(root.createdWorks[0]);
  assert.deepEqual([pose.x,pose.y,pose.z,pose.yaw],
    [PAINT_WALL_SLOTS[0].x,1.72,-4.10,180]);
  const loaded=loadHousehold(copy(root));
  assert.deepEqual(loaded.createdWorks[0],root.createdWorks[0]);
  assert.equal(loaded.otherSim.createdWorks.length,1);
  commit(loaded,'alex',transactPainting(loaded,'alex',original.id,'store'));
  assert.equal(loaded.createdWorks[0].location,'inventory');
  assert.equal(loaded.createdWorks[0].wallSlot,undefined);
});
test('H5b: wall mounts exclusive across both residents, invalid slots rejected',()=>{
  const root=setup();
  commit(root,'alex',transactPainting(root,'alex',root.createdWorks[0].id,'store'));
  commit(root,'alex',transactPainting(root,'alex',root.createdWorks[0].id,'hang',4));
  const owner=root.otherSim.createdWorks[0].id;
  assert.equal(transactPainting(root,'mira',owner,'hang',4).reason,'slot-occupied');
  assert.equal(transactPainting(root,'mira',owner,'hang',100).reason,'invalid-slot');
  assert.equal(transactPainting(root,'alex',owner,'store').reason,'not-owned');
  assert.equal(availablePaintingWallSlots(root).length,7);
});
test('H5b: sell only owned inventory for playtest credits, never twice',()=>{
  const root=setup(),id=root.createdWorks[0].id;
  assert.equal(transactPainting(root,'alex',id,'sell').reason,'not-in-inventory');
  commit(root,'alex',transactPainting(root,'alex',id,'store'));
  const before=root.shop.credits,price=paintingResaleCredits(root.createdWorks[0]);
  commit(root,'alex',transactPainting(root,'alex',id,'sell'));
  assert.equal(root.shop.credits,before+price);
  assert.equal(root.createdWorks.length,0);
  assert.equal(transactPainting(root,'alex',id,'sell').reason,'not-owned');
  const loaded=loadHousehold(copy(root));
  assert.equal(loaded.shop.credits,before+price);
  assert.equal(loaded.createdWorks.length,0);
  assert.equal(loaded.otherSim.createdWorks.length,1);
});
test('H5b: fails closed at credit cap and keeps state untouched',()=>{
  const root=setup(),id=root.createdWorks[0].id;
  commit(root,'alex',transactPainting(root,'alex',id,'store'));
  root.shop.credits=1000000;
  const snapshot=copy(root);
  assert.equal(transactPainting(root,'alex',id,'sell').reason,'wallet-limit');
  assert.deepEqual(root,snapshot);
});
test('H5b: legacy H5 collection-only works can be recovered into inventory',()=>{
  const raw=work('a');delete raw.kind;delete raw.location;
  const root=setup();root.createdWorks=restoreCreatedWorks([raw],'alex');
  assert.equal(root.createdWorks[0].kind,undefined);
  commit(root,'alex',transactPainting(root,'alex',raw.id,'store'));
  assert.equal(root.createdWorks[0].location,'inventory');
  assert.deepEqual(loadHousehold(copy(root)).createdWorks,root.createdWorks);
});
test('H5b: corrupt wall slots and conflicting saved mounts never lose art',()=>{
  const root=setup(),a=root.createdWorks[0],b=root.otherSim.createdWorks[0];
  root.createdWorks=[{...a,location:'wall',wallSlot:2}];
  root.otherSim.createdWorks=[{...b,location:'wall',wallSlot:2}];
  const loaded=loadHousehold(copy(root));
  assert.equal(loaded.createdWorks[0].location,'wall');
  assert.equal(loaded.otherSim.createdWorks[0].location,'inventory');
  assert.equal(loaded.otherSim.createdWorks[0].id,b.id);
  root.createdWorks=[{...a,location:'wall',wallSlot:99}];
  const migrated=loadHousehold(copy(root));
  assert.equal(migrated.createdWorks[0].location,'inventory');
  assert.equal(migrated.createdWorks[0].id,a.id);
});
test('H5b: 24 paintings persist; trying for number 25 never evicts wall or inventory art',()=>{
  const root=newHousehold(),position=findMarketPlacement(root.world.furniture,root.shop,'easel.starter');
  assert.ok(position);
  const tx=buyMarketItem(root.world.furniture,root.shop,'easel.starter',position);
  assert.equal(tx.ok,true);root.world.furniture=tx.world;root.shop=tx.shop;
  root.createdWorks=Array.from({length:PAINT_WORKS_LIMIT},(_,i)=>({
    ...work('a'),id:'work:painting:alex:'+i+':480000',
    location:i===0?'wall':'inventory',...(i===0?{wallSlot:0}:{})
  }));
  const original=copy(root.createdWorks);
  assert.equal(chooseResidentAction(root,'paint',false,'alex',tx.instanceId,
    PAINT_ACTIVITY_ID,PAINT_CONTENT_IDS[0]),false);
  assert.equal(root.action,null);
  assert.deepEqual(root.createdWorks,original);
  assert.deepEqual(loadHousehold(copy(root)).createdWorks,original);
  commit(root,'alex',transactPainting(root,'alex',original[0].id,'store'));
  commit(root,'alex',transactPainting(root,'alex',original[0].id,'sell'));
  assert.equal(root.createdWorks.length,PAINT_WORKS_LIMIT-1);
  assert.equal(chooseResidentAction(root,'paint',false,'alex',tx.instanceId,
    PAINT_ACTIVITY_ID,PAINT_CONTENT_IDS[0]),true);
});
test('H5b: wall geometry and browser/build wiring',()=>{
  const game=read('../src/game.js'),html=read('../index.html'),
    ci=read('../.github/workflows/pages.yml');
  assert.equal(PAINT_WALL_SLOTS.length,8);
  assert.ok(PAINT_WALL_SLOTS.every((s,i)=>s.id===i&&s.x>1&&s.x<13&&s.z>-4.25));
  assert.match(game,/artworkDisplayPose\(work,index,origin\)/);
  assert.match(game,/transactPainting\(game,game.selectedSim,work.id/);
  assert.match(game,/foot.enabled=!position.wall/);
  assert.match(game,/setMindTab\('skills'\)/);
  assert.match(ci,/cp src\/painting-gallery.js site\/src\//);
  assert.match(html,/painting-gallery.js\?v=1.2u-h5b-20261117/);
});
