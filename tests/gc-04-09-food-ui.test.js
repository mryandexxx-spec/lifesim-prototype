import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold} from '../src/household.js';
import {fridgeViewModel} from '../src/fridge-ui.js';
import {mealEnjoyment,cookingQuality} from '../src/kitchen.js';
test('food UI is a pure projection of canonical taste, quality and prices',()=>{
 const h=newHousehold('2026-11-26');
 h.kitchen.prepared=[{recipeId:'cook.soup',quality:'good',portions:1},{recipeId:'cook.soup',quality:'chef',portions:1},{recipeId:'ready.gold-roast',portions:1}];
 const before=JSON.stringify(h),m=fridgeViewModel(h,6);
 assert.equal(m.meals.find(x=>x.recipeId==='cook.soup').enjoyment,null);
 assert.equal(m.meals.find(x=>x.recipeId==='ready.gold-roast').enjoyment,8);
 for(const r of m.recipes)assert.equal(r.enjoyment,mealEnjoyment(r.id,cookingQuality(6).id));
 assert.deepEqual(m.ready.map(x=>[x.price,x.enjoyment]),[[18,4],[24,6],[30,8]]);
 assert.equal(JSON.stringify(h),before);
 h.kitchen.prepared.shift();
 assert.equal(fridgeViewModel(h,0).meals.find(x=>x.recipeId==='cook.soup').enjoyment,7);
 const phone=readFileSync(new URL('../src/career-phone-ui.js',import.meta.url),'utf8');
 assert.ok(phone.includes('mealEnjoyment(id)'));
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const name of ['kitchen','simulation','fridge-ui','fridge-ui-dom','career-phone-ui']){
  const prefix='"./src/'+name+'.js":"./src/'+name+'.js?v=';
  const lines=html.split('\n').filter(l=>l.includes(prefix));
  assert.ok(lines.length&&lines.every(l=>l.includes('-gc-04-09-food"')),name);
 }
});
