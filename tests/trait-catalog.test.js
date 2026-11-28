import test from 'node:test';
import assert from 'node:assert/strict';
import {TRAIT_CATALOG,DEMO_PROFILES,PROFILE_RULES,AXES,PREFERENCE_CATALOG,
  getTrait,listTraits,validateSelection,validatePreferences,createProfile,TRAIT_CONFLICTS,traitsConflict,
  restoreProfile,deriveAxes,preferenceAffinity,traitLabels,interestLabels} from '../src/trait-catalog.js';
import {activityReceipt,isSimEvent} from '../src/sim-events.js';
import {newGame,loadGame,SAVE_KEY,autonomousChoice} from '../src/simulation.js';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {selectWish,calculateMood,psychologyScore} from '../src/psychology.js';
const thinker=['temperament.melancholic','habits.neat'];
const joyful=['temperament.cheerful','coordination.clumsy'];
test('registry exposes 24 stable unique trait definitions',()=>{
  assert.equal(listTraits().length,24);
  assert.equal(new Set(listTraits().map(t=>t.id)).size,24);
  assert.equal(TRAIT_CONFLICTS.length,14);
  assert.ok(AXES.length>=10);assert.equal(PROFILE_RULES.schema,1);
  assert.equal(getTrait('coordination.clumsy').label,'Растяпа');
  assert.equal(getTrait('__proto__'),null);
  assert.equal(TRAIT_CATALOG['habits.neat'].axisDeltas.organization,.30);
});
test('melancholic neat and cheerful clumsy are valid and order-independent',()=>{
  assert.equal(validateSelection(thinker).valid,true);
  assert.equal(validateSelection(joyful).valid,true);
  assert.equal(validateSelection(['habits.neat','coordination.clumsy']).valid,true);
  assert.deepEqual(deriveAxes(createProfile(thinker)),deriveAxes(createProfile([...thinker].reverse())));
  assert.ok(deriveAxes(createProfile(thinker)).organization>.5);
  assert.ok(deriveAxes(createProfile(joyful)).coordination<.5);
});
test('same-facet, duplicate, short, excessive and unknown selections are rejected',()=>{
  for(const ids of [
    ['temperament.cheerful','temperament.melancholic'],
    ['habits.neat','habits.neat'],
    ['habits.neat'],[...thinker,'social.outgoing','values.empathetic'],
    [...thinker,'alien'],{bad:true}])
    assert.equal(validateSelection(ids).valid,false,JSON.stringify(ids));
  assert.throws(()=>createProfile(['habits.neat','habits.untidy']),RangeError);
});
test('preferences are independent, safe and cannot contradict themselves',()=>{
  const p=createProfile(joyful,{likes:['books','drawing'],dislikes:['parties']});
  assert.equal(preferenceAffinity(p,'books'),1);
  assert.equal(preferenceAffinity(p,'parties'),-1);
  assert.equal(preferenceAffinity(p,'music'),0);
  assert.ok(interestLabels(p).includes('Рисование'));
  assert.ok(traitLabels(p).includes('Весёлый'));
  assert.equal(validatePreferences({likes:['books'],dislikes:['books']}).valid,false);
  assert.equal(validatePreferences({likes:['<script>'],dislikes:[]}).valid,false);
  assert.ok(Object.keys(PREFERENCE_CATALOG).length>=8);
});
test('existing and malicious saved profiles are sanitized without mutating fallback',()=>{
  const own=createProfile(joyful,{likes:['drawing'],dislikes:['parties']});
  const round=restoreProfile(JSON.parse(JSON.stringify(own)),DEMO_PROFILES.first);
  assert.deepEqual(round,own);
  round.traitIds.push('approach.creative');
  assert.equal(own.traitIds.length,2);
  const broken={schema:1,traitIds:['__proto__','habits.neat'],
    preferences:{likes:['<img>'],dislikes:[]}};
  const restored=restoreProfile(broken,DEMO_PROFILES.first);
  assert.deepEqual(restored.traitIds,DEMO_PROFILES.first.traitIds);
  assert.deepEqual(restoreProfile(null,DEMO_PROFILES.second).traitIds,DEMO_PROFILES.second.traitIds);
});
test('additive catalog extension accepts another registered trait without a new character class',()=>{
  const extra={id:'values.patient',facet:'values',label:'Терпеливый',axisDeltas:{resilience:.2},tags:[]};
  const registry={...TRAIT_CATALOG,[extra.id]:extra};
  assert.equal(validateSelection(['temperament.cheerful','values.patient'],{catalog:registry}).valid,true);
  assert.equal(validateSelection(['temperament.cheerful','values.patient']).valid,false);
});
test('fresh household has two distinct profiles and copies are not aliased',()=>{
  const root=newHousehold();
  assert.notDeepEqual(root.personality.traitIds,root.otherSim.personality.traitIds);
  assert.equal(root.personality.traitIds[0],'temperament.melancholic');
  assert.equal(root.otherSim.personality.traitIds[0],'temperament.cheerful');
  root.personality.preferences.likes.push('drawing');
  assert.ok(!root.otherSim.personality.preferences.likes.includes('drawing'));
});
test('custom traits and preferences survive exact v1 roundtrip for both residents',()=>{
  const s=newHousehold();
  s.personality=createProfile(joyful,{likes:['books'],dislikes:['parties']});
  s.otherSim.personality=createProfile(thinker,{likes:['drawing'],dislikes:['music']});
  const t=loadHousehold(JSON.parse(JSON.stringify(s)));
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(t.version,1);
  assert.deepEqual(t.personality,s.personality);
  assert.deepEqual(t.otherSim.personality,s.otherSim.personality);
});
test('0.8a saves lacking profiles retain all old needs, relationship and memory records',()=>{
  const old=newHousehold();delete old.personality;delete old.otherSim.personality;
  old.minutes=1200;old.needs.energy=25;old.otherSim.needs.hunger=11;
  old.relationship.affinity=73;
  old.mind.memories.push({id:'regret',at:900,fulfilled:false});
  const t=loadHousehold(JSON.parse(JSON.stringify(old)));
  assert.equal(t.needs.energy,25);assert.equal(t.otherSim.needs.hunger,11);
  assert.equal(t.relationship.affinity,73);assert.equal(t.mind.memories.at(-1).id,'regret');
  assert.equal(t.personality.traitIds[0],'temperament.melancholic');
  assert.equal(t.otherSim.personality.traitIds[0],'temperament.cheerful');
});
test('single-resident loader preserves explicit profile but repairs bad profile safely',()=>{
  const s=newGame();s.needs.hunger=23;
  s.personality=createProfile(joyful);
  assert.deepEqual(loadGame(JSON.parse(JSON.stringify(s))).personality,s.personality);
  s.personality={schema:1,traitIds:['temperament.cheerful','temperament.melancholic'],
    preferences:{likes:[],dislikes:[]}};
  const t=loadGame(JSON.parse(JSON.stringify(s)));
  assert.equal(t.needs.hunger,23);
  assert.deepEqual(t.personality.traitIds,DEMO_PROFILES.first.traitIds);
});
test('same needs and memory can yield distinct mood, wishes and activity bonus from profiles',()=>{
  const a=newGame(DEMO_PROFILES.first);
  const b=newGame(DEMO_PROFILES.second);
  b.needs={...a.needs};b.mind=JSON.parse(JSON.stringify(a.mind));
  assert.notEqual(calculateMood(a.needs,a.mind,800,a.personality).value,
    calculateMood(b.needs,b.mind,800,b.personality).value);
  assert.notEqual(psychologyScore(a,'sofa',false),psychologyScore(b,'sofa',false));
  const x={...a,minutes:800,needs:{hunger:80,energy:80,hygiene:80,fun:80},mind:{memories:[]}};
  const y={...x,personality:b.personality};
  assert.ok(['bed','fridge','shower','sofa'].includes(selectWish(x)));
  assert.ok(['bed','fridge','shower','sofa'].includes(selectWish(y)));
  assert.ok(autonomousChoice({...a,minutes:590})===null||typeof autonomousChoice({...a,minutes:590})==='string');
});
test('profile changes do not affect paused ticks, saved memory or previous social contracts',()=>{
  const s=newHousehold();s.paused=true;
  const before=JSON.stringify(s);tickHousehold(s,42);
  assert.equal(JSON.stringify(s),before);
});
test('completed activity receipts are safe typed immutable values',()=>{
  const e=activityReceipt('sofa',680.25);
  assert.equal(e.type,'activity.completed');
  assert.equal(e.actionId,'sofa');
  assert.equal(isSimEvent(e),true);
  assert.equal(activityReceipt('unknown',600),null);
  assert.equal(activityReceipt('sofa',NaN),null);
  assert.equal(isSimEvent({type:'gift.given',atGameMinute:-1}),false);
});


// Independently frozen old catalogue groups; do not derive expected conflicts
// from the validator under test. Catalogue expansion must extend this fixture.
const oldTraitGroups=[
  ['temperament.cheerful','temperament.melancholic','temperament.calm','temperament.hotheaded'],
  ['habits.neat','habits.untidy'],
  ['coordination.clumsy','coordination.agile'],
  ['social.outgoing','social.reserved'],
  ['approach.creative','approach.pragmatic'],
  ['values.empathetic','values.independent']
];
test('LP-02A: exhaustive old profile pair/triple compatibility in every order',()=>{
  const ids=oldTraitGroups.flat();
  assert.ok(ids.every(id=>Object.hasOwn(TRAIT_CATALOG,id)));
  const groupOf=id=>oldTraitGroups.findIndex(g=>g.includes(id));
  const totals={2:{valid:0,invalid:0},3:{valid:0,invalid:0}};
  const inspect=selection=>{
    const valid=new Set(selection.map(groupOf)).size===selection.length;
    totals[selection.length][valid?'valid':'invalid']++;
    const [a,b,c]=selection;
    const orders=selection.length===2?[[a,b],[b,a]]:
      [[a,b,c],[a,c,b],[b,a,c],[b,c,a],[c,a,b],[c,b,a]];
    for(const order of orders){
      assert.equal(validateSelection(order).valid,valid,order.join(','));
      if(valid){
        const p=createProfile(order);
        assert.deepEqual(restoreProfile(JSON.parse(JSON.stringify(p))),p);
        assert.deepEqual(deriveAxes(p),deriveAxes(createProfile(selection)));
      }else assert.throws(()=>createProfile(order),RangeError);
    }
  };
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
    inspect([ids[i],ids[j]]);
    for(let k=j+1;k<ids.length;k++)inspect([ids[i],ids[j],ids[k]]);
  }
  assert.deepEqual(totals,{2:{valid:80,invalid:11},3:{valid:240,invalid:124}});
  for(const id of ids){
    assert.equal(validateSelection([id,id]).valid,false);
    assert.equal(validateSelection([id]).valid,false);
    assert.equal(validateSelection([id,'not.registered']).valid,false);
  }
  assert.equal(validateSelection([ids[0],ids[4],ids[6],ids[8]]).valid,false);
});

test('LP-02C: all ordered 24-trait pairs and triples against independent groups, old axes unchanged',()=>{
  const groups=[...oldTraitGroups,['novelty.curious','novelty.familiar'],['pace.patient','pace.impatient'],['tone.playful','tone.serious'],['motivation.ambitious'],['motivation.balanced'],['communication.diplomatic'],['communication.direct']];
  const ids=groups.flat(),old=oldTraitGroups.flat();
  assert.deepEqual(Object.keys(TRAIT_CATALOG).sort(),[...ids].sort());
  const group=id=>groups.findIndex(g=>g.includes(id));
  let checked=0,restored=0;
  function verify(xs){
    const valid=new Set(xs.map(group)).size===xs.length;
    const [a,b,c]=xs;
    for(const order of c?[[a,b,c],[a,c,b],[b,a,c],[b,c,a],[c,a,b],[c,b,a]]:[[a,b],[b,a]]){
      assert.equal(validateSelection(order).valid,valid,order.join(','));
      checked++;
      if(valid)assert.deepEqual(deriveAxes(createProfile(order)),deriveAxes({traitIds:order.filter(id=>old.includes(id))}));
    }
    if(valid){
      const root=newHousehold();root.personality=createProfile(xs);root.otherSim.personality=createProfile([...xs].reverse());
      const loaded=loadHousehold(JSON.parse(JSON.stringify(root)));
      assert.deepEqual(loaded.personality,root.personality);assert.deepEqual(loaded.otherSim.personality,root.otherSim.personality);restored++;
    }
  }
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
    assert.equal(traitsConflict(ids[i],ids[j]),group(ids[i])===group(ids[j]));
    assert.equal(traitsConflict(ids[i],ids[j]),traitsConflict(ids[j],ids[i]));
    verify([ids[i],ids[j]]);
    for(let k=j+1;k<ids.length;k++)verify([ids[i],ids[j],ids[k]]);
  }
  assert.equal(checked,12696);assert.equal(restored,1986);
});

import {getActor} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {plannedCareerShift} from '../src/career-scheduler.js';
import {progressCareerWork,arriveCareerPortal} from '../src/career-work.js';
import {startWorkIncident,chooseAutonomousWorkOption,automaticWorkIncident,decideWorkIncident} from '../src/career-incidents.js';
import {boundaryDisposition} from '../src/social-boundaries.js';
import {evaluateResponse} from '../src/conversation-engine.js';
import {startConversation,arriveSocial,chooseSocialLine,finishSocialConversation} from '../src/relationships.js';
import {getPair} from '../src/social-graph.js';

function mixedHousehold(){
  const root=newHousehold('2026-11-16');
  root.population={schema:1,nextResidentSerial:5,residentsById:{},linksByResident:{},kinship:[]};
  for(const id of ['alex','mira','resident_3','resident_4']){
    root.population.linksByResident[id]={familyId:'family_1',dwellingId:'dwelling_1'};
    if(id.startsWith('resident_'))root.population.residentsById[id]={id,identity:{firstName:id==='resident_3'?'Вера':'Игорь',lastName:'Тест',lifeStage:'adult'},actor:newGame()};
  }
  return loadHousehold(structuredClone(root));
}
test('LP-02C mixed four-person v1 profiles survive reload without changing existing identities',()=>{
  const root=mixedHousehold(),ids=['alex','mira','resident_3','resident_4'];
  const profiles=[['habits.neat','novelty.curious','pace.patient'],['coordination.agile','motivation.balanced','motivation.ambitious'],['communication.direct','communication.diplomatic','tone.serious'],['values.independent','novelty.familiar','tone.playful']];
  ids.forEach((id,i)=>getActor(root,id).personality=createProfile(profiles[i]));
  const restored=loadHousehold(structuredClone(root));
  ids.forEach((id,i)=>assert.deepEqual(getActor(restored,id).personality,createProfile(profiles[i])));
  assert.equal(restored.version,1);assert.equal(SAVE_KEY,'lifesim.room01.v1');
  restored.paused=true;const snapshot=JSON.stringify(restored);tickHousehold(restored,20);assert.equal(JSON.stringify(restored),snapshot);
});
const opportunityFixtures=[
 ['city-services','city-route','test','plan'],['kitchen-studio','kitchen-special','invent','pair'],
 ['business-center','business-idea','pilot','review'],['art-studio','art-young','mentor','exhibit'],
 ['editorial','editorial-letter','visit','interview'],['civic-service','civic-neighbors','mediate','survey']
];
const paceFixtures=[['editorial','editorial-source','rights','replace'],['business-center','business-handoff','rebuild','contact'],['kitchen-studio','kitchen-supply','inventory','substitute']];
const neutralTraits=['social.outgoing','values.independent'];
function pendingFixture(id,career,scene,after=0){
  const root=id.startsWith('resident_')?mixedHousehold():newHousehold('2026-11-16');
  root.careerSystem=hireCareer(root.careerSystem,id,career,480);
  const c=root.careerSystem.byResident[id];let shift=null;
  for(let day=after;day<after+15&&!shift;day++)shift=plannedCareerShift(root.calendar,c,day);
  assert.ok(shift);
  root.minutes=root.otherSim.minutes=shift.start;
  progressCareerWork(root,shift.start-.01,shift.start);assert.ok(arriveCareerPortal(root,id,shift.start));
  root.minutes=root.otherSim.minutes=shift.start+shift.duration/2+1;
  assert.ok(startWorkIncident(root,id,root.minutes));c.currentShift.incident.scenarioId=scene;
  const a=getActor(root,id);a.personality=createProfile(neutralTraits);
  Object.assign(a.needs,{hunger:80,bladder:80,hygiene:80,energy:80,fun:80,social:80});
  a.mind.mood.value=65;c.performance=50;
  return {root,shift};
}
test('LP-02C native work preferences cross actual decisions and settle once for all four actor IDs',()=>{
  const old=oldTraitGroups.flat(),anchors=[...old.map(x=>[x]),...old.flatMap((a,i)=>old.slice(i+1).map(b=>[a,b]).filter(x=>validateSelection(x).valid))];
  for(const trait of ['novelty.curious','novelty.familiar','motivation.ambitious','motivation.balanced','pace.patient','pace.impatient']){
    for(const id of ['alex','mira','resident_3','resident_4']){
      let witness=false;
      for(const [career,scene,first,second] of trait.startsWith('pace.')?paceFixtures:opportunityFixtures){
        for(const known of trait.startsWith('novelty.')?[first,second]:[null]){
          let previous=null;
          if(known){
            previous=pendingFixture(id,career,scene);
            assert.ok(decideWorkIncident(previous.root,id,known).ok);
            assert.ok(previous.root.careerSystem.incidentHistory[id][0].performanceDelta>0);
          }
          const {root}=pendingFixture(id,career,scene,previous?previous.shift.dayIndex+1:0);
          if(previous){
            root.careerSystem.incidentHistory[id]=structuredClone(previous.root.careerSystem.incidentHistory[id]);
            root.careerSystem.incidentIds=structuredClone(previous.root.careerSystem.incidentIds);
          }
          const a=getActor(root,id);
          for(const anchor of anchors){
            if(witness)break;
            for(const energy of [55,65,75,95]){
              a.needs.energy=energy;
              // A one-old baseline is only an unsaved counterfactual.
              a.personality={schema:1,traitIds:anchor,preferences:{likes:[],dislikes:[]}};
              const before=chooseAutonomousWorkOption(root,id);
              a.needs.hunger=10;const urgent=chooseAutonomousWorkOption(root,id);
              a.personality=createProfile([...anchor,trait]);
              assert.equal(chooseAutonomousWorkOption(root,id),urgent);
              a.needs.hunger=80;const after=chooseAutonomousWorkOption(root,id);
              if(before===after)continue;
              assert.ok([first,second].includes(after));
              const profile=structuredClone(a.personality),n=root.careerSystem.incidentIds.length,credits=root.shop.credits;
              const receipt=automaticWorkIncident(root,id);assert.ok(receipt.ok);
              assert.equal(receipt.option.id,after);assert.equal(root.shop.credits,credits);
              assert.equal(root.careerSystem.incidentIds.length,n+1);
              assert.equal(automaticWorkIncident(root,id).ok,false);
              const restored=loadHousehold(structuredClone(root));
              assert.deepEqual(getActor(restored,id).personality,profile);
              assert.deepEqual(restored.careerSystem.incidentHistory[id],root.careerSystem.incidentHistory[id]);
              witness=true;break;
            }
          }
          if(witness)break;
        }
        if(witness)break;
      }
      assert.ok(witness,trait+' '+id+' must change at least one native work decision');
    }
  }
});
test('LP-02C all four communication styles cross actual legacy responses and complete canonical conversations',()=>{
  for(const [trait,line] of [['communication.diplomatic','family.share'],['communication.direct','conflict.explain'],['tone.playful','humor.joke'],['tone.serious','philosophy.share']]){
    const topic=line.split('.')[0];
    for(const id of ['alex','mira']){
      let found=false;const target=id==='alex'?'mira':'alex';
      const fixture=extra=>{
        const root=newHousehold(),a=getActor(root,id),b=getActor(root,target);
        a.personality=createProfile(['habits.neat','coordination.agile']);
        b.personality=createProfile(['habits.neat','coordination.agile',...extra]);
        b.mind.mood.value=70;return root;
      };
      for(const trust of [10,30,50,70,90]){
        for(let tension=0;tension<=100&&!found;tension+=2){
          const a=fixture([]),b=fixture([trait]);
          for(const root of [a,b])Object.assign(root.relationship.views[target],{trust,tension,friendship:50});
          const before=evaluateResponse(a,id,topic,line),after=evaluateResponse(b,id,topic,line);
          if(!before||!after||before.accepted===after.accepted)continue;
          assert.equal(after.accepted,true);
          for(const [root,expected] of [[a,before],[b,after]]){
            const seq=root.socialGraph.nextSeq;
            assert.ok(startConversation(root,id,{x:-.2,z:1.85},topic));assert.ok(arriveSocial(root));
            assert.equal(chooseSocialLine(root,line).accepted,expected.accepted);
            assert.equal(root.socialGraph.nextSeq,seq);
            assert.ok(finishSocialConversation(root));assert.equal(root.socialGraph.nextSeq,seq+1);
            const restored=loadHousehold(structuredClone(root));
            assert.deepEqual(getActor(restored,target).personality,getActor(root,target).personality);
            assert.deepEqual(getPair(restored.socialGraph,'alex','mira').events,getPair(root.socialGraph,'alex','mira').events);
            assert.equal(finishSocialConversation(root),null);
          }
          found=true;
        }
        if(found)break;
      }
      assert.ok(found,trait+' '+id);
    }
  }
  const old=createProfile(['temperament.cheerful','coordination.agile']);
  const playful=createProfile([...old.traitIds,'tone.playful']);
  assert.equal(boundaryDisposition(playful,'humor.joke'),boundaryDisposition(old,'humor.joke'));
  assert.equal(boundaryDisposition(createProfile(['habits.neat','tone.serious']),'humor.joke'),0);
  assert.equal(boundaryDisposition(createProfile(['habits.neat','communication.direct','communication.diplomatic']),'conflict.explain'),3);
});
