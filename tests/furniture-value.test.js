import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FURNITURE_CATALOG} from '../src/furniture-catalog.js';
import {ACTIONS} from '../src/simulation.js';
import {SHOP_ITEMS,marketListing,newFurnitureShop,buyMarketItem} from '../src/furniture-shop.js';
import {newFurnitureWorld} from '../src/furniture-catalog.js';
import {describeFurnitureValue} from '../src/furniture-value.js';

test('F4a shop shows one honest use description for each of the six items',()=>{
  const listing=marketListing();
  assert.equal(listing.length,SHOP_ITEMS.length+2);
  for(const item of listing){
    assert.equal(typeof item.effectText,'string');
    assert.ok(item.effectText.length>6);
    assert.ok(['action','surface','decor'].includes(item.kind));
    if(SHOP_ITEMS.some(x=>x.prefabId===item.prefabId))
      assert.equal(item.price,SHOP_ITEMS.find(x=>x.prefabId===item.prefabId).price);
    else assert.ok(['plant.amber','bookcase.starter'].includes(item.itemId));
  }
});
test('F4a functional products reflect existing simulation needs, not invented buffs',()=>{
  for(const prefabId of ['tv','sofa','bed']){
    const actionId=FURNITURE_CATALOG[prefabId].actionId;
    const value=describeFurnitureValue(prefabId);
    assert.equal(value.kind,'action');
    assert.equal(value.need,ACTIONS[actionId].need);
    assert.ok(value.effectText.includes('→'));
  }
});
test('F4a surfaces and decor make no claim of permanent need gains',()=>{
  for(const prefabId of ['plant','table','nightstand']){
    const value=describeFurnitureValue(prefabId);
    assert.equal(value.need,null);
    assert.ok(['surface','decor'].includes(value.kind));
    assert.doesNotMatch(value.effectText,/\+[0-9]+|уровень качества|в час|доход/iu);
  }
  assert.equal(describeFurnitureValue('not-a-real-item'),null);
});
test('F4a applies consistently to original fixtures without making them shop offers',()=>{
  for(const name of ['fridge','shower','toilet','counter']){
    assert.ok(describeFurnitureValue(name));
    assert.equal(SHOP_ITEMS.some(x=>x.prefabId===name),false);
  }
});
test('F4a value metadata leaves trial economy and saved shop schema unaltered',()=>{
  const wallet=newFurnitureShop(),world=newFurnitureWorld();
  assert.deepEqual(wallet,{schema:1,credits:5000,nextId:1});
  const listing=marketListing();
  assert.deepEqual(listing.map(x=>x.price),[130,250,170,650,550,850,320,130]);
  const bad=buyMarketItem(world,wallet,'plant',{x:900,z:900,yaw:0});
  assert.equal(bad.ok,false);
  assert.equal(wallet.credits,5000);
  assert.equal(world.instances.length,10);
});
test('F4a production bundle contains the descriptor module and real card copy',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(workflow,/node --check src\/furniture-value\.js/);
  assert.match(workflow,/cp src\/furniture-shop\.js src\/furniture-value\.js site\/src\//);
  assert.match(ui,/effect\.textContent=item\.effectText/);
  assert.match(ui,/button\.append\(name,cost,effect,mark\)/);
  assert.match(css,/\.furnish-product-effect/);
  assert.match(html,/aria-label="Товары для покупки"/);
});
