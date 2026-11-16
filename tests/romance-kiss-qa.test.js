import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createKissQAHousehold,KISS_QA_DEBUG_QUERY} from '../src/romance-kiss-qa.js';
import {newHousehold} from '../src/household.js';
import {romanceAvailability} from '../src/romance.js';
import {getPair,setLifeStage,addFamilyLink} from '../src/social-graph.js';
import {startBranchSocial,arriveSocial,tickSocial,cancelSocial} from '../src/relationships.js';
import {kissMotion} from '../src/romantic-kiss.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const target={x:-.2,z:1.85};
test('QA link creates a disposable adult couple, not a normal unlock',()=>{
  assert.equal(KISS_QA_DEBUG_QUERY,'kiss');
  const original=newHousehold();
  const before=JSON.stringify(original);
  assert.equal(romanceAvailability(original.socialGraph,'alex','mira','romance.kiss',original.minutes).enabled,false);
  const qa=createKissQAHousehold();
  assert.equal(JSON.stringify(original),before);
  assert.notEqual(qa,original);
  assert.equal(qa.version,1);
  assert.equal(qa.autonomy.enabled,false);
  assert.equal(qa.otherSim.autonomy.enabled,false);
  assert.equal(qa.socialGraph.lifeStages.alex,'adult');
  assert.equal(qa.socialGraph.lifeStages.mira,'adult');
  for(const [a,b] of [['alex','mira'],['mira','alex']])
    assert.equal(romanceAvailability(qa.socialGraph,a,b,'romance.kiss',qa.minutes).enabled,true);
});
test('QA both buttons trigger the real kissing action, consensual animation and one receipt',()=>{
  for(const initiator of ['alex','mira']){
    const qa=createKissQAHousehold();
    const before=JSON.stringify(qa.socialGraph);
    assert.equal(startBranchSocial(qa,initiator,target,'romance.kiss'),true);
    assert.equal(kissMotion(qa.socialAction).weight,0);
    assert.equal(qa.socialAction.phase,'walking');
    assert.equal(JSON.stringify(qa.socialGraph),before);
    assert.equal(arriveSocial(qa),true);
    assert.equal(qa.socialAction.branchAction.kissConsent,true);
    assert.equal(tickSocial(qa,8),false);
    assert.ok(kissMotion(qa.socialAction).weight>.5);
    assert.equal(tickSocial(qa,8),true);
    const receipts=getPair(qa.socialGraph,'alex','mira').events.filter(x=>x.type==='romance.kiss');
    assert.equal(receipts.length,1);
    assert.equal(receipts[0].actorId,initiator);
  }
});
test('QA cancel and safety guards still function normally',()=>{
  const qa=createKissQAHousehold();
  assert.ok(startBranchSocial(qa,'alex',target,'romance.kiss'));
  assert.ok(cancelSocial(qa));
  assert.equal(getPair(qa.socialGraph,'alex','mira').events.filter(e=>e.type==='romance.kiss').length,0);
  const teen=createKissQAHousehold();
  setLifeStage(teen.socialGraph,'alex','teen');
  assert.equal(romanceAvailability(teen.socialGraph,'alex','mira','romance.kiss',teen.minutes).enabled,false);
  const kin=createKissQAHousehold();
  addFamilyLink(kin.socialGraph,'alex','mira','sibling');
  assert.equal(romanceAvailability(kin.socialGraph,'alex','mira','romance.kiss',kin.minutes).enabled,false);
});
test('QA runtime is opt-in and blocks all household save entrypoints',()=>{
  const src=read('../src/game.js');
  assert.match(src,/get\('debug'\)===KISS_QA_DEBUG_QUERY/);
  assert.match(src,/if\(kissQAMode\)game=createKissQAHousehold\(\)/);
  assert.match(src,/if\(kissQAMode\)\{\s*if\(!silent\)toast/);
  assert.match(src,/if\(kissQAMode\)\$\('reset-btn'\)\.disabled=true/);
  assert.match(src,/if\(kissQAMode\)return;\s*if \(!window\.confirm/);
  assert.match(src,/beginSocial\('talk',false,initiatorId,null,null,'romance\.kiss'\)/);
  assert.match(src,/pagehide', \(\) => save\(true\)/);
  assert.match(src,/visibilitychange', \(\) => \{ if \(document\.hidden\) save\(true\)/);
  assert.match(src,/setInterval\(\(\) => save\(true\), 8000\)/);
  const pages=read('../.github/workflows/pages.yml');
  assert.ok(pages.includes('src/romance-kiss-qa.js site/src/'));
});
