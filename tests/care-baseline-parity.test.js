import assert from 'node:assert/strict';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const load=async path=>{
  const mod=name=>import(pathToFileURL(resolve(path,'src',name+'.js')).href);
  const [sim,hh,extra,queue,nav,furniture]=await Promise.all(
    ['simulation','household','resident-activity-runtime','action-queue','navigation','furniture-catalog'].map(mod));
  return {sim,hh,extra,queue,nav,furniture};
};
const clone=x=>JSON.parse(JSON.stringify(x));
export async function collectCareTrace(path){
  const {sim,hh,extra,queue,nav,furniture}=await load(path);
  const traces=[];
  for(const size of [2,4])for(const scenario of ['normal','night','memory','paused','disabled','fifo','occupied','active','cooldown','parked','speed3']){
    let root=hh.newHousehold('2026-11-21');
    if(size===4){
      const ids=['resident_3','resident_4'];
      root.population={schema:1,nextResidentSerial:5,residentsById:{},
        linksByResident:{alex:{familyId:'family_1',dwellingId:'dwelling_1'},
          mira:{familyId:'family_1',dwellingId:'dwelling_1'}},kinship:[]};
      for(const [i,id] of ids.entries()){
        const actor=sim.newGame(),name=i?'Игорь':'Вера';
        actor.personality.name=name;
        actor.position=nav.nearestWalkable({x:i?3.5:-3.2,z:2.6},root.world);
        root.population.residentsById[id]={id,identity:{firstName:name,lastName:'Тестовая',lifeStage:'adult'},actor};
        root.population.linksByResident[id]={familyId:'family_1',dwellingId:'dwelling_1'};
      }
      root=hh.loadHousehold(clone(root));
    }
    const ids=extra.residentIdsForSimulation(root);
    assert.equal(ids.length,size);
    root.minutes=scenario==='night'?1380:800;
    const fridge=furniture.resolveActionFurniture(root.world,'fridge');
    assert.ok(fridge);
    for(const [i,id] of ids.entries()){
      const a=hh.getActor(root,id);
      a.minutes=root.minutes;
      a.autonomy.nextAt=scenario==='cooldown'?root.minutes+10:480;
      Object.assign(a.needs,{hunger:i%2?70:12,energy:scenario==='night'?25:90,
        hygiene:80,bladder:i%2?10:35,fun:80,social:90});
      if(scenario==='memory')a.mind.memories.push({id:'fridge',at:root.minutes-1,fulfilled:true});
      if(scenario==='fifo')queue.enqueueAction(root.actionQueues,id,{type:'object',actionId:'fridge',targetInstanceId:fridge.instanceId});
      if(scenario==='active')a.action={id:'fridge',phase:'walking',elapsed:0,automatic:false,targetInstanceId:fridge.instanceId};
      if(scenario==='parked')assert.ok(queue.parkInterruptedAction(root.actionQueues,id,
        {type:'object',actionId:'fridge',targetInstanceId:fridge.instanceId},'resource-busy',root.minutes));
    }
    if(scenario==='occupied')root.action={id:'fridge',phase:'using',elapsed:0,automatic:false,targetInstanceId:fridge.instanceId};
    root.paused=scenario==='paused';root.autonomy.enabled=scenario!=='disabled';
    root.speed=scenario==='speed3'?3:1;
    const observe=()=>{
      const rows=[];
      for(const id of ids){
        const a=hh.getActor(root,id);
        const before=clone(root);
        const ranking=sim.evaluateAutonomy(a);
        assert.deepEqual(root,before);
        const decision=id==='alex'||id==='mira'?hh.residentAutonomousChoice(root,id):extra.explainAdditionalResidentAutonomy(root,id);
        rows.push({id,ranking,decision,mirrors:{minutes:a.minutes,paused:a.paused,enabled:a.autonomy.enabled}});
      }
      return rows;
    };
    const initial=observe();
    for(const id of ids.slice(2))extra.startAdditionalResidentAutonomy(root,id);
    const admitted=clone(root);
    for(let i=0;i<8;i++)hh.tickHousehold(root,.3);
    const ticked=clone(root);
    root=hh.loadHousehold(clone(root));
    assert.equal(root.version,1);assert.equal(sim.SAVE_KEY,'lifesim.room01.v1');
    traces.push({size,scenario,initial,admitted,ticked,reloaded:clone(root),after:observe()});
  }
  return traces;
}
test('care baseline trace covers two and four residents, and matches frozen base when supplied',async()=>{
  const candidate=await collectCareTrace(process.cwd());
  assert.equal(candidate.length,22);
  if(process.env.CARE_BASELINE_PATH){
    const baseline=await collectCareTrace(process.env.CARE_BASELINE_PATH);
    assert.deepEqual(candidate,baseline);
    console.log('Exact baseline parity: 22 matched care traces');
  }
});
