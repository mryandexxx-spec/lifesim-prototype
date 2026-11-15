import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CAMERA_INITIAL,dragCamera,orbitCamera,panCamera,pinchCamera,
  CAMERA_BOUNDS} from '../src/camera-controls.js';
import {newHousehold,loadHousehold,chooseResidentAction} from '../src/household.js';
import {SOCIAL_ACTIONS,canStartSocial,startSocial,arriveSocial,
  cancelSocial,tickSocial} from '../src/relationships.js';

const place={x:-.2,z:1.85};
const approx=(a,b,e=1e-7)=>Math.abs(a-b)<=e;

test('one-finger pan remains the default gesture and cannot rotate accidentally',()=>{
 const a=dragCamera(CAMERA_INITIAL,'pan',75,28,700);
 assert.deepEqual(a,panCamera(CAMERA_INITIAL,75,28,700));
 assert.equal(a.yaw,CAMERA_INITIAL.yaw);
 assert.equal(a.pitch,CAMERA_INITIAL.pitch);
});
test('explicit one-finger rotation is sensitive enough on a small iPhone display',()=>{
 const a=dragCamera(CAMERA_INITIAL,'orbit',180,0,700);
 assert.ok(Math.abs(a.yaw-CAMERA_INITIAL.yaw)>75,'180 px must orbit significantly');
 assert.equal(a.centerX,CAMERA_INITIAL.centerX);
 assert.equal(a.centerZ,CAMERA_INITIAL.centerZ);
 assert.equal(a.distance,CAMERA_INITIAL.distance);
 const b=dragCamera(a,'orbit',-180,0,700);
 assert.ok(approx(b.yaw,CAMERA_INITIAL.yaw));
});
test('two-finger orbit sensitivity and pinch are independent of panning',()=>{
 const a=orbitCamera(CAMERA_INITIAL,120,35,2);
 assert.ok(Math.abs(a.yaw-CAMERA_INITIAL.yaw)>55);
 assert.equal(a.centerX,CAMERA_INITIAL.centerX);
 assert.equal(a.centerZ,CAMERA_INITIAL.centerZ);
 const zoom=pinchCamera(a,130,155);
 assert.ok(zoom.distance<CAMERA_INITIAL.distance);
 assert.equal(zoom.yaw,a.yaw);
 assert.equal(orbitCamera(CAMERA_INITIAL,10,NaN,2).yaw,CAMERA_INITIAL.yaw);
});
test('camera continues to obey pitch bounds at high sensitivity and reset remains stable',()=>{
 const a=dragCamera(CAMERA_INITIAL,'orbit',0,1000,650);
 const b=dragCamera(CAMERA_INITIAL,'orbit',0,-1000,650);
 assert.equal(a.pitch,CAMERA_BOUNDS.maxPitch);
 assert.equal(b.pitch,CAMERA_BOUNDS.minPitch);
 assert.deepEqual({...CAMERA_INITIAL},CAMERA_INITIAL);
});
test('full 100 affinity never blocks repeated manual talk, while meter remains clamped',()=>{
 const s=newHousehold();
 s.relationship.affinity=100;
 s.relationship.nextSocialAt=1000000;
 for(let i=0;i<3;i++){
   assert.equal(canStartSocial(s,'talk','alex'),true);
   assert.equal(startSocial(s,'talk','alex',place),true);
   assert.equal(arriveSocial(s),true);
   assert.equal(tickSocial(s,SOCIAL_ACTIONS.talk.duration+1),true);
   assert.equal(s.relationship.affinity,100);
 }
 assert.equal(s.socialAction,null);
 assert.equal(s.mind.memories.length,3);
 assert.equal(startSocial(s,'argue','mira',place),true);
 assert.equal(arriveSocial(s),true);
 tickSocial(s,SOCIAL_ACTIONS.argue.duration+1);
 assert.equal(s.relationship.affinity,88,'argue remains available after full meter');
});
test('zero affinity also permits argue and talk, with bounds and no save migration',()=>{
 const s=newHousehold();s.relationship.affinity=0;
 for(let i=0;i<3;i++){
   assert.equal(startSocial(s,'argue','mira',place),true);
   arriveSocial(s);tickSocial(s,SOCIAL_ACTIONS.argue.duration+1);
   assert.equal(s.relationship.affinity,0);
 }
 assert.equal(startSocial(s,'talk','alex',place),true);
 arriveSocial(s);tickSocial(s,SOCIAL_ACTIONS.talk.duration+1);
 assert.equal(s.relationship.affinity,12,'first conversation after quarrel is reconciliation');
 assert.equal(s.mind.memories.at(-1).id,'reconcile');
 const restored=loadHousehold(JSON.parse(JSON.stringify(s)));
 assert.equal(restored.version,1);
 assert.equal(restored.relationship.affinity,12);
});
test('manual and automatic talks wait for active furniture to finish',()=>{
 const s=newHousehold();
 assert.equal(chooseResidentAction(s,'bed',false,'mira'),true);
 assert.equal(canStartSocial(s,'talk','alex',false),false);
 assert.equal(canStartSocial(s,'talk','alex',true),false);
 assert.equal(startSocial(s,'talk','alex',place,false),false);
 assert.equal(s.otherSim.action.id,'bed');
 s.otherSim.action=null; // explicit user cancellation, not hidden overwriting
 assert.equal(canStartSocial(s,'talk','alex',false),true);
 assert.equal(startSocial(s,'talk','alex',place,false),true);
 assert.ok(s.socialAction);
 assert.equal(canStartSocial(s,'argue','mira'),false);
 assert.equal(cancelSocial(s),true);
 assert.equal(s.socialAction,null);
});
test('manual invite respects only actual overlap, not manual cooldown or score',()=>{
 const s=newHousehold();s.relationship.affinity=100;
 s.relationship.nextSocialAt=Number.MAX_SAFE_INTEGER;
 s.autonomy.enabled=false;
 assert.equal(canStartSocial(s,'talk','alex'),true);
 assert.equal(startSocial(s,'talk','alex',place),true);
 assert.equal(canStartSocial(s,'argue','mira'),false);
});
test('camera input is tracked beyond canvas for iOS, keeps single/multitouch safe',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 const src=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
 assert.ok(html.includes('id="rotate-camera-btn"'));
 assert.ok(html.includes('aria-pressed="false"'));
 assert.ok(css.includes('#rotate-camera-btn[aria-pressed="true"]'));
 assert.ok(css.includes('touch-action:none'));
 assert.ok(src.includes("window.addEventListener('pointermove'"));
 assert.ok(src.includes("window.addEventListener('pointerup'"));
 assert.ok(src.includes("window.addEventListener('pointercancel'"));
 assert.ok(src.includes("dragCamera(view,dragMode"));
 assert.ok(src.includes("orbitCamera(view,dx,dy,2.0)"));
 assert.ok(src.includes('tapCandidate=null;lastPinch=null;lastMidpoint=null'));
});
test('renderer social controls remain enabled when partner busy or meter full',()=>{
 const src=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
 assert.ok(src.includes('const busy=Boolean(game.socialAction);'));
 assert.ok(!src.includes("const busy=Boolean(game.socialAction) || Boolean(getActor"));
 assert.ok(src.includes('const partnerExiting=sofaStates[partnerId].progress>0'));
 assert.ok(!src.includes("paths[partnerId]={points:null,index:0,id:null};"),
   'no new invitation can delete the other resident route');
 assert.ok(src.includes('if(partnerExiting){'));
});
