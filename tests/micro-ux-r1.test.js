/** MICRO-UX-R1: red-first contracts across camera, modal dismissal and genuine use. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CAMERA_INITIAL,stepCameraFocus} from '../src/camera-controls.js';
import {sleepZzzVisible,dismissOnCanvasTap} from '../src/micro-ux.js';
import {newHousehold,loadHousehold,chooseResidentAction,tickHousehold,
  furnitureAvailable} from '../src/household.js';
import {arrive,ACTIONS,SAVE_KEY} from '../src/simulation.js';
import {MIRROR_SPEECH_DURATION} from '../src/furniture-interactions.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {enqueueAction,restoreActionQueues} from '../src/action-queue.js';
import {stepAnimation,createAnimationState} from '../src/animations.js';
const copy=x=>JSON.parse(JSON.stringify(x));
const close=(a,b,eps=.01)=>Math.abs(a-b)<eps;
const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('MICRO camera focus eases only center, preserves orbit and zoom, converges and ignores bad targets',()=>{
  const initial={...CAMERA_INITIAL};
  const point={x:4.5,z:-1.8};
  const first=stepCameraFocus(initial,point,.016);
  assert.ok(first.centerX>initial.centerX&&first.centerX<point.x);
  assert.ok(first.centerZ<initial.centerZ&&first.centerZ>point.z);
  for(const key of ['yaw','pitch','distance','centerY'])assert.equal(first[key],initial[key]);
  let current=first;
  for(let i=0;i<180;i++)current=stepCameraFocus(current,point,.016);
  assert.ok(close(current.centerX,point.x)&&close(current.centerZ,point.z));
  assert.deepEqual(stepCameraFocus(current,{x:NaN,z:1},.016),current);
  assert.deepEqual(stepCameraFocus(current,point,0),current);
});

test('MICRO dismissal is only a completed single tap; modal and editor win',()=>{
  assert.equal(dismissOnCanvasTap({tap:true,target:'empty',modal:false,editing:false,menuOpen:true}),true);
  assert.equal(dismissOnCanvasTap({tap:true,target:'object',modal:false,editing:false,menuOpen:true}),false);
  for(const bad of [{tap:false},{modal:true},{editing:true},{menuOpen:false}])
    assert.equal(dismissOnCanvasTap({tap:true,target:'empty',menuOpen:true,...bad}),false);
});

test('MICRO Zzz requires an actual occupied sleeping bed and remains presentation-only',()=>{
  assert.equal(sleepZzzVisible({action:{id:'bed',phase:'walking'}},false),false);
  assert.equal(sleepZzzVisible({action:{id:'bed',phase:'using'}},false),true);
  assert.equal(sleepZzzVisible({action:{id:'bed',phase:'using'}},true),false);
  assert.equal(sleepZzzVisible({action:{id:'tv',phase:'using'}},false),false);
  assert.equal(sleepZzzVisible({action:null},false),false);
});

function withMirror(){
  const root=newHousehold();
  const pose=findMarketPlacement(root.world.furniture,root.shop,'mirror.panel');
  assert.ok(pose);
  const bought=buyMarketItem(root.world.furniture,root.shop,'mirror.panel',pose);
  assert.equal(bought.ok,true);
  root.world.furniture=bought.world;root.shop=bought.shop;
  return {root,id:bought.instanceId};
}
test('MICRO mirror grants proportional Social/Fun only during genuine practice, both residents, no extra XP',()=>{
  for(const person of ['alex','mira']){
    const {root,id}=withMirror(),actor=person==='alex'?root:root.otherSim;
    actor.needs.social=25;actor.needs.fun=25;
    assert.equal(chooseResidentAction(root,'mirror',false,person,id,
      null,null,null,null,null,true),true);
    const before={...actor.needs};
    tickHousehold(root,4);
    assert.ok(actor.needs.social<before.social&&actor.needs.fun<before.fun);
    const point=furnitureActionApproach(root.world,'mirror',id);
    actor.position={...point};arrive(actor);
    tickHousehold(root,MIRROR_SPEECH_DURATION/2);
    const mid={...actor.needs};
    assert.ok(mid.social>before.social+1&&mid.social<before.social+4);
    assert.ok(mid.fun>before.fun+.5&&mid.fun<before.fun+3);
    const copySaved=loadHousehold(copy(root)),savedActor=person==='alex'?copySaved:copySaved.otherSim;
    const xpBefore=savedActor.skills.xpById.charisma||0;
    copySaved.paused=true;tickHousehold(copySaved,5);
    assert.ok(close(savedActor.needs.social,mid.social,.00001));
    copySaved.paused=false;tickHousehold(copySaved,MIRROR_SPEECH_DURATION/2);
    assert.ok(savedActor.needs.social>mid.social);
    assert.equal(savedActor.skills.xpById.charisma-xpBefore,18);
    const final={...savedActor.needs};tickHousehold(copySaved,0);
    assert.deepEqual(savedActor.needs,final);
  }
});
test('MICRO grooming remains reward-free; interrupt practice never awards remaining benefits',()=>{
  const {root,id}=withMirror();
  root.needs.social=25;root.needs.fun=25;
  assert.equal(chooseResidentAction(root,'mirror',false,'alex',id),true);
  root.position={...furnitureActionApproach(root.world,'mirror',id)};arrive(root);
  tickHousehold(root,ACTIONS.mirror.duration);
  assert.ok(root.needs.social<25&&root.needs.fun<25);
  assert.equal(root.skills.xpById.charisma,undefined);
  assert.equal(chooseResidentAction(root,'mirror',false,'alex',id,
    null,null,null,null,null,true),true);
  arrive(root);tickHousehold(root,4);root.action=null;
  const end={...root.needs};
  tickHousehold(root,1);
  assert.ok(root.needs.fun<=end.fun);
});

test('MICRO TV talk keeps TV id/slot/queue, earns bounded solo needs only on real use',()=>{
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  const root=newHousehold();root.needs.fun=20;root.needs.social=20;
  const request={type:'object',actionId:'tv',targetInstanceId:'home-tv-1',tvTalk:true};
  assert.equal(enqueueAction(root.actionQueues,'alex',request)?.tvTalk,true);
  const restoredQ=restoreActionQueues(copy(root.actionQueues),['alex','mira']);
  assert.equal(restoredQ.byResident.alex[0].tvTalk,true);
  assert.equal(chooseResidentAction(root,'tv',false,'alex','home-tv-1',
    null,null,null,null,null,false,true),true);
  assert.equal(root.action.tvTalk,true);
  assert.equal(furnitureAvailable(root,'tv','mira','home-tv-1'),false);
  const walking={...root.needs};
  tickHousehold(root,3);
  assert.ok(root.needs.fun<walking.fun&&root.needs.social<walking.social);
  const at=furnitureActionApproach(root.world,'tv','home-tv-1');
  root.position={...at};arrive(root);
  const start={...root.needs};tickHousehold(root,10);
  assert.ok(root.needs.fun>start.fun+2&&root.needs.social>start.social);
  const saved=loadHousehold(copy(root));
  assert.equal(saved.action.tvTalk,true);
  const funAtSave=saved.needs.fun,socialAtSave=saved.needs.social;
  tickHousehold(saved,26);
  assert.equal(saved.action,null);
  assert.ok(saved.needs.fun>funAtSave&&saved.needs.fun<40);
  assert.ok(saved.needs.social>socialAtSave&&saved.needs.social<28);
  assert.equal(saved.socialAction,null);
  const second=loadHousehold(copy(saved));
  assert.equal(second.action,null);
});

test('MICRO expressive TV response lives only in the existing avatar animator',()=>{
  const base=stepAnimation(createAnimationState(),{id:'alex',using:'tv'},.06);
  const reaction=stepAnimation(createAnimationState(),{id:'alex',using:'tv',tvTalk:true},.06);
  assert.notDeepEqual(reaction.arms,base.arms);
});

test('MICRO mobile source contract: name focus, Zzz overlay, separate TV action, cache keys',()=>{
  const game=source('../src/game.js'),html=source('../index.html');
  assert.match(game,/focusSelectedCamera\(id\)/);
  assert.match(game,/sleepZzzVisible\(/);
  assert.match(game,/dismissOnCanvasTap\(/);
  assert.doesNotMatch(game,/canvas\.addEventListener\('pointerdown',closeGroundWalkMenu\)/,
    'long press/swipe may not dismiss a ground menu at pointerdown');
  assert.match(game,/const rendered=rig\?\.getPosition/,
    'camera follows actual rendered bed/sleep/seat pose');
  assert.match(game,/tv-talk-button/);
  assert.match(html,/id="tv-talk-button"/);
  assert.match(html,/micro-ux-r1/);
});
