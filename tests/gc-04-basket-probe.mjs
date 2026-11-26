/** GC-04 scenario projections, NOT household gameplay or new runtime rules. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {newHousehold,loadHousehold} from '../src/household.js';
import {proposeKitchenRestock} from '../src/kitchen-market.js';
import {proposeReadyMealPurchase,settleReadyMealDeliveries,DELIVERY_GAME_MINUTES} from '../src/ready-food.js';
import {finishKitchenRecipe,takeKitchenServingDetails} from '../src/kitchen.js';
import {MARKET_OFFERS} from '../src/furniture-shop.js';
import {paintingResaleCredits} from '../src/painting-gallery.js';
const dir='artifacts/gc-04-r1';
const trace=JSON.parse(readFileSync(dir+'/report.json','utf8'));
const checkpoints=[7,30,90], meals=[2,4,6], modes=['home','fridge','phone'];
const report={sha:trace.sha,assumptions:'Independent 2/4/6 portions per family-day, not actual hunger/route; hypothetical material cost 20 per sold work; shared rolling 24h sale pressure; optional catalog price milestones, no placement; no added runtime costs.',baskets:[],projections:[],controls:{}};
function basket(mode,portions){
 const h=newHousehold('2026-11-26');h.shop.credits=100000;
 const start=h.shop.credits,begin=h.minutes,ids=new Set();let cost=0,consumed=0,batches=0;
 const daily=[];
 const commit=tx=>{assert.ok(tx.ok,tx.reason);assert.ok(tx.entry);assert.ok(!ids.has(tx.entry.id));ids.add(tx.entry.id);cost-=tx.entry.delta;Object.assign(h,{kitchen:tx.kitchen,shop:tx.shop,financialHistory:tx.financialHistory});assert.equal(h.shop.credits,start-cost);};
 for(let day=1;day<=90;day++){
   h.minutes=begin+(day-1)*1440;
   for(let n=0;n<portions;n++){
     if(mode==='home'){
       if(!h.kitchen.prepared.some(x=>x.recipeId==='cook.soup'&&x.portions>0)){
         if(h.kitchen.pantry.vegetables<2)commit(proposeKitchenRestock(h,'vegetables','alex'));
         assert.ok(finishKitchenRecipe(h.kitchen,'cook.soup',0));batches++;
       }
       assert.equal(takeKitchenServingDetails(h.kitchen,'cook.soup')?.recipeId,'cook.soup');
     }else{
       const tx=proposeReadyMealPurchase(h,'ready.sunny-grains',mode,'alex');commit(tx);
       if(mode==='phone'){
         assert.equal(settleReadyMealDeliveries(h).length,0);
         h.minutes+=DELIVERY_GAME_MINUTES;
         assert.equal(settleReadyMealDeliveries(h).length,1);
         assert.equal(settleReadyMealDeliveries(h).length,0);
       }
       assert.equal(takeKitchenServingDetails(h.kitchen,'ready.sunny-grains')?.recipeId,'ready.sunny-grains');
     }
     consumed++;
   }
   assert.equal(consumed,day*portions);
   if(mode==='home')assert.equal(batches*3,consumed+h.kitchen.prepared.reduce((a,x)=>a+x.portions,0));
   assert.equal(h.shop.credits,start-cost);
   daily.push({day,cost,consumed,batches,remaining:h.kitchen.prepared.reduce((a,x)=>a+x.portions,0)});
 }
 return {mode,portions,daily};
}
for(const mode of modes)for(const portions of meals)report.baskets.push(basket(mode,portions));
const poor=newHousehold('2026-11-26');poor.shop.credits=0;
assert.equal(proposeReadyMealPurchase(poor,'ready.sunny-grains','fridge').reason,'insufficient-credits');
assert.equal(proposeKitchenRestock(poor,'vegetables').reason,'insufficient-credits');
report.controls.procurement='PASS';
const milestones=['bed.canopy','sofa.comfort','diningtable.farm','chair.loft','chair.loft'].map(id=>{const x=MARKET_OFFERS.find(v=>v.itemId===id);assert.ok(x,id);return {id,price:x.price};});
report.milestones=milestones;
const furniture=milestones.reduce((s,x)=>s+x.price,0);
const price=(amount,prior)=>Math.round(amount/(1+0.20*prior));
assert.ok(price(325,8)<price(325,0));assert.ok(price(325,8)>0);assert.ok(price(325,4)>price(100,4));
report.controls.saturation='PASS';
for(const row of trace.policies.filter(x=>!x.replay&&x.status==='PASS')){
 const sales=row.artReceipts;let left=0,alt=0;
 const priced=sales.map((s,i)=>{assert.equal(s.amount,paintingResaleCredits({quality:s.quality}));while(left<i&&sales[left].at<=s.at-1440)left++;const demand=price(s.amount,i-left);alt+=demand;return {...s,demand};});
 for(const b of report.baskets)for(const day of checkpoints){
   const d=row.daily[day-1],food=b.daily[day-1].cost;
   const sold=priced.filter(s=>s.at<d.minutes);assert.equal(sold.length,d.sales);
   const observedArt=sold.reduce((n,s)=>n+s.amount,0),demandArt=sold.reduce((n,s)=>n+s.demand,0);
   assert.equal(observedArt,d.cashByKind['art-sale']||0);
   const observedNet=d.wallet-d.debt-food;
   const materials=20*sold.length;
   report.projections.push({block:row.block.date,policy:row.variant.name,day,mode:b.mode,portions:b.portions,start:row.initial.wallet,actualWallet:d.wallet,debt:d.debt,food,observedArt,demandArt,materials,sales:sold.length,observedNet,materialNet:observedNet-materials,demandNet:observedNet-observedArt+demandArt-materials,afterMilestones:observedNet-observedArt+demandArt-materials-furniture});
 }
}
assert.equal(report.projections.length,2*6*9*3);
writeFileSync(dir+'/economy.json',JSON.stringify(report,null,2)+'\n');
console.log('GC04 procurement, pricing, and projections',report.projections.length);
