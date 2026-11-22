import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('UX-00 startup writes only after readiness; retry never writes a blank game',()=>{
 assert.match(game,/let bootReadyToSave=false/);
 assert.match(game,/const canWriteGameSave=\(\)=>bootReadyToSave&&!saveStorageLocked/);
 assert.match(game,/function save\(silent = false\) \{\s*if\(!canWriteGameSave\(\)\)/);
 assert.match(game,/bootReadyToSave=true;\s*if\(saveStorageLocked\)toast\(/);
 assert.match(game,/if\(calendarNeedsPersistence\|\|billsNeedsPersistence\)save\(true\)/);
 assert.match(game,/retry\.addEventListener\('click',\(\)=>window\.location\.reload\(\)\)/);
 assert.match(game,/window\.addEventListener\('pagehide', \(\) => save\(true\)\)/);
});
test('UX-00 world hint teaches action choice, not immediate walking',()=>{
 assert.match(html,/Земля → «Идти сюда» → очередь/);
 assert.doesNotMatch(game,/Тап по земле — идти/);
 assert.doesNotMatch(html,/Тап по земле — идти/);
});
