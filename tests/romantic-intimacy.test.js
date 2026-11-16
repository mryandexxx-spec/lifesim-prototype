import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold,setHouseholdAutonomy} from '../src/household.js';
import {observePairViews,applySocialEvent} from '../src/social-graph.js';
import {intimacyBedPlan,intimacyFrame,INTIMACY_DURATION_MINUTES,
  INTIMACY_REFUSAL_DURATION_MINUTES} from '../src/romantic-intimacy.js';
import {romanceAvailability,setRomanceBoundary} from '../src/romance.js';
import {getPair,setLifeStage,addFamilyLink} from '../src/social-graph.js';
import {startBranchSocial,arriveSocial,tickSocial,cancelSocial}
  from '../src/relationships.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const target={x:-.2,z:1.85};
// Test-only builder: the accepted release no longer exposes ?debug=intimacy.
function createIntimacyQAHousehold(){
  const root=newHousehold();
  root.minutes=8000;
  root.otherSim.minutes=root.minutes;
  root.mind.mood.value=88;
  root.otherSim.mind.mood.value=88;
  for(const id of ['alex','mira']){
    Object.assign(root.relationship.views[id],{friendship:88,trust:90,tension:0});
    const resident=id==='alex'?root:root.otherSim;
    Object.assign(resident.needs,{hunger:95,energy:95,hygiene:95,fun:95,social:95,bladder:95});
  }
  setHouseholdAutonomy(root,false);
  if(!observePairViews(root.socialGraph,'alex','mira',root.relationship.views))
    throw Error('Intimacy QA: perspectives unavailable');
  // Genuine canonical romance receipts ONLY in a new throwaway graph.
  for(const [actorId,targetId,type,at] of [
    ['alex','mira','romance.flirt',900],
    ['mira','alex','romance.flirt',2400],
    ['alex','mira','romance.flirt',3900],
    ['alex','mira','romance.confess',4200],
    ['alex','mira','romance.date',4500],
    ['alex','mira','romance.tender',5000],
    ['mira','alex','romance.tender',5400]
  ]){
    if(!applySocialEvent(root.socialGraph,{actorId,targetId,type,at}))
      throw Error('Intimacy QA: invalid milestone '+type);
  }
  for(const [a,b] of [['alex','mira'],['mira','alex']]){
    if(!romanceAvailability(root.socialGraph,a,b,'romance.intimacy',root.minutes).enabled||
      !intimacyBedPlan(root,a))throw Error('Intimacy QA: unable to offer '+a);
  }
  return root;
}

const receipts=s=>getPair(s.socialGraph,'alex','mira').events
  .filter(e=>e.type.startsWith('romance.intimacy'));
test('R2 only a voluntary adult, unrelated committed couple can offer',()=>{
  const ordinary=newHousehold();
  assert.equal(romanceAvailability(ordinary.socialGraph,'alex','mira','romance.intimacy',ordinary.minutes).enabled,false);
  assert.equal(startBranchSocial(ordinary,'alex',target,'romance.intimacy'),false);
  const qa=createIntimacyQAHousehold();
  assert.equal(qa.autonomy.enabled,false);
  assert.equal(qa.otherSim.autonomy.enabled,false);
  for(const a of ['alex','mira']){
    assert.equal(romanceAvailability(qa.socialGraph,a,a==='alex'?'mira':'alex','romance.intimacy',qa.minutes).enabled,true);
    const plan=intimacyBedPlan(qa,a);
    assert.ok(plan?.bedId);
    assert.notDeepEqual(plan.actor,plan.partner);
  }
});
test('R2 consent is evaluated at arrival, only then private scene, one receipt at finish',()=>{
  for(const a of ['alex','mira']){
    const root=createIntimacyQAHousehold();
    const before=JSON.stringify(root.socialGraph);
    assert.equal(startBranchSocial(root,a,target,'romance.intimacy'),true);
    assert.equal(intimacyFrame(root.socialAction).active,false);
    assert.equal(JSON.stringify(root.socialGraph),before);
    assert.equal(arriveSocial(root),true);
    const s=root.socialAction;
    assert.equal(s.branchAction.intimacyConsent,true);
    assert.deepEqual(receipts(root),[]);
    assert.equal(intimacyFrame(s).active,true);
    assert.equal(s.phase,'using');
    assert.equal(tickSocial(root,INTIMACY_DURATION_MINUTES/2),false);
    assert.ok(intimacyFrame(root.socialAction).progress>=.5);
    assert.equal(tickSocial(root,INTIMACY_DURATION_MINUTES/2),true);
    assert.equal(root.socialAction,null);
    assert.deepEqual(receipts(root).map(x=>x.type),['romance.intimacy']);
    assert.equal(receipts(root)[0].actorId,a);
    assert.equal(tickSocial(root,100),false);
    assert.equal(receipts(root).length,1);
    assert.equal(romanceAvailability(root.socialGraph,a,a==='alex'?'mira':'alex','romance.intimacy',root.minutes).enabled,false);
  }
});
test('R2 refusal is harmless, no black screen and no positive receipt',()=>{
  const s=createIntimacyQAHousehold();
  s.otherSim.mind.mood.value=12;
  const before=[getPair(s.socialGraph,'alex','mira').romance.views.alex.attraction,
    getPair(s.socialGraph,'alex','mira').romance.views.mira.attraction];
  const positions=[{...s.position},{...s.otherSim.position}];
  assert.ok(startBranchSocial(s,'alex',target,'romance.intimacy'));
  assert.ok(arriveSocial(s));
  assert.equal(s.socialAction.branchAction.intimacyConsent,false);
  assert.equal(intimacyFrame(s.socialAction).active,false);
  assert.deepEqual([s.position,s.otherSim.position],positions);
  assert.equal(tickSocial(s,INTIMACY_REFUSAL_DURATION_MINUTES),true);
  assert.deepEqual(receipts(s).map(e=>e.type),['romance.intimacy.refused']);
  assert.deepEqual([getPair(s.socialGraph,'alex','mira').romance.views.alex.attraction,
    getPair(s.socialGraph,'alex','mira').romance.views.mira.attraction],before);
});
test('R2 no available bed / no private access refuses starting; no forged receipt',()=>{
  const s=createIntimacyQAHousehold();
  const bed=s.world.furniture.instances.find(x=>x.prefabId==='bed');
  bed.location='storage';s.world.furniture.revision++;
  assert.equal(intimacyBedPlan(s,'alex'),null);
  assert.equal(startBranchSocial(s,'alex',target,'romance.intimacy'),false);
  assert.deepEqual(receipts(s),[]);
});
test('R2 age, kinship, explicit boundaries and live changes fail closed',()=>{
  const teen=createIntimacyQAHousehold();
  assert.equal(setLifeStage(teen.socialGraph,'mira','teen'),true);
  assert.equal(startBranchSocial(teen,'alex',target,'romance.intimacy'),false);
  const kin=createIntimacyQAHousehold();
  assert.equal(addFamilyLink(kin.socialGraph,'alex','mira','sibling'),true);
  assert.equal(startBranchSocial(kin,'alex',target,'romance.intimacy'),false);
  const boundary=createIntimacyQAHousehold();
  setRomanceBoundary(boundary.socialGraph,'mira','alex','closed');
  assert.equal(startBranchSocial(boundary,'alex',target,'romance.intimacy'),false);
  const inFlight=createIntimacyQAHousehold();
  assert.ok(startBranchSocial(inFlight,'alex',target,'romance.intimacy'));
  setRomanceBoundary(inFlight.socialGraph,'mira','alex','closed');
  assert.ok(arriveSocial(inFlight));
  assert.equal(intimacyFrame(inFlight.socialAction).active,false);
  assert.ok(tickSocial(inFlight,INTIMACY_REFUSAL_DURATION_MINUTES));
  assert.equal(receipts(inFlight).filter(e=>e.type==='romance.intimacy').length,0);
});
test('R2 cancel, pause and v1 save restore cannot duplicate or fabricate intimacy',()=>{
  const s=createIntimacyQAHousehold();
  assert.ok(startBranchSocial(s,'alex',target,'romance.intimacy'));
  assert.ok(arriveSocial(s));
  s.paused=true;
  assert.equal(tickSocial(s,90),false);
  assert.equal(s.socialAction.elapsed,0);
  s.paused=false;
  assert.equal(tickSocial(s,19),false);
  const restored=loadHousehold(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.version,1);
  assert.equal(restored.socialAction?.branchAction?.intimacyConsent,true);
  assert.equal(restored.socialAction?.elapsed,19);
  assert.equal(intimacyFrame(restored.socialAction).active,true);
  assert.equal(tickSocial(restored,11),true);
  assert.equal(receipts(restored).filter(e=>e.type==='romance.intimacy').length,1);
  assert.equal(cancelSocial(s),true);
  assert.equal(receipts(s).length,0);
});
test('R2 UI fades only on consent, keeps ordinary save and game controls intact',()=>{
  const game=read('../src/game.js');
  const html=read('../index.html');
  const css=read('../styles.css');
  const pages=read('../.github/workflows/pages.yml');
  assert.doesNotMatch(game,/intimacyQAMode|createIntimacyQAHousehold|INTIMACY_QA_DEBUG_QUERY|intimacy-qa-controls/);
  assert.doesNotMatch(game,/get\\('debug'\\)/);
  assert.match(game,/localStorage\\.getItem\\(SAVE_KEY\\)/);
  assert.match(game,/localStorage\\.setItem\\(SAVE_KEY,/);
  assert.ok(game.includes("beginSocial('talk',false"));
  assert.ok(game.includes("intimacyVeil.classList.toggle('visible',privateFrame.active)"));
  assert.ok(game.includes("if(intimacyFrame(game.socialAction).active)"));
  assert.ok(html.includes('id="intimacy-veil"'));
  assert.ok(html.includes('id="intimacy-progress"'));
  assert.ok(css.includes('.intimacy-veil.visible'));
  assert.ok(pages.includes('cp src/romantic-intimacy.js site/src/'));
  assert.ok(!pages.includes('romance-intimacy-qa.js'));
  assert.ok(!css.includes('.intimacy-qa-controls'));
  assert.doesNotMatch(game,/kissQAMode|createKissQAHousehold|kiss-qa-controls/);
  assert.equal(INTIMACY_DURATION_MINUTES,30);
});
