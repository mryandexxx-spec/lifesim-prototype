import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createObjectRegistry} from '../src/object-definition-registry.js';
import {compareShopVariants,formatShopVariantComparison} from '../src/object-quality-comparison.js';
import {legacyObjectRegistry} from '../src/object-legacy-adapter.js';
import {selectShopCatalog} from '../src/shop-catalog-selector.js';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';

const registry=legacyObjectRegistry(),offers=selectShopCatalog();
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('F4b7 compare two sofas: only real extra energy, 150 credits and appearance',()=>{
  const base=compareShopVariants(registry,offers,'legacy.sofa');
  assert.equal(base.length,1);
  const comfort=base[0];
  assert.equal(comfort.itemId,'sofa.comfort');
  assert.equal(comfort.price,700);
  assert.equal(comfort.priceDifference,150);
  assert.equal(comfort.effectDeltas.length,1);
  assert.equal(comfort.effectDeltas[0].statId,'needs.energy');
  assert.equal(comfort.effectDeltas[0].delta,0.2);
  assert.equal(comfort.appearanceDifferent,true);
  assert.match(formatShopVariantComparison(comfort),/дороже на 150 кр/);
  assert.match(formatShopVariantComparison(comfort),/Энергия \+0,2\/мин/);
  assert.ok(Object.isFrozen(comfort));
  assert.ok(Object.isFrozen(base));
});
test('F4b7 reverse sofa difference is honest and never invents intrinsic quality score',()=>{
  const base=compareShopVariants(registry,offers,'sofa.comfort')[0];
  assert.equal(base.itemId,'legacy.sofa');
  assert.equal(base.priceDifference,-150);
  assert.equal(base.effectDeltas[0].delta,-0.2);
  assert.match(formatShopVariantComparison(base),/дешевле на 150 кр/);
  assert.match(formatShopVariantComparison(base),/Энергия -0,2\/мин/);
  assert.equal(base.ratingDeltas.length,0);
});
test('F4b7 plant comparison: cosmetic change has same price and no benefit',()=>{
  const amber=compareShopVariants(registry,offers,'legacy.plant')[0];
  assert.equal(amber.itemId,'plant.amber');
  assert.equal(amber.priceDifference,0);
  assert.equal(amber.effectDeltas.length,0);
  assert.equal(amber.appearanceDifferent,true);
  assert.match(formatShopVariantComparison(amber),/та же цена/);
  assert.match(formatShopVariantComparison(amber),/отличается оформление/);
  assert.equal(compareShopVariants(registry,offers,'legacy.bed').length,0);
});
test('F4b7 only compares real offered SKU of exactly the same prefab',()=>{
  assert.deepEqual(compareShopVariants(registry,offers,'made-up'),[]);
  assert.deepEqual(compareShopVariants(registry,offers,'legacy.sofa').map(x=>x.itemId),['sofa.comfort']);
  assert.deepEqual(compareShopVariants(registry,offers.filter(x=>x.itemId!=='sofa.comfort'),'legacy.sofa'),[]);
  assert.deepEqual(compareShopVariants(registry,[...offers,{itemId:'fake.sofa',prefabId:'sofa',price:10}],'legacy.sofa').map(x=>x.itemId),['sofa.comfort']);
  assert.deepEqual(compareShopVariants(registry,Array(1025).fill(offers[0]),'legacy.plant'),[]);
});
test('F4b7 optional numeric quality ratings compare only authored dimensions',()=>{
  const r=createObjectRegistry({
    attributes:[{id:'comfort',min:0,max:10,label:'Комфорт'},{id:'style',min:0,max:5,label:'Стиль'}],
    stats:[],triggers:[],categories:[],
    items:[
      {id:'sofa.basic',prefabId:'sofa',name:'Простой',ratings:{comfort:4}},
      {id:'sofa.better',prefabId:'sofa',name:'Улучшенный',ratings:{comfort:7,style:3}}
    ]
  });
  const options=[{itemId:'sofa.basic',prefabId:'sofa',price:200},
    {itemId:'sofa.better',prefabId:'sofa',price:290}];
  const compare=compareShopVariants(r,options,'sofa.basic')[0];
  assert.deepEqual(compare.ratingDeltas.map(x=>x.id),['comfort']);
  assert.equal(compare.ratingDeltas[0].delta,3);
  assert.equal(compare.priceDifference,90);
  assert.deepEqual(compare.effectDeltas,[]);
});
test('F4b7 shop comparison does not modify wallet, old v1 saves or bonus runtime',()=>{
  const state=newHousehold(),before=JSON.stringify(state);
  for(let i=0;i<100;i++)compareShopVariants(registry,offers,'sofa.comfort');
  assert.equal(JSON.stringify(state),before);
  assert.equal(loadHousehold(JSON.parse(before)).version,1);
  const sofa=state.world.furniture.instances.find(x=>x.prefabId==='sofa');
  sofa.itemDefinitionId='sofa.comfort';
  state.action={id:'sofa',phase:'using',elapsed:0,automatic:false,targetInstanceId:sofa.instanceId};
  state.needs.energy=50;
  tickHousehold(state,10);
  assert.equal(state.needs.energy,52);
});
test('F4b7 Pages ships comparison module, one panel, stable SKU and no gameplay switch',()=>{
  const pages=read('../.github/workflows/pages.yml'),html=read('../index.html'),
    game=read('../src/game.js'),css=read('../styles.css');
  assert.match(pages,/node --check src\/object-quality-comparison\.js/);
  assert.match(pages,/src\/object-quality-comparison\.js site\/src\//);
  assert.match(html,/id="furnish-variant-compare"/);
  assert.match(game,/compareShopVariants\(shopQualityRegistry,visibleShopListings,listing\.itemId\)/);
  assert.match(game,/formatShopVariantComparison\(other\)/);
  assert.match(css,/\.furnish-variant-compare\{/);
  assert.doesNotMatch(game,/if\(item\.itemId==='sofa\.comfort'\)/);
});
