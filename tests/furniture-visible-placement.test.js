import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {cameraPlacementPose} from '../src/furniture-placement-preview.js';
import {newFurnitureWorld,FURNITURE_CATALOG,instanceRect} from '../src/furniture-catalog.js';
import {newFurnitureShop,buyMarketItem} from '../src/furniture-shop.js';
const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const game=source('../src/game.js'),css=source('../styles.css'),html=source('../index.html');

test('Camera-centered previews always yield visible finite floor pose even without screen ray',()=>{
  assert.deepEqual(cameraPlacementPose({centerX:0,centerZ:0}),{x:0,z:0,yaw:0});
  assert.deepEqual(cameraPlacementPose({centerX:2.33,centerZ:-1.62},{yaw:270}),
    {x:2.25,z:-1.5,yaw:270});
  assert.deepEqual(cameraPlacementPose({centerX:undefined,centerZ:NaN}),{x:0,z:0,yaw:0});
  assert.deepEqual(cameraPlacementPose({centerX:800,centerZ:-800},{yaw:90}),
    {x:13.25,z:-3.75,yaw:90});
  assert.ok(cameraPlacementPose({centerX:0,centerZ:0}).x!==null);
  const first=cameraPlacementPose({centerX:0,centerZ:0});
  const moved=cameraPlacementPose({centerX:2.5,centerZ:0.5},first);
  assert.notDeepEqual(first,moved,'sweeping camera moves item even when no ray intersects floor');
});

test('actual PlayCanvas prefab staging fragment enables a real clone at known non-null pose',()=>{
  const begin=game.indexOf('  const clearShopPreviewEntity=()=>{');
  const end=game.indexOf('  const renderMarket=()=>{',begin);
  assert.ok(begin>0&&end>begin);
  let cloneCalls=0,destroyCalls=0,added=0,meshAttachments=0;
  const obj=()=>({enabled:false,at:null,yaw:null,
    setPosition(x,y,z){this.at={x,y,z};},
    setEulerAngles(x,y,z){this.yaw=y;},
    destroy(){destroyCalls++;}
  });
  const template={clone(){cloneCalls++;return obj();}};
  const context={shopOpen:true,shopPlacing:true,shopSelected:'plant',shopSelectedItemId:'legacy.plant',
    shopPose:cameraPlacementPose({centerX:0,centerZ:0}),
    shopPreviewEntity:null,shopPreviewType:null,marketGhost:{enabled:false},
    decorTemplates:new Map([['plant',template]]),app:{root:{addChild(){added++;}}},applySkuModel(){},
    meshyFurnitureDisplaySku:()=>null,meshyFurniture:{attach(){meshAttachments++;}}};
  const block=game.slice(begin,end);
  runInNewContext('(()=>{'+block+'\nsyncShopPreviewEntity();})()',context,{timeout:1000});
  assert.equal(cloneCalls,1);
  assert.equal(added,1);
  assert.equal(context.shopPreviewEntity.enabled,true);
  assert.equal(context.shopPreviewEntity.at.x,0);
  assert.equal(context.shopPreviewEntity.at.z,0);
  assert.equal(context.shopPreviewType,'plant|legacy.plant');
  assert.equal(meshAttachments,1);
  // Moving the camera never generates a second copy.
  context.shopPose=cameraPlacementPose({centerX:-2,centerZ:1},context.shopPose);
  runInNewContext('(()=>{'+block+'\nsyncShopPreviewEntity();})()',context,{timeout:1000});
  assert.equal(cloneCalls,1);
  assert.equal(context.shopPreviewEntity.at.x,-2);
  assert.equal(context.shopPreviewEntity.at.z,1);
  // Cancelling removes the floating instance rather than mutating home.
  context.shopPlacing=false;
  runInNewContext('(()=>{'+block+'\nsyncShopPreviewEntity();})()',context,{timeout:1000});
  assert.equal(destroyCalls,1);
  assert.equal(context.shopPreviewEntity,null);
});

test('renderMarket visibly selects exactly one card and enables valid 3D placement',()=>{
  const begin=game.indexOf('  const renderMarket=()=>{');
  const end=game.indexOf('  const renderWarehouse=()=>{',begin);
  assert.ok(begin>0&&end>begin);
  const makeEl=()=>({hidden:false,dataset:{},attrs:{},textContent:'',disabled:false,
    setAttribute(k,v){this.attrs[k]=v;},replaceChildren(){}});
  const selectedMark={hidden:true},otherMark={hidden:false};
  function card(type,mark){
    const c=makeEl(),classes=new Set();
    c.dataset.prefabId=type;c.dataset.itemId='legacy.'+type;
    c.classList={toggle(key,active){if(active)classes.add(key);else classes.delete(key);},
      contains(key){return classes.has(key);}};
    c.querySelector=()=>mark;
    return c;
  }
  const plant=card('plant',selectedMark),table=card('table',otherMark);
  const elements=new Map();
  for(const id of ['furnish-shop','furnish-warehouse','furnish-shop-toggle',
    'furnish-warehouse-toggle','furnish-edit-toggle','furniture-editor',
    'furnish-placement-guide','furnish-placing-name','furnish-placing-status',
    'furnish-place-cancel','furnish-placement-controls','furnish-preview',
    'furnish-buy','furnish-preview-turn','furnish-stock','hint',
    'furnish-variant-compare','furnish-variant-rows'])
    elements.set(id,makeEl());
  elements.get('furnish-stock').querySelectorAll=()=>[plant,table];
  const pos=cameraPlacementPose({centerX:0,centerZ:0});
  const visual={enabled:false,render:{material:null},setPosition(){},setLocalScale(){}};
  const state={
    $:key=>elements.get(key),shopOpen:true,warehouseOpen:false,oneFingerMode:'pan',
    shopSelected:'plant',shopSelectedItemId:'legacy.plant',shopPlacing:true,shopPose:pos,
    shopListings:[{itemId:'legacy.plant',name:'Растение',prefabId:'plant',price:130}],
    game:{world:{furniture:newFurnitureWorld()},shop:newFurnitureShop()},
    buyMarketItem,editorContext:()=>({residents:[]}),editorMessage:r=>r,
    shopPreviewEntity:{enabled:true},syncShopPreviewEntity(){},
    marketGhost:visual,instanceRect,FURNITURE_CATALOG,MOUNTED_LIGHTS:{},
    ghostValid:{kind:'valid'},ghostInvalid:{kind:'invalid'},furnishMode:true,
    shopRoomCategory:null,shopFunctionCategory:null,
    shopTypeCategory:null,shopSearchText:'',
    selectShopCatalog:()=>[] // placement hides variants but still computes visible filters
  };
  runInNewContext('(()=>{'+game.slice(begin,end)+'\nrenderMarket();})()',state,{timeout:1500});
  assert.equal(plant.attrs['aria-pressed'],'true');
  assert.equal(table.attrs['aria-pressed'],'false');
  assert.equal(plant.classList.contains('selected-product'),true);
  assert.equal(table.classList.contains('selected-product'),false);
  assert.equal(selectedMark.hidden,false);
  assert.equal(otherMark.hidden,true);
  assert.equal(elements.get('furnish-placement-guide').hidden,false);
  assert.equal(elements.get('furnish-placing-name').textContent,'Растение');
  assert.equal(visual.enabled,true,'placement outline must show after Buy');
  assert.equal(elements.get('furnish-preview-turn').disabled,false);
  assert.match(elements.get('furnish-buy').textContent,/Купить и установить/);
});
test('shop selection and placement guidance is clear even when card list collapses',()=>{
  assert.match(game,/button.classList.toggle\('selected-product',active\)/);
  assert.match(game,/shopPose=candidate;shopManualPose=false;renderMarket\(\)/);
  assert.match(html,/id="furnish-placement-guide"/);
  assert.match(html,/id="furnish-placing-name"/);
  assert.match(css,/#furnish-stock > button.selected-product/);
  assert.match(css,/\.furnish-placement-guide\[hidden\]\{display:none!important;/);
  assert.match(css,/\.furnish-selected-mark\[hidden\]\{display:none!important;/);
});

// Regression for the real Safari crash: a fake test DOM once contained an ID
// that the shipped HTML lacked. renderMarket() threw before selection or cloning.
test('all literal DOM selectors in live game code resolve to real HTML IDs',()=>{
  const ids=[...new Set([...game.matchAll(/\$\('([^']+)'\)/g)].map(match=>match[1]))];
  assert.ok(ids.length>80,'guard must cover the full running UI, not just shop stubs');
  for(const id of ids)assert.ok(html.includes('id="'+id+'"'),
    'Missing live DOM target #'+id+' (JavaScript would throw and abort the editor)');
  assert.match(html,/id="furnish-placement-controls" class="furnish-placement-controls"/);
});
