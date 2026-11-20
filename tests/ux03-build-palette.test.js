import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BUILD_TOOL_GROUPS,BUILD_TOOL_IDS,buildGroupForTool,describeBuildPreview} from '../src/build-tool-palette.js';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('UX-03 maps every one of 31 original tool buttons to six groups or View',()=>{
  const tools=[...html.matchAll(/data-build-tool="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(tools.length,31);
  assert.equal(new Set(tools).size,31);
  assert.deepEqual(new Set(tools),new Set(BUILD_TOOL_IDS));
  assert.deepEqual(BUILD_TOOL_GROUPS.map(x=>x.id),['room','walls','openings','finishes','roof','porch']);
  for(const group of BUILD_TOOL_GROUPS){
    assert.match(html,new RegExp('data-build-group-tab="'+group.id+'"'));
    for(const tool of group.tools){
      assert.equal(buildGroupForTool(tool),group.id);
      assert.match(html,new RegExp('data-build-tool="'+tool+'" data-build-group="'+group.id+'"'));
    }
  }
  assert.equal(buildGroupForTool('camera'),'view');
  assert.equal(buildGroupForTool('unknown'),null);
});
test('UX-03 room preview names real 3×2m = 6 square meters, no mutation',()=>{
 const cmd={type:'room',from:{x:15,z:-2},to:{x:18,z:0}};
 const before=JSON.stringify(cmd);
 assert.deepEqual(describeBuildPreview(cmd),{title:'Построить комнату?',
   action:'✓ Построить комнату',detail:'3 × 2 м · 6 м²'});
 assert.equal(JSON.stringify(cmd),before);
 assert.match(describeBuildPreview({type:'room-relocate'}).title,/с содержимым/);
 assert.match(describeBuildPreview({type:'roof-clear'}).title,/все крыши/);
});
test('UX-03 retains transaction IDs, guard paths, view and undo',()=>{
 const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
 assert.match(game,/buildSession\.commit\(cmd,buildContext\(\)\)/);
 assert.match(game,/mountedFixturesSurviveEdit/);
 assert.match(game,/inaccessible-essential/);
 assert.match(game,/clearBuildPending\(\)/);
 for(const id of ['build-view-trigger','build-pending-title','build-apply','build-cancel',
 'build-undo','build-redo','build-roof-toggle','build-ceiling-toggle']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
 assert.match(pages,/src\/build-tool-palette\.js site\/src/);
 assert.doesNotMatch(html,/F5-D\.3a\/объединение/);
});
