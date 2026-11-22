import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLoadingProgress} from '../src/loading-progress.js';

test('LOAD-TRUTH: named milestones tell their real pending, ready and fallback states',()=>{
  const updates=[];
  const loader=createLoadingProgress([
    {id:'cache',label:'Кэш моделей',optional:true},
    {id:'engine',label:'Движок PlayCanvas',optional:false},
    {id:'frame',label:'Первый WebGL кадр',optional:false}
  ],(summary,stages)=>updates.push({summary,stages}));
  assert.deepEqual(updates[0].summary,{completed:0,total:3,failed:0});
  assert.deepEqual(updates[0].stages.map(s=>s.status),['pending','pending','pending']);
  assert.equal(updates[0].stages[1].label,'Движок PlayCanvas');
  assert.equal(loader.requiredReady(),false);
  loader.finish('cache',false);
  loader.finish('engine');
  assert.deepEqual(loader.stages().map(s=>s.status),['fallback','ready','pending']);
  assert.equal(loader.requiredReady(),false);
  loader.finish('frame');
  assert.equal(loader.requiredReady(),true);
  assert.deepEqual(loader.snapshot(),{completed:3,total:3,failed:1});
});
test('LOAD-TRUTH: optional timeout cannot declare unrendered required WebGL ready',async()=>{
  const loader=createLoadingProgress([
    {id:'alex',label:'Алекс',optional:true},
    {id:'mira',label:'Мира',optional:true},
    {id:'frame',label:'Первый WebGL кадр',optional:false}
  ]);
  let settled=false;
  const complete=loader.wait().then(()=>{settled=true;});
  assert.deepEqual(loader.failUnresolved({onlyOptional:true}),{completed:2,total:3,failed:2});
  assert.equal(loader.requiredReady(),false);
  await Promise.resolve();
  assert.equal(settled,false);
  loader.finish('frame');
  await complete;
  assert.equal(settled,true);
  assert.equal(loader.requiredReady(),true);
  assert.equal(loader.finish('alex'),false,'a late GLB must not rewrite a fallback');
});
test('LOAD-TRUTH: unique IDs, labels and required flag are validated',()=>{
  assert.throws(()=>createLoadingProgress([{id:'x',label:'X'},{id:'x',label:'Y'}]),/unique/);
  assert.throws(()=>createLoadingProgress([{id:'',label:'No ID'}]),/id/i);
  assert.throws(()=>createLoadingProgress([{id:'x',label:''}]),/label/i);
});
test('LOAD-TRUTH: discrete real stages wired to engine, frame, cache and both characters',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  for(const id of ['cache','engine','scene','interface','frame','alex','mira']){
    assert.match(game,new RegExp("id:'"+id+"'"),id+' missing from stage plan');
  }
  assert.match(game,/loadingProgress\.finish\('cache'/);
  assert.match(game,/loadingProgress\.finish\('engine'/);
  assert.match(game,/loadingProgress\.finish\('scene'/);
  assert.match(game,/loadingProgress\.finish\('interface'/);
  assert.match(game,/loadingProgress\.finish\('frame'/);
  assert.match(game,/app\.once\('postrender'/);
  assert.match(game,/loadingProgress\.failUnresolved\(\{onlyOptional:true\}\)/);
  assert.match(game,/loadingProgress\.requiredReady\(\)/);
});
test('LOAD-TRUTH: player sees each milestone, not a simulated byte percentage',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  assert.match(html,/id="loading-stages"/);
  assert.match(html,/id="loading-count"[^>]*>0 \/ 7/);
  assert.match(html,/Этапы готовности/);
  assert.match(css,/\.loading-stages/);
  assert.match(html,/game\.js\?v=[^"]*load-truth-r1/,'Safari entrypoint cache-bust');
});
