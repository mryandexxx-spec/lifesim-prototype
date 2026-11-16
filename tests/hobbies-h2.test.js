import test from 'node:test';
import assert from 'node:assert/strict';
import {HOBBY_ACTIVITIES,HOBBY_CONTENT,MUSIC_ACTIVITY_ID,MUSIC_CONTENT_IDS,READING_SKILL_ID}
  from '../src/hobby-reading.js';
import {getActivityDefinition} from '../src/activity-registry.js';
import {getHobbyContent} from '../src/hobby-content.js';
import {FURNITURE_CATALOG,furnitureRenderOrigin,furnitureActionApproach} from '../src/furniture-catalog.js';
import {FURNITURE_PRODUCTS} from '../src/furniture-products.js';
import {findMarketPlacement,buyMarketItem,storeMarketItem} from '../src/furniture-shop.js';
import {newHousehold,chooseResidentAction,getActor,tickHousehold,furnitureAvailable,
  loadHousehold} from '../src/household.js';
import {arrive,SAVE_KEY} from '../src/simulation.js';
import {enqueueAction,restoreActionQueues} from '../src/action-queue.js';
import {audibleMusicStyle,createMusicAudio,MUSIC_STYLE_NOTES} from '../src/music-audio.js';
import {canShowMeshy} from '../src/meshy-visual-policy.js';
import {canShowMiraMeshy} from '../src/meshy-mira-policy.js';

const copy=value=>JSON.parse(JSON.stringify(value));
function buyStation(root){
  const pose=findMarketPlacement(root.world.furniture,root.shop,'music.starter');
  assert.ok(pose,'music station must have a real purchasable floor placement');
  const result=buyMarketItem(root.world.furniture,root.shop,'music.starter',pose);
  assert.equal(result.ok,true);
  root.world.furniture=result.world;root.shop=result.shop;
  return result.instanceId;
}
function beginListening(root,id,who='alex',style=MUSIC_CONTENT_IDS[0]){
  assert.equal(chooseResidentAction(root,'music',false,who,id,
    MUSIC_ACTIVITY_ID,style),true);
  return getActor(root,who);
}
function reachStation(root,actor,id){
  const point=furnitureActionApproach(root.world,'music',id);
  assert.ok(point);
  actor.position={...point};
  arrive(actor);
  assert.equal(actor.action.phase,'using');
}

test('H2 content is authored independently of music performance skill',()=>{
  assert.deepEqual(Object.keys(MUSIC_STYLE_NOTES),MUSIC_CONTENT_IDS);
  const def=getActivityDefinition(HOBBY_ACTIVITIES,MUSIC_ACTIVITY_ID);
  assert.deepEqual(def.requiredCapabilities,['music.playback']);
  assert.deepEqual(def.skillPractice,[]);
  assert.equal(def.audioCue,'music.original');
  for(const id of MUSIC_CONTENT_IDS)
    assert.equal(getHobbyContent(HOBBY_CONTENT,id)?.kind,'musicStyle');
});
test('H2 console is not preowned and has a template renderer and real shop SKU',()=>{
  assert.equal(FURNITURE_CATALOG.music.templateOnly,true);
  assert.equal(furnitureRenderOrigin('music').location,'template');
  assert.equal(FURNITURE_PRODUCTS.find(x=>x.itemId==='music.starter').price,390);
  assert.equal(newHousehold().world.furniture.instances.some(x=>x.prefabId==='music'),false);
});
test('H2 walking never earns music fun, playing requires real arrival',()=>{
  const root=newHousehold(),id=buyStation(root),actor=beginListening(root,id);
  const initial=actor.needs.fun;
  tickHousehold(root,1);
  assert.equal(actor.action.phase,'walking');
  assert.equal(actor.activitySession.phase,'walking');
  assert.ok(actor.needs.fun<=initial);
  reachStation(root,actor,id);
  const before=actor.needs.fun;
  tickHousehold(root,3);
  assert.equal(actor.activitySession.phase,'using');
  assert.ok(actor.needs.fun>before);
  assert.equal(actor.action.elapsed,3);
  assert.equal(actor.skills.xpById[READING_SKILL_ID]||0,0);
});
test('H2 each style persists in a safe, optional v1 save without awarding XP',()=>{
  for(const style of MUSIC_CONTENT_IDS){
    const root=newHousehold(),id=buyStation(root),actor=beginListening(root,id,'mira',style);
    reachStation(root,actor,id);
    tickHousehold(root,4);
    const restored=loadHousehold(copy(root));
    const current=getActor(restored,'mira');
    assert.equal(current.action?.contentId,style);
    assert.equal(current.activitySession?.contentId,style);
    assert.equal(current.action.elapsed,4);
    tickHousehold(restored,1);
    assert.equal(current.action.elapsed,5);
    assert.equal(current.skills.xpById[READING_SKILL_ID]||0,0);
  }
});
test('H2 exclusive device permits only one listener per physical station',()=>{
  const root=newHousehold(),id=buyStation(root);
  beginListening(root,id,'alex');
  assert.equal(furnitureAvailable(root,'music','mira',id),false);
  assert.equal(chooseResidentAction(root,'music',false,'mira',id,MUSIC_ACTIVITY_ID,MUSIC_CONTENT_IDS[1]),false);
});
test('H2 removed or stored device cancels action before any further reward',()=>{
  const root=newHousehold(),id=buyStation(root),actor=beginListening(root,id);
  reachStation(root,actor,id);
  tickHousehold(root,2);
  const stored=storeMarketItem(root.world.furniture,root.shop,id);
  assert.equal(stored.ok,true);
  root.world.furniture=stored.world;
  const before=actor.needs.fun;
  tickHousehold(root,1);
  assert.equal(actor.action,null);
  assert.equal(actor.activitySession,null);
  assert.ok(actor.needs.fun<=before);
});
test('H2 corrupted or mismatched saved session fails closed, not reset apartment',()=>{
  const root=newHousehold(),id=buyStation(root),actor=beginListening(root,id);
  reachStation(root,actor,id);
  tickHousehold(root,2);
  const raw=copy(root);
  raw.activitySession.contentId=MUSIC_CONTENT_IDS[1];
  const restored=loadHousehold(raw);
  assert.equal(restored.action,null);
  assert.ok(restored.world.furniture.instances.some(x=>x.instanceId===id));
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
});
test('H2 music queue validates real style and survives restore',()=>{
  const root=newHousehold(),id=buyStation(root);
  const command={type:'activity',activityId:MUSIC_ACTIVITY_ID,
    contentId:MUSIC_CONTENT_IDS[2],targetInstanceId:id};
  assert.ok(enqueueAction(root.actionQueues,'mira',command));
  assert.equal(enqueueAction(root.actionQueues,'alex',{...command,contentId:'music.unknown'}),null);
  const restored=restoreActionQueues(copy(root.actionQueues),['alex','mira']);
  assert.equal(restored.byResident.mira[0].contentId,MUSIC_CONTENT_IDS[2]);
});
test('H2 audio never unlocks from simulation, and muted/background sessions are silent',async()=>{
  let creations=0;
  const sound=createMusicAudio({contextFactory:()=>{
    creations++;
    return {state:'running',currentTime:0,destination:{},
      createGain(){return {gain:{value:0,cancelScheduledValues(){},setTargetAtTime(){},
        setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};},
      createOscillator(){return {type:'sine',frequency:{setValueAtTime(){}},
        connect(){},start(){},stop(){}};},
      resume(){return Promise.resolve();}};
  }});
  assert.equal(sound.update('music.calm'),false);
  assert.equal(creations,0);
  assert.equal(await sound.enable(),true);
  assert.equal(creations,1);
  sound.setMuted(true);
  assert.equal(sound.update('music.calm'),false);
  sound.setMuted(false);
  assert.equal(sound.update('music.calm'),true);
  assert.equal(sound.update(null),false);
  const actor={action:{id:'music',phase:'using',contentId:'music.calm',
    targetInstanceId:'shop-music-1'},
    activitySession:{phase:'using',targetInstanceId:'shop-music-1'}};
  assert.equal(audibleMusicStyle([actor]),'music.calm');
  assert.equal(audibleMusicStyle([actor],{hidden:true}),null);
  assert.equal(audibleMusicStyle([actor],{paused:true}),null);
  assert.equal(audibleMusicStyle([actor],{editing:true}),null);
  actor.action.phase='walking';
  assert.equal(audibleMusicStyle([actor]),null);
});
test('H2 both Meshy residents retain original skinned appearance while listening',()=>{
  assert.equal(canShowMeshy({preferred:true,ready:true,actionId:'music'}),true);
  assert.equal(canShowMiraMeshy({preferred:true,ready:true,actionId:'music'}),true);
});
