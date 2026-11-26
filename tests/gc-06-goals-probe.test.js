/** Isolated GC-06 diagnostic: read-only optional goals, not a game entry point. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,chooseResidentAction,getActor,tickHousehold} from '../src/household.js';
import {arrive} from '../src/simulation.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {findMarketPlacement,buyMarketItem,storeMarketItem} from '../src/furniture-shop.js';
import {findPath} from '../src/navigation.js';
import {PAINT_ACTIVITY_ID,PAINT_CONTENT_IDS,restoreCreatedWorks} from '../src/painting.js';
import {transactPainting} from '../src/painting-gallery.js';
import {recordFinanceChange,restoreFinancialHistory} from '../src/finance-ledger.js';
import {currentSkillLevel} from '../src/skills-engine.js';
import {HOBBY_SKILLS} from '../src/hobby-reading.js';

const clone=x=>JSON.parse(JSON.stringify(x));
const level=(root,id)=>currentSkillLevel(getActor(root,id).skills,HOBBY_SKILLS,'painting');
const works=(root,id)=>restoreCreatedWorks(getActor(root,id).createdWorks,id);
function activate(root,id,kind){
  if(!['alex','mira'].includes(id)||!['display','sell','mastery'].includes(kind))return null;
  if(kind==='mastery'&&level(root,id)>=3)return null;
  return Object.freeze({id,kind,from:root.minutes,until:root.minutes+(kind==='mastery'?10080:1440),
    prior:Object.freeze(works(root,id).map(w=>w.id)),initialLevel:level(root,id)});
}
// Called on validated domain state only. Never a source of payments or commands.
// Display and level are current observations, not a historical event journal.
// The sell adapter uses the existing canonical finance ID format.
function observe(root,g){
  if(!g||!getActor(root,g.id)||root.minutes<g.from)return {state:'unavailable'};
  const now=root.minutes,inside=now<=g.until;
  const fresh=w=>!g.prior.includes(w.id)&&w.createdAt>g.from&&w.createdAt<=Math.min(now,g.until);
  if(g.kind==='sell'){
    const entry=restoreFinancialHistory(root.financialHistory).entries.find(e=>
      e.kind==='art-sale'&&e.actorId===g.id&&e.delta>0&&e.id==='art:'+g.id+':'+e.sourceId&&
      e.sourceId.startsWith('work:')&&!g.prior.includes(e.sourceId)&&
      e.atGameMinute>g.from&&e.atGameMinute<=Math.min(now,g.until));
    if(entry)return {state:'observed',proof:entry.id,amount:entry.delta};
  }
  if(inside&&g.kind==='display'){
    const work=works(root,g.id).find(w=>fresh(w)&&w.kind==='artwork'&&w.location==='wall');
    if(work)return {state:'observed',proof:work.id};
  }
  if(inside&&g.kind==='mastery'&&g.initialLevel<3&&level(root,g.id)>=3)
    return {state:'observed',proof:'painting-level-3',level:level(root,g.id)};
  return {state:inside?'open':'expired-unverified'};
}
function fixture(){
  const root=newHousehold('2026-11-16');
  const pose=findMarketPlacement(root.world.furniture,root.shop,'easel.starter');
  assert.ok(pose);
  const bought=buyMarketItem(root.world.furniture,root.shop,'easel.starter',pose);
  assert.equal(bought.ok,true,bought.reason);
  root.world.furniture=bought.world;root.shop=bought.shop;
  return {root,easel:bought.instanceId};
}
function begin(root,id,easel){
  assert.equal(chooseResidentAction(root,'paint',false,id,easel,PAINT_ACTIVITY_ID,PAINT_CONTENT_IDS[0]),true);
  return getActor(root,id);
}
function reach(root,id,easel){
  const actor=getActor(root,id),dest=furnitureActionApproach(root.world,'paint',easel);
  assert.ok(dest);assert.ok(findPath(actor.position,dest,root.world));
  actor.position={...dest};arrive(actor);
}
function finish(root,id,easel){
  begin(root,id,easel);reach(root,id,easel);tickHousehold(root,45);
  const w=getActor(root,id).createdWorks.at(-1);
  assert.ok(w);return w.id;
}
function commit(root,id,work,op,slot=null){
  const result=transactPainting(root,id,work,op,slot);
  assert.equal(result.ok,true,result.reason);
  const finance=op==='sell'?recordFinanceChange(root,result.shop,{kind:'art-sale',
    sourceId:work,actorId:id,atGameMinute:Math.floor(root.minutes),receiptId:'art:'+id+':'+work}):null;
  if(finance){assert.equal(finance.ok,true,finance.reason);root.financialHistory=finance.financialHistory;}
  getActor(root,id).createdWorks=result.works;root.shop=finance?.shop||result.shop;
}
function run(id,kind,withObserver){
  const {root,easel}=fixture(),g=activate(root,id,kind),m=activate(root,id,'mastery');
  const checks=[];
  const sample=label=>{
    if(!withObserver)return;
    const before=clone(root);
    checks.push({label,short:observe(root,g),medium:observe(root,m)});
    assert.deepEqual(root,before,'observer must not mutate household');
  };
  sample('start');
  begin(root,id,easel);sample('walking');reach(root,id,easel);
  tickHousehold(root,20);sample('partial');
  tickHousehold(root,25);sample('finished-not-disposed');
  const work=getActor(root,id).createdWorks.at(-1).id;
  commit(root,id,work,'store');sample('stored');
  commit(root,id,work,kind==='display'?'hang':'sell',kind==='display'?0:null);
  sample('chosen');
  const cash=root.shop.credits;
  for(let i=0;i<8&&level(root,id)<3;i++){
    const next=finish(root,id,easel);commit(root,id,next,'store');sample('practice-'+i);
  }
  assert.ok(level(root,id)>=3);assert.equal(root.shop.credits,cash);
  sample('mastery');
  return {root,checks,g,m,work};
}
for(const id of ['alex','mira'])for(const kind of ['display','sell']){
  test('paired observer vs free play: '+id+' '+kind,()=>{
    const a=run(id,kind,false),b=run(id,kind,true);
    assert.deepEqual(a.root,b.root);
    for(const row of b.checks.slice(0,5))assert.equal(row.short.state,'open',row.label);
    assert.equal(b.checks.find(x=>x.label==='chosen').short.state,'observed');
    assert.equal(b.checks.at(-1).medium.state,'observed');
    assert.deepEqual(observe(b.root,b.g),observe(loadHousehold(clone(b.root)),b.g));
    const other=id==='alex'?'mira':'alex';
    assert.equal(observe(b.root,{...b.g,id:other}).state,'open');
    if(kind==='sell'){
      assert.equal(transactPainting(b.root,id,b.work,'sell').reason,'not-owned');
      const legacy=clone(b.root);delete legacy.financialHistory;
      assert.equal(observe(loadHousehold(legacy),b.g).state,'open');
    }else{
      const later=activate(b.root,id,'display');
      assert.equal(observe(b.root,later).state,'open','old displayed work not retroactive');
    }
    const expired=clone(b.root);expired.minutes=b.g.until+1;
    assert.equal(observe(expired,b.g).state,kind==='sell'?'observed':'expired-unverified');
    expired.minutes=b.m.until+1;
    assert.equal(observe(expired,b.m).state,'expired-unverified');
    console.log(JSON.stringify({actor:id,choice:kind,checks:b.checks,wallet:b.root.shop.credits,
      level:level(b.root,id),work:b.work,elapsed:b.root.minutes-b.g.from}));
  });
}
test('removed station, partial work and failed sale never complete short goals',()=>{
  const {root,easel}=fixture(),g=activate(root,'alex','sell'),h=activate(root,'alex','display');
  begin(root,'alex',easel);reach(root,'alex',easel);tickHousehold(root,2);
  const removed=storeMarketItem(root.world.furniture,root.shop,easel);
  assert.equal(removed.ok,true);root.world.furniture=removed.world;
  tickHousehold(root,4);
  assert.equal(root.createdWorks.length,0);
  assert.equal(observe(root,g).state,'open');assert.equal(observe(root,h).state,'open');
  assert.equal(transactPainting(root,'alex','work:missing','sell').ok,false);
  assert.deepEqual(observe(root,g),observe(root,g));
});
test('expired, missing evidence and pre-activation work fail closed; no goal when already mastered',()=>{
  const {root,easel}=fixture(),old=finish(root,'alex',easel);
  commit(root,'alex',old,'store');
  const g=activate(root,'alex','sell');
  tickHousehold(root,1);commit(root,'alex',old,'sell');
  assert.equal(observe(root,g).state,'open');
  const late=clone(root);late.minutes=g.until+1;
  assert.equal(observe(late,g).state,'expired-unverified');
  assert.equal(activate(root,'resident_3','display'),null);
  const done=run('alex','display',true);
  assert.equal(activate(done.root,'alex','mastery'),null);
});
