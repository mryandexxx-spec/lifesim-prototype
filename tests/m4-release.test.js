import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('M4 production Pages includes the physical toilet code and keeps existing UI5 bundle',()=>{
  const workflow=read('../.github/workflows/pages.yml');
  assert.ok(workflow.includes('node --check src/toilet-interaction.js'));
  assert.ok(workflow.includes('cp src/toilet-interaction.js site/src/'));
  assert.ok(workflow.includes('cp src/insight-presentation.js site/src/'));
  assert.ok(workflow.includes('cp src/camera-gestures.js site/src/'));
  assert.ok(workflow.includes('node --check src/meshy-toilet-pose.js'));
  assert.ok(workflow.includes('cp src/meshy-toilet-pose.js site/src/'));
  assert.ok(workflow.includes('node --check src/required-choice-focus.js'));
});
test('M4 Safari release cache bust is consistent with package and lock',()=>{
  const html=read('../index.html');
  assert.ok(html.includes('сборка / 1.1y'));
  assert.ok(html.includes('styles.css?v=1.1y'));
  assert.ok(html.includes('src/game.js?v=1.1y'));
  const pkg=JSON.parse(read('../package.json'));
  const lock=JSON.parse(read('../package-lock.json'));
  assert.equal(pkg.version,'1.0.0-alpha.51');
  assert.equal(lock.version,pkg.version);
  assert.equal(lock.packages[''].version,pkg.version);
  assert.ok(html.includes('id="bar-bladder"'));
  assert.ok(html.includes('id="bar-social"'));
});
