import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createLoadingProgress} from '../src/loading-progress.js';
import {registerModelCache} from '../src/model-cache.js';

test('startup waits for scene plus both 3D models and reports integer progress',async()=>{
  const progress=[];
  const loader=createLoadingProgress(['scene','alex','mira'],p=>progress.push(p));
  let resolved=false;
  const all=loader.wait().then(()=>{resolved=true;});
  assert.deepEqual(progress[0],{completed:0,total:3,failed:0});
  loader.finish('alex');
  loader.finish('scene');
  await Promise.resolve();
  assert.equal(resolved,false);
  assert.equal(progress.at(-1).completed,2);
  loader.finish('mira');
  await all;
  assert.deepEqual(loader.snapshot(),{completed:3,total:3,failed:0});
});
test('stalled optional models unblock the loading gate with fallback',async()=>{
 const loader=createLoadingProgress(['scene','alex','mira']);
 loader.finish('scene');
 const waiting=loader.wait();
 assert.deepEqual(loader.failUnresolved(),{completed:3,total:3,failed:2});
 assert.deepEqual(await waiting,{completed:3,total:3,failed:2});
 assert.equal(loader.finish('mira',true),false);
});
test('duplicate readiness is ignored; unknown IDs rejected',()=>{
  const loader=createLoadingProgress(['scene','alex']);
  assert.equal(loader.finish('scene'),true);
  assert.equal(loader.finish('scene',false),false);
  assert.throws(()=>loader.finish('unknown'),/Unknown asset/);
  assert.deepEqual(loader.snapshot(),{completed:1,total:2,failed:0});
});
test('missing GLB unblocks loading with a failed count (procedural fallback)',async()=>{
  const loader=createLoadingProgress(['scene','alex','mira']);
  loader.finish('scene');
  loader.finish('alex',false);
  loader.finish('mira');
  assert.deepEqual(await loader.wait(),{completed:3,total:3,failed:1});
});
test('the assets are unique and progress is monotonic',()=>{
  assert.throws(()=>createLoadingProgress([]),/unique/);
  assert.throws(()=>createLoadingProgress(['a','a']),/unique/);
  const history=[];
  const loader=createLoadingProgress(['a','b'],s=>history.push(s.completed));
  loader.finish('b');
  loader.finish('b');
  loader.finish('a');
  assert.deepEqual(history,[0,1,2]);
});
test('model service worker caches both GLBs and skips non-model routes',async()=>{
  const listeners={};
  const requests=[];
  const store=new Map();
  const cache={
    match:async req=>store.get(req.url),
    put:async(req,res)=>{store.set(req.url,res);}
  };
  const origin='https://example.test';
  const scope=origin+'/lifesim-prototype/';
  const self={
    location:{origin},registration:{scope},
    clients:{claim:async()=>{}},skipWaiting:async()=>{},
    addEventListener:(name,fn)=>{listeners[name]=fn;}
  };
  const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  vm.runInNewContext(source,{self,caches:{
    open:async()=>cache,keys:async()=>[],delete:async()=>true
  },URL,console,fetch:async req=>{
    requests.push(req.url);
    return new Response('binary model',{status:200});
  },Response});
  assert.ok(listeners.fetch);
  async function request(path){
    const lifetime=[];
    let response;
    listeners.fetch({
      request:new Request(origin+path),
      respondWith:p=>{response=p;},
      waitUntil:p=>lifetime.push(p)
    });
    if(!response)return null;
    const answer=await response;
    await Promise.all(lifetime);
    return answer.text();
  }
  const male='/lifesim-prototype/assets/characters/meshy-casual-v1.glb';
  const female='/lifesim-prototype/assets/characters/meshy-mira-mobile-v1.glb';
  assert.equal(await request(male),'binary model');
  assert.equal(await request(male),'binary model');
  assert.equal(await request(female),'binary model');
  assert.equal(requests.length,2);
  assert.equal(await request('/lifesim-prototype/src/game.js'),null);
  assert.equal(await request('/wrong/assets/characters/meshy-casual-v1.glb'),null);
});

test('first-visit cache registration waits for active service worker to claim page',async()=>{
  let handler;
  const sw={
    controller:null,
    register:async()=>({}),
    addEventListener:(name,fn)=>{assert.equal(name,'controllerchange');handler=fn;},
    removeEventListener:(name,fn)=>{assert.equal(name,'controllerchange');assert.equal(fn,handler);}
  };
  const outcome=registerModelCache(sw);
  await Promise.resolve();
  assert.equal(typeof handler,'function');
  sw.controller={active:true};
  handler();
  assert.equal(await outcome,true);
});
