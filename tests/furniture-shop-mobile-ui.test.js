import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newFurnitureWorld} from '../src/furniture-catalog.js';
import {SHOP_ITEMS,newFurnitureShop,findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=source('../index.html'),game=source('../src/game.js'),css=source('../styles.css');
const people={residents:[{x:-.8,z:2.95},{x:-.25,z:.35}]};

test('F2.1 UX all four items are purchasable via one catalog, not only plants',()=>{
  assert.deepEqual(SHOP_ITEMS.map(p=>p.prefabId),['plant','table','nightstand','tv']);
  assert.match(game,/for\(const item of shopListings\)\{/);
  assert.match(game,/button\.append\(name,cost\)/);
  for(const item of SHOP_ITEMS){
    assert.ok(item.price>0);
    const free=findMarketPlacement(newFurnitureWorld(),newFurnitureShop(),item.prefabId,people);
    // If no preset is free, the player still may tap a free location on the 3D floor.
    assert.ok(free===null||[0,90,180,270].includes(free.yaw));
  }
});
test('F2.1 mobile shop occupies the existing editor surface, not an inner scrolling popup',()=>{
  for(const id of ['furnish-edit-toggle','furnish-shop-toggle','furnish-warehouse-toggle',
    'furnish-stock','furnish-preview','furnish-preview-turn','furnish-preview-auto',
    'furnish-buy','furnish-storage-list','furnish-balance'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.doesNotMatch(html,/id="furnish-items"/);
  for(const old of ['furnish-left','furnish-right','furnish-up','furnish-down'])
    assert.ok(!html.includes('id="'+old+'"'),old);
  assert.match(css,/\.furnish-stock\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.furnish-shop\{display:grid;[\s\S]*?overflow:visible;/);
  assert.match(css,/\.furnish-shop\[hidden\],\.furnish-warehouse\[hidden\],\.furnish-commands\[hidden\]\{display:none!important;/);
});
test('F2.1 camera orbit/pan switch stays visible and entering shop defaults to pan',()=>{
  assert.match(html,/id="rotate-camera-btn"/);
  assert.match(css,/\.control-tray > button:not\(#furnish-toggle\):not\(#rotate-camera-btn\):not\(#reset-camera-btn\)/);
  assert.match(css,/display:none!important;/);
  assert.match(css,/\.app-shell\[data-furnish-mode="true"\] #rotate-camera-btn/);
  assert.match(game,/shopPreviousCameraMode=oneFingerMode;\s*oneFingerMode='pan';showCameraMode\(\)/);
  assert.match(game,/oneFingerMode=shopPreviousCameraMode;showCameraMode\(\)/);
  assert.match(game,/rotateButton\.addEventListener\('click'/);
  assert.match(game,/oneFinger:oneFingerMode/);
});
test('F2.1 purchase preview is a real validatable 3D tap with red blocked place, never a charge',()=>{
  assert.match(game,/if\(shopOpen&&shopPlacing&&shopSelected\)\{\s*const floor=editorFloorAt\(pos\)/);
  assert.match(game,/shopPose=\{x:snapFurnitureCoordinate\(floor\.x\),z:snapFurnitureCoordinate\(floor\.z\)/);
  assert.match(game,/shopManualPose=true;renderMarket\(\)/);
  assert.match(game,/const preview=listing&&shopPose\s*\?buyMarketItem/);
  assert.match(game,/marketGhost\.render\.material=suitable\?ghostValid:ghostInvalid/);
  assert.match(game,/\$\('furnish-buy'\)\.disabled=shopPlacing\?!suitable/);
  assert.match(game,/shopPose=\{\.\.\.shopPose,yaw:\(shopPose\.yaw\+90\)%360\}/);
  const w=newFurnitureWorld(),s=newFurnitureShop();
  const preview=buyMarketItem(w,s,'plant',{x:100,z:100,yaw:0},people);
  assert.equal(preview.ok,false);
  assert.equal(s.credits,5000);
  assert.equal(w.instances.length,10);
});
test('F2.1 selections come only from scene rays; warehouse has its own stored-item list',()=>{
  assert.match(game,/if\(shopOpen\|\|warehouseOpen\|\|!selectable\)furnitureGhost.enabled=false/);
  assert.match(game,/const editorFurnitureAt=pos=>/);
  assert.match(game,/chooseFurniture\(editorFurnitureAt\(pos\)\)/);
  assert.match(game,/shopOpen\|\|warehouseOpen\|\|cameraGesture\.count\(\)!==1/);
  assert.match(game,/const renderWarehouse=\(\)=>\{/);
  assert.match(game,/item\.location==='storage'/);
  assert.match(game,/const restore=document\.createElement\('button'\)/);
  assert.match(game,/const sell=document\.createElement\('button'\)/);
  assert.doesNotMatch(game,/renderFurnitureItems/);
});
