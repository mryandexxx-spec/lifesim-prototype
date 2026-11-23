import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {areaStretchForTarget,parseQuadFaces} from '../art-review/cas-head-v2/audit-mpfb-morph-area.mjs';

const skill=readFileSync(new URL('../.agents/skills/playcanvas-cas-identity-morphs/SKILL.md',import.meta.url),'utf8');
const pin=JSON.parse(readFileSync(new URL('../art-review/cas-head-v2/MPFB-DONOR-PIN.json',import.meta.url),'utf8'));

test('CAS-HEAD-V2 skill permits only source-fitted derivative topology and MPFB reference data',()=>{
  assert.match(skill,/NEW residents only/);
  assert.match(skill,/CC0 asset data/);
  assert.match(skill,/donor\/reference only/);
  assert.match(skill,/GPL Python addon/);
  assert.match(skill,/byte-identical/);
  assert.match(skill,/not a universal threshold/);
  assert.match(skill,/false.*until separately verified/);
  assert.match(skill,/owner art approval/);
  assert.match(skill,/PR #145/);
  assert.match(skill,/lifesim.room01.v1/);
});
test('CAS-HEAD-V2 quads split into two real triangles and reject arbitrary faces',()=>{
  assert.deepEqual(parseQuadFaces('f 1/1 2/2 3/3 4/4\n'),[[0,1,2],[0,2,3]]);
  assert.throws(()=>parseQuadFaces('f 1 2 3\n'),/fixed MPFB quad/);
});
test('CAS-HEAD-V2 1.20x metric is diagnostic; not a morph acceptance threshold',()=>{
  const verts=[[0,0,0],[1,0,0],[0,1,0]];
  const result=areaStretchForTarget(verts,[[0,1,2]],new Map([[1,[1,0,0]]]));
  assert.equal(result.trianglesAffected,1);
  assert.equal(result.degenerateTriangles,0);
  assert.equal(result.p95AreaStretch,2);
  assert.equal(pin.gate.textureCorrected,undefined);
  assert.equal(pin.gate.correctiveSkinUV,false);
  assert.equal(pin.gate.ownerVisualApproval,false);
});
test('CAS-HEAD-V2 degenerate morph fails other geometry gate independently',()=>{
  const verts=[[0,0,0],[1,0,0],[0,1,0]];
  const result=areaStretchForTarget(verts,[[0,1,2]],new Map([[1,[-1,0,0]]]));
  assert.equal(result.trianglesAffected,0);
  assert.equal(result.degenerateTriangles,1);
});
