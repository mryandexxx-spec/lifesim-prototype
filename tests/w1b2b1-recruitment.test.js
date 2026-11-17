import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {acceptCareerOffer} from '../src/career-job-board.js';
import {CAREER_CATALOG} from '../src/career-catalog.js';
import {RECRUITMENT_CAREERS,EDITORIAL_QUESTIONS,newRecruitmentSystem,
  restoreRecruitmentSystem,submitCareerApplication,progressCareerRecruitment,
  startCareerInterview,answerCareerInterview,interviewScore,hiringChance,
  finishRecruitmentApplication,markRecruitmentRead} from '../src/career-recruitment.js';
import {SAVE_KEY} from '../src/simulation.js';

const clone=x=>JSON.parse(JSON.stringify(x));
const fresh=()=>newHousehold('2026-11-18');
const enter=(root,id='alex',career='editorial')=>{
  const sent=submitCareerApplication(root,id,career);
  assert.equal(sent.ok,true);
  return root.recruitmentSystem.byResident[id];
};
const arrive=(root,minute)=>{
  const before=root.minutes;
  root.minutes=minute;root.otherSim.minutes=minute;
  return progressCareerRecruitment(root,before,minute);
};
const offerEditorial=(root,id='alex',answers=['verify','research','correct'])=>{
  const app=enter(root,id);
  arrive(root,app.replyDueAt);
  assert.equal(startCareerInterview(root,id).ok,true);
  for(const choice of answers)assert.equal(answerCareerInterview(root,id,choice).ok,true);
  const deadline=app.decisionDueAt;
  arrive(root,deadline);
  return root.recruitmentSystem.byResident[id];
};

test('W1-B.2b: all six careers share the saved application route and real catalog contracts',()=>{
  assert.deepEqual(new Set(RECRUITMENT_CAREERS),new Set(CAREER_CATALOG.map(c=>c.id)));
  assert.equal(CAREER_CATALOG.length,6);
  assert.equal(EDITORIAL_QUESTIONS.length,3);
  for(const q of EDITORIAL_QUESTIONS){
    assert.equal(q.answers.length,3);
    assert.equal(new Set(q.answers.map(a=>a.id)).size,3);
    assert.ok(q.answers.every(a=>a.text&&a.feedback));
  }
  assert.equal(newRecruitmentSystem().schema,1);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
});

test('W1-B.2b.1: apply creates no contract or wage; delayed response once across repeated ticks',()=>{
  const root=fresh(),money=root.shop.credits;
  const app=enter(root,'alex','city-services');
  assert.equal(app.replyDueAt,Math.ceil(app.appliedAt+180));
  assert.equal(root.careerSystem.byResident.alex,null);
  assert.equal(root.shop.credits,money);
  assert.equal(enterDuplicate(root,'alex','city-services'),false);
  assert.equal(arrive(root,app.replyDueAt-0.01).length,0);
  assert.equal(arrive(root,app.replyDueAt).length,1);
  assert.equal(app.phase,'offer_ready');
  assert.equal(app.unread,true);
  assert.equal(markRecruitmentRead(root,'alex'),true);
  assert.equal(markRecruitmentRead(root,'alex'),false);
  assert.equal(arrive(root,app.replyDueAt+1000).length,0);
  assert.equal(root.shop.credits,money);
});
function enterDuplicate(root,id,career){
  return submitCareerApplication(root,id,career).ok;
}

test('W1-B.2b.1: pause and no clock progress do not trigger employer response',()=>{
  const root=fresh(),app=enter(root);
  root.paused=true;
  assert.equal(progressCareerRecruitment(root,root.minutes,app.replyDueAt+100).length,0);
  assert.equal(tickHousehold(root,720),undefined);
  assert.equal(app.phase,'waiting_reply');
  root.paused=false;
  assert.equal(progressCareerRecruitment(root,root.minutes,root.minutes).length,0);
  assert.equal(app.phase,'waiting_reply');
  assert.equal(arrive(root,app.replyDueAt).length,1);
  assert.equal(app.phase,'interview_invited');
});

test('W1-B.2b.1: editorial multi-choice snapshots mood, traits and genuine literature',()=>{
  const root=fresh();
  root.skills.xpById.literature=100;
  const app=enter(root);
  arrive(root,app.replyDueAt);
  assert.equal(app.phase,'interview_invited');
  assert.equal(startCareerInterview(root,'alex').ok,true);
  assert.equal(app.phase,'interview_active');
  assert.equal(app.interview.skill,2);
  const originalMood=app.interview.mood;
  root.mind.mood.value=1;root.skills.xpById.literature=0;
  assert.equal(answerCareerInterview(root,'alex','verify').ok,true);
  assert.equal(app.interview.answers.length,1);
  assert.equal(app.interview.mood,originalMood);
  assert.equal(app.interview.skill,2);
  assert.equal(answerCareerInterview(root,'alex','verify').ok,false,'Cannot reuse previous answer for next question');
  assert.equal(answerCareerInterview(root,'alex','research').ok,true);
  assert.equal(answerCareerInterview(root,'alex','correct').ok,true);
  assert.equal(app.phase,'waiting_decision');
  assert.equal(app.interview.answers.length,3);
  assert.equal(interviewScore(app),60);
  assert.ok(hiringChance(app)>70);
  assert.equal(answerCareerInterview(root,'alex','correct').ok,false,'No fourth answer');
  assert.equal(root.skills.xpById.literature,0,'Interview cannot mint XP');
});

test('W1-B.2b.1: result is deterministic, never re-rolled on reload or rerun',()=>{
  const root=fresh(),app=offerEditorial(root);
  assert.ok(['offer_ready','rejected'].includes(app.phase));
  const expected=app.phase;
  const before=clone(root),restored=loadHousehold(before);
  assert.equal(restored.recruitmentSystem.byResident.alex.phase,expected);
  assert.equal(restored.recruitmentSystem.byResident.alex.interview.answers.length,3);
  assert.equal(restored.recruitmentSystem.byResident.alex.interview.startedAt,app.interview.startedAt);
  progressCareerRecruitment(restored,restored.minutes,restored.minutes+600);
  assert.equal(restored.recruitmentSystem.byResident.alex.phase,expected);
  assert.equal(restored.shop.credits,root.shop.credits);
});

test('W1-B.2b.1: save and reload in middle of interview, resume exactly next choice',()=>{
  let root=fresh(),app=enter(root);
  arrive(root,app.replyDueAt);
  startCareerInterview(root,'alex');
  answerCareerInterview(root,'alex','verify');
  root=loadHousehold(clone(root));
  app=root.recruitmentSystem.byResident.alex;
  assert.equal(app.phase,'interview_active');
  assert.deepEqual(app.interview.answers,['verify']);
  assert.equal(answerCareerInterview(root,'alex','research').ok,true);
  assert.equal(answerCareerInterview(root,'alex','correct').ok,true);
  assert.equal(app.phase,'waiting_decision');
  const waiting=loadHousehold(clone(root));
  assert.equal(waiting.recruitmentSystem.byResident.alex.decisionDueAt,app.decisionDueAt);
});

test('W1-B.2b.1: city offer signs only once, actual contract and shift intact',()=>{
  const root=fresh(),money=root.shop.credits;
  const app=enter(root,'mira','city-services');
  assert.equal(finishRecruitmentApplication(root,'mira','accept').ok,false);
  arrive(root,app.replyDueAt);
  assert.equal(finishRecruitmentApplication(root,'mira','accept').ok,true);
  assert.equal(root.careerSystem.byResident.mira.careerId,'city-services');
  assert.equal(root.recruitmentSystem.byResident.mira,null);
  assert.equal(root.recruitmentSystem.history.mira.at(-1).outcome,'hired');
  assert.equal(root.careerSystem.byResident.alex,null);
  assert.equal(root.shop.credits,money);
  assert.equal(finishRecruitmentApplication(root,'mira','accept').ok,false);
  assert.equal(submitCareerApplication(root,'mira','editorial').ok,false);
  const reloaded=loadHousehold(clone(root));
  assert.equal(reloaded.careerSystem.byResident.mira.employmentId,
    root.careerSystem.byResident.mira.employmentId);
  assert.equal(reloaded.shop.credits,money);
});

test('W1-B.2b.1: Alex and Mira remain independent with simultaneous applications',()=>{
  const root=fresh();
  const alex=enter(root,'alex','editorial');
  const mira=enter(root,'mira','city-services');
  arrive(root,mira.replyDueAt);
  assert.equal(mira.phase,'offer_ready');
  assert.equal(alex.phase,'waiting_reply');
  finishRecruitmentApplication(root,'mira','accept');
  arrive(root,alex.replyDueAt);
  assert.equal(alex.phase,'interview_invited');
  assert.equal(root.careerSystem.byResident.alex,null);
  assert.equal(root.careerSystem.byResident.mira.careerId,'city-services');
});

test('W1-B.2b.1: decline and rejection allow another career path; no contract',()=>{
  const root=fresh();
  const app=enter(root,'alex','city-services');
  arrive(root,app.replyDueAt);
  assert.equal(finishRecruitmentApplication(root,'alex','dismiss').ok,true);
  assert.equal(root.recruitmentSystem.history.alex[0].outcome,'declined');
  assert.equal(root.careerSystem.byResident.alex,null);
  assert.equal(enter(root).careerId,'editorial');
  const second=root.recruitmentSystem.byResident.alex;
  arrive(root,second.replyDueAt);
  startCareerInterview(root,'alex');
  for(const choice of ['publish','guess','ignore'])
    answerCareerInterview(root,'alex',choice);
  assert.equal(interviewScore(second),0);
  assert.ok(hiringChance(second)<=35);
  arrive(root,second.decisionDueAt);
  assert.ok(['rejected','offer_ready'].includes(second.phase));
  if(second.phase==='rejected')assert.equal(finishRecruitmentApplication(root,'alex','accept').ok,false);
  assert.equal(finishRecruitmentApplication(root,'alex','dismiss').ok,true);
  assert.equal(submitCareerApplication(root,'alex','city-services').ok,true);
});

test('W1-B.2b.1: malformed recruitment saves do not invent offers or overwrite existing jobs',()=>{
  const root=fresh();
  root.careerSystem=acceptCareerOffer(root,'alex','editorial').careerSystem;
  const employment=clone(root.careerSystem),credits=root.shop.credits;
  const corrupt={schema:1,nextApplicationId:2,byResident:{
    alex:{id:'a1',residentId:'alex',careerId:'city-services',appliedAt:480,replyDueAt:660,phase:'offer_ready'},
    mira:{id:'a2',residentId:'mira',careerId:'editorial',appliedAt:480,replyDueAt:840,
      phase:'waiting_decision',interview:{startedAt:840,skill:5,mood:90,traitBoost:2,answers:['verify']}}
  },history:{alex:[{id:'a0',careerId:'editorial',outcome:'hired',at:1}],mira:[]}};
  root.recruitmentSystem=corrupt;
  const restored=loadHousehold(clone(root));
  assert.deepEqual(restored.careerSystem,employment);
  assert.equal(restored.recruitmentSystem.byResident.alex,null);
  assert.equal(restored.recruitmentSystem.byResident.mira,null);
  assert.equal(restored.shop.credits,credits);
  assert.equal(finishRecruitmentApplication(restored,'alex','accept').ok,false);
});

test('W1-B.2b.1: old v1 saves have a safe empty inbox; employed legacy contracts survive',()=>{
  const root=fresh();
  root.careerSystem=acceptCareerOffer(root,'mira','civic-service').careerSystem;
  const prior=clone(root);delete prior.recruitmentSystem;
  const restored=loadHousehold(prior);
  assert.equal(restored.version,1);
  assert.equal(restored.recruitmentSystem.schema,1);
  assert.equal(restored.recruitmentSystem.byResident.alex,null);
  assert.equal(restored.recruitmentSystem.byResident.mira,null);
  assert.deepEqual(restored.careerSystem,root.careerSystem);
});
