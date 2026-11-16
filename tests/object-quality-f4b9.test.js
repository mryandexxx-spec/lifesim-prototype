import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createObjectRegistry} from '../src/object-definition-registry.js';
import {compareShopVariants,chooseComparableVariant,formatShopVariantComparison}
  from '../src/object-quality-comparison.js';
import {legacyObjectRegistry} from '../src/object-legacy-adapter.js';
import {selectShopCatalog} from '../src/shop-catalog-selector.js';
import {newHousehold,loadHousehold} from '../src/household.js';

const offers=selectShopCatalog(),registry=legacyObjectRegistry();
function custom(effectsA,effectsB){
  return createObjectRegistry({stats:[{id:'needs.energy',label:'Энергия',min:0,max:100}],
    triggers:[{id:'item.use.tick'},{id:'item.use.complete'}],
    items:[{id:'test.a',name:'First',prefabId:'sofa',effects:effectsA},
      {id:'test.b',name:'Second',prefabId:'sofa',effects:effectsB}]
  });
}
const bonus=(id,amount,{group='rest',stacking='highest',trigger='item.use.tick',
  mode='perMinute',actionId='sofa'}={})=>({
  id,statId:'needs.energy',amount,trigger,mode,actionId,group,stacking
});
const fakeOffers=[{itemId:'test.a',prefabId:'sofa',price:200},
  {itemId:'test.b',prefabId:'sofa',price:250}];

test('F4b9: existing sofa real difference and cosmetic plant difference remain unchanged',()=>{
  const sofa=compareShopVariants(registry,offers,'legacy.sofa')[0];
  assert.equal(sofa.effectDeltas[0].delta,0.2);
  assert.equal(sofa.effectConditionsDifferent,false);
  assert.match(formatShopVariantComparison(sofa),/Энергия \+0,2\/мин/);
  const plant=compareShopVariants(registry,offers,'legacy.plant')[0];
  assert.equal(plant.effectConditionsDifferent,false);
  assert.equal(plant.effectDeltas.length,0);
  assert.equal(plant.appearanceDifferent,true);
});
test('F4b9: direct variant selection only for offered, same-prefab, visible SKU',()=>{
  assert.equal(chooseComparableVariant(registry,offers,'legacy.sofa','sofa.comfort'),'sofa.comfort');
  assert.equal(chooseComparableVariant(registry,offers,'legacy.sofa','legacy.plant'),null);
  assert.equal(chooseComparableVariant(registry,offers,'legacy.sofa','legacy.sofa'),null);
  assert.equal(chooseComparableVariant(registry,offers.filter(x=>x.itemId!=='sofa.comfort'),
    'legacy.sofa','sofa.comfort'),null);
  assert.equal(chooseComparableVariant(registry,offers,'legacy.sofa','evil.sofa'),null);
});
test('F4b9: comparable matching policy compares numeric value, not authored effect id',()=>{
  const r=custom([bonus('old',0.12)],[bonus('new',0.4)]);
  const item=compareShopVariants(r,fakeOffers,'test.a')[0];
  assert.equal(item.effectDeltas[0].delta,0.28);
  assert.equal(item.effectConditionsDifferent,false);
});
test('F4b9: different stacking or groups are NOT subtracted as identical effects',()=>{
  for(const opts of [{stacking:'sum'},{group:'other'}]){
    const r=custom([bonus('old',0.15)],[bonus('new',0.7,opts)]);
    const item=compareShopVariants(r,fakeOffers,'test.a')[0];
    assert.deepEqual(item.effectDeltas,[]);
    assert.equal(item.effectConditionsDifferent,true);
    assert.match(formatShopVariantComparison(item),/условия бонусов различаются/);
  }
});
test('F4b9: overlapping declarations fail closed rather than map last-write wins',()=>{
  const r=custom([bonus('old',0.12)],
    [bonus('new-a',0.2),bonus('new-b',0.4)]);
  const item=compareShopVariants(r,fakeOffers,'test.a')[0];
  assert.equal(item.effectDeltas.length,0);
  assert.equal(item.effectConditionsDifferent,true);
});
test('F4b9: different triggers, action and mode are distinct truthful facts',()=>{
  const old=bonus('old',1,{trigger:'item.use.complete',mode:'once'});
  const newEffect=bonus('new',0.3);
  const r=custom([old],[newEffect]);
  const item=compareShopVariants(r,fakeOffers,'test.a')[0];
  assert.equal(item.effectDeltas.length,2);
  assert.equal(item.effectConditionsDifferent,false);
  assert.ok(item.effectDeltas.some(x=>x.delta===-1));
  assert.ok(item.effectDeltas.some(x=>x.delta===0.3));
});
test('F4b9: comparison and switching do not alter v1 save, wallet or H1n reader',()=>{
  const home=newHousehold(),snapshot=JSON.stringify(home);
  for(let i=0;i<50;i++)chooseComparableVariant(registry,offers,'legacy.sofa','sofa.comfort');
  assert.equal(JSON.stringify(home),snapshot);
  assert.equal(loadHousehold(JSON.parse(snapshot)).version,1);
  assert.deepEqual(home.objectOnceLedger.entries,[]);
  assert.ok('readingStage' in (home.action||{})===false);
});
test('F4b9: Safari markup has real variant buttons, filter guard, no purchase on tap',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(game,/chooseComparableVariant\(shopQualityRegistry,currentVisible,/);
  assert.match(game,/if\(!furnishMode\|\|!shopOpen\|\|shopPlacing\)return/);
  assert.match(game,/selectVariant\.textContent='Выбрать вариант'/);
  assert.match(game,/chooseShopProduct\(id\)/);
  assert.doesNotMatch(game,/selectVariant\.addEventListener\('click',[\s\S]{0,800}buyMarketItem\(/);
  assert.match(css,/\.furnish-variant-select\{/);
  assert.match(html,/1\.2u-h2/);
  assert.match(pages,/node --check src\/object-quality-comparison\.js/);
  assert.match(pages,/src\/object-quality-comparison\.js site\/src\//);
});


test('F4b9: actual browser renderMarket button selects real visible SKU without spending credits',async()=>{
  const {runInNewContext}=await import('node:vm');
  const {newFurnitureShop}=await import('../src/furniture-shop.js');
  const {newFurnitureWorld}=await import('../src/furniture-catalog.js');
  const gameCode=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const start=gameCode.indexOf('  const renderMarket=()=>{'),stop=gameCode.indexOf('  const renderWarehouse=()=>{',start);
  assert.ok(start>0&&stop>start);
  const makeEl=()=>({
    hidden:false,dataset:{},attrs:{},children:[],textContent:'',disabled:false,
    setAttribute(k,v){this.attrs[k]=v;},
    replaceChildren(...nodes){this.children=[...nodes];},
    append(...nodes){this.children.push(...nodes);},
    addEventListener(k,fn){this['on'+k]=fn;},
    focus(){this.focused=true;}
  });
  const elements=new Map();
  for(const id of ['hint','furnish-shop','furnish-warehouse','furnish-shop-toggle',
    'furnish-warehouse-toggle','furnish-edit-toggle','furniture-editor',
    'furnish-placement-guide','furnish-place-cancel','furnish-placement-controls',
    'furnish-stock','furnish-variant-compare','furnish-variant-rows',
    'furnish-placing-name','furnish-placing-status','furnish-preview','furnish-buy',
    'furnish-preview-turn'])elements.set(id,makeEl());
  const buttons=offers.filter(x=>x.prefabId==='sofa').map(item=>{
    const button=makeEl();button.dataset.itemId=item.itemId;
    const mark=makeEl();
    button.classList={toggle(){}};
    button.querySelector=()=>mark;
    return button;
  });
  elements.get('furnish-stock').querySelectorAll=()=>buttons;
  const state={
    $:id=>elements.get(id),document:{createElement:()=>makeEl()},
    shopOpen:true,warehouseOpen:false,shopPlacing:false,furnishMode:true,
    shopSelected:'sofa',shopSelectedItemId:'legacy.sofa',
    shopRoomCategory:null,shopFunctionCategory:null,
    oneFingerMode:'pan',showCameraMode(){},shopPose:null,
    marketGhost:{enabled:false},shopListings:offers,shopQualityRegistry:registry,
    selectShopCatalog,compareShopVariants,formatShopVariantComparison,chooseComparableVariant,
    game:{shop:newFurnitureShop(),world:{furniture:newFurnitureWorld()}},
    editorMessage:r=>r,syncShopPreviewEntity(){},clearShopPreviewEntity(){},
    chooseShopProduct(id){this.shopSelectedItemId=id;this.shopSelected='sofa';},
    // The actual code calls chooseShopProduct as a bare function.
    instanceRect(){},FURNITURE_CATALOG:{},ghostValid:{},ghostInvalid:{}
  };
  const selected=[];
  state.chooseShopProduct=id=>{selected.push(id);state.shopSelectedItemId=id;state.shopSelected='sofa';};
  runInNewContext('(()=>{'+gameCode.slice(start,stop)+'\nrenderMarket();})()',state,{timeout:1500});
  const panel=elements.get('furnish-variant-compare');
  const rows=elements.get('furnish-variant-rows');
  assert.equal(panel.hidden,false);
  assert.equal(rows.children.length,1);
  const pick=rows.children[0].children[1];
  assert.equal(pick.textContent,'Выбрать вариант');
  assert.match(pick.attrs['aria-label'],/Комфорт/);
  const initialCredits=state.game.shop.credits;
  state.shopPlacing=true;pick.onclick();assert.deepEqual(selected,[]);
  state.shopPlacing=false;
  state.selectShopCatalog=()=>offers.filter(x=>x.itemId==='legacy.sofa');
  pick.onclick();assert.deepEqual(selected,[],'stale button cannot select filtered-out SKU');
  state.selectShopCatalog=selectShopCatalog;
  pick.onclick();
  assert.deepEqual(selected,['sofa.comfort']);
  assert.equal(state.shopSelectedItemId,'sofa.comfort');
  assert.equal(state.game.shop.credits,initialCredits);
  assert.equal(state.shopPlacing,false);
  assert.equal(buttons.find(b=>b.dataset.itemId==='sofa.comfort').focused,true);
});
