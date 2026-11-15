import test from 'node:test';
import assert from 'node:assert/strict';
import {newSocialGraph,markAcquainted,observePairViews,getPair,applySocialEvent,
  restoreSocialGraph} from '../src/social-graph.js';
import {newActionQueues,enqueueAction} from '../src/action-queue.js';
import {createProfile} from '../src/trait-catalog.js';
import {pairSocialHabits,proposeAutonomousSocial,autonomousLeisureToken,
  AUTONOMOUS_HABIT_WINDOW_DAYS,AUTONOMOUS_PAIR_COOLDOWN} from '../src/social-dynamics.js';
import {SAVE_KEY} from '../src/simulation.js';

const ids=['nova','ember','iris','opal','riven'],DAY=1440;
const copy=x=>JSON.parse(JSON.stringify(x));
const resident=likes=>({needs:{energy:85,hunger:88,hygiene:85,fun:23},
  personality:createProfile(['temperament.cheerful','social.outgoing'],{likes,dislikes:[]}),
  mind:{mood:{value:72}},autonomy:{enabled:true},paused:false,action:null});
function fixture(likes=['books','music']){
  const graph=newSocialGraph(ids);
  markAcquainted(graph,'nova','ember',480);
  observePairViews(graph,'nova','ember',{nova:{friendship:70,trust:75,tension:4},
    ember:{friendship:72,trust:73,tension:5}});
  return {graph,actorId:'nova',
    residents:Object.fromEntries(ids.map(id=>[id,resident(likes)])),
    queues:newActionQueues(ids),minutes:1000,enabled:true,nextSocialAt:0};
}
function event(c,actor,type,at,choice){
  return applySocialEvent(c.graph,{actorId:actor,targetId:actor==='nova'?'ember':'nova',
    type,at,...(choice?{token:autonomousLeisureToken(choice,c.graph.nextSeq)}:{})});
}
test('1.0j familiarity requires completed activity on different days and stays directional',()=>{
  const c=fixture(),p=getPair(c.graph,'nova','ember');
  assert.equal(AUTONOMOUS_HABIT_WINDOW_DAYS,10);
  event(c,'nova','leisure.accepted',600,'books');
  event(c,'nova','leisure.accepted',670,'books');
  assert.deepEqual(pairSocialHabits(p,'nova',680).familiar,{});
  event(c,'nova','leisure.accepted',DAY+700,'books');
  assert.equal(pairSocialHabits(p,'nova',DAY+720).familiar['leisure.books'],2);
  assert.deepEqual(pairSocialHabits(p,'ember',DAY+720).familiar,{});
  assert.deepEqual(pairSocialHabits(p,'iris',DAY+720),{recent:[],familiar:{}});
  event(c,'ember','leisure.accepted',2*DAY+700,'music');
  assert.equal(pairSocialHabits(p,'nova',2*DAY+720).familiar['leisure.music'],undefined);
});
test('derived history survives v1 restore without a parallel stored score and expires',()=>{
  const c=fixture();
  event(c,'nova','friend.tease',600);
  event(c,'nova','friend.tease',DAY+600);
  const moment=DAY+1000,before=copy(c.graph);
  const history=pairSocialHabits(getPair(c.graph,'nova','ember'),'nova',moment);
  const loaded=restoreSocialGraph(copy(c.graph),ids);
  assert.deepEqual(pairSocialHabits(getPair(loaded,'nova','ember'),'nova',moment),history);
  assert.deepEqual(c.graph,before);
  assert.equal(Object.hasOwn(getPair(c.graph,'nova','ember'),'habits'),false);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.deepEqual(pairSocialHabits(getPair(loaded,'nova','ember'),'nova',
    moment+(AUTONOMOUS_HABIT_WINDOW_DAYS+1)*DAY).familiar,{});
});
test('alternating two favorite hobbies cannot continue in an endless A/B/A/B loop',()=>{
  const c=fixture();
  for(const [who,activity,at] of [['nova','books',600],['ember','music',DAY+600],
    ['nova','books',2*DAY+600],['ember','music',3*DAY+600]])
    event(c,who,'leisure.accepted',at,activity);
  c.minutes=3*DAY+600+AUTONOMOUS_PAIR_COOLDOWN;
  const snapshot=JSON.stringify(c),result=proposeAutonomousSocial(c);
  assert.ok(result===null||result.kind==='talk');
  assert.ok(!result?.action||result.action.type!=='shared');
  assert.equal(JSON.stringify(c),snapshot);
});
test('repeated conversations allow quiet time and later a new invitation',()=>{
  const c=fixture([]);
  c.residents.ember.mind.mood.value=50;
  event(c,'nova','talk',600);
  event(c,'nova','talk',DAY+600);
  c.minutes=DAY+600+AUTONOMOUS_PAIR_COOLDOWN;
  assert.equal(proposeAutonomousSocial(c),null);
  c.minutes=DAY+600+2*AUTONOMOUS_PAIR_COOLDOWN;
  assert.equal(proposeAutonomousSocial(c)?.kind,'talk');
});
test('manual FIFOs, running tasks and basic needs still veto a learned habit',()=>{
  const c=fixture(['books']);
  event(c,'nova','leisure.accepted',600,'books');
  event(c,'nova','leisure.accepted',DAY+600,'books');
  c.minutes=DAY+1200;
  enqueueAction(c.queues,'ember',{type:'object',actionId:'bed'});
  assert.equal(proposeAutonomousSocial(c),null);
  c.queues=newActionQueues(ids);c.residents.nova.action={id:'sofa',phase:'using'};
  assert.equal(proposeAutonomousSocial(c),null);
  c.residents.nova.action=null;c.residents.ember.needs.hunger=15;
  assert.equal(proposeAutonomousSocial(c),null);
});
test('refusals and untyped shared activity never invent personal habits',()=>{
  const c=fixture([]),p=getPair(c.graph,'nova','ember');
  event(c,'nova','leisure.refused',600);
  event(c,'nova','acquaint.chat.refused',DAY+600);
  event(c,'nova','leisure.accepted',DAY+700);
  assert.deepEqual(pairSocialHabits(p,'nova',DAY+900).familiar,{});
  assert.ok(p.events.every(e=>e.token===undefined));
  assert.equal(proposeAutonomousSocial({...c,minutes:DAY+700+960})?.action?.type,
    undefined);
});
