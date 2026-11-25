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

test('LOAD-TRUTH-R1 and QSK-02 jointly cover startup tracking with dedicated real WebGL',()=>{
  const core=planChanges(['src/loading-progress.js']);
  assert.equal(core.browser,true,'QSK-02 upgrades loader tracking changes to real WebGL fault coverage');
  assert.equal(core.qsk_02,true);
  assert.equal(core.load_truth,true);
  const smoke=planChanges(['tests/load-truth-r1-browser-smoke.mjs']);
  assert.equal(smoke.browser,true);
  assert.equal(smoke.load_truth,true);
  for(const name of ['index.html','src/kitchen.js','src/career-phone-ui.js'])
    assert.equal(planChanges([name]).load_truth,false,name);
});

test('FANDOM-R1-D only adds detailed fifth-app mobile QA for sports phone changes',()=>{
  assert.equal(planChanges(['src/sports-phone-model.js']).fandom_phone,true);
  assert.equal(planChanges(['src/sports-phone-model.js']).browser,true);
  assert.equal(planChanges(['tests/fandom-r1-d-browser-smoke.mjs']).fandom_phone,true);
  assert.equal(planChanges(['src/kitchen.js']).fandom_phone,false);
  assert.equal(planChanges(['README.md']).fandom_phone,false);
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

test('CAS-00 browser baseline selectively activates four-viewport real PlayCanvas profiling',()=>{
  const profile=planChanges(['tests/cas-00-browser-baseline.mjs']);
  assert.equal(profile.browser,true,'browser script must force real WebGL boot');
  assert.equal(profile.cas_baseline,true,'dedicated four-size branch must run');
  assert.ok(profile.tests.includes('tests/household.test.js'),'baseline protects legacy residents');
  for(const path of ['README.md','src/kitchen.js','tests/cas-00-save-baseline.test.js']){
    assert.equal(Boolean(planChanges([path]).cas_baseline),false,
      'unrelated edits must not schedule full profile: '+path);
  }
});

test('CAS-00 source inventory runs only for the audited script and its own test',()=>{
  for(const file of ['scripts/cas-00-dependency-inventory.mjs','tests/cas-00-dependency-inventory.test.js']){
    const plan=planChanges([file]);
    assert.equal(plan.cas_inventory,true,file);
    assert.equal(plan.browser,false,'textual source inventory must not waste WebGL runtime');
  }
  assert.equal(planChanges(['src/kitchen.js']).cas_inventory,false);
  assert.equal(planChanges(['tests/cas-00-save-baseline.test.js']).cas_inventory,false);
  assert.equal(planChanges(['README.md']).cas_inventory,false);
});

test('CAS-01.7 source-level VM tests are included for game and phone edits',()=>{
  for(const source of ['src/game.js','src/career-phone-ui.js']){
    const selected=planChanges([source]).tests;
    for(const testFile of ['tests/q1-q4-regression.test.js',
      'tests/ui-live-plan.test.js','tests/ui-nonblocking.test.js'])
      assert.ok(selected.includes(testFile),source+' must guard '+testFile);
  }
});

test('CAS-01.8 seven-plus-day Node soak and real mobile 2/4 WebGL run on affected changes only',()=>{
  const own=planChanges(['tests/cas-01-8-browser-smoke.mjs']);
  assert.equal(own.cas_soak,true);
  assert.equal(own.browser,true);
  for(const src of ['src/household.js','src/career-work.js','src/resident-social-runtime.js']){
    const p=planChanges([src]);
    assert.equal(p.cas_soak,true,src);
    assert.ok(p.tests.includes('tests/cas-01-8-soak.test.js'),src);
  }
  assert.equal(planChanges(['src/game.js']).cas_soak,true,
    'live renderer edits need mobile profiling, though pure Node tests do not import game.js');
  for(const src of ['src/kitchen.js','tests/cas-01-8-soak.test.js','README.md'])
    assert.equal(planChanges([src]).cas_soak,false,src);
});


test('CAS-02.1-B modular asset/lab changes trigger dedicated real WebGL but not gameplay-only changes',()=>{
 for(const name of ['scripts/build-cas-modular-mannequin.mjs','src/character-lab.js',
    'src/character-lab-config.js','cas-modular-lab.html','tests/cas-02-1-b-browser-smoke.mjs']){
  const plan=planChanges([name]);assert.equal(plan.cas_modular,true,name);
 }
 const plan=planChanges(['tests/cas-02-1-b-browser-smoke.mjs']);
 assert.equal(plan.browser,true);
 for(const name of ['src/kitchen.js','README.md','src/career-work.js'])
  assert.equal(Boolean(planChanges([name]).cas_modular),false,name);
});


test('CAS-02.1-D actual Alex source asset builder and wardrobe lab selectively require real PlayCanvas',()=>{
 for(const changed of ['scripts/cas-source-asset-audit.mjs','scripts/build-cas-alex-wardrobe.mjs',
  'tests/cas-02-1-d-browser-smoke.mjs','cas-alex-wardrobe-lab.html']){
  const p=planChanges([changed]);
  assert.equal(p.cas_alex,true,changed);
 }
 const asset=planChanges(['scripts/build-cas-alex-wardrobe.mjs']);
 assert.equal(asset.browser,false,'pure asset builder only runs Node and does not need extra global browser smoke');
 const browser=planChanges(['tests/cas-02-1-d-browser-smoke.mjs']);
 assert.equal(browser.browser,true);
 assert.equal(planChanges(['src/character-lab.js']).cas_alex,true);
 for(const changed of ['src/kitchen.js','README.md','src/career-work.js'])
  assert.equal(Boolean(planChanges([changed]).cas_alex),false,changed);
});


test('CAS-02.1-E source Alex and independently bound Mira both require exact two-size WebGL',()=>{
 for(const name of ['scripts/build-cas-resident-footwear-v2.mjs',
  'tests/cas-02-1-e-footwear.test.js','tests/cas-02-1-e-browser-smoke.mjs',
  'cas-resident-footwear-lab.html','src/character-lab.js','src/character-lab-config.js']){
  const plan=planChanges([name]);
  assert.equal(plan.cas_styles,true,name);
 }
 const p=planChanges(['cas-resident-footwear-lab.html']);
 assert.equal(p.browser,true);
 const src=planChanges(['scripts/build-cas-resident-footwear-v2.mjs']);
 assert.equal(src.browser,false,'source GLB generator changes do not need unrelated browser work');
 assert.equal(planChanges(['src/finance-ledger.js']).cas_styles,false);
 assert.equal(planChanges(['README.md']).cas_styles,false);
});


test('CAS-02.1-F0 licensed source audit and real visual lab always get targeted CI and PlayCanvas',()=>{
 const source=planChanges(['scripts/cas-02-1-f0-download-assets.mjs']);
 assert.equal(source.cas_cc0,true);
 const html=planChanges(['cas-cc0-shoe-fit-lab.html']);
 assert.equal(html.cas_cc0,true);
 assert.equal(html.browser,true,'real shoe 3D lab changes need browser checks');
 const script=planChanges(['src/cas-cc0-shoe-fit-lab.js']);
 assert.equal(script.cas_cc0,true);
 assert.equal(script.browser,true);
 const browser=planChanges(['tests/cas-02-1-f0-browser-smoke.mjs']);
 assert.equal(browser.cas_cc0,true);
 assert.equal(browser.browser,true);
 const testFile=planChanges(['tests/cas-02-1-f0-sources.test.js']);
 assert.equal(testFile.cas_cc0,true);
 assert.equal(planChanges(['src/career-work.js']).cas_cc0,false);
 assert.equal(planChanges(['README.md']).cas_cc0,false);
});

test('C4B and C4C fit and preview changes run the shared footwear mobile job', () => {
  for (const path of ['scripts/cas-c4-open-upper.mjs', 'src/cas-f2-c4b-lab.js',
    'tests/cas-02-1-f2-c4b-browser-smoke.mjs', 'scripts/cas-c4c-heel-motion.mjs',
    'tests/cas-02-1-f2-c4c-browser-smoke.mjs']) {
    const plan = planChanges([path]);
    assert.equal(plan.cas_c3, true, path);
    assert.equal(plan.browser, true, path);
  }
});

test('QSK-01 routes action queues, social handlers and Safari entry changes to real 4-resident touch QA',()=>{
  for(const path of ['src/action-queue.js','src/resident-social-runtime.js',
    'src/household.js','src/social-graph.js','index.html','styles.css']){
    const plan=planChanges([path]);
    assert.equal(plan.browser,true,path+' requires a PlayCanvas boot');
    assert.equal(plan.cas_hud,true,path+' must execute the 4-resident social smoke');
    assert.ok(plan.tests.includes('tests/qsk-01-social-queue.test.js'),
      path+' must run persistent FIFO and import URL guards');
  }
  const testOnly=planChanges(['tests/qsk-01-social-queue.test.js']);
  assert.equal(testOnly.cas_hud,true);
  assert.equal(testOnly.browser,true);
});

test('QSK-02 routes SW, startup and recovery risks to real mobile WebGL fault matrix',()=>{
  for(const path of ['sw.js','src/model-cache.js','src/loading-progress.js',
    'src/viewport-health.js','src/game.js','index.html']){
    const p=planChanges([path]);
    assert.equal(p.qsk_02,true,path+' must have QSK-02 fault coverage');
    assert.equal(p.browser,true,path+' must boot real PlayCanvas WebGL');
    assert.ok(p.tests.includes('tests/qsk-02-startup-faults.test.js'),path);
  }
  const probe=planChanges(['tests/qsk-02-startup-faults-browser.mjs']);
  assert.equal(probe.qsk_02,true);
  assert.equal(probe.browser,true);
});

// QSK-11: helper-only follow-ups must retain real PlayCanvas and social/queue regression.
test('QSK-11 extracted live task UI routes real browser and social/queue regression',()=>{
  const plan=planChanges(['src/qsk-11-task-labels.js']);
  assert.equal(plan.browser,true);
  for(const file of ['tests/qsk-11-task-labels.test.js','tests/qsk-08-touch-ux.test.js','tests/qsk-01-social-queue.test.js','tests/ui-nonblocking.test.js'])
    assert.ok(plan.tests.includes(file),file);
  assert.equal(planChanges(['src/kitchen.js']).browser,false);
});

test('QSK-11/B toast UI must route mobile WebGL, accessibility and social regressions',()=>{
  const plan=planChanges(['src/qsk-11-toast-ui.js']);
  assert.equal(plan.browser,true);
  for(const file of ['tests/qsk-11-toast-ui.test.js','tests/ui-nonblocking.test.js',
    'tests/qsk-08-touch-ux.test.js','tests/qsk-01-social-queue.test.js',
    'tests/q1-q4-regression.test.js'])
    assert.ok(plan.tests.includes(file),file);
  assert.equal(planChanges(['README.md']).browser,false);
});

test('QSK-11/C view popover changes require mobile WebGL and input regression',()=>{
  const plan=planChanges(['src/qsk-11-view-popover.js']);
  assert.equal(plan.browser,true);
  for(const file of [
    'tests/qsk-11-view-popover.test.js','tests/ui-nonblocking.test.js',
    'tests/qsk-08-touch-ux.test.js','tests/qsk-01-social-queue.test.js',
    'tests/q1-q4-regression.test.js','tests/ui4-integration.test.js',
    'tests/ui7-integration.test.js'
  ])assert.ok(plan.tests.includes(file),file);
  for(const path of ['src/game.js','index.html']){
    const selected=planChanges([path]).tests;
    for(const file of ['tests/ui4-integration.test.js','tests/ui7-integration.test.js',
      'tests/qsk-11-toast-ui.test.js','tests/qsk-11-view-popover.test.js'])
      assert.ok(selected.includes(file),path+' must run '+file);
  }
});

test('QSK-11/D home extraction routes full Node regression and mobile browser',()=>{
  const plan=planChanges(['src/qsk-11-home-menu.js']);
  assert.equal(plan.browser,true);
  for(const file of ['tests/qsk-11-home-menu.test.js','tests/parcel-editor.test.js',
    'tests/qsk-11-view-popover.test.js','tests/ui4-integration.test.js','tests/ui7-integration.test.js'])
    assert.ok(plan.tests.includes(file),file);
});

test('QSK-11/E onboarding extraction routes full Node regression and mobile browser',()=>{
  const plan=planChanges(['src/qsk-11-tour-ui.js']);
  assert.equal(plan.browser,true);
  for(const file of ['tests/qsk-11-tour-ui.test.js','tests/ui-onboarding.test.js','tests/ui7-integration.test.js','tests/qsk-11-home-menu.test.js','tests/parcel-editor.test.js'])
    assert.ok(plan.tests.includes(file),file);
});

test('QSK-11/F time UI routes full Node and mobile browser',()=>{
  const plan=planChanges(['src/qsk-11-time-ui.js']);
  assert.equal(plan.browser,true);
  for(const file of ['tests/qsk-11-time-ui.test.js','tests/household.test.js','tests/simulation.test.js','tests/qsk-11-tour-ui.test.js','tests/comfort-c2-hud.test.js']) assert.ok(plan.tests.includes(file),file);
});


test('PF-07: F1 source-text release contract runs before merge on every inspected source',()=>{
  for(const source of ['src/household.js','src/window-mount.js','src/game.js','src/qsk-11-home-menu.js','src/toilet-interaction.js','index.html','styles.css','.github/workflows/pages.yml'])
    assert.ok(planChanges([source]).tests.includes('tests/furniture-f1-integration.test.js'),source);
});

 test('PF-01 legacy HUD VM and pool contracts run on live dependency edits',()=>{
  for(const file of ['src/game.js','src/resident-hud.js','src/career-work.js','index.html','styles.css'])
    assert.ok(planChanges([file]).tests.includes('tests/pf-01.test.js'),file);
});
