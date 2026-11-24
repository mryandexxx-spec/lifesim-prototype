import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('LOT-E5 is a four-viewport cross-mode release gate, not another gameplay system',()=>{
  const browser=source('tests/lot-e5-browser-smoke.mjs');
  for(const size of ['390,844','375,667','320,568','844,390'])
    assert.ok(browser.includes('['+size+']'),size);
  // The native editor DOM is intentionally hidden by the unified parcel tray.
  // Require actual user-facing entry points, touch commands and mode checks.
  for(const mode of ['#home-build','#home-pool','#home-outdoors','#home-furnish',
    '#career-phone-toggle','[data-phone-app="finance"]','#menu-rotate-btn','#save-btn'])
    assert.ok(browser.includes(mode),mode);
  for(const section of ["'build-editor','house'","'outdoor-editor','pool'",
    "'outdoor-editor','yard'","'furniture-editor','furniture'"])
    assert.ok(browser.includes(section),section);
  for(const action of ['exit','group:water','group:shop','try','cancel'])
    assert.ok(browser.includes("parcelAction(page,'"+action+"').tap()"),action);
  for(const guard of ["['paint','erase']","parcelAction(page,'pick:'+tool).tap()",
    "parcelAction(page,'apply').isDisabled()",'page.touchscreen.tap','lotRaySurface',
    'PF-01 pool preview outline','native editor must be hidden behind parcel UI'])
    assert.ok(browser.includes(guard),guard);
  assert.doesNotMatch(browser, /#(?:build-exit|outdoor-exit|furnish-exit|furnish-place-cancel)/);
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
