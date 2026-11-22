import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createObjectRegistry} from '../src/object-definition-registry.js';
import {legacyObjectRegistry} from '../src/object-legacy-adapter.js';
import {describeObjectQualities,shopQualitySummary} from '../src/object-quality-presentation.js';
import {selectShopCatalog} from '../src/shop-catalog-selector.js';
import {newHousehold,tickHousehold,loadHousehold} from '../src/household.js';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('F4b6: measured quality describes ONLY actual authored effects, no fake tier',()=>{
  const registry=legacyObjectRegistry();
  const enhanced=describeObjectQualities(registry,'sofa.comfort');
  assert.equal(enhanced.itemId,'sofa.comfort');
  assert.deepEqual(enhanced.properties,['Отдых']);
  assert.deepEqual(enhanced.ratings,[]);
  assert.equal(enhanced.effects.length,1);
  assert.equal(enhanced.effects[0].amount,0.2);
  assert.match(shopQualitySummary(enhanced),/Энергия \+0,2\/мин/);
  assert.equal(enhanced.hasMeasuredQuality,true);
  assert.equal(shopQualitySummary(describeObjectQualities(registry,'legacy.sofa')),'');
  assert.equal(shopQualitySummary(describeObjectQualities(registry,'plant.amber')),'');
  assert.equal(describeObjectQualities(registry,'unknown.variant'),null);
  assert.equal(shopQualitySummary(null),'');
});
test('F4b6: future quality dimensions/ratings are defined by registry, not product switches',()=>{
  const r=createObjectRegistry({
    categories:[{id:'room.test',facet:'room',label:'Комната'},
      {id:'function.test',facet:'function',label:'Игра'}],
    attributes:[{id:'comfort',label:'Комфорт',min:0,max:5},
      {id:'quietness',label:'Тишина',min:0,max:10}],
    stats:[{id:'needs.fun',min:0,max:100,label:'Досуг'}],
    triggers:[{id:'item.use.tick'}],
    items:[{id:'custom.device',prefabId:'device',name:'Устройство',rendererKey:'device',
      categoryIds:['room.test','function.test'],capabilities:['games'],
      ratings:{comfort:4,quietness:7},
      effects:[{id:'relax',trigger:'item.use.tick',statId:'needs.fun',amount:1.25,
        mode:'perMinute',actionId:'game',stacking:'highest',group:'fun'}]}]
  });
  const q=describeObjectQualities(r,'custom.device');
  assert.deepEqual(q.ratings.map(x=>x.id),['comfort','quietness']);
  assert.deepEqual(q.properties,['Игра']);
  assert.equal(q.ratings[0].max,5);
  assert.match(shopQualitySummary(q),/Комфорт: 4/);
  assert.match(shopQualitySummary(q),/Тишина: 7/);
  assert.match(shopQualitySummary(q),/Досуг \+1,25\/мин/);
  assert.ok(Object.isFrozen(q));
  assert.ok(Object.isFrozen(q.effects[0]));
});
test('F4b6: all nine live offers have safe descriptions and only true sofa perk',()=>{
  const r=legacyObjectRegistry(),offers=selectShopCatalog();
  assert.equal(offers.length,82);
  for(const offer of offers){
    const quality=describeObjectQualities(r,offer.itemId);
    assert.equal(quality.itemId,offer.itemId);
    assert.equal(quality.hasMeasuredQuality,offer.itemId==='sofa.comfort');
    assert.equal(offer.price,r.items[offer.itemId].price);
  }
});
test('F4b6: presentation is pure and does not change savings, wallet or actual action',()=>{
  const game=newHousehold(),previous=JSON.stringify(game);
  const before=game.shop.credits;
  for(let i=0;i<100;i++)shopQualitySummary(describeObjectQualities(legacyObjectRegistry(),'sofa.comfort'));
  assert.equal(JSON.stringify(game),previous);
  assert.equal(game.shop.credits,before);
  const restored=loadHousehold(JSON.parse(previous));
  assert.equal(restored.shop.credits,before);
  assert.equal(restored.version,1);
});
test('F4b6: no new per-item conditions or unshipped Safari quality dependency',()=>{
  const code=read('../src/game.js'),pages=read('../.github/workflows/pages.yml');
  const css=read('../styles.css');
  assert.match(code,/describeObjectQualities\(shopQualityRegistry,item\.itemId\)/);
  assert.match(code,/quality\.textContent=qualitySummary/);
  assert.match(code,/if\(qualitySummary\)button\.append\(quality\)/);
  assert.match(pages,/node --check src\/object-quality-presentation\.js/);
  assert.match(pages,/cp src\/object-use-runtime\.js src\/object-quality-presentation\.js src\/object-quality-comparison\.js site\/src\//);
  assert.match(css,/\.furnish-product-quality\{/);
  assert.doesNotMatch(code,/if\(item\.itemId==='sofa\.comfort'\)/);
});
