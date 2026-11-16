import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHugQAHousehold,HUG_QA_DEBUG_QUERY} from '../src/romance-hug-qa.js';
import {newHousehold,loadHousehold} from '../src/household.js';
import {getPair,availableSocialActions,setLifeStage} from '../src/social-graph.js';
import {romanceAvailability} from '../src/romance.js';
import {startBranchSocial,arriveSocial,tickSocial,cancelSocial} from '../src/relationships.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const point={x:-.2,z:1.85};
test('R1a QA helper prepares a disposable ready pair without changing default gameplay',()=>{
  const ordinary=newHousehold(),before=JSON.stringify(ordinary);
  const q=createHugQAHousehold();
  assert.equal(JSON.stringify(ordinary),before);
  assert.equal(q.version,1);
  assert.equal(q.autonomy.enabled,false);
  assert.equal(q.otherSim.autonomy.enabled,false);
  assert.equal(q.minutes,8000);
  assert.equal(q.otherSim.minutes,8000);
  assert.equal(getPair(q.socialGraph,'alex','mira').romance.bond.status,'dating');
  assert.equal(q.socialAction,null);
  assert.equal(q.action,null);
  assert.equal(q.otherSim.action,null);
  for(const [id,to] of [['alex','mira'],['mira','alex']]){
    assert.equal(romanceAvailability(q.socialGraph,id,to,'romance.hug',q.minutes).enabled,true);
    assert.equal(availableSocialActions(q.socialGraph,id,to,q.minutes)
      .find(x=>x.id==='romance.hug').enabled,true);
  }
  assert.deepEqual(q.actionQueues.byResident.alex,[]);
  assert.deepEqual(q.actionQueues.byResident.mira,[]);
  assert.ok(HUG_QA_DEBUG_QUERY==='hug');
});
test('R1a QA is a complete real domain interaction for each initiator',()=>{
  for(const id of ['alex','mira']){
    const q=createHugQAHousehold();
    assert.equal(startBranchSocial(q,id,point,'romance.hug'),true,id);
    assert.equal(arriveSocial(q),true);
    assert.equal(q.socialAction.branchAction.hugConsent,true);
    assert.equal(tickSocial(q,18),true);
    assert.equal(q.socialAction,null);
    const events=getPair(q.socialGraph,'alex','mira').events
      .filter(e=>e.type==='romance.hug');
    assert.equal(events.length,1,id);
    assert.equal(events[0].actorId,id);
  }
});
test('R1a QA does not bypass adult and family safeguards',()=>{
  const q=createHugQAHousehold();
  setLifeStage(q.socialGraph,'alex','teen');
  assert.equal(romanceAvailability(q.socialGraph,'alex','mira','romance.hug',q.minutes).enabled,false);
  assert.equal(startBranchSocial(q,'alex',point,'romance.hug'),false);
});
test('R1a QA reload is disposable; normal saves retain ordinary state and key',()=>{
  const source=newHousehold();
  const bytes=JSON.stringify(source);
  const sandbox=createHugQAHousehold();
  assert.notEqual(JSON.stringify(sandbox),bytes);
  const restored=loadHousehold(JSON.parse(bytes));
  assert.equal(getPair(restored.socialGraph,'alex','mira').romance.bond.status,'none');
  const game=read('../src/game.js');
  assert.match(game,/const hugQAMode=new URLSearchParams\(window\.location\.search\)\.get\('debug'\)===HUG_QA_DEBUG_QUERY/);
  assert.match(game,/if\(hugQAMode\)game=createHugQAHousehold\(\)/);
  assert.match(game,/if\(hugQAMode\)\{[\s\S]{0,130}return;[\s\S]{0,90}\}[\s\S]{0,100}try\s*\{\s*localStorage\.setItem\(SAVE_KEY/);
  assert.match(game,/if\(hugQAMode\)\{[\s\S]{0,300}hug-qa/);
  assert.ok(game.includes('beginSocial(\'talk\',false,initiatorId,null,null,\'romance.hug\')'));
  assert.ok(game.includes("qaPanel.querySelectorAll('button[data-initiator]')"));
  const ci=read('../.github/workflows/pages.yml');
  assert.ok(ci.includes('node --check src/romance-hug-qa.js'));
  assert.ok(ci.includes('cp src/romance-hug-qa.js site/src/'));
});
