/** W1-B.2b.3 — stable rejection receipts, bounded legacy-safe journal and two residents. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {INTERVIEW_CAREERS,INTERVIEW_QUESTIONS_BY_CAREER,
  RECRUITMENT_RETRY_MINUTES,RECRUITMENT_HISTORY_LIMIT,
  submitCareerApplication,progressCareerRecruitment,startCareerInterview,
  answerCareerInterview,finishRecruitmentApplication,recruitmentRetry}
  from '../src/career-recruitment.js';

const copy=x=>JSON.parse(JSON.stringify(x));
const fresh=()=>newHousehold('2026-11-18');
function advance(root,to){
  const before=root.minutes;
  root.minutes=to;root.otherSim.minutes=to;
  return progressCareerRecruitment(root,before,to);
}
function rejectOne(career='editorial',resident='alex'){
  for(let seed=1;seed<=100;seed++){
    const root=fresh();
    root.recruitmentSystem.nextApplicationId=seed;
    assert.equal(submitCareerApplication(root,resident,career).ok,true);
    const app=root.recruitmentSystem.byResident[resident];
    advance(root,app.replyDueAt);
    assert.equal(startCareerInterview(root,resident).ok,true);
    for(const question of INTERVIEW_QUESTIONS_BY_CAREER[career])
      assert.equal(answerCareerInterview(root,resident,question.answers[2].id).ok,true);
    advance(root,app.decisionDueAt);
    if(app.phase==='rejected')return {root,app};
  }
  throw new Error('No rejection seed for '+career);
}
test('W1-B.2b.3: two days counted from employer verdict, not dismissal, with exact deadline',()=>{
  const {root,app}=rejectOne();
  const due=app.decisionDueAt+RECRUITMENT_RETRY_MINUTES;
  assert.equal(app.resolvedAt,app.decisionDueAt);
  assert.equal(recruitmentRetry(root,'alex','editorial').retryAt,due);
  assert.equal(root.recruitmentSystem.cooldowns.alex.editorial,due);
  assert.equal(finishRecruitmentApplication(root,'alex','dismiss').ok,true);
  assert.equal(submitCareerApplication(root,'alex','editorial').ok,false);
  assert.equal(submitCareerApplication(root,'alex','city-services').ok,true);
  const fast=root.recruitmentSystem.byResident.alex;
  advance(root,fast.replyDueAt);
  assert.equal(finishRecruitmentApplication(root,'alex','dismiss').ok,true);
  advance(root,due-0.001);
  assert.equal(submitCareerApplication(root,'alex','editorial').ok,false);
  const restored=loadHousehold(copy(root));
  assert.equal(recruitmentRetry(restored,'alex','editorial').blocked,true);
  advance(restored,due);
  assert.equal(recruitmentRetry(restored,'alex','editorial').remaining,0);
  assert.equal(submitCareerApplication(restored,'alex','editorial').ok,true);
  assert.equal(submitCareerApplication(restored,'alex','editorial').ok,false);
});
test('W1-B.2b.3: every interview career can be retried; other character unaffected',()=>{
  for(const career of INTERVIEW_CAREERS){
    const {root,app}=rejectOne(career,'alex');
    assert.equal(finishRecruitmentApplication(root,'alex','dismiss').ok,true);
    assert.equal(recruitmentRetry(root,'alex',career).blocked,true);
    assert.equal(recruitmentRetry(root,'mira',career).blocked,false);
    assert.equal(submitCareerApplication(root,'mira',career).ok,true);
    assert.equal(root.recruitmentSystem.byResident.alex,null);
    assert.equal(root.recruitmentSystem.byResident.mira.careerId,career);
    const restored=loadHousehold(copy(root));
    assert.equal(restored.recruitmentSystem.byResident.mira.phase,'waiting_reply');
    assert.equal(restored.recruitmentSystem.history.alex[0].interview.answers.length,3);
    assert.equal(restored.recruitmentSystem.history.mira.length,0);
    assert.equal(restored.recruitmentSystem.cooldowns.alex[career],
      app.decisionDueAt+RECRUITMENT_RETRY_MINUTES);
  }
});
test('W1-B.2b.3: archive preserves exact answers and actual skill/mood/traits, no XP or money',()=>{
  const {root,app}=rejectOne('art-studio');
  const money=root.shop.credits,skills=copy(root.skills),snapshot=copy(app.interview);
  assert.equal(finishRecruitmentApplication(root,'alex','dismiss').ok,true);
  const item=root.recruitmentSystem.history.alex[0];
  assert.equal(item.appliedAt,app.appliedAt);
  assert.equal(item.resolvedAt,app.decisionDueAt);
  assert.deepEqual(item.interview,snapshot);
  const loaded=loadHousehold(copy(root));
  assert.deepEqual(loaded.recruitmentSystem.history.alex[0].interview,snapshot);
  assert.equal(loaded.shop.credits,money);
  assert.deepEqual(loaded.skills,skills);
  assert.equal(loaded.version,1);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
});
test('W1-B.2b.3: rejected vacancy cooldown survives 8-entry bounded history eviction',()=>{
  const {root,app}=rejectOne();
  const deadline=app.decisionDueAt+RECRUITMENT_RETRY_MINUTES;
  assert.equal(finishRecruitmentApplication(root,'alex','dismiss').ok,true);
  for(let i=0;i<RECRUITMENT_HISTORY_LIMIT+1;i++){
    assert.equal(submitCareerApplication(root,'alex','city-services').ok,true);
    const fast=root.recruitmentSystem.byResident.alex;
    advance(root,fast.replyDueAt);
    assert.equal(finishRecruitmentApplication(root,'alex','dismiss').ok,true);
  }
  assert.equal(root.recruitmentSystem.history.alex.length,RECRUITMENT_HISTORY_LIMIT);
  assert.equal(root.recruitmentSystem.history.alex.some(entry=>entry.outcome==='rejected'),false);
  assert.ok(root.minutes<deadline);
  const loaded=loadHousehold(copy(root));
  assert.equal(loaded.recruitmentSystem.history.alex.length,RECRUITMENT_HISTORY_LIMIT);
  assert.equal(recruitmentRetry(loaded,'alex','editorial').retryAt,deadline);
  assert.equal(submitCareerApplication(loaded,'alex','editorial').ok,false);
});
test('W1-B.2b.3: legacy journals migrate, invalid snapshots and future cooldowns are discarded',()=>{
  const root=fresh();
  root.recruitmentSystem.history.alex=[
    {id:'a1',careerId:'editorial',outcome:'rejected',at:root.minutes},
    {id:'a2',careerId:'art-studio',outcome:'rejected',at:root.minutes,
      interview:{startedAt:root.minutes,skill:400,traitBoost:40,mood:-1,answers:['bad']}},
    {id:'a3',careerId:'fake-job',outcome:'hired',at:root.minutes},
    {id:'a4',careerId:'editorial',outcome:'declined',at:root.minutes+9999}
  ];
  root.recruitmentSystem.cooldowns={alex:{editorial:9999999,'business-center':root.minutes+30},mira:'bad'};
  const loaded=loadHousehold(copy(root));
  assert.equal(loaded.recruitmentSystem.history.alex.length,2);
  assert.equal(loaded.recruitmentSystem.history.alex[0].appliedAt,root.minutes);
  assert.equal(loaded.recruitmentSystem.history.alex[1].interview,undefined);
  assert.equal(loaded.recruitmentSystem.cooldowns.alex.editorial,root.minutes+2880);
  assert.equal(loaded.recruitmentSystem.cooldowns.alex['business-center'],root.minutes+30);
  assert.deepEqual(loaded.recruitmentSystem.cooldowns.mira,{});
});
test('W1-B.2b.3: paused household and repeated resolution do not reroll or create duplicate history',()=>{
  const {root,app}=rejectOne('business-center');
  const money=root.shop.credits;
  root.paused=true;
  tickHousehold(root,200);
  assert.equal(root.recruitmentSystem.byResident.alex.phase,'rejected');
  assert.equal(progressCareerRecruitment(root,root.minutes,root.minutes+200).length,0);
  root.paused=false;root.speed=3;
  assert.equal(progressCareerRecruitment(root,root.minutes,root.minutes+200).length,0);
  assert.equal(finishRecruitmentApplication(root,'alex','dismiss').ok,true);
  assert.equal(finishRecruitmentApplication(root,'alex','dismiss').ok,false);
  assert.equal(root.recruitmentSystem.history.alex.length,1);
  assert.equal(root.shop.credits,money);
  const saved=loadHousehold(copy(root));
  assert.equal(saved.recruitmentSystem.history.alex.length,1);
  assert.equal(saved.recruitmentSystem.cooldowns.alex['business-center'],
    app.decisionDueAt+RECRUITMENT_RETRY_MINUTES);
});
