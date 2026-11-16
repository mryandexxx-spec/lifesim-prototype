import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {posix} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>readFileSync(root+p,'utf8');
const imports=src=>[...src.matchAll(/^\s*import\s+(?:[^;]*?\s+from\s*)?['\"]([^'\"]+)['\"]\s*;/gm)].map(m=>m[1]);
test('Browser module graph is all present in GitHub Pages artifact',()=>{
 const workflow=read('.github/workflows/pages.yml');
 const assembly=workflow.split('- name: Assemble static website')[1];
 assert.ok(assembly);
 const html=read('index.html');
 assert.match(html, /"playcanvas":"\.\/vendor\/playcanvas\.mjs"/);
 assert.ok(assembly.includes('cp node_modules/playcanvas/build/playcanvas.mjs site/vendor/'));
 assert.ok(existsSync(root+'node_modules/playcanvas/build/playcanvas.mjs'),'PlayCanvas distribution file missing');
 const seen=new Set(),todo=['src/game.js'];
 while(todo.length){
   const file=todo.pop();if(seen.has(file))continue;
   seen.add(file);
   assert.ok(existsSync(root+file),'Missing module '+file);
   assert.ok(assembly.includes(file),'Not copied into Pages: '+file);
   for(const dep of imports(read(file))){
     if(!dep.startsWith('.'))continue;
     const full=posix.normalize(posix.join(posix.dirname(file),dep));
     assert.ok(full.startsWith('src/'),'Unexpected import '+full);
     todo.push(full);
   }
 }
 assert.ok(seen.size>50,'Unexpectedly small browser import graph');
 for(const file of ['src/romantic-hug.js','src/furniture-shop.js','src/camera-gestures.js'])
   assert.ok(seen.has(file),'Missing feature module '+file);
});
test('Safari startup has bounded SW registration and optional model loading',()=>{
 const game=read('src/game.js'),html=read('index.html');
 assert.match(game,/Promise\.race\(\[\s*registerModelCache\(\)/);
 assert.match(game,/loadingProgress\.failUnresolved\(\)/);
 assert.match(game,/18000/);
 assert.match(html,/Повторить загрузку/);
 assert.match(html,/game\.js\?v=1\.2a/);
});
