import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const names = ['create-game-assets','threejs-gltf-loading','ai-behavior-trees-utility-ai','performance-optimization','save-systems','game-ui-ux'];
const pinned = 'c6ca6c41c839b68319ffc08430b99ab768debc32';

test('six pinned, scoped LifeSim skill adapters exist with correct metadata and no runtime installation', () => {
  for (const name of names) {
    const content = readFileSync(new URL(`../.agents/skills/${name}/SKILL.md`, import.meta.url), 'utf8');
    assert.ok(content.startsWith('---\nname: ' + name + '\n'), name);
    assert.ok(content.includes(pinned), name);
    assert.match(content, /PRIVATE source-of-truth/);
    assert.match(content, /PR/);
  }
  const guide = readFileSync(new URL('../docs/agent-skills-playcanvas.md', import.meta.url), 'utf8');
  for (const name of names) assert.ok(guide.includes(name), name);
  assert.ok(guide.includes('not automatically activate'));
});

test('engine-specific and persistence advice is explicitly quarantined', () => {
  const read = (name) => readFileSync(new URL(`../.agents/skills/${name}/SKILL.md`, import.meta.url), 'utf8');
  assert.match(read('threejs-gltf-loading'), /NEVER import THREE/);
  assert.match(read('save-systems'), /Do not copy Godot FileAccess/);
  assert.match(read('ai-behavior-trees-utility-ai'), /FIFO/);
  assert.match(read('game-ui-ux'), /iPhone Safari/);
});
