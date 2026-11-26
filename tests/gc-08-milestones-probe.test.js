/** Isolated diagnostic only. No runtime entry point or persistence integration. */
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

// Observe a committed canonical sale receipt, never a request or a UI event.
// Sidecar deliberately separate from root for this experiment.
function firstSale(root,id,work,book){
  if(!['alex','mira'].includes(id))return book;
  const e=restoreFinancialHistory(root.financialHistory).entries.find(e=>
    e.id==='art:'+id+':'+work && e.kind==='art-sale' &&
    e.actorId===id && e.sourceId===work && e.delta>0 &&
    e.atGameMinute<=root.minutes);
  if(!e||getActor(root,id).createdWorks.some(w=>w.id===work)||Object.hasOwn(book,id))return book;
  return {...book,[id]:{definition:'first-art-sale',actorId:id,receiptId:e.id,at:e.atGameMinute,work}};
}
function currentProof(root,id,work){
  return restoreFinancialHistory(root.financialHistory).entries.some(e=>
    e.id==='art:'+id+':'+work && e.actorId===id && e.kind==='art-sale' && e.delta>0)
    ?'observed':'unknown';
}
function run(id,track){
  let book={};const {root,easel}=fixture(),other=id==='alex'?'mira':'alex';
  begin(root,id,easel);reach(root,id,easel);tickHousehold(root,20);
  assert.equal(getActor(root,id).createdWorks.length,0);
  assert.equal(transactPainting(root,id,'work:missing','sell').ok,false);
  if(track)assert.deepEqual(firstSale(root,id,'work:missing',book),{});
  tickHousehold(root,25);
  const work=getActor(root,id).createdWorks.at(-1).id;
  assert.ok(work);commit(root,id,work,'store');
  assert.equal(transactPainting(root,other,work,'sell').ok,false);
  if(track)assert.deepEqual(firstSale(root,id,work,book),{});
  commit(root,id,work,'sell');
  const wallet=root.shop.credits, before=clone(root);
  if(track){
    assert.deepEqual(firstSale(root,other,work,book),{});
    book=firstSale(root,id,work,book);
    assert.ok(book[id]);
    assert.deepEqual(firstSale(root,id,work,book),book);
    assert.deepEqual(root,before);
  }
  assert.equal(root.shop.credits,wallet);
  assert.equal(transactPainting(root,id,work,'sell').ok,false);
  assert.equal(currentProof(root,id,work),'observed');
  const second=finish(root,id,easel);assert.notEqual(second,work);
  commit(root,id,second,'store');commit(root,id,second,'sell');
  if(track)assert.deepEqual(firstSale(root,id,second,book),book);
  // Artificial ledger pressure, not simulated purchases or player behavior.
  for(let i=0;i<120;i++){
    const f=recordFinanceChange(root,{...root.shop,credits:root.shop.credits-1},{
      kind:'purchase',sourceId:'stress-'+i,actorId:id,atGameMinute:Math.floor(root.minutes)});
    assert.equal(f.ok,true,f.reason);root.shop=f.shop;root.financialHistory=f.financialHistory;
  }
  assert.equal(root.financialHistory.entries.length,120);
  assert.equal(currentProof(root,id,work),'unknown');
  assert.equal(currentProof(loadHousehold(clone(root)),id,work),'unknown');
  if(track){
    const copy=clone(book);
    assert.deepEqual(copy,book);assert.equal(copy[id].work,work);
    assert.equal(copy[id].receiptId,'art:'+id+':'+work);
    assert.equal(Object.keys(copy).length,1);
    assert.deepEqual(firstSale(root,id,work,copy),copy);
  }
  return {root,book,work};
}
for(const id of ['alex','mira'])test('first sale survives bounded journal eviction: '+id,()=>{
  const a=run(id,false),b=run(id,true);
  assert.deepEqual(a.root,b.root);
  assert.deepEqual(a.book,{});
  assert.equal(b.book[id].work,b.work);
  console.log(JSON.stringify({actor:id,baseline:currentProof(a.root,id,a.work),milestone:b.book[id],journal:a.root.financialHistory.entries.length,wallet:a.root.shop.credits,canonicalEqual:true}));
});
test('legacy history absent, no backdated claim',()=>{
  const {root}=fixture();delete root.financialHistory;
  const old=loadHousehold(clone(root));
  assert.equal(currentProof(old,'alex','work:legacy'),'unknown');
  assert.deepEqual(firstSale(old,'alex','work:legacy',{}),{});
});
