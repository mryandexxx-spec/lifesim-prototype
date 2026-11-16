import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,setHouseholdAutonomy} from '../src/household.js';
import {getPair,observePairViews,applySocialEvent,setLifeStage,addFamilyLink} from '../src/social-graph.js';
import {romanceAvailability,setRomancePreference} from '../src/romance.js';
import {startBranchSocial,arriveSocial,tickSocial,cancelSocial,
  ROMANTIC_EVENING_DURATION_MINUTES,ROMANTIC_EVENING_REFUSAL_MINUTES} from '../src/relationships.js';
const goal={x:-.2,z:1.85};
const pair=s=>getPair(s.socialGraph,'alex','mira');
const receipts=s=>pair(s).events.filter(e=>e.type.startsWith('romance.evening'));
const availability=(s,a='alex')=>romanceAvailability(s.socialGraph,a,
  a==='alex'?'mira':'alex','romance.evening',s.minutes);
function couple(){
  const s=newHousehold();s.minutes=8000;s.otherSim.minutes=8000;
  setHouseholdAutonomy(s,false);
  for(const id of ['alex','mira']){
    Object.assign(s.relationship.views[id],{friendship:90,trust:92,tension:0});
    const resident=id==='alex'?s:s.otherSim;
    Object.assign(resident.needs,{hunger:92,energy:90,hygiene:90,
      fun:40,social:48,bladder:95});
    resident.mind.mood.value=86;
  }
  assert.ok(observePairViews(s.socialGraph,'alex','mira',s.relationship.views));
  for(const [a,b,type,at] of [
    ['alex','mira','romance.flirt',900],['mira','alex','romance.flirt',2400],
    ['alex','mira','romance.flirt',3900],['alex','mira','romance.confess',4200],
    ['alex','mira','romance.date',4500],['alex','mira','romance.tender',5000],
    ['mira','alex','romance.tender',5400]
  ])assert.ok(applySocialEvent(s.socialGraph,{actorId:a,targetId:b,type,at}),type);
  assert.equal(availability(s).enabled,true);
  return s;
}
test('R5a requires adult committed pair, compatible boundaries and trust',()=>{
  const ordinary=newHousehold();
  assert.equal(availability(ordinary).enabled,false);
  assert.equal(startBranchSocial(ordinary,'alex',goal,'romance.evening'),false);
  const s=couple();
  assert.ok(setRomancePreference(s.socialGraph,'mira','alex','boundary','closed'));
  assert.equal(availability(s).enabled,false);
  const child=couple();setLifeStage(child.socialGraph,'mira','teen');
  assert.equal(availability(child).enabled,false);
  const related=couple();addFamilyLink(related.socialGraph,'alex','mira','sibling');
  assert.equal(availability(related).enabled,false);
});
test('R5a each adult can initiate, consent only on arrival, one completed reward',()=>{
  for(const id of ['alex','mira']){
    const s=couple(),snapshot=JSON.stringify(s.socialGraph);
    assert.ok(startBranchSocial(s,id,goal,'romance.evening'));
    assert.equal(JSON.stringify(s.socialGraph),snapshot);
    assert.equal(receipts(s).length,0);
    assert.ok(arriveSocial(s));
    assert.equal(s.socialAction.branchAction.eveningConsent,true);
    assert.equal(tickSocial(s,15),false);
    assert.equal(receipts(s).length,0);
    assert.equal(s.needs.fun,40);
    assert.equal(tickSocial(s,15),true);
    assert.equal(s.socialAction,null);
    assert.deepEqual(receipts(s).map(e=>e.type),['romance.evening']);
    assert.equal(receipts(s)[0].actorId,id);
    assert.equal(s.needs.fun,48);assert.equal(s.otherSim.needs.fun,48);
    assert.ok(s.needs.social>48&&s.otherSim.needs.social>48);
    assert.equal(pair(s).romance.bond.lastEveningAt,8000);
    assert.equal(availability(s,'mira').enabled,false);
    assert.equal(tickSocial(s,50),false);
  }
});
test('R5a respectful refusal never gives leisure or attraction',()=>{
  const s=couple(),before=[pair(s).romance.views.alex.attraction,
    pair(s).romance.views.mira.attraction];
  s.otherSim.mind.mood.value=9;
  assert.ok(startBranchSocial(s,'alex',goal,'romance.evening'));
  assert.ok(arriveSocial(s));
  assert.equal(s.socialAction.branchAction.eveningConsent,false);
  assert.ok(tickSocial(s,ROMANTIC_EVENING_REFUSAL_MINUTES));
  assert.deepEqual(receipts(s).map(e=>e.type),['romance.evening.refused']);
  assert.equal(s.needs.fun,40);assert.equal(s.otherSim.needs.fun,40);
  assert.deepEqual([pair(s).romance.views.alex.attraction,
    pair(s).romance.views.mira.attraction],before);
  assert.equal(pair(s).romance.bond.lastEveningAt,undefined);
});
test('R5a interruption, pause or boundary changed while running awards nothing',()=>{
  const s=couple();
  assert.ok(startBranchSocial(s,'alex',goal,'romance.evening'));
  assert.ok(cancelSocial(s));assert.equal(receipts(s).length,0);
  assert.ok(startBranchSocial(s,'alex',goal,'romance.evening'));assert.ok(arriveSocial(s));
  s.paused=true;assert.equal(tickSocial(s,30),false);
  assert.equal(s.socialAction.elapsed,0);s.paused=false;
  assert.ok(setRomancePreference(s.socialGraph,'mira','alex','boundary','closed'));
  assert.ok(tickSocial(s,30));
  assert.deepEqual(receipts(s).map(e=>e.type),['romance.evening.refused']);
  assert.equal(s.needs.fun,40);assert.equal(s.otherSim.needs.fun,40);
});
test('R5a v1 session restore resumes at real elapsed time; no duplicate replay',()=>{
  const s=couple();
  assert.ok(startBranchSocial(s,'mira',goal,'romance.evening'));assert.ok(arriveSocial(s));
  assert.equal(tickSocial(s,18),false);
  const reloaded=loadHousehold(JSON.parse(JSON.stringify(s)));
  assert.equal(reloaded.version,1);
  assert.equal(reloaded.socialAction?.branchAction?.eveningConsent,true);
  assert.equal(reloaded.socialAction?.elapsed,18);
  assert.equal(tickSocial(reloaded,12),true);
  assert.equal(receipts(reloaded).length,1);
  const again=loadHousehold(JSON.parse(JSON.stringify(reloaded)));
  assert.equal(receipts(again).length,1);
  assert.equal(tickSocial(again,60),false);
});
test('R5a pair-wide per-day cooldown persists and clears next day',()=>{
  const s=couple();assert.ok(startBranchSocial(s,'alex',goal,'romance.evening'));
  assert.ok(arriveSocial(s));assert.ok(tickSocial(s,30));
  assert.equal(availability(s,'mira').enabled,false);
  s.minutes=8640;
  assert.equal(availability(s,'mira').enabled,true);
  const stored=loadHousehold(JSON.parse(JSON.stringify(s)));
  assert.equal(availability(stored,'mira').enabled,true);
  assert.equal(pair(stored).romance.bond.lastEveningAt,8000);
});
test('R5a existing 3D and household contracts unchanged',()=>{
  assert.equal(ROMANTIC_EVENING_DURATION_MINUTES,30);
  assert.equal(ROMANTIC_EVENING_REFUSAL_MINUTES,3);
});
