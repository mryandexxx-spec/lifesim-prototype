import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSkillRegistry,getSkillDefinition,deriveSkillLevel,skillUnlocksAtLevel} from '../src/skill-registry.js';
import {createHobbyContentCatalog,getHobbyContent,contentByKind} from '../src/hobby-content.js';
import {createActivityRegistry,getActivityDefinition,activitiesForItem} from '../src/activity-registry.js';
import {createActivitySession,restoreActivitySession,arriveActivitySession,
  advanceActivitySession,completeActivitySession,cancelActivitySession} from '../src/activity-session.js';
import {newSkillProgress,restoreSkillProgress,currentSkillLevel,creditActivityPractice} from '../src/skills-engine.js';
import {createObjectRegistry,filterObjectItems} from '../src/object-definition-registry.js';
import {newHousehold,loadHousehold} from '../src/household.js';
import {ACTIONS,SAVE_KEY} from '../src/simulation.js';
import {LEISURE_CATALOG,GIFT_CATALOG,starterInventory} from '../src/gifts-leisure.js';

const skillDefs=[{id:'literature',group:'knowledge',label:'Литературная эрудиция',
  maxLevel:4,xpThresholds:[10,30,60,100],practiceTags:['book.fiction'],
  unlocks:[{id:'read.poetry',minLevel:2}]},
  {id:'music.performance',group:'creative',label:'Исполнение музыки',
    maxLevel:3,xpThresholds:[20,60,150],practiceTags:['instrument.keys']}];
const skills=()=>createSkillRegistry({skills:skillDefs});
const content=()=>createHobbyContentCatalog({entries:[
  {id:'book.test.stories',kind:'book',label:'Истории путешественника',
    difficulty:1,tags:['book.fiction'],skillTags:['literature']},
  {id:'music.test.soft',kind:'musicstyle',label:'Тёплый вечер',
    difficulty:1,tags:['music.calm'],skillTags:[]}]});
const activityDefs=[
  {id:'hobby.read.fiction',label:'Читать',kind:'leisure',source:'item',
    participation:'solo',requiredCapabilities:['books.borrow'],contentKind:'book',
    timeBudget:{minMinutes:6,targetMinutes:30},
    needEffects:[{statId:'needs.fun',perMinute:0.7}],
    skillPractice:[{skillId:'literature',xpPerMinute:2}],
    poseKey:'reading.book',audioCue:null},
  {id:'hobby.listen.music',label:'Слушать музыку',kind:'leisure',source:'item',
    participation:'solo',requiredCapabilities:['music.playback'],contentKind:'musicstyle',
    timeBudget:{minMinutes:5,targetMinutes:25},
    needEffects:[{statId:'needs.fun',perMinute:0.9}],skillPractice:[],
    poseKey:'listen.music',audioCue:'music.original.preview'},
  {id:'hobby.read.owned',label:'Читать подаренную книгу',kind:'leisure',
    source:'inventory',participation:'solo',requiredCapabilities:['books.readowned'],
    contentKind:'book',timeBudget:{minMinutes:5,targetMinutes:20},
    skillPractice:[{skillId:'literature',xpPerMinute:1}]},
  {id:'hobby.read.together',label:'Читать вдвоём',kind:'social',source:'item',
    participation:'paired',requiredCapabilities:['books.borrow'],
    contentKind:'book',timeBudget:{minMinutes:10,targetMinutes:40},
    skillPractice:[{skillId:'literature',xpPerMinute:1}]}];
const activities=()=>createActivityRegistry({activities:activityDefs,
  skills:skills(),content:content()});
const newRead=(registry=activities())=>createActivitySession(registry,{
  sessionId:'activity:42',actorId:'alex',activityId:'hobby.read.fiction',
  targetInstanceId:'shop-bookcase-1',contentId:'book.test.stories'},content());
const auth={authorized:true,resourceAvailable:true};

test('H0 skill definitions are immutable with finite XP curves and declarative unlocks',()=>{
  const r=skills();
  assert.ok(Object.isFrozen(r.skills.literature.xpThresholds));
  assert.ok(Object.isFrozen(r.skills.literature.unlocks[0]));
  assert.equal(getSkillDefinition(r,'literature').maxLevel,4);
  assert.equal(deriveSkillLevel(r,'literature',0),0);
  assert.equal(deriveSkillLevel(r,'literature',9.99),0);
  assert.equal(deriveSkillLevel(r,'literature',10),1);
  assert.equal(deriveSkillLevel(r,'literature',60),3);
  assert.equal(deriveSkillLevel(r,'literature',Infinity),0);
  assert.equal(deriveSkillLevel(r,'literature',100),4);
  assert.deepEqual(skillUnlocksAtLevel(r,'literature',1),[]);
  assert.deepEqual(skillUnlocksAtLevel(r,'literature',2).map(x=>x.id),['read.poetry']);
});
test('H0 skill authoring rejects duplicate IDs, nonmonotonic curves and impossible unlocks',()=>{
  assert.throws(()=>createSkillRegistry({skills:[...skillDefs,skillDefs[0]]}),/duplicate skill/);
  assert.throws(()=>createSkillRegistry({skills:[{...skillDefs[0],xpThresholds:[10,10,60,100]}]}),/XP threshold/);
  assert.throws(()=>createSkillRegistry({skills:[{...skillDefs[0],maxLevel:5}]}),/threshold count/);
  assert.throws(()=>createSkillRegistry({skills:[{...skillDefs[0],unlocks:[{id:'new.technique',minLevel:5}]}]}),/unlock level/);
  assert.throws(()=>createSkillRegistry({skills:[{...skillDefs[0],practiceTags:['book.fiction','book.fiction']}]}),/duplicate practice/);
});
test('H0 content is authored independently of object definitions and gift inventory',()=>{
  const c=content();
  assert.equal(getHobbyContent(c,'book.test.stories').difficulty,1);
  assert.equal(contentByKind(c,'book').length,1);
  assert.equal(contentByKind(c,'musicstyle').length,1);
  assert.ok(Object.isFrozen(c.entries['book.test.stories'].tags));
  assert.equal(getHobbyContent(c,'unknown'),null);
  assert.throws(()=>createHobbyContentCatalog({entries:[c.entries['book.test.stories'],c.entries['book.test.stories']]}),/duplicate/);
  assert.throws(()=>createHobbyContentCatalog({entries:[{...c.entries['book.test.stories'],difficulty:99}]}),/difficulty/);
});
test('H0 activity registry can connect to existing F4b0 capability system without prefab switches',()=>{
  const a=activities();
  const objects=createObjectRegistry({items:[
    {id:'bookcase.simple',name:'Книжный шкаф',prefabId:'bookcase',categoryIds:[],
      capabilities:['books.borrow'],price:200},
    {id:'music.stand',name:'Музыкальный центр',prefabId:'stereo',categoryIds:[],
      capabilities:['music.playback'],price:300}],categories:[]});
  assert.equal(activitiesForItem(a,objects.items['bookcase.simple']).length,2);
  assert.deepEqual(activitiesForItem(a,objects.items['music.stand']).map(x=>x.id),['hobby.listen.music']);
  assert.deepEqual(activitiesForItem(a,objects.items['bookcase.simple']).map(x=>x.id),
    ['hobby.read.fiction','hobby.read.together']);
  assert.equal(filterObjectItems(objects,{capability:'books.borrow'}).length,1);
  assert.equal(getActivityDefinition(a,'hobby.read.owned').source,'inventory');
});
test('H0 registry cannot claim unknown skills or content kinds, or duplicate need effects',()=>{
  assert.throws(()=>createActivityRegistry({activities:[{...activityDefs[0],
    skillPractice:[{skillId:'unknown',xpPerMinute:1}]}],skills:skills(),content:content()}),/unknown skill/);
  assert.throws(()=>createActivityRegistry({activities:[{...activityDefs[0],contentKind:'fiction'}],
    skills:skills(),content:content()}),/unknown content kind/);
  assert.throws(()=>createActivityRegistry({activities:[{...activityDefs[0],
    needEffects:[{statId:'needs.fun',perMinute:1},{statId:'needs.fun',perMinute:2}]}],
    skills:skills(),content:content()}),/duplicate need effect/);
  assert.throws(()=>createActivityRegistry({activities:[activityDefs[0],activityDefs[0]],
    skills:skills(),content:content()}),/duplicate/);
  assert.throws(()=>createActivityRegistry({activities:[{...activityDefs[0],
    timeBudget:{minMinutes:40,targetMinutes:20}}],skills:skills(),content:content()}),/timeBudget/);
});
test('H0 listening to music has no musical performance XP despite having a music object',()=>{
  const def=getActivityDefinition(activities(),'hobby.listen.music');
  assert.equal(def.audioCue,'music.original.preview');
  assert.deepEqual(def.skillPractice,[]);
  assert.ok(def.needEffects.length);
});
test('H0 requires a real station or an explicitly owned item, and validates partner roles',()=>{
  const a=activities();
  assert.equal(createActivitySession(a,{sessionId:'activity:1',actorId:'alex',
    activityId:'hobby.read.fiction',targetInstanceId:'unknown',contentId:'book.test.stories'},content())?.phase,'walking');
  assert.equal(createActivitySession(a,{sessionId:'activity:1',actorId:'alex',
    activityId:'hobby.read.fiction',inventoryItemId:'m1',contentId:'book.test.stories'},content()),null);
  assert.equal(createActivitySession(a,{sessionId:'activity:1',actorId:'alex',
    activityId:'hobby.read.fiction',targetInstanceId:'shop-bookcase-1',contentId:'music.test.soft'},content()),null);
  assert.equal(createActivitySession(a,{sessionId:'activity:1',actorId:'alex',
    activityId:'hobby.read.together',targetInstanceId:'shop-bookcase-1',contentId:'book.test.stories'},content()),null);
  const paired=createActivitySession(a,{sessionId:'activity:1',actorId:'alex',partnerId:'mira',
    activityId:'hobby.read.together',targetInstanceId:'shop-bookcase-1',
    contentId:'book.test.stories'},content());
  assert.equal(paired.partnerId,'mira');
  const owned=createActivitySession(a,{sessionId:'activity:2',actorId:'mira',
    activityId:'hobby.read.owned',inventoryItemId:'m1',contentId:'book.test.stories'},content());
  assert.equal(owned.inventoryItemId,'m1');
});
test('H0 progress requires explicit arrival and authorization; pause and resource loss are neutral',()=>{
  const a=activities(),initial=newRead(a);
  assert.equal(arriveActivitySession(initial,{}),null);
  assert.equal(arriveActivitySession(initial,{authorized:true}),null);
  assert.equal(advanceActivitySession(a,initial,15,auth).usedMinutes,0);
  const using=arriveActivitySession(initial,auth);
  assert.equal(using.phase,'using');
  assert.equal(advanceActivitySession(a,using,10,{...auth,paused:true}).usedMinutes,0);
  assert.equal(advanceActivitySession(a,using,10,{authorized:true}).usedMinutes,0);
  assert.equal(advanceActivitySession(a,using,10,{...auth,resourceAvailable:false}).usedMinutes,0);
  assert.equal(advanceActivitySession(a,using,NaN,auth).usedMinutes,0);
  const progressed=advanceActivitySession(a,using,12,auth);
  assert.equal(progressed.usedMinutes,12);
  assert.equal(progressed.session.elapsed,12);
  assert.equal(progressed.session.phase,'using');
  assert.equal(using.elapsed,0);
});
test('H0 target time caps progress at game minutes and completion needs canonical receipt',()=>{
  const a=activities(),using=arriveActivitySession(newRead(a),auth);
  const p=advanceActivitySession(a,using,1440,auth);
  assert.equal(p.usedMinutes,30);
  assert.equal(p.session.phase,'ready');
  assert.equal(completeActivitySession(a,p.session,{}),null);
  assert.equal(completeActivitySession(a,p.session,{authorized:true,eventId:'receipt:1'}),null);
  const done=completeActivitySession(a,p.session,{...auth,eventId:'receipt:1'});
  assert.equal(done.phase,'done');
  assert.equal(done.receiptId,'receipt:1');
  assert.equal(completeActivitySession(a,done,{...auth,eventId:'receipt:1'}),null);
  assert.equal(advanceActivitySession(a,done,3,auth).usedMinutes,0);
});
test('H0 cancelled / refused sessions cannot complete and never gain new time',()=>{
  const a=activities(),using=arriveActivitySession(newRead(a),auth);
  const stopped=cancelActivitySession(using);
  assert.equal(stopped.phase,'canceled');
  assert.equal(advanceActivitySession(a,stopped,20,auth).usedMinutes,0);
  assert.equal(completeActivitySession(a,stopped,{...auth,eventId:'receipt:77'}),null);
  assert.equal(cancelActivitySession(stopped),null);
});
test('H0 restore verifies strict phase, bounds, known content and no finished replay',()=>{
  const a=activities();
  const using=advanceActivitySession(a,arriveActivitySession(newRead(a),auth),12,auth).session;
  assert.deepEqual(restoreActivitySession(a,JSON.parse(JSON.stringify(using)),content()),using);
  assert.equal(restoreActivitySession(a,{...using,activityId:'invalid'},content()),null);
  assert.equal(restoreActivitySession(a,{...using,awardedMinutes:13},content()),null);
  assert.equal(restoreActivitySession(a,{...using,elapsed:100},content()),null);
  assert.equal(restoreActivitySession(a,{...using,phase:'walking'},content()),null);
  assert.equal(restoreActivitySession(a,{...using,receiptId:'receipt:3'},content()),null);
  assert.equal(restoreActivitySession(a,{...using,contentId:'unknown'},content()),null);
  assert.equal(restoreActivitySession(a,{...using,phase:'done'},content()),null);
});
test('H0 skill progress restores old missing data neutrally and sanitizes corrupt unknown XP',()=>{
  const r=skills();
  assert.deepEqual(restoreSkillProgress(undefined,r),newSkillProgress());
  const restored=restoreSkillProgress({schema:1,xpById:{
    literature:42,'music.performance':999999,nonexistent:100,bad:-10}},r);
  assert.equal(restored.xpById.literature,42);
  assert.equal(restored.xpById['music.performance'],150);
  assert.equal(restored.xpById.nonexistent,undefined);
  assert.equal(currentSkillLevel(restored,r,'literature'),2);
  assert.equal(currentSkillLevel(restored,r,'music.performance'),3);
});
test('H0 XP is awarded only for elapsed authorized active reading; same checkpoint cannot pay twice',()=>{
  const a=activities(),r=skills(),using=arriveActivitySession(newRead(a),auth);
  const p=advanceActivitySession(a,using,8,auth);
  assert.equal(creditActivityPractice(newSkillProgress(),r,a,p.session,{content:content()}),null);
  const gained=creditActivityPractice(newSkillProgress(),r,a,p.session,
    {...auth,content:content()});
  assert.equal(gained.progress.xpById.literature,16);
  assert.equal(gained.usedMinutes,8);
  assert.equal(gained.session.awardedMinutes,8);
  assert.equal(gained.changes[0].level,1);
  assert.equal(creditActivityPractice(gained.progress,r,a,gained.session,
    {...auth,content:content()}),null);
  const next=advanceActivitySession(a,gained.session,7,auth).session;
  const gain2=creditActivityPractice(gained.progress,r,a,next,{...auth,content:content()});
  assert.equal(gain2.progress.xpById.literature,30);
  assert.equal(gain2.changes[0].level,2);
  assert.equal(gained.progress.xpById.literature,16);
});
test('H0 XP is bounded and split clocks and larger game-minute steps produce identical result',()=>{
  const a=activities(),r=skills(),start=arriveActivitySession(newRead(a),auth);
  const completed=advanceActivitySession(a,start,30,auth).session;
  const whole=creditActivityPractice(newSkillProgress(),r,a,completed,{...auth,content:content()});
  let session=start,progress=newSkillProgress();
  for(const m of [5,6,7,12]){
    session=advanceActivitySession(a,session,m,auth).session;
    const gain=creditActivityPractice(progress,r,a,session,{...auth,content:content()});
    progress=gain.progress;session=gain.session;
  }
  assert.deepEqual(progress,whole.progress);
  assert.equal(whole.progress.xpById.literature,60);
  assert.equal(whole.session.awardedMinutes,30);
  const highProgress={schema:1,xpById:{literature:99}};
  const capped=creditActivityPractice(highProgress,r,a,completed,{...auth,content:content()});
  assert.equal(capped.progress.xpById.literature,100);
});
test('H0 XP does not leak between residents; listening gives no instrument XP',()=>{
  const a=activities(),r=skills();
  let alex=advanceActivitySession(a,arriveActivitySession(newRead(a),auth),10,auth).session;
  const gained=creditActivityPractice(newSkillProgress(),r,a,alex,{...auth,content:content()});
  const miraProgress=restoreSkillProgress(undefined,r);
  assert.equal(miraProgress.xpById.literature,undefined);
  const listening=createActivitySession(a,{sessionId:'activity:listen',actorId:'mira',
    activityId:'hobby.listen.music',targetInstanceId:'shop-stereo-1',
    contentId:'music.test.soft'},content());
  const used=advanceActivitySession(a,arriveActivitySession(listening,auth),12,auth).session;
  const noSkills=creditActivityPractice(miraProgress,r,a,used,{...auth,content:content()});
  assert.deepEqual(noSkills.changes,[]);
  assert.deepEqual(noSkills.progress.xpById,{});
  assert.equal(noSkills.session.awardedMinutes,12);
  assert.equal(gained.progress.xpById.literature,20);
});
test('H0 does not change existing household saves, catalog, inventory or runtime wiring',()=>{
  const before=newHousehold(),saved=JSON.parse(JSON.stringify(before));
  const restored=loadHousehold(saved);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(ACTIONS.sofa.need,'fun');
  assert.equal(LEISURE_CATALOG.books.tag,'books');
  assert.equal(GIFT_CATALOG.book.tag,'books');
  assert.ok(starterInventory().mira.some(v=>v.type==='book'));
  assert.deepEqual(restored.skills,{schema:1,xpById:{}});
  assert.deepEqual(restored.otherSim.skills,{schema:1,xpById:{}});
  assert.equal(restored.activitySession,null);
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  assert.match(game,/from '\.\/hobby-reading\.js'/);
  assert.match(game,/from '\.\/skills-engine\.js'/);
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/src\/game\.js\?v=1\.2m/);
});
test('H0 is checked and packaged by Pages but never masquerades as a live interaction',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  for(const name of ['skill-registry','skills-engine','activity-registry',
    'activity-session','hobby-content']){
    assert.ok(workflow.includes('node --check src/'+name+'.js'));
    assert.ok(workflow.includes('src/'+name+'.js site/src/'));
  }
});
