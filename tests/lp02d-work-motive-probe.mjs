/** LP-02D1 diagnostic only. Never imported by production. Compare canonical C
 * neutral score, bounded authored candidate factor, actual native receipts.
 * Existing explicit work options only. Not a second game selector. */
import assert from 'node:assert/strict';
import {deriveAxes,createProfile} from '../src/trait-catalog.js';
import {currentSkillLevel} from '../src/skills-engine.js';
import {HOBBY_SKILLS} from '../src/hobby-reading.js';
import {chooseAutonomousWorkOption,pendingWorkIncident,workScenario,decideWorkIncident} from '../src/career-incidents.js';
import {getActor,loadHousehold} from '../src/household.js';

// Pairs selected from actual authored wording, not generated from axis rotation.
// Patient: thorough check/analysis vs explicit shorter path still legitimate.
// Novelty: trial / novel solution vs established or explicitly checked method.
// A missing label means no proposed factor, not a generic preference.
const pace={
 'editorial/editorial-source':['rights','replace'],
 'business-center/business-handoff':['rebuild','contact'],
 'kitchen-studio/kitchen-supply':['inventory','substitute'],
 'editorial/pf09b-editorial-correction':['a','b'],
 'editorial/pf09b-editorial-voices':['a','b'],
 'editorial/pf09b-editorial-embargo':['a','b'],
 'business-center/pf09b-business-center-version':['a','b'],
 'city-services/pf09b-city-services-locker':['a','b'],
 'kitchen-studio/pf09b-kitchen-studio-guest':['a','b'],
 'art-studio/pf09b-art-studio-packing':['a','b'],
 'civic-service/pf09b-civic-service-language':['a','b']
};
const novelty={
 'city-services/city-route':['test','wait'],
 'kitchen-studio/kitchen-special':['invent','classic'],
 'editorial/pf09b-editorial-embargo':[null,'b'],
 'business-center/pf09b-business-center-version':[null,'b'],
 'city-services/pf09b-city-services-letter':[null,'c'],
 'business-center/business-idea':['pilot',null],
 'city-services/pf09b-city-services-partner':['b',null],
 'kitchen-studio/pf09b-kitchen-studio-fruit':['a',null],
 'kitchen-studio/pf09b-kitchen-studio-texture':['a',null],
 'art-studio/pf09b-art-studio-paper':['a',null],
 'art-studio/pf09b-art-studio-restudy':['b',null],
 'business-center/pf09b-business-center-partner':['a',null],
 'business-center/pf09b-business-center-feedback':['b',null],
 'business-center/pf09b-business-center-workshop':['b',null],
 'civic-service/pf09b-civic-service-seeds':['b',null],
 'civic-service/pf09b-civic-service-outreach':['b',null],
 'civic-service/pf09b-civic-service-garden':['b',null],
 'editorial/pf09b-editorial-access':['a',null],
 'editorial/pf09b-editorial-rotation':['b',null]
};
const motives=['novelty.curious','novelty.familiar','motivation.ambitious','motivation.balanced','pace.patient','pace.impatient'];
const clamp=n=>Math.max(0,Math.min(100,Number.isFinite(n)?n:50));
const copy=x=>JSON.parse(JSON.stringify(x));
export function candidateWorkAudit(root,id,anchors){
 const actor=getActor(root,id),c=root.careerSystem.byResident[id],incident=pendingWorkIncident(root,id);
 assert.ok(incident);const def=workScenario(c.careerId,incident.scenarioId),key=c.careerId+'/'+def.id;
 const axes=deriveAxes(actor.personality),energy=clamp(actor.needs.energy),mood=clamp(actor.mind.mood.value);
 const history=root.careerSystem.incidentHistory[id]||[];
 const gate=energy>=45&&mood>=45&&['hunger','bladder','hygiene'].every(k=>actor.needs[k]>=25);
 const known=new Set(history.filter(h=>h.careerId===c.careerId&&h.scenarioId===def.id&&h.performanceDelta>0).map(h=>h.choiceId));
 const optionId=x=>x&&def.id.startsWith('pf09b-')?def.id+'-'+x:x;
 const pair=(table)=>(table[key]||[null,null]).map(optionId);
 const [deep,short]=pair(pace),[novel,standard]=pair(novelty);
 for(const x of [deep,short,novel,standard])if(x)assert.ok(def.options.some(o=>o.id===x),key+' '+x);
 const successful=def.options.filter(o=>o.performance>0).sort((a,b)=>b.performance-a.performance||a.id.localeCompare(b.id));
 const high=successful[0],low=successful.slice(1).find(o=>o.energy>high.energy&&o.performance<high.performance);
 const score=o=>o.performance*.45+o.energy*(energy<45?.75:.22)+o.fun*(mood<45?.38:.2)+(axes[o.axis]-.5)*16+
    Math.min(3,o.skill?currentSkillLevel(actor.skills,HOBBY_SKILLS,o.skill):0)*1.1-history.slice(-3).filter(h=>h.choiceId===o.id).length*.65;
 const rank=bias=>[...def.options].sort((a,b)=>score(b)+bias(b)-score(a)-bias(a)||a.id.localeCompare(b.id));
 const native=chooseAutonomousWorkOption(root,id),neutral=rank(()=>0)[0].id;
 assert.equal(neutral,native,'neutral C native parity');
 // Successful options only: do not equate delaying a task with patience,
 // or an adverse outcome with a desirable work-life balance.
 const targetFor=trait=>{
   if(!gate)return [];
   if(trait==='motivation.ambitious')return energy>=65&&c.performance<85&&low?[high.id]:[];
   if(trait==='motivation.balanced')return energy<=70&&low?[low.id]:[];
   if(trait==='pace.patient')return deep?[deep]:[];
   if(trait==='pace.impatient')return short?[short]:[];
   if(energy<55)return [];
   if(trait==='novelty.curious'){
     if(novel&&!known.has(novel))return [novel];
     if(known.size)return successful.filter(o=>!known.has(o.id)).map(o=>o.id);
   }
   if(trait==='novelty.familiar')return [...known].filter(x=>successful.some(o=>o.id===x)).concat(standard&&successful.some(o=>o.id===standard)?[standard]:[]);
   return [];
 };
 const cases={};
 for(const trait of motives){
   const targets=targetFor(trait).filter(x=>def.options.some(o=>o.id===x&&o.performance>0));
   const order=rank(o=>targets.includes(o.id)?3:0);
   const choice=order[0].id,baseScore=score(def.options.find(o=>o.id===native));
   cases[trait]={targets:[...new Set(targets)],choice,changed:choice!==native,
      margin:Math.round((baseScore-score(order[0]))*100)/100};
   if(choice===native)continue;
   // Same detached authentic pending session; real canonical resolver, not
   // pretend settlement in the natural live schedule. No new reward path.
   const results=[];
   for(const option of [native,choice]){
     const snapshot=copy(root),a=getActor(snapshot,id);
     a.personality=createProfile([...anchors,trait]);
     const wallet=snapshot.shop.credits,receipts=snapshot.careerSystem.incidentIds.length;
     const receipt=decideWorkIncident(snapshot,id,option,{automatic:true});
     assert.ok(receipt.ok);assert.equal(receipt.option.id,option);
     assert.equal(snapshot.shop.credits,wallet);assert.equal(snapshot.careerSystem.incidentIds.length,receipts+1);
     assert.equal(decideWorkIncident(snapshot,id,option,{automatic:true}).ok,false);
     const restored=loadHousehold(copy(snapshot));
     assert.deepEqual(restored.careerSystem.incidentHistory[id],snapshot.careerSystem.incidentHistory[id]);
     assert.deepEqual(getActor(restored,id).personality,a.personality);
     results.push({option,performance:receipt.incident.performanceDelta,energy:receipt.incident.energyDelta,fun:receipt.incident.funDelta});
   }
   cases[trait].receipts=results;
 }
 return {scene:key,gate,native,scores:def.options.map(o=>({id:o.id,score:Math.round(score(o)*100)/100,performance:o.performance,energy:o.energy})),known:[...known],cases};
}
