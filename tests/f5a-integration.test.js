import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold} from '../src/household.js';
import {newConstructionWorld,proposeConstructionEdit} from '../src/construction.js';
import {setCameraBuildBounds,panCamera,CAMERA_INITIAL} from '../src/camera-controls.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('F5-A additive v1 migration retains furniture and all residents',()=>{
 const household=newHousehold();
 const legacy={...household,world:{furniture:household.world.furniture}};
 const restored=loadHousehold(JSON.parse(JSON.stringify(legacy)));
 assert.deepEqual(restored.world.furniture,household.world.furniture);
 assert.equal(restored.version,1);
 assert.equal(restored.world.construction.legacy,true);
 assert.equal(restored.otherSim.version,1);
 const changed=proposeConstructionEdit(restored.world.construction,{type:'room',from:{x:14,z:-2},to:{x:18,z:2}});
 assert.ok(changed.ok);
 restored.world.construction=changed.world;
 assert.equal(loadHousehold(JSON.parse(JSON.stringify(restored))).world.construction.wallEdges.length,32);
});
test('F5-A lot camera bounds are transient and old camera behavior restores on exit',()=>{
 const original=panCamera({...CAMERA_INITIAL,centerX:12.5},-400,0,800);
 setCameraBuildBounds({minX:-8,maxX:22,minZ:-10,maxZ:10,maxDistance:50});
 const grown=panCamera({...CAMERA_INITIAL,centerX:12.5},-400,0,800);
 assert.ok(grown.centerX>original.centerX);
 setCameraBuildBounds();
 assert.deepEqual(panCamera({...CAMERA_INITIAL,centerX:12.5},-400,0,800),original);
});
test('F5-A browser graph actually exposes touch tools and runtime transaction wiring',()=>{
 const html=read('../index.html'),game=read('../src/game.js');
 const workflow=read('../.github/workflows/pages.yml');
 for(const id of ['build-toggle','build-editor','build-exit','build-undo','build-redo','build-apply','build-cancel'])
   assert.ok(html.includes('id="'+id+'"'),id);
 for(const mode of ['room','floor','wall','move-wall','door','window','erase-wall','remove-opening','remove-floor','camera'])
   assert.ok(html.includes('data-build-tool="'+mode+'"'),mode);
 assert.match(game,/createConstructionEditor\(game\.world\.construction\)/);
 assert.match(game,/proposeConstructionEdit\(game\.world\.construction/);
 assert.match(game,/const frameActive=active&&!buildMode/);
 assert.match(workflow,/cp src\/construction\.js site\/src\//);
 assert.match(html,/src\/construction\.js\?v=.*f5a/);
 assert.ok(read('../src/construction.js').includes('export function constructionRooms'));
});

test('F5-A iPhone build defaults to camera pan, wall tool has direct resize affordances',()=>{
 const html=read('../index.html'),game=read('../src/game.js'),css=read('../styles.css');
 assert.match(html,/data-build-tool="camera" aria-pressed="true"/);
 assert.match(html,/id="build-wall-expand"/);
 assert.match(html,/id="build-wall-contract"/);
 assert.match(game,/buildTool='camera'/);
 assert.match(game,/oneFingerMode='pan';showCameraMode\(\)/);
 assert.match(game,/selectBuildWall\(target\)/);
 assert.match(game,/constructionWallOutward\(game\.world\.construction/);
 assert.match(css,/\.build-wall-controls\[hidden\]/);
});

test('F5-A.3 legacy walls are editable with independent H5b wall gallery anchors',()=>{
 const html=read('../index.html'),game=read('../src/game.js');
 assert.match(html,/data-starter-side="north"/);
 assert.match(html,/data-starter-side="west"/);
 assert.match(html,/data-starter-side="east"/);
 assert.match(html,/data-starter-side="south"/);
 assert.match(game,/starterShellSegments\(game\.world\.construction\)/);
 assert.match(game,/starterBackDecor\.setPosition\(0,0,n\)/);
 assert.match(game,/starterLeftDecor\.setPosition\(w,0,0\)/);
 assert.match(game,/artworkDisplayPose\(work,index,origin,game\.world\.construction\)/);
});
