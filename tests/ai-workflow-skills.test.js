import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const workflow = read('docs/AI_WORKFLOW.md');
const entry = read('AGENTS.md');
const skills = readdirSync(new URL('../.agents/skills/', import.meta.url), {withFileTypes:true})
  .filter(entry=>entry.isDirectory()).map(entry=>entry.name);

test('agent entry point requires workflow and project skill before each new task',()=>{
  assert.match(entry,/docs\/AI_WORKFLOW\.md/);
  assert.match(entry, /every new task/i);
  assert.match(entry,/playcanvas-lifesim\/SKILL\.md/);
  assert.match(workflow,/every new task/i);
  assert.match(workflow, /before.*planning/i);
});

test('workflow discovers the live repository skill catalog and reads applicable skill bodies',()=>{
  assert.ok(skills.includes('playcanvas-lifesim'));
  assert.ok(skills.length>=7);
  for(const name of skills) {
    const text = read('.agents/skills/' + name + '/SKILL.md');
    assert.ok(text.startsWith('---\nname: ' + name + '\n'), name);
  }
  assert.match(workflow, /list the folders under `.agents\/skills\/`/);
  assert.match(workflow, /YAML frontmatter/);
  assert.match(workflow, /entire relevant `SKILL\.md`/);
  assert.match(workflow, /re-evaluate skills/i);
  assert.match(workflow, /no additional skill applicable/);
});

test('workflow protects private rules, runtime, concurrency and truthful activation',()=>{
  for(const term of ['PRIVATE','PlayCanvas 2.24.1','lifesim.room01.v1','PR #145','exact-head','exact-main','Pages','plain ChatGPT']) assert.ok(workflow.includes(term),term);
  assert.match(workflow,/does \*\*not\*\* make them automatically executed/);
  assert.match(workflow,/do not falsely claim loading/);
  assert.match(entry,/do not claim automatic execution/);
});
