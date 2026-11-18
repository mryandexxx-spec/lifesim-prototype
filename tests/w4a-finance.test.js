import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold} from '../src/household.js';
import {newFinancialHistory,restoreFinancialHistory,recordFinanceChange,FINANCE_HISTORY_LIMIT}
  from '../src/finance-ledger.js';
import {buyMarketItem,sellMarketItem,findMarketPlacement,SHOP_MAX_CREDITS}
  from '../src/furniture-shop.js';
import {createFurnitureEditor} from '../src/furniture-editor.js';
import {hireCareer} from '../src/career-state.js';
import {nextCareerShift} from '../src/career-scheduler.js';
import {progressCareerWork} from '../src/career-work.js';
import {transactPainting} from '../src/painting-gallery.js';

const copy=x=>JSON.parse(JSON.stringify(x));
const money=(root,shop,kind,sourceId,more={})=>
  recordFinanceChange(root,shop,{kind,sourceId,
    atGameMinute:Math.floor(root.minutes),...more});
const apply=(root,transaction,kind,sourceId)=>{
  const result=money(root,transaction.shop,kind,sourceId);
  assert.equal(result.ok,true,result.reason);
  root.shop=result.shop;root.financialHistory=result.financialHistory;
  return result;
};

test('W4-A: new household gets history; legacy v1 credits, furniture and both actors survive migration',()=>{
  const old=newHousehold();
  old.shop.credits=2719;
  old.world.furniture.instances[0].x+=0.01;
  old.careerSystem=hireCareer(old.careerSystem,'alex','city-services',old.minutes);
  delete old.financialHistory;
  const restored=loadHousehold(copy(old));
  assert.equal(restored.version,1);
  assert.equal(restored.shop.credits,2719);
  assert.equal(restored.world.furniture.instances.length,old.world.furniture.instances.length);
  assert.deepEqual(restored.financialHistory,newFinancialHistory());
  assert.equal(restored.careerSystem.byResident.alex.careerId,'city-services');
  assert.ok(restored.otherSim);
  assert.deepEqual(loadHousehold(copy(restored)).financialHistory,newFinancialHistory());
});

test('W4-A: journal validates signing, source, balance and never mutates caller on rejection',()=>{
  const root=newHousehold(),before=copy(root);
  const wrong=money(root,{...root.shop,credits:root.shop.credits+50},
    'purchase','fake');
  assert.equal(wrong.ok,false);
  assert.deepEqual(root,before);
  assert.equal(money(root,{...root.shop,credits:-1},'sale','bad').ok,false);
  assert.equal(money(root,{...root.shop,credits:SHOP_MAX_CREDITS+1},
    'sale','overflow').ok,false);
  assert.equal(money(root,{...root.shop,credits:root.shop.credits+5},
    'salary','shift', {actorId:'foreign'}).ok,false);
  const paid=money(root,{...root.shop,credits:root.shop.credits+120},
    'salary','e1@1@480',{receiptId:'salary:e1@1@480',actorId:'alex'});
  assert.equal(paid.ok,true);assert.equal(paid.entry.delta,120);
  assert.equal(paid.entry.balanceAfter,5120);
  assert.equal(root.shop.credits,5000);
  root.shop=paid.shop;root.financialHistory=paid.financialHistory;
  assert.equal(money(root,{...root.shop,credits:root.shop.credits+120},
    'salary','e1@1@480',{receiptId:'salary:e1@1@480'}).reason,
    'duplicate-transaction');
});

test('W4-A: storage/placement without credits has no phantom entry',()=>{
  const root=newHousehold();
  const a=money(root,{...root.shop},'undo','free-store');
  assert.equal(a.ok,true);assert.equal(a.recorded,false);
  assert.equal(a.financialHistory.entries.length,0);
  assert.equal(a.shop.credits,5000);
});

test('W4-A: successful shop purchase and resale record actual signed value; rejected placement is free',()=>{
  const root=newHousehold(),people={residents:[{x:-.8,z:2.95},{x:-.25,z:.35}]};
  const invalid=buyMarketItem(root.world.furniture,root.shop,'plant',
    {x:100,z:100,yaw:0},people);
  assert.equal(invalid.ok,false);
  assert.equal(root.shop.credits,5000);
  assert.equal(root.financialHistory.entries.length,0);
  const pose=findMarketPlacement(root.world.furniture,root.shop,'plant',people);
  const bought=buyMarketItem(root.world.furniture,root.shop,'plant',pose,people);
  assert.equal(bought.ok,true);
  apply(root,bought,'purchase',bought.instanceId);
  root.world.furniture=bought.world;
  assert.equal(root.shop.credits,4870);
  const sold=sellMarketItem(root.world.furniture,root.shop,bought.instanceId);
  assert.equal(sold.ok,true);
  apply(root,sold,'sale',sold.instanceId);
  root.world.furniture=sold.world;
  assert.equal(root.financialHistory.entries.length,2);
  assert.deepEqual(root.financialHistory.entries.map(e=>e.delta),[-130,91]);
  assert.equal(root.shop.credits,4961);
  const restored=loadHousehold(copy(root));
  assert.equal(restored.shop.credits,4961);
  assert.equal(restored.financialHistory.entries.length,2);
});

test('W4-A: editor undo/redo monetary effects become explicit journal entries',()=>{
  const root=newHousehold(),people={residents:[{x:-.8,z:2.95},{x:-.25,z:.35}]};
  const editor=createFurnitureEditor(root.world.furniture,root.shop);
  const pose=findMarketPlacement(root.world.furniture,root.shop,'plant',people);
  const tx=buyMarketItem(root.world.furniture,root.shop,'plant',pose,people);
  const bought=editor.transactMarket(tx);
  assert.equal(bought.ok,true);
  root.world.furniture=bought.world;
  apply(root,bought,'purchase',tx.instanceId);
  const undone=editor.undo();
  assert.equal(undone.ok,true);
  root.world.furniture=undone.world;
  apply(root,undone,'undo','undo-buy');
  assert.equal(root.shop.credits,5000);
  const redone=editor.redo();
  root.world.furniture=redone.world;
  apply(root,redone,'redo','redo-buy');
  assert.deepEqual(root.financialHistory.entries.map(e=>e.delta),[-130,130,-130]);
  assert.equal(root.shop.credits,4870);
});

test('W4-A: genuine full shift pays exactly once and writes one salary record',()=>{
  const root=newHousehold();
  root.careerSystem=hireCareer(root.careerSystem,'alex','city-services',root.minutes);
  const contract=root.careerSystem.byResident.alex;
  const shift=nextCareerShift(root.calendar,contract,root.minutes);
  assert.ok(shift);
  contract.currentShift={...shift,phase:'working',departedAt:shift.start,
    warn60:true,warn15:true,readiness:75};
  root.minutes=shift.end-1;
  const before=root.shop.credits;
  const events=progressCareerWork(root,shift.end-1,shift.end);
  assert.ok(events.some(e=>e.type==='salary'));
  assert.equal(root.shop.credits-before,Math.round(shift.duration*shift.hourlyCredits/60));
  assert.equal(root.financialHistory.entries.length,1);
  assert.equal(root.financialHistory.entries[0].id,'salary:'+shift.id);
  assert.equal(root.financialHistory.entries[0].actorId,'alex');
  assert.deepEqual(root.careerSystem.settlementIds,[shift.id]);
  progressCareerWork(root,shift.end,shift.end+3);
  assert.equal(root.financialHistory.entries.length,1);
  assert.equal(root.shop.credits-before,Math.round(shift.duration*shift.hourlyCredits/60));
  const again=loadHousehold(copy({...root,minutes:shift.end,otherSim:{...root.otherSim,minutes:shift.end}}));
  assert.equal(again.shop.credits,root.shop.credits);
  assert.equal(again.financialHistory.entries.length,1);
  assert.deepEqual(again.careerSystem.settlementIds,[shift.id]);
});

test('W4-A: painting sale returns the existing credits only once and has a dated receipt',()=>{
  const root=newHousehold();
  root.createdWorks=[{id:'paint-test',ownerId:'alex',kind:'artwork',
    location:'inventory',quality:55,contentId:'painting.still-life'}];
  const tx=transactPainting(root,'alex','paint-test','sell');
  assert.equal(tx.ok,true);
  const posted=money(root,tx.shop,'art-sale','paint-test',
    {actorId:'alex',receiptId:'art:alex:paint-test'});
  assert.equal(posted.ok,true);
  root.createdWorks=tx.works;root.shop=posted.shop;
  root.financialHistory=posted.financialHistory;
  assert.equal(root.createdWorks.length,0);
  assert.equal(root.financialHistory.entries[0].delta,190);
  assert.equal(transactPainting(root,'alex','paint-test','sell').ok,false);
});

test('W4-A: art sales share the same 1e9 credit cap as wages and store',()=>{
  const root=newHousehold();
  root.shop.credits=1_000_001;
  root.createdWorks=[{id:'paint-high',ownerId:'alex',kind:'artwork',
    location:'inventory',quality:100}];
  const sold=transactPainting(root,'alex','paint-high','sell');
  assert.equal(sold.ok,true);
  const booked=money(root,sold.shop,'art-sale','paint-high',{actorId:'alex'});
  assert.equal(booked.ok,true);
  assert.equal(booked.shop.credits,1_000_326);
  root.shop.credits=SHOP_MAX_CREDITS;
  assert.equal(transactPainting(root,'alex','paint-high','sell').reason,'wallet-limit');
});

test('W4-A: bounded sanitized history, monotonic ids and old malformed data safe',()=>{
  const root=newHousehold();
  for(let i=0;i<FINANCE_HISTORY_LIMIT+35;i++){
    const out=money(root,{...root.shop,credits:root.shop.credits+1},
      'salary','shift-'+i,{actorId:'mira'});
    assert.equal(out.ok,true);
    root.shop=out.shop;root.financialHistory=out.financialHistory;
  }
  assert.equal(root.financialHistory.entries.length,FINANCE_HISTORY_LIMIT);
  assert.equal(root.financialHistory.entries.at(0).id,'fin-36');
  assert.equal(root.financialHistory.nextId,FINANCE_HISTORY_LIMIT+36);
  const broken={...root.financialHistory,entries:[
    {id:'bad',kind:'salary',delta:1,balanceAfter:-50,atGameMinute:1,sourceId:'s'},
    root.financialHistory.entries.at(-1),root.financialHistory.entries.at(-1)]};
  const clean=restoreFinancialHistory(copy(broken));
  assert.equal(clean.entries.length,1);
  assert.equal(clean.nextId,root.financialHistory.nextId);
  assert.equal(loadHousehold(copy(root)).financialHistory.entries.length,FINANCE_HISTORY_LIMIT);
  assert.deepEqual(restoreFinancialHistory(undefined),newFinancialHistory());
});

test('W4-A: actual game integrations use one journal and production Pages includes it',()=>{
  const sources=['src/game.js','src/career-work.js','src/household.js'].map(f=>
    readFileSync(new URL('../'+f,import.meta.url),'utf8'));
  for(const source of sources)assert.match(source,/recordFinanceChange|restoreFinancialHistory|newFinancialHistory/);
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(pages,/src\/finance-ledger\.js/);
  const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(index,/\.\/src\/finance-ledger\.js/);
});
