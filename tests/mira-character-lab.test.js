import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {characterLabModel,MIRA_KNOWN_CLIPS,chooseIdleClip,isOneShotClip,inspectGltf} from '../src/character-lab-config.js';

const name='../assets/characters/meshy-mira-mobile-v1.glb';
const source=new URL(name,import.meta.url);
const expectSha='40a2d1e0dcde53f7c2f53c6bd220f39ba440bbf4d42dfbad949ca82146594d0a';
function parseGlb(data){
  assert.equal(data.toString('ascii',0,4),'glTF');
  assert.equal(data.readUInt32LE(4),2);
  assert.equal(data.readUInt32LE(8),data.byteLength);
  const jsonLength=data.readUInt32LE(12);
  assert.equal(data.toString('ascii',16,20),'JSON');
  const json=JSON.parse(data.toString('utf8',20,20+jsonLength));
  const binaryStart=20+jsonLength;
  assert.equal(data.toString('ascii',binaryStart+4,binaryStart+7),'BIN');
  return json;
}
test('female mobile GLB is bundled with the exact audited SHA-256 and expected size',()=>{
  const data=readFileSync(source);
  assert.equal(data.byteLength,2235708);
  assert.equal(createHash('sha256').update(data).digest('hex'),expectSha);
  assert.equal(parseGlb(data).asset.version,'2.0');
});
test('female GLB retains all 13 clips, 66 bones, 23,245 triangles and no morph targets',()=>{
  const j=parseGlb(readFileSync(source));
  assert.deepEqual(j.animations.map(a=>a.name),MIRA_KNOWN_CLIPS);
  assert.deepEqual(inspectGltf(j),{triangles:23245,joints:66,clips:13,materials:1,morphTargets:0});
  assert.equal(j.images.length,1);
  assert.equal(j.images[0].mimeType,'image/jpeg');
  assert.equal(j.skins.length,1);
});
test('female page uses its own asset and keeps male defaults',()=>{
  const mira=characterLabModel('mira'),alex=characterLabModel('alex');
  assert.equal(mira.assetUrl,'./assets/characters/meshy-mira-mobile-v1.glb');
  assert.equal(mira.bytes,2235708);
  assert.equal(alex.assetUrl,'./assets/characters/meshy-casual-v1.glb');
  assert.equal(characterLabModel('unknown').key,'alex');
  assert.equal(chooseIdleClip(MIRA_KNOWN_CLIPS),'Idle_7');
  assert.equal(isOneShotClip('Sit_to_Stand_Transition_F'),true);
  assert.equal(isOneShotClip('Walking_Woman'),false);
  assert.equal(isOneShotClip('sleep'),false);
  const html=readFileSync(new URL('../character-lab-mira.html',import.meta.url),'utf8');
  assert.match(html,/<body data-character="mira">/);
  assert.match(html,/\.\/src\/character-lab.js/);
  const male=readFileSync(new URL('../character-lab.html',import.meta.url),'utf8');
  assert.doesNotMatch(male,/data-character="mira"/);
});
