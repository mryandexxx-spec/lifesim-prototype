import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const companions=[{"name":"pc-inspect-glb","pin":"65f6241bc413c2adb78af5890317a8177dd518f0"},{"name":"pc-configure-animation","pin":"65f6241bc413c2adb78af5890317a8177dd518f0"},{"name":"pc-inspect-runtime","pin":"65f6241bc413c2adb78af5890317a8177dd518f0"},{"name":"pc-verify-pixels","pin":"65f6241bc413c2adb78af5890317a8177dd518f0"},{"name":"pc-load-assets","pin":"65f6241bc413c2adb78af5890317a8177dd518f0"},{"name":"blender-core","pin":"1a1cc6c49312f9f370aae86f52b7b907f29c94f6"},{"name":"blender-facial-shapekeys","pin":"1a1cc6c49312f9f370aae86f52b7b907f29c94f6"},{"name":"blender-character-rigging","pin":"1a1cc6c49312f9f370aae86f52b7b907f29c94f6"},{"name":"blender-animation","pin":"1a1cc6c49312f9f370aae86f52b7b907f29c94f6"},{"name":"blender-asset-qa","pin":"1a1cc6c49312f9f370aae86f52b7b907f29c94f6"},{"name":"blender-export-pipelines","pin":"1a1cc6c49312f9f370aae86f52b7b907f29c94f6"},{"name":"scenario-blender-sculpting","pin":"3c4d18cd0be2e5280a5accebfeef9ddc98b9a15b"}];
const guide=read('docs/agent-skills-playcanvas.md'),workflow=read('docs/AI_WORKFLOW.md'),root=read('.agents/skills/playcanvas-lifesim/SKILL.md');

test('pinned CAS companion skills exist, contain rules, and vendor no executable scripts',()=>{
 for(const {name,pin} of companions){
  assert.deepEqual(readdirSync(new URL('../.agents/skills/'+name+'/',import.meta.url)),['SKILL.md'],name);
  const s=read('.agents/skills/'+name+'/SKILL.md');
  assert.ok(s.startsWith('---\nname: '+name+'\ndescription:'),name);
  for(const token of [pin,'instruction-only','PlayCanvas','PR #145','lifesim.room01.v1','MakeHuman'])assert.ok(s.includes(token),name+': '+token);
  assert.ok(guide.includes(name)&&workflow.includes(name),'workflow missing '+name);
  assert.doesNotMatch(s,/^(?:npm install |npx skills add |import )/m);
 }
});
test('CAS coordinator requires actual identity geometry, independent people and owner art gate',()=>{
 assert.deepEqual(readdirSync(new URL('../.agents/skills/playcanvas-cas-identity-morphs/',import.meta.url)),['SKILL.md']);
 const s=read('.agents/skills/playcanvas-cas-identity-morphs/SKILL.md');
 assert.ok(s.startsWith('---\nname: playcanvas-cas-identity-morphs\ndescription:'));
 for(const token of ['Alex','Mira','G0','G4','POSITION','eyes','nose','lips','chin','66','390×844','320×568','lifesim.room01.v1','root.version=1','owner art approval','PR #145'])assert.ok(s.includes(token),token);
 assert.match(s,/AFTER explicit owner art approval/);
 for(const doc of [guide,workflow,root])assert.ok(doc.includes('playcanvas-cas-identity-morphs'));
 assert.match(guide,/Not automatically executed/);
});
