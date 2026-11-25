import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {CAREER_SPECIALIZATIONS} from '../src/career-specializations.js';
import {WORK_INCIDENT_CATALOG,selectWorkScenario,incidentOutcome,workScenario,restoreWorkIncident,advanceWorkIncident,decideWorkIncident} from '../src/career-incidents.js';
const tiers=['ordinary','unusual','rare'];
const eligible=(s,rank,track)=>rank>=(s.minRank??0)&&rank<=(s.maxRank??7)&&(!s.trackId||s.trackId===track);
test('PF09B 90 scenes, 48 new, unique IDs and non-dominated bounded options',()=>{
 const ids=new Set(),titles=new Set(),choices=new Set();let total=0;
 for(const [career,bank] of Object.entries(WORK_INCIDENT_CATALOG)){
  assert.equal(bank.length,15);const fresh=bank.filter(s=>s.id.startsWith('pf09b-'));assert.equal(fresh.length,8);
  for(const s of fresh){
   assert.ok(!ids.has(s.id)&&!titles.has(s.title));ids.add(s.id);titles.add(s.title);
   assert.ok(tiers.includes(s.rarity)&&s.minRank>=0&&s.maxRank<=7&&s.minRank<=s.maxRank);
   if(s.trackId)assert.ok(CAREER_SPECIALIZATIONS[career].some(t=>t.id===s.trackId));
   assert.equal(s.options.length,3);assert.equal(new Set(s.options.map(o=>o.text)).size,3);
   for(const o of s.options){assert.ok(!choices.has(o.id));choices.add(o.id);assert.ok(o.feedback.length>10&&o.text.length>8);assert.ok(o.performance>=-5&&o.performance<=6&&o.energy>=-20&&o.energy<=5&&o.fun>=-10&&o.fun<=10);assert.ok(['organization','empathy','practicality','resilience','creativity','coordination'].includes(o.axis));}
   for(const a of s.options)for(const b of s.options)if(a!==b)assert.ok(!(a.performance>=b.performance&&a.energy>=b.energy&&a.fun>=b.fun&&(a.performance>b.performance||a.energy>b.energy||a.fun>b.fun)),s.id+' dominated choice');
  }
  total+=bank.length;
 }
 assert.equal(total,90);assert.equal(ids.size,48);
});
test('PF09B deterministic 12k+ selection simulations, all ranks and tracks',()=>{
 let n=0;const seen=new Set(),counts={none:0,ordinary:0,unusual:0,rare:0};
 for(const [career,bank] of Object.entries(WORK_INCIDENT_CATALOG)){
  const root=newHousehold('2026-11-16');root.careerSystem=hireCareer(root.careerSystem,'alex',career,480);
  const c=root.careerSystem.byResident.alex;c.workedShifts=20;
  for(let rank=0;rank<=7;rank++)for(const track of (rank>=4?CAREER_SPECIALIZATIONS[career].map(t=>t.id):[null])){
   c.level=rank;c.specialization=track?{id:track,focusReceiptId:'existing'}:null;
   const pool=bank.filter(s=>eligible(s,rank,track));
   for(const rarity of tiers)assert.ok(pool.some(s=>(s.rarity??'ordinary')===rarity),career+' '+rank+' '+track+' '+rarity);
   const history=root.careerSystem.incidentHistory.alex;history.length=0;
   for(let i=0;i<250;i++){
    const shift={id:'e1@'+i+'@'+(540+i*1440),careerId:career,start:540+i*1440,end:1020+i*1440};
    const rarity=incidentOutcome(shift.id,'alex');counts[rarity]++;n++;if(rarity==='none')continue;
    const plan={rarity,proofScenes:[]},id=selectWorkScenario(root,'alex',shift,plan),scene=workScenario(career,id);
    assert.ok(pool.includes(scene));assert.equal(scene.rarity??'ordinary',rarity);
    assert.equal(selectWorkScenario(root,'alex',shift,plan),id);
    if(pool.filter(s=>(s.rarity??'ordinary')===rarity).length>1)assert.notEqual(history.at(-1)?.scenarioId,id);
    seen.add(career+':'+id);history.push({careerId:career,scenarioId:id});if(history.length>12)history.shift();
   }
  }
 }
 assert.ok(n>=12000);for(const [career,bank] of Object.entries(WORK_INCIDENT_CATALOG))for(const s of bank.filter(s=>s.id.startsWith('pf09b-')))assert.ok(seen.has(career+':'+s.id),'unseen '+s.id);
 console.log('PF09B simulations',n,counts,'distinct scenes',seen.size);
});
test('PF09B all 144 new choices restore exact scene and reject invalid IDs',()=>{
 for(const [career,bank] of Object.entries(WORK_INCIDENT_CATALOG))for(const scene of bank.filter(s=>s.id.startsWith('pf09b-')))for(const option of scene.options){
  const shift={id:'e1@0@540',careerId:career,start:540,end:1020};
  const raw={id:shift.id+'#work',scenarioId:scene.id,createdAt:750,choiceId:option.id,resolvedAt:751,performanceDelta:option.performance,energyDelta:option.energy,funDelta:option.fun};
  assert.equal(restoreWorkIncident(shift,raw)?.choiceId,option.id);
  assert.equal(restoreWorkIncident(shift,{...raw,choiceId:'invalid'}),null);
 }
});
