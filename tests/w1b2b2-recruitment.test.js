/** W1-B.2b.2 — six actual recruitment routes and persistent profession interviews. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {CAREER_CATALOG} from '../src/career-catalog.js';
import {acceptCareerOffer} from '../src/career-job-board.js';
import {newSkillProgress} from '../src/skills-engine.js';
import {createProfile} from '../src/trait-catalog.js';
import {SAVE_KEY} from '../src/simulation.js';
import {FAST_OFFER_CAREERS,INTERVIEW_CAREERS,RECRUITMENT_CAREERS,
  INTERVIEW_QUESTIONS_BY_CAREER,CAREER_SKILL_LABELS,submitCareerApplication,
  startCareerInterview,answerCareerInterview,interviewScore,hiringChance,
  finishRecruitmentApplication,progressCareerRecruitment} from '../src/career-recruitment.js';

const clone=x=>JSON.parse(JSON.stringify(x));
const newRoot=()=>newHousehold('2026-11-18');
const apply=(root,id,careerId)=>{
  const result=submitCareerApplication(root,id,careerId);
  assert.equal(result.ok,true,careerId+' '+result.reason);
  return root.recruitmentSystem.byResident[id];
};
const advance=(root,to)=>{
  const from=root.minutes;
  root.minutes=to;root.otherSim.minutes=to;
  return progressCareerRecruitment(root,from,to);
};
const interview=(root,id,career,choiceIndex=0)=>{
  const app=apply(root,id,career);
  assert.equal(app.replyDueAt-app.appliedAt,360);
  assert.equal(advance(root,app.replyDueAt).length,1);
  assert.equal(app.phase,'interview_invited');
  assert.equal(startCareerInterview(root,id).ok,true);
  const bank=INTERVIEW_QUESTIONS_BY_CAREER[career];
  for(const question of bank){
    const chosen=question.answers[choiceIndex];
    const a=answerCareerInterview(root,id,chosen.id);
    assert.equal(a.ok,true);
    assert.equal(a.feedback,chosen.feedback);
  }
  assert.equal(app.phase,'waiting_decision');
  return app;
};

test('W1-B.2b.2: six original jobs; 2 fast offers, 4 authentic 3x3 interview banks',()=>{
  assert.deepEqual(new Set(RECRUITMENT_CAREERS),new Set(CAREER_CATALOG.map(x=>x.id)));
  assert.deepEqual(new Set(FAST_OFFER_CAREERS),new Set(['city-services','kitchen-studio']));
  assert.deepEqual(new Set(INTERVIEW_CAREERS),new Set(['editorial','art-studio','business-center','civic-service']));
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  for(const career of INTERVIEW_CAREERS){
    const bank=INTERVIEW_QUESTIONS_BY_CAREER[career];
    assert.equal(bank.length,3,career);
    const prompts=new Set();
    for(const question of bank){
      assert.ok(question.text.length>=30);
      prompts.add(question.text);
      assert.equal(question.answers.length,3);
      assert.equal(new Set(question.answers.map(a=>a.id)).size,3);
      assert.ok(question.answers.every(a=>a.text.length>=25 && a.feedback.length>=25));
      assert.ok(new Set(question.answers.map(a=>a.score)).size>=2);
    }
    assert.equal(prompts.size,3);
  }
  assert.equal(Object.keys(CAREER_SKILL_LABELS).length,2,'No fictional job skills');
});

test('W1-B.2b.2: kitchen follows actual game-time delay, existing cooking level and explicit sign',()=>{
  const root=newRoot(),money=root.shop.credits;
  root.skills.xpById.cooking=165;
  const app=apply(root,'alex','kitchen-studio');
  assert.equal(app.kitchenSkill,4);
  assert.equal(app.replyDueAt-app.appliedAt,180);
  assert.equal(finishRecruitmentApplication(root,'alex','accept').ok,false);
  assert.equal(advance(root,app.replyDueAt-.01).length,0);
  assert.equal(app.phase,'waiting_reply');
  assert.equal(advance(root,app.replyDueAt).length,1);
  assert.equal(app.phase,'offer_ready');
  assert.equal(advance(root,app.replyDueAt+1440).length,0);
  assert.equal(root.careerSystem.byResident.alex,null);
  assert.equal(root.shop.credits,money);
  const loaded=loadHousehold(clone(root));
  assert.equal(loaded.recruitmentSystem.byResident.alex.kitchenSkill,4);
  assert.equal(finishRecruitmentApplication(loaded,'alex','accept').ok,true);
  assert.equal(loaded.careerSystem.byResident.alex.careerId,'kitchen-studio');
  assert.equal(loaded.recruitmentSystem.history.alex.at(-1).outcome,'hired');
  assert.equal(finishRecruitmentApplication(loaded,'alex','accept').ok,false);
  assert.equal(loaded.shop.credits,money);
});

test('W1-B.2b.2: art studio snapshots genuine painting skill, choices and character',()=>{
  const low=newRoot(),high=newRoot();
  high.skills.xpById.painting=360;
  high.personality=createProfile(['approach.creative','coordination.agile','temperament.calm']);
  const a=interview(low,'alex','art-studio',0);
  const b=interview(high,'alex','art-studio',0);
  assert.equal(a.interview.skill,0);
  assert.equal(b.interview.skill,5);
  assert.ok(b.interview.traitBoost>a.interview.traitBoost);
  assert.ok(hiringChance(b)>hiringChance(a));
  assert.ok(interviewScore(a)>45);
  assert.equal(high.skills.xpById.painting,360,'Interview never credits XP');
  assert.equal(high.shop.credits,low.shop.credits);
  const beforeChance=hiringChance(b);
  high.skills.xpById.painting=0;
  high.mind.mood.value=0;
  assert.equal(hiringChance(b),beforeChance,'Snapshots cannot change after the interview');
});

test('W1-B.2b.2: business interview uses organization, practicality, no invented skill',()=>{
  const root=newRoot();
  root.personality=createProfile(['habits.neat','approach.pragmatic','temperament.calm']);
  const app=interview(root,'alex','business-center',0);
  assert.equal(app.interview.skill,0);
  assert.ok(app.interview.traitBoost>0);
  assert.ok(hiringChance(app)>60);
  assert.deepEqual(root.skills,newSkillProgress(),'No imaginary office skill or XP');
  assert.equal(answerCareerInterview(root,'alex','prioritize').ok,false,'No fourth click');
});

test('W1-B.2b.2: civic-service empathy and calm actually improve matching',()=>{
  const sympathetic=newRoot(),impulsive=newRoot();
  sympathetic.personality=createProfile(['values.empathetic','temperament.calm','social.outgoing']);
  impulsive.personality=createProfile(['temperament.hotheaded','social.reserved']);
  const good=interview(sympathetic,'alex','civic-service',1);
  const bad=interview(impulsive,'alex','civic-service',1);
  assert.equal(good.interview.skill,0);
  assert.equal(bad.interview.skill,0);
  assert.ok(good.interview.traitBoost>bad.interview.traitBoost);
  assert.ok(hiringChance(good)>hiringChance(bad));
  assert.equal(sympathetic.shop.credits,impulsive.shop.credits);
});

test('W1-B.2b.2: full interview saves and resumes at the correct question across iPhone reload',()=>{
  for(const career of INTERVIEW_CAREERS){
    let root=newRoot();
    const app=apply(root,'mira',career);
    advance(root,app.replyDueAt);
    assert.equal(startCareerInterview(root,'mira').ok,true);
    const first=INTERVIEW_QUESTIONS_BY_CAREER[career][0].answers[0].id;
    const wrongNext=INTERVIEW_QUESTIONS_BY_CAREER[career][0].answers[2].id;
    assert.equal(answerCareerInterview(root,'mira',first).ok,true);
    assert.equal(answerCareerInterview(root,'mira',wrongNext).ok,false);
    root=loadHousehold(clone(root));
    const resumed=root.recruitmentSystem.byResident.mira;
    assert.deepEqual(resumed.interview.answers,[first]);
    assert.equal(resumed.phase,'interview_active');
    for(let i=1;i<3;i++){
      const id=INTERVIEW_QUESTIONS_BY_CAREER[career][i].answers[0].id;
      assert.equal(answerCareerInterview(root,'mira',id).ok,true);
    }
    const deadline=resumed.decisionDueAt,oldRoll=hiringChance(resumed);
    root=loadHousehold(clone(root));
    assert.equal(hiringChance(root.recruitmentSystem.byResident.mira),oldRoll);
    advance(root,deadline);
    const settled=root.recruitmentSystem.byResident.mira;
    assert.ok(['offer_ready','rejected'].includes(settled.phase));
    const outcome=settled.phase,money=root.shop.credits;
    assert.equal(advance(root,deadline+400).length,0);
    assert.equal(loadHousehold(clone(root)).recruitmentSystem.byResident.mira.phase,outcome);
    assert.equal(root.shop.credits,money);
    if(outcome==='offer_ready'){
      assert.equal(finishRecruitmentApplication(root,'mira','accept').ok,true);
      assert.equal(root.careerSystem.byResident.mira.careerId,career);
      assert.equal(finishRecruitmentApplication(root,'mira','accept').ok,false);
    }else{
      assert.equal(finishRecruitmentApplication(root,'mira','accept').ok,false);
      assert.equal(finishRecruitmentApplication(root,'mira','dismiss').ok,true);
    }
    assert.equal(root.careerSystem.byResident.alex,null);
  }
});

test('W1-B.2b.2: refusal and offer possible for all three new careers, fixed applicant roll',()=>{
  for(const career of ['art-studio','business-center','civic-service']){
    const outcomes=new Set();
    for(let seed=1;seed<=40;seed++){
      const root=newRoot();
      root.recruitmentSystem.nextApplicationId=seed;
      const app=interview(root,'alex',career,2);
      advance(root,app.decisionDueAt);
      outcomes.add(app.phase);
      if(outcomes.size===2)break;
    }
    assert.deepEqual(outcomes,new Set(['offer_ready','rejected']),career);
  }
});

test('W1-B.2b.2: Alex/Mira independent; no duplicate offers, pause and speed x3 use one clock',()=>{
  const root=newRoot(),initialCredits=root.shop.credits;
  const alex=apply(root,'alex','business-center');
  const mira=apply(root,'mira','kitchen-studio');
  assert.equal(submitCareerApplication(root,'alex','art-studio').ok,false);
  root.paused=true;
  assert.equal(progressCareerRecruitment(root,root.minutes,root.minutes+720).length,0);
  assert.equal(tickHousehold(root,720),undefined);
  assert.equal(alex.phase,'waiting_reply');
  root.paused=false;root.speed=3;
  // Crossing both dueAt thresholds in one catch-up interval cannot duplicate results.
  const signals=advance(root,alex.replyDueAt+20);
  assert.equal(signals.length,2);
  assert.equal(alex.phase,'interview_invited');
  assert.equal(mira.phase,'offer_ready');
  assert.equal(advance(root,alex.replyDueAt+900).length,0);
  assert.equal(finishRecruitmentApplication(root,'mira','accept').ok,true);
  assert.equal(root.careerSystem.byResident.mira.careerId,'kitchen-studio');
  assert.equal(root.careerSystem.byResident.alex,null);
  assert.equal(root.shop.credits,initialCredits);
});

test('W1-B.2b.2: old editorial interview, old contracts and corrupted new records migrate safely',()=>{
  const root=newRoot();
  const editorial=apply(root,'alex','editorial');
  advance(root,editorial.replyDueAt);
  startCareerInterview(root,'alex');
  answerCareerInterview(root,'alex','verify');
  const old=clone(root);
  old.recruitmentSystem.byResident.alex.interview={
    startedAt:editorial.interview.startedAt,
    skill:editorial.interview.skill,
    traitBoost:editorial.interview.traitBoost,
    mood:editorial.interview.mood,
    answers:['verify']};
  const resume=loadHousehold(old);
  assert.equal(resume.recruitmentSystem.byResident.alex.phase,'interview_active');
  assert.deepEqual(resume.recruitmentSystem.byResident.alex.interview.answers,['verify']);
  assert.equal(answerCareerInterview(resume,'alex','research').ok,true);
  assert.equal(answerCareerInterview(resume,'alex','correct').ok,true);
  const oldContract=newRoot();
  oldContract.careerSystem=acceptCareerOffer(oldContract,'mira','art-studio').careerSystem;
  delete oldContract.recruitmentSystem;
  const preserved=loadHousehold(clone(oldContract));
  assert.equal(preserved.careerSystem.byResident.mira.careerId,'art-studio');
  assert.equal(preserved.recruitmentSystem.byResident.mira,null);
  assert.equal(preserved.version,1);
  const corrupt=newRoot();
  const candidate=apply(corrupt,'alex','business-center');
  advance(corrupt,candidate.replyDueAt);
  startCareerInterview(corrupt,'alex');
  corrupt.recruitmentSystem.byResident.alex.interview.answers=['verify'];
  const cleaned=loadHousehold(clone(corrupt));
  assert.equal(cleaned.recruitmentSystem.byResident.alex,null);
});
