import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {newGame,loadGame,chooseAction,arrive,tick} from '../src/simulation.js';
const mode=process.env.GC_ARM;
const starts=[0,10,40,70,80,100],products=['bed.platform','bed.canopy'];
const worldFor=sku=>({furniture:{instances:[{instanceId:'sleep-bed-1',prefabId:'bed',itemDefinitionId:sku,location:'home'}]}});
const create=(start,sku)=>{const s=newGame();s.needs.energy=start;s.autonomy.enabled=false;assert.ok(chooseAction(s,'bed',false));arrive(s);s.action.targetInstanceId='sleep-bed-1';return s;};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} vs ${b}`);
const rows=[];
for(const start of starts)for(const sku of products){
 const world=worldFor(sku);
 for(const step of [1,.3]){
  let s=create(start,sku),used=0;
  while(s.action&&used<600){tick(s,step,world);used+=step;}
  assert.equal(s.action,null);
  rows.push({start,sku,step,used,energy:s.needs.energy,full:s.needs.energy>=99.9});
 }
 const a=create(start,sku),b=create(start,sku);tick(a,600,world);
 for(let i=0;i<600;i++)tick(b,1,world);
 close(a.needs.energy,b.needs.energy);
 const c=create(start,sku);tick(c,15,world);const restored=loadGame(structuredClone(c));assert.equal(restored.action?.id,'bed');restored.action.targetInstanceId='sleep-bed-1';
 restored.paused=true;tick(restored,120,world);close(restored.needs.energy,c.needs.energy);
 restored.paused=false;tick(restored,10,world);tick(c,10,world);close(restored.needs.energy,c.needs.energy);
}
const idle=newGame();for(const k of Object.keys(idle.needs))idle.needs[k]=90;tick(idle,450);assert.ok(idle.needs.energy>=75);
if(mode==='B-constant')assert.ok(rows.some(x=>!x.full),'negative control not detected');
else{
 assert.ok(rows.every(x=>x.full),'full-wake regression');
 for(const start of starts.filter(x=>x<100))for(const step of [1,.3]){const a=rows.find(x=>x.start===start&&x.step===step&&x.sku===products[0]);const b=rows.find(x=>x.start===start&&x.step===step&&x.sku===products[1]);assert.ok(b.used<a.used,'premium no faster');}
}
mkdirSync('artifacts/gc-03-r2',{recursive:true});writeFileSync('artifacts/gc-03-r2/sleep-fixture.json',JSON.stringify({mode,rows,chunkPauseReload:'PASS',idle:'PASS'},null,2));
