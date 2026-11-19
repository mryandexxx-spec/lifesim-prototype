import test from 'node:test';
import assert from 'node:assert/strict';
import {createViewportHealth,viewportHealthLabel,viewportHealthReport,
  VIEWPORT_STALL_MS} from '../src/viewport-health.js';

test('fresh viewport is warming up, then reports healthy updates and frames',()=>{
  const h=createViewportHealth({warmupMs:1000,stallMs:500});
  assert.equal(h.inspect(0).status,'starting');
  h.begin(0);h.markUpdate(1200);h.markRender(1201);
  const state=h.inspect(1400,{paused:true,mode:'furnish',canvasWidth:390,
    canvasHeight:844,dpr:2,outdoorFeatures:12,furniture:7});
  assert.equal(state.status,'healthy','intentional simulation pause is not a frozen render');
  assert.equal(state.paused,true);
  assert.equal(state.mode,'furnish');
  assert.equal(state.canvas,'390×844');
  assert.equal(state.outdoorFeatures,12);
  assert.match(viewportHealthReport(state),/пауза: да/);
  assert.match(viewportHealthLabel('healthy'),/Кадры/);
});
test('independent render and update heartbeat detect two distinct freezes',()=>{
  const h=createViewportHealth({warmupMs:100,stallMs:500});
  h.begin(0);h.markUpdate(150);h.markRender(150);
  h.markUpdate(600);
  assert.equal(h.inspect(700).status,'render-stall');
  h.markRender(650);
  assert.equal(h.inspect(700).status,'healthy');
  assert.equal(h.inspect(1500).status,'update-stall');
});
test('context loss is immediate, restore requires fresh real frames after grace',()=>{
  const h=createViewportHealth({warmupMs:100,stallMs:300});
  h.begin(0);h.markUpdate(150);h.markRender(150);
  h.loseContext(160);
  assert.equal(h.inspect(161).status,'webgl-lost');
  assert.equal(h.inspect(1000,{hidden:true}).status,'background');
  h.restoreContext(1000);
  assert.equal(h.inspect(1001).status,'starting');
  assert.equal(h.inspect(1450).status,'update-stall');
  h.markUpdate(1460);h.markRender(1461);
  assert.equal(h.inspect(1480).status,'healthy');
  assert.deepEqual(h.inspect(1480).events.map(x=>x.type),['webgl-lost','webgl-restored']);
});
test('return from background gives Safari time to resume without a false alarm',()=>{
  const h=createViewportHealth({warmupMs:1000,stallMs:500});
  h.begin(0);h.markUpdate(2000);h.markRender(2000);
  assert.equal(h.inspect(10000,{hidden:true}).status,'background');
  h.resume(10000);
  assert.equal(h.inspect(10500).status,'starting');
  h.markUpdate(11000);h.markRender(11000);
  assert.equal(h.inspect(11001).status,'healthy');
});
test('input and recent anomalies are bounded and never include game/save data',()=>{
  const h=createViewportHealth({warmupMs:100,stallMs:500,maxEvents:3});
  h.begin(0);h.markInput(130);
  for(let n=1;n<=5;n++)h.markError('runtime-'+n,130+n);
  const s=h.inspect(300,{mode:'outdoors',pointers:45,canvasWidth:320});
  assert.equal(s.pointers,10);
  assert.equal(s.inputAge,170);
  assert.deepEqual(s.events.map(e=>e.type),['runtime-3','runtime-4','runtime-5']);
  assert.ok(!viewportHealthReport(s).includes('localStorage'));
  assert.equal(VIEWPORT_STALL_MS,7500);
});
test('FPS monitor ignores background gaps and rejects zero-duration frames',()=>{
  const h=createViewportHealth({warmupMs:100,stallMs:800});
  h.begin(0);h.markRender(200);h.markRender(216);h.markRender(232);
  assert.equal(h.inspect(300).fps,63);
  h.resume(3000);h.markRender(3100);h.markRender(3100);
  assert.equal(h.inspect(3110).fps,null);
  h.markRender(3120);
  assert.equal(h.inspect(3121).fps,50);
});
test('source integration keeps diagnostics off simulation save schema',async()=>{
  const {readFileSync}=await import('node:fs');
  const src=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(src,/createViewportHealth/);
  assert.match(src,/webglcontextlost/);
  assert.match(src,/webglcontextrestored/);
  assert.match(src,/app\.on\('postrender'/);
  assert.match(src,/viewportHealth\.markUpdate/);
  assert.match(src,/if\(!save\(true\)\)\{/);
  assert.match(html,/id="viewport-recovery"/);
  assert.match(html,/id="viewport-health-open"/);
  assert.match(pages,/cp src\/viewport-health\.js site\/src\//);
});
