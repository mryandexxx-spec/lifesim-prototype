import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold} from '../src/household.js';
import {fridgeViewModel,fridgeTab} from '../src/fridge-ui.js';
import {preparedKitchenMeals} from '../src/kitchen.js';
import {quoteReadyMeal} from '../src/ready-food.js';
import {quoteKitchenRestock} from '../src/kitchen-market.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('FRIDGE-UX-R2: approved A is three tabs, default to eat and no persistent UI state',()=>{
  assert.equal(fridgeTab(undefined),'eat');
  assert.deepEqual(['eat','stock','buy'].map(fridgeTab),['eat','stock','buy']);
  assert.equal(fridgeTab('unknown'),'eat');
  const root=newHousehold('2026-11-22');
  const before=JSON.stringify(root);
  const projection=fridgeViewModel(root,0);
  assert.deepEqual(projection.tabs,['eat','stock','buy']);
  assert.equal(typeof projection.credits,'number');
  assert.equal(JSON.stringify(root),before,'view model must not mutate save');
});

test('FRIDGE-UX-R2: prepared rows use real kitchen stock and never synthesize meals',()=>{
  const root=newHousehold('2026-11-22');
  const before=fridgeViewModel(root,0);
  assert.equal(before.meals.length,0);
  root.kitchen.prepared=[{recipeId:'cook.soup',portions:2,quality:'good'},
    {recipeId:'ready.sunny-grains',portions:1}];
  const actual=preparedKitchenMeals(root.kitchen);
  const projection=fridgeViewModel(root,0);
  assert.deepEqual(projection.meals.map(x=>x.recipeId),actual.map(x=>x.recipeId));
  assert.deepEqual(projection.meals.map(x=>x.portions),[2,1]);
  assert.equal(projection.stored,3);
  assert.equal(projection.capacity,12);
  assert.equal(projection.remaining,9);
});

test('FRIDGE-UX-R2: purchase state mirrors the canonical quotes; no new debits',()=>{
  const root=newHousehold('2026-11-22');
  const before=JSON.stringify(root);
  const projection=fridgeViewModel(root,0);
  for(const product of projection.ready){
    const quote=quoteReadyMeal(root,product.id,'fridge');
    assert.equal(product.price,product.id==='ready.sunny-grains'?18:
      product.id==='ready.garden-wrap'?24:30);
    assert.equal(product.available,quote.ok);
  }
  for(const staple of projection.staples){
    const quote=quoteKitchenRestock(root,staple.id);
    assert.equal(staple.available,quote.ok);
    assert.equal(staple.price,staple.id==='meat'?36:staple.id==='chicken'?30:15);
  }
  assert.equal(JSON.stringify(root),before);
});

test('FRIDGE-UX-R2: recipe locks follow actual skill and pantry without fake access',()=>{
  const root=newHousehold('2026-11-22');
  const beginner=fridgeViewModel(root,0);
  assert.equal(beginner.recipes.find(x=>x.id==='cook.pasta').available,false);
  assert.match(beginner.recipes.find(x=>x.id==='cook.pasta').reason,/уровень 2/);
  assert.equal(beginner.recipes.find(x=>x.id==='cook.soup').available,true);
  const skilled=fridgeViewModel(root,7);
  assert.equal(skilled.recipes.find(x=>x.id==='cook.pasta').available,true);
});

test('FRIDGE-UX-R2: existing fridge actions, purchases, save rollback and FIFOs are reused',()=>{
  const game=read('src/game.js'),html=read('index.html'),css=read('styles.css');
  const presenter=read('src/fridge-ui-dom.js');
  for(const id of ['fridge-r2','fridge-r2-eat','fridge-r2-stock','fridge-r2-buy',
     'fridge-r2-meal-list','fridge-r2-stock-list','fridge-r2-ready-list','fridge-r2-staple-list'])
    assert.match(html,new RegExp('id="'+id+'"'),id+' missing');
  assert.match(game,/fridgeViewModel\(/);
  assert.match(game,/renderFridgeR2\(/);
  assert.match(presenter,/fridge-r2-meal-list/);
  assert.match(game,/fridge-prepared-select/);
  assert.match(game,/fridge-lunch-button/);
  assert.match(game,/fridge-cook-button/);
  assert.match(game,/fridge-ready-buy-button/);
  assert.match(game,/fridge-buy-button/);
  assert.match(game,/proposeKitchenRestock\(/);
  assert.match(game,/buyReadyMeal\(/);
  assert.match(game,/scheduleCommand\(/);
  assert.match(css,/\.fridge-r2-tabs/);
  assert.match(html,/game\.js\?v=[^"]*fridge-ux-r2/);
  assert.match(html,/"\.\/src\/fridge-ui\.js":/);
});

test('FRIDGE-UX-R2: main actions outside fridge remain standard untouched controls',()=>{
  const html=read('index.html');
  assert.match(html,/id="action-button"/);
  assert.match(html,/id="mirror-speech-button"/);
  assert.match(html,/id="tv-talk-button"/);
  assert.match(html,/id="music-dance-button"/);
  assert.match(html,/id="fridge-ready-select"/);
  assert.match(html,/id="fridge-staple-select"/);
});
