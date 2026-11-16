import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const src=read('../src/game.js'),html=read('../index.html'),workflow=read('../.github/workflows/pages.yml');
test('UI6 points camera at a pure session and defaults to one-finger pan',()=>{
 assert.match(src,/import \{createCameraGestureSession\} from '\.\/camera-gestures\.js'/);
 assert.match(src,/let oneFingerMode='pan'/);
 assert.match(src,/cameraGesture=createCameraGestureSession\(\)/);
 assert.match(src,/cameraGesture\.move\(gesturePoint\(event\),view,/);
 assert.match(src,/oneFinger:furnishMode&&shopPlacing&&oneFingerMode==='pan'/);
 assert.match(src,/if\(result.changed\)\{/);
 assert.match(src,/setView\(result.view\)/);
 assert.doesNotMatch(src,/let dragMode='pan'/);
});
test('UI6 accepts only a deliberate pointerup tap for world commands',()=>{
 assert.match(src,/const pos=cameraGesture\.end\(gesturePoint\(event\),performance\.now\(\)\)/);
 assert.match(src,/if\(!pos\|\|dialogueNeedsDecision\(game\)\)return/);
 assert.match(src,/const target=worldTargetAt\(pos\)/);
 assert.match(src,/if\(target\?\.kind==='resident'\)openSocialContext\(pos\)/);
 assert.match(src,/else if\(target\?\.kind==='object'\)select\(target\.id,target\.instanceId\)/);
 assert.match(src,/pointercancel'[\s\S]*?\{cancel:true\}/);
 assert.match(src,/window\.addEventListener\('blur',\(\)=>\{/);
 assert.match(src,/cancelEditorDrag\(\);cameraGesture\.clear\(\)/);
});
test('UI6 preserves fallback, strict dialogue, camera reset and iPhone pointer capture',()=>{
 assert.match(src,/rotateButton\.addEventListener\('click'/);
 assert.match(src,/oneFingerMode==='orbit'\?'pan':'orbit'/);
 assert.match(src,/canvas\.setPointerCapture\?\.\(event\.pointerId\)/);
 assert.match(src,/if\(dialogueNeedsDecision\(game\)\)\{\s*cancelPendingGrab\(\);cameraGesture\.clear\(\);return;\s*\}/);
 assert.match(src,/setView\(CAMERA_INITIAL\)/);
 assert.match(src,/wheelCamera\(view,event\.deltaY\)/);
 assert.match(html,/id="rotate-camera-btn"[^>]*aria-label="Включить вращение камеры одним пальцем/);
 assert.match(html,/Один палец — сдвиг · два — вращение и масштаб/);
 assert.match(html,/id="game-canvas"/);
});
test('UI6 static pages includes all new runtime dependencies',()=>{
 assert.match(workflow,/node --check src\/camera-gestures\.js/);
 assert.match(workflow,/cp src\/camera-gestures\.js site\/src\//);
 assert.match(html,/сборка \/ 1\.2c/);
 assert.match(html,/styles\.css\?v=1\.2c/);
 assert.match(html,/src\/game\.js\?v=1\.2c/);
});
