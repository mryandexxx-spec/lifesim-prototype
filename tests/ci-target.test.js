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
