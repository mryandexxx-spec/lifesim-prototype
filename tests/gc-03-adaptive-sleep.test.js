import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,loadGame,chooseAction,arrive,tick,ACTIONS} from '../src/simulation.js';
import {newHousehold,loadHousehold,chooseResidentAction,bedDestinationFor,tickHousehold} from '../src/household.js';
import {NEED_DECAY_PER_MINUTE,adaptiveSleepRate,SLEEP_STANDARD_PROFILE,SLEEP_PREMIUM_PROFILE} from '../src/need-balance.js';
const skus=['bed.platform','bed.canopy'];
const id='home-bed-1';
const world=sku=>({furniture:{instances:[{instanceId:id,prefabId:'bed',itemDefinitionId:sku,location:'home'}]}});
const create=(start,sku,automatic=false)=>{
 const s=newGame();s.needs.energy=start;s.autonomy.enabled=false;
 assert.ok(chooseAction(s,'bed',automatic));arrive(s);s.action.targetInstanceId=id;return s;
};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} vs ${b}`);
const full=(s,step)=>{assert.equal(s.action,null);assert.equal(s.event,ACTIONS.bed.label+' — готово');assert.ok(s.needs.energy>=100-NEED_DECAY_PER_MINUTE.energy*step-1e-7);};
for(const start of [0,10,40,70,80,100])for(const step of [1,.3]){
 test(`GC-03 full wake, quality and time: ${start}, ${step}`,()=>{
  const times=[];
  for(const sku of skus){
   const s=create(start,sku);let used=0;
   while(s.action&&used<601){tick(s,step,world(sku));used+=step;}
   full(s,step);assert.ok(used<=(sku===skus[0]?540:450)+step+1e-6);times.push(used);
   const a=create(start,sku),b=create(start,sku);tick(a,600,world(sku));
   for(let i=0;i<600;i++)tick(b,1,world(sku));
   close(a.needs.energy,b.needs.energy);
   if(start===100)close(used,30);
  }
  if(start<100)assert.ok(times[1]<times[0],'premium must save time');
 });
}
test('adaptive floor, severe deficit, legacy expired budget and unknown target',()=>{
 close(adaptiveSleepRate(SLEEP_STANDARD_PROFILE,80,0),.068);
 close(adaptiveSleepRate(SLEEP_PREMIUM_PROFILE,80,0),.095);
 close(adaptiveSleepRate(SLEEP_STANDARD_PROFILE,0,0),100/540);
 for(const sku of skus){
  const s=create(12,sku);s.action.elapsed=999;const restored=loadGame(structuredClone(s));
  assert.equal(restored.action.targetInstanceId,id);tick(restored,1,world(sku));
  assert.ok(restored.action);assert.ok(restored.needs.energy<=12.24+1e-7);
  for(let i=0;i<600&&restored.action;i++)tick(restored,1,world(sku));
  full(restored,1);
 }
 const missing=create(80,skus[1]);tick(missing,1,{});close(missing.needs.energy,80.068);
});
test('real household reload retains installed bed and continues same sleep without extra energy',()=>{
 const h=newHousehold('2026-11-27');h.autonomy.enabled=false;h.otherSim.autonomy.enabled=false;
 h.needs.energy=40;const bed=h.world.furniture.instances.find(x=>x.prefabId==='bed'&&x.location==='home');
 assert.ok(bed);assert.ok(chooseResidentAction(h,'bed',false,'alex',bed.instanceId));
 h.position=bedDestinationFor(h,'alex',bed.instanceId);arrive(h);
 tickHousehold(h,90);
 const restored=loadHousehold(JSON.parse(JSON.stringify(h)));
 assert.equal(restored.version,1);assert.equal(restored.action?.targetInstanceId,bed.instanceId);
 close(restored.needs.energy,h.needs.energy);
 restored.paused=true;tickHousehold(restored,60);close(restored.needs.energy,h.needs.energy);
 restored.paused=false;
 for(let i=0;i<30;i++){tickHousehold(h,.3);tickHousehold(restored,.3);}
 close(restored.needs.energy,h.needs.energy);close(restored.action.elapsed,h.action.elapsed);
});
