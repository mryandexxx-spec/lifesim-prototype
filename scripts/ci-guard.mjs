import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const location=path.join(root,'.github/workflows');
const active=new Set(['ci-targeted.yml','pages.yml','ci-full-manual.yml']);
for(const file of readdirSync(location).filter(f=>/\.ya?ml$/.test(f))){
  if(file==='qsk-12-release-evidence.yml'){
    const yaml=readFileSync(path.join(location,file),'utf8');
    assert.match(yaml,/^on:\n  workflow_run:\n    workflows:\n      - CI — change-aware Node and one-screen WebGL\n      - Test and deploy Блин’С to GitHub Pages\n    types: \[completed\]\npermissions:\n  actions: read\n  contents: read\n/m);
    assert.doesNotMatch(yaml,/^  (?:pull_request|push|schedule|pull_request_target|merge_group):/m);
    continue;
  }
  if(active.has(file))continue;
  const yaml=readFileSync(path.join(location,file),'utf8');
  const match=yaml.match(/^on:[ \t]*\r?\n((?:^[ \t].*(?:\r?\n|$)|^\r?\n)*)/m);
  assert.ok(match,'Workflow needs explicit manual event: '+file);
  assert.match(match[1],/^  workflow_dispatch:/m,'Historical workflow must be manually runnable: '+file);
  assert.doesNotMatch(match[1],/^  (?:pull_request|push|schedule|workflow_run|pull_request_target|merge_group):/m,
    'Historical workflow must not auto-run: '+file);
}
console.log('CI registry guard PASS: one PR workflow, one Pages deploy, historical QA on demand');
