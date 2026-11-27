import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,chooseResidentAction,getActor} from '../src/household.js';
import {findMarketPlacement,buyMarketItem,SHOP_MAX_CREDITS} from '../src/furniture-shop.js';
import {PAINT_ACTIVITY_ID,PAINT_WORKS_LIMIT} from '../src/painting.js';
import {HOBBY_ACTIVITIES} from '../src/hobby-reading.js';
import {arriveActivitySession,advanceActivitySession} from '../src/activity-session.js';
import {transactPainting} from '../src/painting-gallery.js';
import {newArtMarket,restoreArtMarket,artAdmissionQuote,projectArtAdmission,projectArtCancellation,projectArtCompletion,quoteArtSale,projectArtSale} from '../src/art-market.js';
const copy=structuredClone;
function fixture(){
 const root=newHousehold('2026-11-26');
 const place=findMarketPlacement(root.world.furniture,root.shop,'easel.starter');
 assert.ok(place);
 const buy=buyMarketItem(root.world.furniture,root.shop,'easel.starter',place);
 assert.ok(buy.ok);root.world.furniture=buy.world;root.shop=buy.shop;
 root.artMarket=newArtMarket(root.minutes);
 return {root,easel:buy.instanceId};
}
function begin(root,easel,id='alex',mode='speculative'){
 // C1 projection isolation: create the canonical session on an unactivated
 // clone; C2 tests separately exercise the integrated actual admission.
 const canonical=copy(root);delete canonical.artMarket;
 assert.ok(chooseResidentAction(canonical,'paint',false,id,easel,PAINT_ACTIVITY_ID,'painting.hills'));
 const a=getActor(root,id),b=getActor(canonical,id);a.action=b.action;a.activitySession=b.activitySession;
 const q=artAdmissionQuote(root,id,mode,'painting.hills');assert.ok(q.ok,q.reason);
 const result=projectArtAdmission(root,id,mode,q.price);assert.ok(result.ok,result.reason);
 Object.assign(root,{artMarket:result.artMarket,shop:result.shop,financialHistory:result.financialHistory});
 return result;
}
function ready(root,id){
 const a=getActor(root,id);
 const s=arriveActivitySession(a.activitySession,{authorized:true,resourceAvailable:true});
 a.activitySession=advanceActivitySession(HOBBY_ACTIVITIES,s,45,{authorized:true,resourceAvailable:true}).session;
 root.minutes+=45;root.otherSim.minutes=root.minutes;
 a.action=null;
}
function finish(root,id){
 ready(root,id);const a=getActor(root,id),r=projectArtCompletion(root,id);
 assert.ok(r.ok,r.reason);root.artMarket=r.artMarket;a.createdWorks=r.works;a.activitySession=null;return r;
}
function store(root,id,work){const r=transactPainting(root,id,work.id,'store');assert.ok(r.ok,r.reason);getActor(root,id).createdWorks=r.works;}
function sell(root,id,work){
 const q=quoteArtSale(root,id,work.id);assert.ok(q.ok,q.reason);
 const snapshot=copy(root),r=projectArtSale(root,id,work.id,q);assert.ok(r.ok,r.reason);assert.deepEqual(root,snapshot);
 Object.assign(root,{artMarket:r.artMarket,shop:r.shop,financialHistory:r.financialHistory});
 getActor(root,id).createdWorks=r.works;return r;
}
test('paid admission records one debit; completion and sale one credit; no repeated effects',()=>{
 const {root,easel}=fixture(),before=root.shop.credits;
 const start=begin(root,easel);assert.equal(start.entry.delta,-20);assert.equal(root.shop.credits,before-20);
 assert.equal(projectArtAdmission(root,'alex','speculative',20).reason,'active-painting');
 assert.equal(projectArtCompletion(root,'alex').reason,'not-ready');
 const {work}=finish(root,'alex');assert.ok(work);assert.equal(projectArtCompletion(root,'alex').reason,'not-ready');
 assert.equal(quoteArtSale(root,'alex',work.id).reason,'not-in-inventory');store(root,'alex',work);
 assert.equal(quoteArtSale(root,'mira',work.id).reason,'not-owned');
 const r=sell(root,'alex',work);assert.equal(root.shop.credits,before-20+r.amount);
 assert.equal(root.financialHistory.entries.length,2);assert.equal(projectArtSale(root,'alex',work.id,r).reason,'not-owned');
 assert.equal(root.artMarket.demandUnits,256*1440-r.amount*1440);
});
test('commission tied to actual selected session and new work, one per window',()=>{
 const {root,easel}=fixture();
 begin(root,easel,'alex');const old=finish(root,'alex').work;store(root,'alex',old);
 begin(root,easel,'alex','commission');const order=root.artMarket.byResident.alex.order;
 assert.equal(order.status,'accepted');assert.equal(quoteArtSale(root,'alex',old.id).kind,'spot');
 const {work}=finish(root,'alex');store(root,'alex',work);
 assert.equal(root.artMarket.byResident.alex.order.workId,work.id);
 assert.equal(quoteArtSale(root,'alex',work.id).kind,'commission');
 const r=sell(root,'alex',work);assert.equal(r.amount,r.base);
 assert.equal(root.artMarket.byResident.alex.order.status,'fulfilled');
 assert.equal(artAdmissionQuote(root,'alex','commission','painting.hills').reason,'order-unavailable');
 root.minutes+=7*1440;root.otherSim.minutes=root.minutes;
 assert.ok(artAdmissionQuote(root,'alex','commission','painting.hills').ok);
});
test('free practice is available without cash or durable artwork, no debit or credit',()=>{
 const {root,easel}=fixture();root.shop.credits=0;
 assert.equal(artAdmissionQuote(root,'alex','speculative','painting.hills').reason,'insufficient-credits');
 begin(root,easel,'alex','practice');const result=finish(root,'alex');
 assert.equal(result.work,null);assert.deepEqual(root.createdWorks,[]);
 assert.equal(root.shop.credits,0);assert.equal(root.financialHistory.entries.length,0);
 root.createdWorks=Array.from({length:PAINT_WORKS_LIMIT},()=>({}));
 assert.ok(artAdmissionQuote(root,'alex','practice','painting.hills').ok);
 assert.equal(artAdmissionQuote(root,'alex','speculative','painting.hills').reason,'collection-full');
});
test('cancelled commission cannot complete or reaccept in window; no refund or repeat debit',()=>{
 const {root,easel}=fixture();const initial=root.shop.credits;
 begin(root,easel,'alex','commission');const sid=root.activitySession.sessionId;
 const r=projectArtCancellation(root,'alex',sid);assert.ok(r.ok);root.artMarket=r.artMarket;
 assert.equal(root.shop.credits,initial-20);assert.equal(projectArtCancellation(root,'alex',sid).reason,'not-active');
 assert.equal(projectArtAdmission(root,'alex','speculative',20).reason,'replayed-admission');
 assert.equal(artAdmissionQuote(root,'alex','commission','painting.hills').reason,'order-unavailable');
 assert.equal(projectArtCompletion(root,'alex').reason,'not-ready');
});
test('stale quote, no demand and wallet cap preserve work, market and ledger',()=>{
 const {root,easel}=fixture();begin(root,easel);const {work}=finish(root,'alex');store(root,'alex',work);
 const q=quoteArtSale(root,'alex',work.id);const s=copy(root);
 assert.equal(projectArtSale(root,'alex',work.id,{...q,amount:q.amount+1}).reason,'stale-quote');assert.deepEqual(root,s);
 root.artMarket.demandUnits=0;root.artMarket.demandAt=root.minutes;
 assert.equal(quoteArtSale(root,'alex',work.id).reason,'no-demand');
 root.minutes+=1440;root.otherSim.minutes=root.minutes;assert.equal(quoteArtSale(root,'alex',work.id).amount,q.amount);
 root.shop.credits=SHOP_MAX_CREDITS;assert.equal(quoteArtSale(root,'alex',work.id).reason,'wallet-limit');
});
test('strict sidecar roundtrip, corrupt state and clock reversal fail closed',()=>{
 const {root,easel}=fixture();begin(root,easel,'mira','commission');
 assert.deepEqual(restoreArtMarket(JSON.parse(JSON.stringify(root.artMarket)),root.minutes),root.artMarket);
 const malformed=copy(root.artMarket);malformed.demandUnits=-1;
 assert.equal(restoreArtMarket(malformed,root.minutes),null);
 assert.equal(restoreArtMarket(root.artMarket,root.minutes-1),null);
 const bad=copy(root.artMarket);bad.byResident.mira.order.sessionId='wrong:session';
 assert.equal(restoreArtMarket(bad,root.minutes),null);
 assert.equal(restoreArtMarket(undefined,root.minutes),null);
});
test('expired commission becomes ordinary owned art, no automatic payout',()=>{
 const {root,easel}=fixture();begin(root,easel,'alex','commission');
 root.minutes+=7*1440;root.otherSim.minutes=root.minutes;
 const before=root.shop.credits;const {work}=finish(root,'alex');store(root,'alex',work);
 assert.equal(root.artMarket.byResident.alex.order.status,'cancelled');
 assert.equal(quoteArtSale(root,'alex',work.id).kind,'spot');assert.equal(root.shop.credits,before);
});
