import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('explicit find is an accessible button, separate from select and portrait focus',()=>{
 assert.match(html,/<button id="menu-find-resident-btn" type="button">◎ Найти выбранного жителя<\/button>/);
 assert.match(game,/focusSelectedCamera\(activeHudResident\(\),\{reveal:true\}\)/);
 assert.match(game,/residentDoubleTap\.tap\(id,performance\.now\(\),physical\)\)focusSelectedCamera\(id\)/);
 assert.match(game,/revealDistance:reveal\?Math\.max\(12,Math\.min\(view\.distance,CAMERA_INITIAL\.distance\)\):null/);
});
test('new explicit overview supersedes transient focus before applying view',()=>{
 const block=game.slice(game.indexOf("$('menu-lot-camera-btn').addEventListener"),game.indexOf('// One finger pans by default',game.indexOf("$('menu-lot-camera-btn').addEventListener")));
 assert.match(block,/cameraFocus=null;[\s\S]*setView\(/);
 assert.match(block,/dialogueNeedsDecision\(game\)/);
 assert.match(game,/residentAwayAtWork\(game,cameraFocus.id\)\)cameraFocus=null/);
});
