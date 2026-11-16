import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newSocialGraph,getOrCreatePair,getPair,markAcquainted,
  observePairViews,applySocialEvent,restoreSocialGraph,setLifeStage}
  from '../src/social-graph.js';
import {romanceAvailability,romanceClimate,setRomanceBoundary,
  setRomancePreference,romancePreferenceSummary} from '../src/romance.js';

const all=['alex','mira','iris'];
const rich={friendship:92,trust:91,tension:0};
function introduce(g,a,b,at){
  getOrCreatePair(g,a,b);
  assert.ok(markAcquainted(g,a,b,at));
  assert.ok(observePairViews(g,a,b,{[a]:rich,[b]:rich}));
}
function receipt(g,a,b,type,at,witnessIds){
  return applySocialEvent(g,{actorId:a,targetId:b,type,at,...(witnessIds?{witnessIds}:{})});
}
function committed(){
  const g=newSocialGraph(all);
  for(const id of all)assert.equal(setLifeStage(g,id,'adult'),true);
  introduce(g,'alex','mira',1000);
  for(const [a,b,t,at] of [
    ['alex','mira','romance.flirt',1200],
    ['mira','alex','romance.flirt',1500],
    ['alex','mira','romance.flirt',1700],
    ['alex','mira','romance.confess',1800],
    ['alex','mira','romance.date',2000]
  ])assert.ok(receipt(g,a,b,t,at),t);
  introduce(g,'alex','iris',2200);
  assert.equal(getPair(g,'alex','mira').romance.bond.status,'dating');
  return g;
}
const pair=g=>getPair(g,'alex','mira');

test('R3 preferences are resident-directed, opt-in and preserve existing general boundaries',()=>{
  const g=committed();
  assert.deepEqual(romancePreferenceSummary(g,'alex','mira'),{
    boundary:'open',touchBoundary:'open',exclusivity:'exclusive',jealousy:0
  });
  const beforeEvents=pair(g).events.length;
  const beforePartner=structuredClone(pair(g).romance.views.mira);
  assert.equal(setRomancePreference(g,'alex','mira','touchBoundary','closed'),true);
  assert.equal(setRomancePreference(g,'alex','mira','touchBoundary','closed'),false);
  assert.equal(setRomancePreference(g,'alex','mira','jealousy',100),false);
  assert.equal(setRomancePreference(g,'alex','mira','exclusivity','invalid'),false);
  assert.equal(setRomancePreference(g,'nobody','mira','boundary','closed'),false);
  assert.equal(romanceAvailability(g,'mira','alex','romance.hug',2500).enabled,false);
  assert.equal(romanceAvailability(g,'alex','mira','romance.kiss',2500).enabled,false);
  assert.equal(romanceAvailability(g,'alex','mira','romance.intimacy',2500).enabled,false);
  assert.equal(romanceAvailability(g,'alex','mira','romance.tender',2500).enabled,true);
  assert.deepEqual(pair(g).romance.views.mira,beforePartner);
  assert.equal(pair(g).events.length,beforeEvents);
  assert.equal(setRomancePreference(g,'alex','mira','touchBoundary','open'),true);
  assert.equal(romanceAvailability(g,'alex','mira','romance.hug',2500).enabled,true);
  assert.equal(setRomanceBoundary(g,'mira','alex','closed'),true);
  assert.equal(romanceAvailability(g,'alex','mira','romance.tender',2500).enabled,false);
  assert.equal(setRomanceBoundary(g,'mira','alex','open'),true);
});

test('R3 default exclusivity preserves previous third-party restrictions',()=>{
  const g=committed();
  assert.equal(romanceAvailability(g,'alex','iris','romance.flirt',3000).enabled,false);
  assert.equal(romanceAvailability(g,'alex','iris','romance.date',3000).enabled,false);
  assert.equal(setRomancePreference(g,'alex','mira','exclusivity','open'),true);
  assert.equal(romanceAvailability(g,'alex','iris','romance.flirt',3000).enabled,true);
  assert.equal(romanceAvailability(g,'alex','iris','romance.date',3000).enabled,false);
  assert.equal(romanceAvailability(g,'alex','iris','romance.kiss',3000).enabled,false);
});

test('R3 only a completed, explicitly witnessed outside flirt creates directional jealousy',()=>{
  const g=committed();
  setRomancePreference(g,'alex','mira','exclusivity','open');
  const original=pair(g),before=structuredClone(original.views);
  const initialEvents=original.events.length;
  const first=receipt(g,'alex','iris','romance.flirt',3000);
  assert.ok(first);
  assert.equal(original.events.length,initialEvents);
  const second=receipt(g,'alex','iris','romance.flirt',3100,['alex','unknown']);
  assert.ok(second);
  assert.equal(original.events.length,initialEvents);
  const third=receipt(g,'alex','iris','romance.flirt',3200,['mira','mira','unknown']);
  assert.ok(third);
  assert.equal(original.events.at(-1).type,'romance.jealousy');
  assert.equal(original.events.at(-1).causeSeq,third.seq);
  assert.equal(original.events.length,initialEvents+1);
  assert.equal(original.views.mira.trust,before.mira.trust-8);
  assert.equal(original.views.mira.tension,before.mira.tension+10);
  assert.deepEqual(original.views.alex,before.alex);
  assert.equal(original.romance.views.mira.jealousy,24);
  assert.equal(original.romance.views.alex.jealousy,0);
  assert.equal(romanceClimate(g,'mira','alex',3250).state,'strained');
  assert.equal(applySocialEvent(g,{type:'romance.jealousy',actorId:'mira',
    targetId:'alex',at:3250}),null);
  assert.equal(original.events.length,initialEvents+1);
});

test('R3 open expectation, refusal and casual friendship do not create jealousy',()=>{
  const g=committed();
  setRomancePreference(g,'alex','mira','exclusivity','open');
  setRomancePreference(g,'mira','alex','exclusivity','open');
  const before=pair(g).events.length;
  assert.ok(receipt(g,'alex','iris','romance.flirt',3000,['mira']));
  assert.ok(receipt(g,'alex','iris','romance.flirt.refused',3100,['mira']));
  assert.ok(receipt(g,'alex','iris','talk',3200,['mira']));
  assert.equal(pair(g).events.length,before);
  assert.equal(pair(g).romance.views.mira.jealousy,0);
});

test('R3 jealous reaction survives save v1; repair is a genuine accepted interaction',()=>{
  const g=committed();
  setRomancePreference(g,'alex','mira','exclusivity','open');
  assert.ok(receipt(g,'alex','iris','romance.flirt',3000,['mira']));
  const saved=JSON.parse(JSON.stringify(g));
  const restored=restoreSocialGraph(saved,all);
  assert.equal(romancePreferenceSummary(restored,'mira','alex').jealousy,24);
  assert.equal(getPair(restored,'alex','mira').events.at(-1).causeSeq,
    getPair(g,'alex','mira').events.at(-1).causeSeq);
  assert.equal(romanceAvailability(restored,'mira','alex','romance.repair',3050).enabled,true);
  assert.ok(receipt(restored,'mira','alex','romance.repair',3050));
  assert.equal(romancePreferenceSummary(restored,'mira','alex').jealousy,9);
  assert.notEqual(romanceClimate(restored,'mira','alex',3100).state,'strained');
  // The original instance did not receive any retroactive reconciliation.
  assert.equal(romancePreferenceSummary(g,'mira','alex').jealousy,24);
});

test('R3 legacy v1 saves default to original exclusivity with no invented episode',()=>{
  const g=committed(),key=JSON.stringify(['alex','mira']);
  const raw=JSON.parse(JSON.stringify(g));
  for(const id of ['alex','mira']){
    delete raw.pairs[key].romance.views[id].touchBoundary;
    delete raw.pairs[key].romance.views[id].exclusivity;
    delete raw.pairs[key].romance.views[id].jealousy;
  }
  raw.pairs[key].romance.views.alex.boundary='closed';
  const old=restoreSocialGraph(raw,all);
  assert.equal(romancePreferenceSummary(old,'alex','mira').boundary,'closed');
  assert.equal(romancePreferenceSummary(old,'alex','mira').exclusivity,'exclusive');
  assert.equal(romancePreferenceSummary(old,'alex','mira').jealousy,0);
  assert.equal(romanceAvailability(old,'alex','iris','romance.flirt',3000).enabled,false);
  assert.equal(pair(old).events.filter(e=>e.type==='romance.jealousy').length,0);
  raw.pairs[key].romance.views.alex.jealousy=Infinity;
  raw.pairs[key].romance.views.alex.touchBoundary='BAD';
  const malformed=restoreSocialGraph(raw,all);
  assert.equal(romancePreferenceSummary(malformed,'alex','mira').jealousy,0);
  assert.equal(romancePreferenceSummary(malformed,'alex','mira').touchBoundary,'open');
});

test('R3 mobile UI changes only active person and does not alter F2 shop or debug modes',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  assert.match(game,/setRomancePreference\(game\.socialGraph,chosen,targetId,kind,next\)/);
  assert.match(game,/save\(true\);renderSocialMenu\(true\)/);
  assert.match(game,/\['touchBoundary','Прикосновения'/);
  assert.match(game,/\['exclusivity','Ожидание верности'/);
  assert.ok(game.includes('buyMarketItem'));
  assert.ok(game.includes('intimacyFrame'));
  assert.doesNotMatch(game,/debug=jealousy|r3QAMode/);
});
