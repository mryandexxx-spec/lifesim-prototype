import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const skill = readFileSync(new URL('../.agents/skills/playcanvas-lifesim/SKILL.md',import.meta.url),'utf8');
const companions = ['create-game-assets','threejs-gltf-loading','ai-behavior-trees-utility-ai','performance-optimization','save-systems','game-ui-ux'];
const guide = readFileSync(new URL('../docs/agent-skills-playcanvas.md',import.meta.url),'utf8');

test('playcanvas-lifesim has discoverable name and explicit project activation',()=>{
  assert.ok(skill.startsWith('---\nname: playcanvas-lifesim\ndescription:'));
  assert.match(skill,/PlayCanvas/);
  assert.match(skill,/instruction-only/);
  assert.match(guide,/playcanvas-lifesim/);
});

test('playcanvas-lifesim integrates six existing adapters without replacing their instructions',()=>{
  for(const name of companions){
    assert.ok(skill.includes('`'+name+'`'),name);
    assert.ok(readFileSync(new URL(`../.agents/skills/${name}/SKILL.md`,import.meta.url),'utf8').startsWith('---\nname: '+name+'\n'),name);
  }
});

test('LifeSim engine, save, agent and CI safety contracts are explicit',()=>{
  for(const contract of ['2.24.1','JavaScript ES modules','lifesim.room01.v1','root.version=1','FIFO','A*','390×844','320×568','iPhone Safari','PRIVATE','exact-main','SHA-guarded','PR #145','THREE.GLTFLoader','AnimationMixer','SkeletonUtils','physical iPhone']){
    assert.ok(skill.includes(contract),'missing '+contract);
  }
  assert.ok(skill.includes('production inventory'));
  assert.ok(skill.includes('game runtime'));
  assert.match(skill,/Do not.*reset owner data/i);
});

test('no executable installer, dynamic engine import, or upstream content vendoring is introduced',()=>{
  assert.doesNotMatch(skill,/npx skills add|npm install|import \* as THREE|from ['"]three['"]/);
  assert.ok(!skill.includes('claude plugin install'));
});
