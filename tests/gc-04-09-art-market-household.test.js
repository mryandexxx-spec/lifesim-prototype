import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,chooseResidentAction,getActor,tickHousehold,enableArtMarketPilot,reconcileArtMarket} from '../src/household.js';
import {arrive} from '../src/simulation.js';
import {findMarketPlacement,buyMarketItem,storeMarketItem} from '../src/furniture-shop.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {PAINT_ACTIVITY_ID,PAINT_WORKS_LIMIT} from '../src/painting.js';
import {enqueueAction,dispatchActionQueues,pendingActions} from '../src/action-queue.js';
import {quoteArtSale,projectArtSale} from '../src/art-market.js';
import {transactPainting} from '../src/painting-gallery.js';
const copy=x=>JSON.parse(JSON.stringify(x));
const theme='painting.hills';
function fixture(active=true){
 const root=newHousehold('2026-11-26');root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
 const pose=findMarketPlacement(root.world.furniture,root.shop,'easel.starter');
 assert.ok(pose);const buy=buyMarketItem(root.world.furniture,root.shop,'easel.starter',pose);
 assert.ok(buy.ok);root.world.furniture=buy.world;root.shop=buy.shop;
 if(active)assert.ok(enableArtMarketPilot(root));
 return {root,easel:buy.instanceId};
}
function command(easel,mode='speculative'){return {type:'activity',activityId:PAINT_ACTIVITY_ID,contentId:theme,targetInstanceId:easel,paintMode:mode,paintExpectedPrice:mode==='practice'?0:20};}
function start(root,id,c){
 return chooseResidentAction(root,'paint',false,id,c.targetInstanceId,c.activityId,c.contentId,null,null,null,false,false,c.paintMode,c.paintExpectedPrice);
}
function reach(root,id,easel){
 const a=getActor(root,id);const spot=furnitureActionApproach(root.world,'paint',easel);assert.ok(spot);
 a.position={x:spot.x,z:spot.z};arrive(a);
}
function complete(root,id,easel){
 reach(root,id,easel);
 for(let i=0;i<45;i++)tickHousehold(root,1);
 assert.equal(getActor(root,id).action,null);
}
test('queue intent persists with no charge; actual dispatch admits and charges once; reload completes and pays once',()=>{
 let {root,easel}=fixture();const initial=root.shop.credits;
 const c=command(easel,'commission');
 assert.ok(enqueueAction(root.actionQueues,'alex',c));
 assert.equal(root.shop.credits,initial);
 root=loadHousehold(copy(root));assert.equal(root.shop.credits,initial);
 assert.equal(pendingActions(root.actionQueues,'alex')[0].paintMode,'commission');
 const dispatch=()=>dispatchActionQueues(root.actionQueues,{canStart:()=>true,start:(id,cmd)=>start(root,id,cmd)});
 assert.equal(dispatch().length,1);assert.equal(root.shop.credits,initial-20);
 assert.equal(dispatch().length,0);assert.equal(root.financialHistory.entries.length,1);
 root=loadHousehold(copy(root));assert.equal(root.shop.credits,initial-20);
 reach(root,'alex',easel);root=loadHousehold(copy(root)); // just-arrived boundary
 assert.equal(root.action.phase,'using');
 for(let i=0;i<45;i++)tickHousehold(root,1);
 assert.equal(root.createdWorks.length,1);assert.equal(root.artMarket.byResident.alex.order.status,'ready');
 const work=root.createdWorks[0];root.createdWorks=transactPainting(root,'alex',work.id,'store').works;
 root=loadHousehold(copy(root));const q=quoteArtSale(root,'alex',work.id);assert.equal(q.kind,'commission');
 const tx=projectArtSale(root,'alex',work.id,q);assert.ok(tx.ok);
 Object.assign(root,{artMarket:tx.artMarket,shop:tx.shop,financialHistory:tx.financialHistory,createdWorks:tx.works});
 root=loadHousehold(copy(root));assert.equal(root.shop.credits,initial-20+tx.amount);
 assert.equal(root.financialHistory.entries.length,2);
 assert.equal(projectArtSale(root,'alex',work.id,q).reason,'not-owned');
});
test('free practice works at full collection and zero cash, preserves existing art and XP',()=>{
 const {root,easel}=fixture();
 root.createdWorks=Array.from({length:PAINT_WORKS_LIMIT},(_,i)=>({id:'work:legacy:'+i,ownerId:'alex',easelInstanceId:easel,contentId:theme,seed:i,quality:50,createdAt:480,kind:'artwork',location:'inventory'}));
 const old=copy(root.createdWorks);root.shop.credits=0;
 assert.equal(start(root,'alex',command(easel)),false);
 assert.ok(start(root,'alex',command(easel,'practice')));
 complete(root,'alex',easel);
 assert.deepEqual(root.createdWorks,old);assert.equal(root.shop.credits,0);
 assert.ok(root.skills.xpById.painting>0);assert.equal(root.financialHistory.entries.length,0);
});
test('manual cancellation and missing physical source reconcile once without refund, reward or ghost order',()=>{
 let {root,easel}=fixture();const cash=root.shop.credits;
 assert.ok(start(root,'mira',command(easel,'commission')));
 root.otherSim.action=null;root.otherSim.activitySession=null;
 root=loadHousehold(copy(root));assert.equal(root.artMarket.byResident.mira.active,null);
 assert.equal(root.artMarket.byResident.mira.order.status,'cancelled');assert.equal(root.shop.credits,cash-20);
 tickHousehold(root,1);assert.ok(start(root,'alex',command(easel)));
 const stored=storeMarketItem(root.world.furniture,root.shop,easel);assert.ok(stored.ok);
 root.world.furniture=stored.world;root.shop=stored.shop;
 tickHousehold(root,1);assert.equal(root.action,null);assert.equal(root.artMarket.byResident.alex.active,null);
 assert.equal(root.createdWorks.length,0);assert.equal(root.financialHistory.entries.length,2);
});
test('legacy save/queue unchanged and activation cannot retroactively charge; invalid market fails closed',()=>{
 let {root,easel}=fixture(false);const money=root.shop.credits;
 assert.ok(enqueueAction(root.actionQueues,'alex',{type:'activity',activityId:PAINT_ACTIVITY_ID,contentId:theme,targetInstanceId:easel}));
 assert.equal(enableArtMarketPilot(root),false);root=loadHousehold(copy(root));
 assert.equal(Object.hasOwn(root,'artMarket'),false);assert.equal(root.shop.credits,money);
 assert.equal(pendingActions(root.actionQueues,'alex')[0].paintMode,undefined);
 root.actionQueues.byResident.alex=[];assert.ok(enableArtMarketPilot(root));
 const raw=copy(root);raw.artMarket.demandUnits=-1;
 assert.throws(()=>loadHousehold(raw),/Invalid saved art market/);
});
test('invalid queue mode, stale price and missing intent never debit or create an action',()=>{
 const {root,easel}=fixture();const before=root.shop.credits;
 assert.equal(enqueueAction(root.actionQueues,'alex',{...command(easel),paintMode:'forged'}),null);
 assert.equal(start(root,'alex',{...command(easel),paintExpectedPrice:21}),false);
 assert.equal(chooseResidentAction(root,'paint',false,'alex',easel,PAINT_ACTIVITY_ID,theme),false);
 assert.equal(root.action,null);assert.equal(root.shop.credits,before);assert.equal(root.financialHistory.entries.length,0);
});
