import test from 'node:test';
import assert from 'node:assert/strict';
import {planChanges} from '../scripts/ci-target.mjs';

test('documentation-only change does not spend Node or browser runtime',()=>{
  assert.deepEqual(planChanges(['README.md','docs/notes.md']).tests,[]);
  assert.equal(planChanges(['README.md']).browser,false);
});
test('new kitchen implementation runs the relevant Node suite without Chromium',()=>{
  const plan=planChanges(['src/kitchen.js']);
  assert.ok(plan.tests.includes('tests/f4g-kitchen.test.js'));
  assert.ok(plan.tests.includes('tests/simulation.test.js'));
  assert.equal(plan.browser,false);
});
test('camera modification routes precise touch regression and one browser smoke',()=>{
  const plan=planChanges(['src/camera-gestures.js']);
  assert.ok(plan.tests.includes('tests/camera-gestures.test.js'));
  assert.ok(plan.browser);
});
test('phone UI edits must run one-screen PlayCanvas smoke (CAREER-R1)',()=>{
  assert.equal(planChanges(['src/career-phone-ui.js']).browser,true);
  assert.equal(planChanges(['src/finance-phone-ui.js']).browser,true);
  assert.equal(planChanges(['src/career-incidents.js']).browser,false);
});
test('finance edit retains the direct ledger guards',()=>{
  assert.ok(planChanges(['src/finance-ledger.js']).tests.includes('tests/w4a-finance.test.js'));
});
test('changed tests always execute and CI workflow edits self-test the router',()=>{
  assert.ok(planChanges(['tests/w4c-bills.test.js']).tests.includes('tests/w4c-bills.test.js'));
  assert.ok(planChanges(['.github/workflows/ci-targeted.yml']).tests.includes('tests/ci-target.test.js'));
});
test('HTML and PlayCanvas browser smoke scripts require an actual browser boot',()=>{
  assert.equal(planChanges(['index.html']).browser,true);
  assert.equal(planChanges(['tests/ci-browser-boot.mjs']).browser,true);
});

test('LOT-E5 alone upgrades the same conditional browser job to four-viewport mode QA',()=>{
  const e5=planChanges(['tests/lot-e5-browser-smoke.mjs']);
  assert.equal(e5.browser,true);
  assert.equal(e5.e5,true);
  assert.equal(planChanges(['tests/ci-browser-boot.mjs']).e5,false);
  assert.equal(planChanges(['README.md']).e5,false);
});


test('P4 integration browser triggers only its four-size job, not LOT-E5',()=>{
  const plan=planChanges(['tests/life-integration-qa-browser.mjs']);
  assert.equal(plan.browser,true);
  assert.equal(plan.integration_qa,true);
  assert.equal(plan.e5,false);
  assert.equal(planChanges(['tests/life-integration-qa.test.js']).integration_qa,false);
  assert.equal(planChanges(['README.md']).integration_qa,false);
});

test('NEEDS-FIX: changed needs loop or bed SKU routes actual PlayCanvas mobile boot',()=>{
  for(const source of ['src/simulation.js','src/need-balance.js','src/furniture-products.js']){
    const plan=planChanges([source]);
    assert.equal(plan.browser,true,source);
    assert.ok(plan.tests.includes('tests/needs-fix-r1.test.js'));
  }
  assert.equal(planChanges(['src/kitchen.js']).browser,false,
    'independent pantry changes should not schedule unrelated browser work');
});

test('MICRO-UX-R1 browser smoke is impact-gated, not run for every future UI edit',()=>{
  assert.equal(planChanges(['src/micro-ux.js']).micro_ux,true);
  assert.equal(planChanges(['src/camera-controls.js']).micro_ux,true);
  assert.equal(planChanges(['tests/micro-ux-r1-browser-smoke.mjs']).micro_ux,true);
  for(const source of ['src/kitchen.js','src/career-phone-ui.js','index.html'])
    assert.equal(planChanges([source]).micro_ux,false,source);
});

test('LOAD-TRUTH-R1 reserves dedicated two-viewport WebGL only for loader changes',()=>{
  const core=planChanges(['src/loading-progress.js']);
  assert.equal(core.browser,false,'pure tracking logic is independent of renderer');
  assert.equal(core.load_truth,true);
  const smoke=planChanges(['tests/load-truth-r1-browser-smoke.mjs']);
  assert.equal(smoke.browser,true);
  assert.equal(smoke.load_truth,true);
  for(const name of ['index.html','src/kitchen.js','src/career-phone-ui.js'])
    assert.equal(planChanges([name]).load_truth,false,name);
});

test('FANDOM-R1-C only reserves detailed mobile TV QA for broadcast changes',()=>{
  assert.equal(planChanges(['src/sports-tv.js']).fandom_tv,true);
  assert.equal(planChanges(['src/sports-tv.js']).browser,true);
  assert.equal(planChanges(['tests/fandom-r1-c-browser-smoke.mjs']).fandom_tv,true);
  assert.equal(planChanges(['src/kitchen.js']).fandom_tv,false);
  assert.equal(planChanges(['README.md']).fandom_tv,false);
});
test('GRILL-R1 dual-viewport WebGL is required for grill code, not unrelated releases',()=>{
  for(const path of ['src/grill-r1.js','src/grill-catalog.js','tests/grill-r1-browser-smoke.mjs'])
    assert.equal(planChanges([path]).grill_r1,true,path);
  for(const path of ['src/ready-food.js','src/micro-ux.js','README.md'])
    assert.equal(Boolean(planChanges([path]).grill_r1),false,path);
});
test('FRIDGE-UX-R2 only runs dedicated dual-viewport UI smoke for affected sources',()=>{
  const model=planChanges(['src/fridge-ui.js']);
  const view=planChanges(['src/fridge-ui-dom.js']);
  const smoke=planChanges(['tests/fridge-ux-r2-browser-smoke.mjs']);
  assert.equal(model.fridge_ux,true);
  assert.equal(view.fridge_ux,true);
  assert.equal(smoke.fridge_ux,true);
  assert.equal(smoke.browser,true);
  assert.ok(model.tests.includes('tests/fridge-ux-r2.test.js'));
  for(const source of ['src/ready-food.js','src/kitchen.js','src/career-phone-ui.js'])
    assert.equal(planChanges([source]).fridge_ux,false,source);
});
