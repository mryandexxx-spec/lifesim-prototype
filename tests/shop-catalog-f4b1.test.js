import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';
import {createObjectRegistry} from '../src/object-definition-registry.js';
import {legacyObjectRegistry} from '../src/object-legacy-adapter.js';
import {shopCategoryOptions,selectShopCatalog} from '../src/shop-catalog-selector.js';
import {SHOP_ITEMS,marketListing,newFurnitureShop,buyMarketItem} from '../src/furniture-shop.js';
import {newFurnitureWorld} from '../src/furniture-catalog.js';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const originalNine=marketListing().slice(0,9);
const legacyCatalog=(opts={})=>selectShopCatalog({offers:originalNine,...opts});
const legacyOptions=(facet,opts={})=>shopCategoryOptions(facet,{offers:originalNine,...opts});

test('F4b1 selector uses SKU definitions for the six real offers, keeps legacy order and prices',()=>{
  const list=legacyCatalog(),old=originalNine,registry=legacyObjectRegistry();
  assert.deepEqual(list.slice(0,6).map(x=>x.prefabId),SHOP_ITEMS.map(x=>x.prefabId));
  assert.equal(list.length,9);
  assert.deepEqual(list.map(x=>x.price),old.map(x=>x.price));
  assert.deepEqual(list.map(x=>x.name),old.map(x=>x.name));
  assert.deepEqual(list.map(x=>x.effectText),old.map(x=>x.effectText));
  for(const item of list){
    assert.ok(item.itemId==='legacy.'+item.prefabId||item.itemId==='plant.amber'||
      item.itemId==='bookcase.starter'||item.itemId==='sofa.comfort');
    assert.deepEqual(item.categoryIds,registry.items[item.itemId].categoryIds);
    assert.ok(Object.isFrozen(item.categoryIds));
    if(item.itemId==='sofa.comfort')assert.equal(registry.items[item.itemId].effects[0].statId,'needs.energy');
    else assert.deepEqual(registry.items[item.itemId].effects,[]);
  }
});
test('F4b1 category choices come from sellable registry items, not all household fixtures',()=>{
  const rooms=legacyOptions('room'),functions=legacyOptions('function');
  assert.deepEqual(rooms.map(x=>x.id),['room.bedroom','room.living','room.decor']);
  assert.deepEqual(rooms.map(x=>x.label),['Спальня','Гостиная','Декор']);
  assert.deepEqual(functions.map(x=>x.id),
    ['function.sleep','function.decor','function.surface','function.relax','function.tv.watch',
    'function.books.borrow']);
  assert.equal(functions.find(x=>x.id==='function.decor').label,'Украшения');
  assert.equal(legacyOptions('style').length,0);
  assert.equal(rooms.some(x=>x.id==='room.bathroom'),false);
  assert.equal(functions.some(x=>x.id==='function.hygiene.shower'),false);
});
test('F4b1 room category switches available products without altering shopping inventory',()=>{
  assert.deepEqual(legacyCatalog({roomCategoryId:'room.bedroom'}).map(x=>x.prefabId),
    ['nightstand','bed']);
  assert.deepEqual(legacyCatalog({roomCategoryId:'room.living'}).map(x=>x.prefabId),
    ['table','tv','sofa','bookcase','sofa']);
  assert.deepEqual(legacyCatalog({roomCategoryId:'room.decor'}).map(x=>x.prefabId),
    ['plant','plant']);
  assert.equal(SHOP_ITEMS.length,6);
});
test('F4b1 function filters support multiple SKU with same capability',()=>{
  assert.deepEqual(legacyCatalog({functionCategoryId:'function.decor'}).map(x=>x.prefabId),
    ['plant','nightstand','plant']);
  assert.deepEqual(legacyCatalog({functionCategoryId:'function.surface'}).map(x=>x.prefabId),
    ['table']);
  assert.deepEqual(legacyCatalog({functionCategoryId:'function.relax'}).map(x=>x.prefabId),
    ['sofa','sofa']);
  assert.deepEqual(legacyCatalog({functionCategoryId:'function.sleep'}).map(x=>x.prefabId),
    ['bed']);
});
test('F4b1 room and function combine with AND; unknown/empty does not buy hidden furniture',()=>{
  assert.deepEqual(legacyCatalog({roomCategoryId:'room.bedroom',
    functionCategoryId:'function.decor'}).map(x=>x.prefabId),['nightstand']);
  assert.deepEqual(legacyCatalog({roomCategoryId:'room.bedroom',
    functionCategoryId:'function.tv.watch'}),[]);
  assert.deepEqual(legacyCatalog({roomCategoryId:'room.garage'}),[]);
  assert.deepEqual(legacyCatalog({functionCategoryId:'function.unknown'}),[]);
  const world=newFurnitureWorld(),wallet=newFurnitureShop();
  assert.equal(wallet.credits,5000);
  assert.equal(world.instances.length,10);
  const bad=buyMarketItem(world,wallet,'bed',{x:100,z:100,yaw:0});
  assert.equal(bad.ok,false);
  assert.equal(wallet.credits,5000);
});
test('F4b1 data-driven future category and SKU works with shared prefab and different price',()=>{
  const registry=createObjectRegistry({
    categories:[
      {id:'room.studio',label:'Мастерская',facet:'room'},
      {id:'function.creative',label:'Творчество',facet:'function'}
    ],
    items:[{id:'table.drawing',prefabId:'table',rendererKey:'table',
      name:'Стол для рисунков',categoryIds:['room.studio','function.creative'],
      capabilities:['surface'],ratings:{},effects:[],price:450}]
  });
  const offers=[{itemId:'table.drawing',prefabId:'table',name:'Старое имя',
    price:250,effectText:'Рабочая поверхность'}];
  const picked=legacyCatalog({registry,offers,roomCategoryId:'room.studio',
    functionCategoryId:'function.creative'});
  assert.equal(picked.length,1);
  assert.equal(picked[0].name,'Стол для рисунков');
  assert.equal(picked[0].price,450);
  assert.equal(picked[0].prefabId,'table');
  assert.deepEqual(legacyOptions('room',{registry,offers}),
    [{id:'room.studio',label:'Мастерская'}]);
  assert.deepEqual(legacyOptions('function',{registry,offers}),
    [{id:'function.creative',label:'Творчество'}]);
  // This is selector-only! F4b2, not F4b1, would enable a price-450 transaction.
});
test('F4b1 never exposes a registry-only, missing or mismatched product for purchase',()=>{
  const registry=legacyObjectRegistry();
  assert.deepEqual(legacyCatalog({registry,offers:[
    {itemId:'legacy.fridge',prefabId:'bed',price:1},
    {itemId:'unknown.item',prefabId:'sofa',price:1},
    {prefabId:'kitchen-machine',price:1}
  ]}),[]);
  assert.equal(legacyCatalog({registry,offers:[]}).length,0);
  assert.equal(legacyCatalog({registry}).length,9);
});
test('F4b1 real Safari shop has native two-facet filters, count and safe empty state',()=>{
  const html=read('../index.html'),css=read('../styles.css'),game=read('../src/game.js');
  for(const id of ['furnish-catalog-filters','furnish-room-filter',
    'furnish-function-filter','furnish-filter-count','furnish-filter-empty'])
    assert.match(html,new RegExp('id="'+id+'"'),id);
  assert.match(html,/select id="furnish-room-filter"/);
  assert.match(html,/select id="furnish-function-filter"/);
  assert.match(game,/const shopListings=selectShopCatalog\(\)/);
  assert.match(game,/shopCategoryOptions\(facet\)/);
  assert.match(game,/button\.hidden=!ids\.has\(button\.dataset\.itemId\)/);
  assert.match(game,/if\(!shopPlacing&&!visible\.some\(item=>item\.itemId===shopSelectedItemId\)\)/);
  assert.match(game,/shopRoomCategory=event\.currentTarget\.value\|\|null/);
  assert.match(game,/shopFunctionCategory=event\.currentTarget\.value\|\|null/);
  assert.match(game,/if\(shopOpen\)renderShopFilteredItems\(\);\s*else renderMarket\(\);/);
  assert.match(css,/\.furnish-catalog-filters\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.furnish-stock button\[hidden\]\{display:none!important;/);
  assert.match(css,/\.furnish-shop\[data-placing="true"\] \.furnish-catalog-filters/);
  assert.doesNotMatch(html,/id="furnish-items"/);
});
test('F4b1 Pages packages registry selector, mobile build version and leaves save schemas intact',()=>{
  const workflow=read('../.github/workflows/pages.yml'),html=read('../index.html');
  const pkg=JSON.parse(read('../package.json'));
  assert.match(workflow,/node --check src\/shop-catalog-selector\.js/);
  assert.match(workflow,/cp src\/object-definition-registry\.js src\/object-effect-engine\.js src\/object-legacy-adapter\.js src\/shop-catalog-selector\.js site\/src\//);
  assert.match(html,/src\/game\.js\?v=1\.2t/);
  assert.match(html,/styles\.css\?v=1\.2t/);
  assert.equal(pkg.version,'1.0.0-alpha.72');
  assert.deepEqual(newFurnitureShop(),{schema:1,credits:5000,nextId:1});
  assert.equal(newFurnitureWorld().schema,1);
});

test('F4b1 DOM filtering hides wrong cards and reselects an offered item',()=>{
  const game=read('../src/game.js');
  const start=game.indexOf('  const renderShopFilteredItems=()=>{');
  const end=game.indexOf("  $('furnish-room-filter').addEventListener",start);
  assert.ok(start>0&&end>start);
  const fragment=game.slice(start,end);
  const buttons=legacyCatalog().map(item=>({
    dataset:{itemId:item.itemId},hidden:false
  }));
  const elements=new Map([
    ['furnish-stock',{querySelectorAll:()=>buttons,setAttribute(k,v){this[k]=v;}}],
    ['furnish-filter-count',{textContent:''}],
    ['furnish-filter-empty',{hidden:true}]
  ]);
  let redraws=0,clears=0;
  const ctx={
    $:id=>elements.get(id),selectShopCatalog:legacyCatalog,shopListings:legacyCatalog(),
    shopRoomCategory:'room.bedroom',shopFunctionCategory:null,
    shopTypeCategory:null,shopSearchText:'',typeTabs:{querySelectorAll:()=>[]},
    shopPlacing:false,shopSelected:'plant',shopSelectedItemId:'legacy.plant',shopPose:{x:1,z:2,yaw:0},
    shopManualPose:true,shopSwipeRawPose:{x:1,z:2},
    clearShopPreviewEntity:()=>{clears++;},
    renderMarket:()=>{redraws++;}
  };
  const run=()=>runInNewContext('(()=>{'+fragment+'\nrenderShopFilteredItems();})()',ctx,{timeout:1000});
  run();
  assert.equal(ctx.shopSelected,'nightstand');
  assert.equal(buttons.filter(b=>!b.hidden).length,2);
  assert.equal(elements.get('furnish-filter-count').textContent,'Показано 2 из 9');
  assert.equal(elements.get('furnish-filter-empty').hidden,true);
  assert.equal(ctx.shopPose,null);
  assert.equal(ctx.shopManualPose,false);
  assert.equal(clears,1);
  ctx.shopFunctionCategory='function.tv.watch';
  run();
  assert.ok(buttons.every(b=>b.hidden));
  assert.equal(ctx.shopSelected,null);
  assert.equal(elements.get('furnish-filter-empty').hidden,false);
  assert.equal(elements.get('furnish-filter-count').textContent,'Показано 0 из 9');
  ctx.shopRoomCategory=null;ctx.shopFunctionCategory=null;
  run();
  assert.equal(ctx.shopSelected,'plant');
  assert.ok(buttons.every(b=>!b.hidden));
  assert.equal(redraws,3);
});
