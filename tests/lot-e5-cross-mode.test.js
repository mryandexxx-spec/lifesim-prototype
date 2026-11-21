import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('LOT-E5 is a four-viewport cross-mode release gate, not another gameplay system',()=>{
  const browser=source('tests/lot-e5-browser-smoke.mjs');
  for(const size of ['390,844','375,667','320,568','844,390'])
    assert.ok(browser.includes('['+size+']'),size);
  for(const mode of ['#home-build','#build-exit','#home-outdoors','#outdoor-exit',
    '#home-furnish','#furnish-place-cancel','#furnish-exit',
    '#career-phone-toggle','#menu-rotate-btn','#save-btn'])
    assert.ok(browser.includes(mode),mode);
  for(const guard of ['financialHistory','world.construction','world.furniture',
    'world.outdoors','actionQueues','shop.credits','page.reload',
    'page.setViewportSize','getContext','pageerror','report.json'])
    assert.ok(browser.includes(guard),guard);
  assert.match(browser,/NOT DONE: actual Safari on iPhone/);
  assert.match(source('src/simulation.js'),/lifesim\.room01\.v1/);
});
test('LOT-E5 deep workflow is manual and automatic PR CI conditionally selects it',()=>{
  const flow=source('.github/workflows/lot-e5-cross-mode-release.yml');
  assert.match(flow,/workflow_dispatch:/);
  assert.doesNotMatch(flow,/\bpull_request:|\bpush:/);
  assert.match(flow,/node tests\/lot-e5-browser-smoke\.mjs/);
  assert.match(flow,/upload-artifact@v4/);
  const target=source('scripts/ci-target.mjs');
  assert.match(target,/tests\/lot-e5-browser-smoke\.mjs/);
  const ci=source('.github/workflows/ci-targeted.yml');
  assert.match(ci,/needs\.targeted\.outputs\.e5/);
  assert.match(ci,/node tests\/lot-e5-browser-smoke\.mjs/);
});
