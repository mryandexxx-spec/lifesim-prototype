import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {newFurnitureWorld} from '../src/furniture-catalog.js';
import {newFurnitureShop,buyMarketItem,findMarketPlacement} from '../src/furniture-shop.js';

const source=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
const game=source('../src/game.js');
const html=source('../index.html');
const css=source('../styles.css');
const people={residents:[{x:-.8,z:2.95},{x:-.25,z:.35}]};

function harness(){
  const handlers={},world=newFurnitureWorld(),shop=newFurnitureShop();
  const placement=findMarketPlacement(world,shop,'plant',people);
  assert.ok(placement,'need available fixture-free slot for purchase');
  const state={
    furnishMode:true,shopOpen:true,shopSelected:'plant',shopSelectedItemId:'legacy.plant',shopPlacing:false,
    shopPose:null,shopManualPose:false,
    shopListings:[{itemId:'legacy.plant',prefabId:'plant',price:130}],game:{world:{furniture:world},shop},
    editorContext:()=>people,
    moveShopPreviewToCamera:()=>{state.shopPose={...placement};state.moved++},
    moved:0,renders:0,cleared:0,committed:0,feedback:[],
    renderMarket:()=>{state.renders++},
    clearShopPreviewEntity:()=>{state.cleared++},
    editorFeedback:(message)=>{state.feedback.push(message)},
    buyMarketItem,
    applyMarketTransaction:(transaction)=>{
      if(!transaction.ok)return false;
      state.committed++;
      state.game.world.furniture=transaction.world;
      state.game.shop=transaction.shop;
      return true;
    },
    $(name){return {addEventListener(type,fn){handlers[name+':'+type]=fn}}}
  };
  const start=game.indexOf("  $('furnish-buy').addEventListener('click',()=>{");
  const end=game.indexOf("  $('furnish-store').addEventListener('click',()=>{",start);
  assert.ok(start>0&&end>start,'F2 buy/cancel callbacks are present');
  runInNewContext('(()=>{\n'+game.slice(start,end)+'\n})()',state,{timeout:1000});
  return {state,handlers};
}
test('Buy starts a movable pending placement without buying, then Place charges exactly once',()=>{
  const {state,handlers}=harness();
  handlers['furnish-buy:click']();
  assert.equal(state.shopPlacing,true);
  assert.equal(state.moved,1,'new preview follows the camera');
  assert.ok(state.shopPose);
  assert.equal(state.game.shop.credits,5000,'nothing is charged at Buy');
  assert.equal(state.game.world.furniture.instances.length,10);
  assert.equal(state.committed,0);
  handlers['furnish-buy:click']();
  assert.equal(state.committed,1);
  assert.equal(state.game.shop.credits,4870);
  assert.equal(state.game.world.furniture.instances.length,11);
  assert.equal(state.shopPlacing,false);
  assert.equal(state.shopPose,null);
});
test('Cancelling an unfinished purchase leaves wallet and home intact',()=>{
  const {state,handlers}=harness();
  handlers['furnish-buy:click']();
  handlers['furnish-place-cancel:click']();
  assert.equal(state.committed,0);
  assert.equal(state.game.shop.credits,5000);
  assert.equal(state.game.world.furniture.instances.length,10);
  assert.equal(state.shopPlacing,false);
  assert.equal(state.shopPose,null);
  assert.ok(state.cleared>=1);
});
test('Blocked placement cannot charge and remains pending so user can continue moving',()=>{
  const {state,handlers}=harness();
  handlers['furnish-buy:click']();
  state.shopPose={x:100,z:100,yaw:0};
  handlers['furnish-buy:click']();
  assert.equal(state.committed,0);
  assert.equal(state.game.shop.credits,5000);
  assert.equal(state.shopPlacing,true);
  assert.equal(state.game.world.furniture.instances.length,10);
});
test('Placement retains 3D prefab and floor outline; swipe moves object without panning camera',()=>{
  assert.match(game,/shopPreviewEntity=template.clone\(\)/);
  assert.match(game,/shopPreviewEntity.name='Unsaved furniture placement preview'/);
  assert.match(game,/shopPreviewEntity.setPosition\(shopPose.x,0,shopPose.z\)/);
  assert.match(game,/shopPreviewEntity.setEulerAngles\(0,-shopPose.yaw,0\)/);
  assert.match(game,/oneFinger:furnishMode&&ownedPlacement/);
  assert.match(game,/shopPlacing&&oneFingerMode==='pan'/);
  assert.match(game,/shopSwipeRawPose=dragShopPlacement\(view,shopSwipeRawPose\|\|shopPose/);
  assert.doesNotMatch(game,/if\(furnishMode&&shopPlacing&&!pos\)moveShopPreviewToCamera/);
  assert.match(game,/const candidate=cameraPlacementPose\(view,shopPose(?:,'lot')?\)/);
  assert.doesNotMatch(game,/const shopCameraAnchor=/);
  assert.match(game,/const moveShopPreviewToCamera=\(force=false\)=>\{/);
  assert.match(game,/lastShopCameraPreviewAt<100/);
  assert.match(game,/if\(shopOpen&&shopPlacing&&shopSelected\)\{/);
  assert.match(game,/if\(!shopOpen\)\{shopPlacing=false;shopPose=null;shopManualPose=false;shopSwipeRawPose=null;\}/);
  assert.match(html,/id="furnish-place-cancel"/);
  assert.match(html,/id="furnish-buy" type="button">Купить<\/button>/);
  assert.match(css,/\.furnish-shop\[data-placing="true"\] \.furnish-stock/);
  assert.match(css,/\.furniture-editor\[data-editor-view="shop"\]\[data-shop-placing="true"\]/);
});
