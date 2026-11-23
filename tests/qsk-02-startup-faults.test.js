/** QSK-02 independent failure tests; no production loaders, assets or saves changed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createLoadingProgress} from '../src/loading-progress.js';
import {createViewportHealth} from '../src/viewport-health.js';
import {registerModelCache} from '../src/model-cache.js';

function serviceWorkerHarness(){
  const listeners=new Map(),stores=new Map(),downloads=[],deleted=[];
  const origin='https://lifesim.invalid',scope=origin+'/lifesim-prototype/';
  const self={
    location:{origin},registration:{scope},skipWaiting:async()=>{},
    clients:{claim:async()=>{}},
    addEventListener:(name,handler)=>listeners.set(name,handler)
  };
  const caches={
    keys:async()=>[...stores.keys()],
    delete:async key=>{deleted.push(key);return stores.delete(key);},
    open:async key=>{
      if(!stores.has(key))stores.set(key,new Map());
      const store=stores.get(key);
      return {
        match:async(request,{ignoreSearch}={})=>{
          const wanted=ignoreSearch?new URL(request.url).pathname:request.url;
          const pair=[...store].find(([key])=>
            (ignoreSearch?new URL(key).pathname:key)===wanted);
          return pair?.[1]?.clone();
        },
        put:async(request,response)=>{store.set(request.url,response.clone());}
      };
    }
  };
  const fakeFetch=async request=>{
    downloads.push(request.url);
    return new Response(request.url.includes('broken-asset')?'not-found':'GLB-BINARY',{
      status:request.url.includes('broken-asset')?404:200
    });
  };
  vm.runInNewContext(readFileSync(new URL('../sw.js',import.meta.url),'utf8'),
    {self,caches,URL,Response,Request,fetch:fakeFetch,console});
  async function dispatch(name,request){
    let handled,waited=[];
    const event={request,respondWith:x=>{handled=x;},waitUntil:x=>{waited.push(x);}};
    listeners.get(name)(event);
    const result=handled?await handled:null;
    await Promise.all(waited);
    return result;
  }
  const request=async(relative,method='GET')=>
    dispatch('fetch',new Request(scope+relative,{method}));
  return {request,dispatch,listeners,downloads,deleted,stores,scope};
}

test('QSK-02: optional 3D model failures complete without inventing a required WebGL frame',async()=>{
  const events=[];
  const load=createLoadingProgress([
    {id:'engine',label:'PlayCanvas',optional:false},
    {id:'frame',label:'First real WebGL frame',optional:false},
    {id:'alex',label:'Alex',optional:true},
    {id:'mira',label:'Mira',optional:true}
  ],(snapshot,stages)=>events.push({snapshot,stages}));
  load.finish('engine');
  assert.deepEqual(load.failUnresolved({onlyOptional:true}),{completed:3,total:4,failed:2});
  assert.equal(load.requiredReady(),false,'optional fallback must never certify an absent frame');
  assert.equal(load.stages().find(s=>s.id==='frame').status,'pending');
  load.finish('frame');
  assert.equal(load.requiredReady(),true);
  assert.deepEqual(await load.wait(),{completed:4,total:4,failed:2});
  assert.equal(load.finish('mira',true),false,'stale network success cannot override fallback');
  assert.deepEqual(events.map(e=>e.snapshot.completed),[0,1,2,3,4]);
});

test('QSK-02: SW only caches same-origin successful immutable GLBs, never JS/JSON/404',async()=>{
  const sw=serviceWorkerHarness();
  const model='assets/characters/meshy-casual-v1.glb';
  assert.equal((await sw.request(model+'?v=first')).status,200);
  assert.equal((await sw.request(model+'?v=second')).status,200);
  assert.equal(sw.downloads.length,1,'different query on immutable URL reuses model bytes');
  // A failed network response is never pinned in the immutable model cache.
  assert.equal((await sw.request('assets/characters/meshy-mira-mobile-v1.glb?broken-asset=1')).status,404);
  assert.equal((await sw.request('assets/characters/meshy-mira-mobile-v1.glb')).status,200);
  assert.equal(sw.downloads.length,3,'the post-404 retry must issue another network request');
  assert.equal(await sw.request('src/game.js'),null,'JS modules cannot receive stale GLB cache');
  assert.equal(await sw.request('assets/characters/cas-cc0-f2/assessment.json'),null,
    'asset audit JSON must never be cached by the GLB-only worker');
  assert.equal(await sw.dispatch('fetch',new Request('https://other.invalid/x')),null);
  assert.equal(await sw.request(model,'POST'),null);
  assert.equal(sw.downloads.length,3);
  assert.ok(sw.stores.size>=1);
});

test('QSK-02: offline cache exceptions propagate to network and registration failures remain optional',async()=>{
  const warn=[];
  const sw={register:async()=>{throw Error('SW unavailable')}};
  const old=console.warn;
  console.warn=(...args)=>warn.push(args.map(String).join(' '));
  try{assert.equal(await registerModelCache(sw),false);}
  finally{console.warn=old;}
  assert.ok(warn.some(x=>x.includes('Model cache unavailable')));
  const fallback=createLoadingProgress([{id:'cache',label:'Cache',optional:true},
    {id:'frame',label:'WebGL',optional:false}]);
  fallback.finish('cache',false);fallback.finish('frame');
  assert.equal(fallback.requiredReady(),true);
});

test('QSK-02: old model cache versions are purged on activate, without deleting unrelated caches',async()=>{
  const sw=serviceWorkerHarness();
  sw.stores.set('blins-models-old',new Map());
  sw.stores.set('unrelated-user-storage',new Map());
  assert.equal(sw.listeners.has('activate'),true);
  await sw.dispatch('activate');
  assert.deepEqual(sw.deleted,['blins-models-old']);
  assert.equal(sw.stores.has('unrelated-user-storage'),true);
});

test('QSK-02: WebGL lost, restored and background state preserve explicit recovery events',()=>{
  const h=createViewportHealth({stallMs:300,warmupMs:100});
  h.begin(0);h.markUpdate(110);h.markRender(111);
  h.loseContext(150);
  assert.equal(h.inspect(200).status,'webgl-lost');
  assert.equal(h.inspect(200,{hidden:true}).status,'background');
  h.restoreContext(500);
  assert.equal(h.inspect(530).status,'starting');
  h.markUpdate(680);h.markRender(681);
  assert.equal(h.inspect(700).status,'healthy');
  assert.deepEqual(h.inspect(700).events.map(e=>e.type),['webgl-lost','webgl-restored']);
});
