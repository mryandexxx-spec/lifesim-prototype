/** Q1 + Q4: numerical camera bounds and pending workplace CTA invariants. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {progressCareerWork,arriveCareerPortal} from '../src/career-work.js';
import {startWorkIncident,pendingWorkIncident,decideWorkIncident} from '../src/career-incidents.js';
import {CAMERA_INITIAL,CAMERA_BOUNDS,CAMERA_LOT_BOUNDS,setCameraBuildBounds,
  pinchCamera,wheelCamera} from '../src/camera-controls.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
function twoPending(){
  const root=newHousehold('2026-11-16');
  root.careerSystem=hireCareer(root.careerSystem,'alex','editorial',480);
  root.careerSystem=hireCareer(root.careerSystem,'mira','business-center',480);
  root.minutes=540;root.otherSim.minutes=540;
  progressCareerWork(root,539,540);
  assert.equal(arriveCareerPortal(root,'alex',540),true);
  assert.equal(arriveCareerPortal(root,'mira',540),true);
  root.minutes=781;root.otherSim.minutes=781;
  assert.equal(startWorkIncident(root,'alex',781),true);
  assert.equal(startWorkIncident(root,'mira',781),true);
  return root;
}
test('Q1 pinch/wheel zoom bounds double in both directions without mutating reset view',()=>{
  setCameraBuildBounds(CAMERA_LOT_BOUNDS);
  assert.equal(CAMERA_LOT_BOUNDS.minDistance,5.5);
  assert.equal(CAMERA_LOT_BOUNDS.maxDistance,100);
  assert.equal(pinchCamera(CAMERA_INITIAL,100,1000).distance,5.5);
  assert.equal(pinchCamera(CAMERA_INITIAL,100,1).distance,100);
  assert.equal(wheelCamera(CAMERA_INITIAL,10000).distance,100);
  setCameraBuildBounds();
  assert.equal(CAMERA_BOUNDS.maxDistance,64);
  assert.deepEqual(CAMERA_INITIAL,{yaw:42,pitch:47,distance:16.9,centerX:0,centerY:.62,centerZ:0});
});
test('Q4 pending state belongs to working resident, survives reload and never pays early',()=>{
  const root=twoPending(),credits=root.shop.credits;
  root.selectedSim='mira';
  const save=loadHousehold(JSON.parse(JSON.stringify(root)));
  assert.ok(pendingWorkIncident(save,'alex'));
  assert.ok(pendingWorkIncident(save,'mira'));
  assert.equal(save.shop.credits,credits);
  assert.equal(decideWorkIncident(save,'alex','rewrite').ok,true);
  assert.equal(pendingWorkIncident(save,'alex'),null);
  assert.ok(pendingWorkIncident(save,'mira'));
  assert.equal(save.careerSystem.incidentIds.length,1);
  const reloaded=loadHousehold(JSON.parse(JSON.stringify(save)));
  assert.equal(reloaded.careerSystem.byResident.alex.currentShift.incident.choiceId,'rewrite');
  assert.equal(pendingWorkIncident(reloaded,'alex'),null);
  assert.ok(pendingWorkIncident(reloaded,'mira'));
  assert.equal(reloaded.shop.credits,credits);
  tickHousehold(reloaded,240);
  assert.equal(pendingWorkIncident(reloaded,'mira'),null);
  assert.equal(reloaded.careerSystem.incidentIds.length,2);
});
test('Q4 direct path is persistent and can select the right resident from finance without changing saves',()=>{
  const game=read('../src/game.js'),phone=read('../src/career-phone-ui.js'),
    css=read('../styles.css'),html=read('../index.html');
  assert.match(game,/function refreshIncidentNotifications\(\)/);
  assert.match(game,/HOUSEHOLD_IDS\.filter\(id=>pendingWorkIncident\(game,id\)\)/);
  assert.match(game,/incidentEvent=careerEvents\.find/);
  assert.match(game,/toast\('💼 '\+incidentEvent\.text,\{incidentResidentId:incidentEvent\.residentId\}\)/);
  assert.match(game,/button\.addEventListener\('click',\(\)=>openWorkIncident\(incidentResidentId\)\)/);
  assert.match(phone,/function openIncident\(residentId\)/);
  assert.match(phone,/root\.selectedSim!==residentId&&!selectResident\(residentId\)/);
  assert.match(phone,/app='work';section='vacancies';view='list';chosen=null;historyId=null/);
  assert.match(phone,/heading\.scrollIntoView\(\{block:'start'\}\)/);
  assert.match(phone,/heading\.focus\(\{preventScroll:true\}\)/);
  assert.match(phone,/body\.append\(action\('Позже/);
  assert.match(css,/\.toast-incident-cta\{[^}]*min-height:44px/);
  assert.match(css,/\.career-incident-badge\[hidden\]/);
  assert.match(html,/src\/camera-controls\.js\?v=[^"]*-q1/);
  assert.match(html,/src\/career-phone-ui\.js\?v=[^"]*-q4/);
  assert.match(game,/farClip:180/);
  assert.equal(game.split('maxDistance:100').length-1,3,'All editor modes use the same wider camera range');
  assert.doesNotMatch(phone,/root\.careerSystem\s*=\s*new/);
});
