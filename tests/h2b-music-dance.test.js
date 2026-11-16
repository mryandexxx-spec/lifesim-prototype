import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HOBBY_ACTIVITIES,HOBBY_CONTENT,MUSIC_ACTIVITY_ID,MUSIC_DANCE_ACTIVITY_ID,
  MUSIC_ACTIVITY_IDS,MUSIC_CONTENT_IDS,READING_SKILL_ID} from '../src/hobby-reading.js';
import {getActivityDefinition} from '../src/activity-registry.js';
import {createActivitySession} from '../src/activity-session.js';
import {musicMovementFrame} from '../src/music-movement.js';
import {createMeshyMusicController} from '../src/meshy-music-runtime.js';
import {newHousehold,getActor,chooseResidentAction,tickHousehold,
  loadHousehold,furnitureAvailable} from '../src/household.js';
import {chooseMusicListeningSpot} from '../src/music-listening.js';
import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {arrive} from '../src/simulation.js';
import {enqueueAction,dispatchActionQueues,pendingActions,restoreActionQueues}
  from '../src/action-queue.js';
import {createAnimationState,stepAnimation} from '../src/animations.js';
import {audibleMusicStyle} from '../src/music-audio.js';
import {canShowMeshy} from '../src/meshy-visual-policy.js';
import {canShowMiraMeshy} from '../src/meshy-mira-policy.js';

const copy=x=>JSON.parse(JSON.stringify(x));
function station(root){
  const p=findMarketPlacement(root.world.furniture,root.shop,'music.starter',{
    residents:[root.position,root.otherSim.position]});
  assert.ok(p,'stereo must be placeable in a reachable real room');
  const bought=buyMarketItem(root.world.furniture,root.shop,'music.starter',p,{
    residents:[root.position,root.otherSim.position]});
  assert.equal(bought.ok,true);
  root.world.furniture=bought.world;root.shop=bought.shop;
  return bought.instanceId;
}
function start(root,id,activityId,who='alex',style=MUSIC_CONTENT_IDS[1]){
  const actor=getActor(root,who),plan=chooseMusicListeningSpot(root.world,actor.position,id);
  assert.ok(plan,'A* is the only music start mechanism');
  assert.equal(chooseResidentAction(root,'music',false,who,id,activityId,style,plan),true);
  return {actor,plan};
}
function getUsing(root,id,activityId,who='alex',style=MUSIC_CONTENT_IDS[1]){
  const a=start(root,id,activityId,who,style);
  a.actor.position={...a.plan.point};arrive(a.actor);
  return a.actor;
}
test('H2b registry declares two activities on the same physical source, distinct effect rates',()=>{
  assert.deepEqual(MUSIC_ACTIVITY_IDS,[MUSIC_ACTIVITY_ID,MUSIC_DANCE_ACTIVITY_ID]);
  const listen=getActivityDefinition(HOBBY_ACTIVITIES,MUSIC_ACTIVITY_ID);
  const dance=getActivityDefinition(HOBBY_ACTIVITIES,MUSIC_DANCE_ACTIVITY_ID);
  assert.deepEqual(dance.requiredCapabilities,listen.requiredCapabilities);
  assert.equal(listen.poseKey,'music.listen');
  assert.equal(dance.poseKey,'music.dance');
  assert.deepEqual(dance.skillPractice,[]);
  assert.deepEqual(listen.skillPractice,[]);
  assert.ok(dance.needEffects.find(x=>x.statId==='needs.fun').perMinute>
    listen.needEffects.find(x=>x.statId==='needs.fun').perMinute);
  assert.ok(dance.needEffects.find(x=>x.statId==='needs.energy').perMinute<0);
  for(const activityId of MUSIC_ACTIVITY_IDS)
    for(const contentId of MUSIC_CONTENT_IDS)
      assert.ok(createActivitySession(HOBBY_ACTIVITIES,{
        sessionId:'h2b:test:1',actorId:'alex',activityId,
        contentId,targetInstanceId:'shop-music-1'
      },HOBBY_CONTENT));
});
test('both listen and dance dispatch from typed queue through real A* and keep style',()=>{
  for(const activityId of MUSIC_ACTIVITY_IDS){
    const root=newHousehold(),id=station(root);
    const cmd={type:'activity',activityId,contentId:MUSIC_CONTENT_IDS[2],targetInstanceId:id};
    assert.ok(enqueueAction(root.actionQueues,'alex',cmd));
    const restored=restoreActionQueues(copy(root.actionQueues),['alex','mira']);
    assert.equal(restored.byResident.alex[0].activityId,activityId);
    const launched=dispatchActionQueues(root.actionQueues,{
      canStart:(who,task)=>furnitureAvailable(root,'music',who,task.targetInstanceId),
      start:(who,task)=>{
        const actor=getActor(root,who);
        const plan=chooseMusicListeningSpot(root.world,actor.position,task.targetInstanceId);
        return !!plan&&chooseResidentAction(root,'music',false,who,
          task.targetInstanceId,task.activityId,task.contentId,plan);
      }
    });
    assert.equal(launched.length,1);
    assert.equal(pendingActions(root.actionQueues,'alex').length,0);
    const a=root;
    assert.equal(a.action.activityId,activityId);
    assert.equal(a.action.contentId,MUSIC_CONTENT_IDS[2]);
    const goal=a.action.musicSpot;
    const before=a.needs.fun;
    tickHousehold(root,1);
    assert.equal(a.action.phase,'walking');
    assert.ok(a.needs.fun<=before);
    a.position={...goal};arrive(a);
    tickHousehold(root,3);
    assert.equal(a.activitySession?.phase,'using');
    assert.ok(a.needs.fun>before,'active, real music use grants leisure');
    assert.equal(a.skills.xpById[READING_SKILL_ID]||0,0);
    assert.equal(audibleMusicStyle([a]),MUSIC_CONTENT_IDS[2]);
    const loaded=loadHousehold(copy(root));
    assert.equal(loaded.action?.activityId,activityId);
    assert.equal(loaded.activitySession?.activityId,activityId);
  }
});
test('dancing earns faster fun and expends a small extra energy amount vs listening',()=>{
  const l=newHousehold(),d=newHousehold(),lid=station(l),did=station(d);
  const listener=getUsing(l,lid,MUSIC_ACTIVITY_ID);
  const dancer=getUsing(d,did,MUSIC_DANCE_ACTIVITY_ID);
  tickHousehold(l,5);tickHousehold(d,5);
  assert.ok(dancer.needs.fun>listener.needs.fun);
  assert.ok(dancer.needs.energy<listener.needs.energy);
  assert.equal(dancer.skills.xpById[READING_SKILL_ID]||0,0);
});
test('dance keeps existing exclusivity, disabled furniture and cancellation guards',()=>{
  const root=newHousehold(),id=station(root);
  start(root,id,MUSIC_DANCE_ACTIVITY_ID);
  assert.equal(furnitureAvailable(root,'music','mira',id),false);
  assert.equal(chooseResidentAction(root,'music',false,'mira',id,
    MUSIC_ACTIVITY_ID,MUSIC_CONTENT_IDS[0]),false);
});
test('dance and listening motion are different in real joint positions and loop deterministically',()=>{
  const passive=musicMovementFrame({phase:'using',activityId:MUSIC_ACTIVITY_ID,
    contentId:'music.rhythmic',elapsed:1.1});
  const active=musicMovementFrame({phase:'using',activityId:MUSIC_DANCE_ACTIVITY_ID,
    contentId:'music.rhythmic',elapsed:1.1});
  assert.equal(passive.kind,'listen');assert.equal(active.kind,'dance');
  assert.notDeepEqual(passive.arms,active.arms);
  assert.ok(Math.abs(active.spineTwist)>Math.abs(passive.spineTwist));
  assert.ok(Math.abs(active.legs[0])>Math.abs(passive.legs[0]));
  assert.deepEqual(active,musicMovementFrame({phase:'using',
    activityId:MUSIC_DANCE_ACTIVITY_ID,contentId:'music.rhythmic',elapsed:1.1}));
  assert.equal(musicMovementFrame(null),null);
  assert.equal(musicMovementFrame({phase:'walking',activityId:MUSIC_DANCE_ACTIVITY_ID,elapsed:1.1}),null);
  assert.equal(musicMovementFrame({phase:'using',activityId:'not.music',elapsed:1.1}),null);
});
test('procedural fallback transforms both listening and dancing body/legs',()=>{
  const state=createAnimationState();
  const make=id=>stepAnimation(state,{using:'music',musicActivityId:id,
    musicStyleId:'music.rhythmic',musicElapsed:1.1,energy:75},.04);
  const listen=make(MUSIC_ACTIVITY_ID),dance=make(MUSIC_DANCE_ACTIVITY_ID);
  assert.notDeepEqual(listen.arms,dance.arms);
  assert.notDeepEqual(listen.legs,dance.legs);
  assert.notEqual(listen.spineTwist,dance.spineTwist);
});
test('Mixamo overlay works with original bones and does not animate while walking or paused',()=>{
  const touched=[];
  class Quat{
    setFromEulerAngles(x,y,z){this.data=[x,y,z];return this;}
    mul2(base,offset){this.data=[...(base.data||[0,0,0]),...offset.data];return this;}
  }
  const bones=new Map();
  const model={findByName(name){
    if(!bones.has(name))bones.set(name,{getLocalRotation(){return {data:[0,0,0]};},
      setLocalRotation(q){touched.push({name,angles:q.data});}});
    return bones.get(name);
  }};
  const overlay=createMeshyMusicController({pc:{Quat},model});
  assert.equal(overlay.ready,true);
  overlay.setFrame({phase:'walking',activityId:MUSIC_DANCE_ACTIVITY_ID,elapsed:2});
  assert.equal(overlay.apply(),false);
  overlay.setFrame({phase:'using',activityId:MUSIC_ACTIVITY_ID,contentId:'music.calm',elapsed:2});
  assert.equal(overlay.apply(),true);
  const listen=touched.map(x=>x.name);
  assert.ok(listen.includes('mixamorig:LeftArm'));
  assert.ok(listen.includes('mixamorig:Neck'));
  touched.length=0;
  overlay.setFrame({phase:'using',activityId:MUSIC_DANCE_ACTIVITY_ID,contentId:'music.rhythmic',elapsed:2});
  assert.equal(overlay.apply(),true);
  assert.ok(touched.some(x=>x.name==='mixamorig:LeftUpLeg'));
  touched.length=0;
  overlay.setFrame({phase:'using',activityId:MUSIC_DANCE_ACTIVITY_ID,elapsed:2},true);
  assert.equal(overlay.apply(),false);
  assert.equal(touched.length,0);
  overlay.setFrame(null);assert.equal(overlay.apply(),false);
});
test('both Meshy skins keep real rigs during music and fall back if music joints unavailable',()=>{
  for(const gate of [canShowMeshy,canShowMiraMeshy]){
    assert.equal(gate({preferred:true,ready:true,actionId:'music',
      musicBusy:true,musicReady:true}),true);
    assert.equal(gate({preferred:true,ready:true,actionId:'music',
      musicBusy:true,musicReady:false}),false);
    assert.equal(gate({preferred:true,ready:true,actionId:'music',
      musicBusy:false,musicReady:false}),true);
  }
});
test('both on-screen buttons and GLB controllers use explicit activity frames',()=>{
  const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
  const html=read('../index.html'),game=read('../src/game.js'),
    alex=read('../src/meshy-visual.js'),mira=read('../src/meshy-mira-visual.js'),
    workflow=read('../.github/workflows/pages.yml');
  assert.match(html,/id="music-dance-button"/);
  assert.match(html,/Танцевать/);
  assert.match(game,/music-dance-button'\)\.addEventListener\('click'/);
  assert.match(game,/activityId:MUSIC_DANCE_ACTIVITY_ID/);
  assert.match(game,/musicFrame:game\.otherSim\.action\?\.id==='music'/);
  assert.match(game,/musicFrame:game\.action\?\.id==='music'/);
  for(const src of [alex,mira]){
    assert.match(src,/createMeshyMusicController/);
    assert.match(src,/musicRuntime\?\.setFrame/);
    assert.match(src,/musicFrame\?\.phase==='using'/);
  }
  assert.match(workflow,/cp src\/music-movement\.js src\/meshy-music-runtime\.js site\/src\//);
});
