import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {gardenApproach,gardenRequestStillValid,settleGardenAction,GARDEN_DURATION} from '../src/gardening.js';
import {gardenActionSheet} from '../src/garden-presentation.js';
import {enqueueAction,pendingActions} from '../src/action-queue.js';
import {labelQueuedTask} from '../src/qsk-11-task-labels.js';
import {NEED_DECAY_PER_MINUTE} from '../src/need-balance.js';
import {socialNeedDecayRate} from '../src/social-need.js';

const types=['garden.herb.mint','garden.herb.melissa','garden.flower.calendula','garden.flower.cornflower'];
function fixture(itemId){
  let root=newHousehold('2026-11-20');
  root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
  const proposal=previewOutdoorFeatureEdit(root,{operation:'place',itemId,pose:{x:8,z:-7,yaw:0}});
  assert.equal(proposal.ok,true,proposal.reason);
  const result=commitOutdoorFeatureEdit(root,proposal);
  assert.equal(result.ok,true,result.reason);
  root=result.root;
  return {root,id:root.world.outdoors.features.find(x=>x.itemId===itemId).instanceId};
}
const actor=(root,id)=>id==='mira'?root.otherSim:root;
function start(root,id,resident,actionId,elapsed=0){
  const a=actor(root,resident),plan=gardenApproach(root.world,id,a.position);
  assert.ok(plan);
  a.position={...plan.goal};
  a.action={id:'garden',phase:'using',automatic:false,elapsed,targetInstanceId:id,
    gardenActionId:actionId,gardenPlantedAt:root.world.outdoors.gardens[id].plantedAt,gardenGoal:{...plan.goal}};
}
for(const item of types)for(const resident of ['alex','mira']){
  test('PF14 water net leisure and energy cost '+item+' '+resident,()=>{
    const {root,id}=fixture(item),a=actor(root,resident);
    a.needs.fun=50;a.needs.energy=60;
    start(root,id,resident,'water');
    tickHousehold(root,15);
    assert.ok(Math.abs(a.needs.fun-(50+3-15*NEED_DECAY_PER_MINUTE.fun))<1e-6);
    assert.ok(Math.abs(a.needs.energy-(60-2-15*NEED_DECAY_PER_MINUTE.energy))<1e-6);
    assert.equal(gardenRequestStillValid(root,resident,id,'water'),false);
    assert.equal(settleGardenAction(root,resident,id,'water'),false);
  });
  test('PF14 talk completion/reload and unlimited admission '+item+' '+resident,()=>{
    let {root,id}=fixture(item),a=actor(root,resident);
    a.needs.social=30;
    const rate=socialNeedDecayRate(a.personality);
    assert.ok(gardenActionSheet(root,resident,id).actions.some(x=>x.actionId==='talk'&&x.available));
    start(root,id,resident,'talk');
    tickHousehold(root,6);
    assert.ok(Math.abs(a.needs.social-(30-6*rate))<1e-6);
    root=loadHousehold(structuredClone(root));a=actor(root,resident);
    assert.equal(a.action?.gardenActionId,'talk');
    tickHousehold(root,6);
    assert.ok(Math.abs(a.needs.social-(34-12*rate))<1e-6);
    assert.equal(a.action,null);
    assert.equal(gardenRequestStillValid(root,resident,id,'talk'),true);
    root=loadHousehold(structuredClone(root));
    assert.equal(settleGardenAction(root,resident,id,'talk'),false);
    assert.equal(gardenRequestStillValid(root,resident==='mira'?'alex':'mira',id,'talk'),true);
    assert.equal(labelQueuedTask(root,{type:'garden',instanceId:id,actionId:'talk'}),'Поговорить с растением');
  });
}
test('PF14 cancelled talk grants nothing; no graph or wallet changes from plant talk',()=>{
  const {root,id}=fixture(types[0]);
  root.needs.social=50;
  const rate=socialNeedDecayRate(root.personality);
  start(root,id,'alex','talk');
  tickHousehold(root,5);root.action=null;tickHousehold(root,7);
  assert.ok(Math.abs(root.needs.social-(50-12*rate))<1e-6);
  const graph=structuredClone(root.socialGraph),wallet=root.shop.credits;
  assert.equal(settleGardenAction(root,'alex',id,'talk'),true);
  assert.deepEqual(root.socialGraph,graph);
  assert.equal(root.shop.credits,wallet);
  assert.equal(gardenRequestStillValid(root,'alex',id,'talk'),true);
  assert.equal(settleGardenAction(root,'alex',id,'talk'),false,'same-minute duplicate settlement');
  root.minutes+=12;
  assert.equal(gardenRequestStillValid(root,'alex',id,'talk'),true);
});
test('PF14 talk works at maturity; invalid resident cannot credit Alex',()=>{
  const {root,id}=fixture(types[1]);
  const record=root.world.outdoors.gardens[id];
  record.progressWetMinutes=4320;
  assert.equal(gardenRequestStillValid(root,'alex',id,'talk'),true);
  assert.equal(settleGardenAction(root,'unknown',id,'talk'),false);
  assert.equal(GARDEN_DURATION.talk,12);
});

test('PF14 persisted FIFO intent across plots and competing reservation',()=>{
 let {root,id}=fixture(types[0]);
 const proposal=previewOutdoorFeatureEdit(root,{operation:'place',itemId:types[2],pose:{x:10,z:-7,yaw:0}});
 assert.equal(proposal.ok,true,proposal.reason);
 root=commitOutdoorFeatureEdit(root,proposal).root;
 const second=root.world.outdoors.features.find(x=>x.itemId===types[2]).instanceId;
 const cmd={type:'garden',instanceId:id,actionId:'talk'};
 assert.ok(enqueueAction(root.actionQueues,'alex',cmd));
 assert.equal(gardenActionSheet(root,'mira',id).actions.find(a=>a.actionId==='talk').available,false);
 root=loadHousehold(structuredClone(root));
 assert.equal(pendingActions(root.actionQueues,'alex')[0].actionId,'talk');
 assert.ok(enqueueAction(root.actionQueues,'alex',{...cmd,instanceId:second}));
 start(root,id,'alex','talk');tickHousehold(root,12);
 assert.equal(gardenRequestStillValid(root,'alex',second,'talk'),true);
 assert.equal(gardenRequestStillValid(root,'mira',second,'talk'),true);
 root=loadHousehold(structuredClone(root));
 assert.equal(pendingActions(root.actionQueues,'alex').filter(x=>x.actionId==='talk').length,2);
});

for(const resident of ['alex','mira'])test('LIFE-QOL: repeated plant talk cap and no loss above cap '+resident,()=>{
 let {root,id}=fixture(types[2]);
 let a=actor(root,resident);a.needs.social=15;
 const graph=structuredClone(root.socialGraph),skills=structuredClone(a.skills);
 for(let i=0;i<30;i++){
   assert.equal(gardenRequestStillValid(root,resident,id,'talk'),true);
   start(root,id,resident,'talk');tickHousehold(root,12);
   assert.ok(a.needs.social<=45+1e-8);
   if(i===5){root=loadHousehold(structuredClone(root));a=actor(root,resident);}
 }
 assert.ok(a.needs.social>43&&a.needs.social<=45);
 a.needs.social=80;const rate=socialNeedDecayRate(a.personality);
 start(root,id,resident,'talk');tickHousehold(root,12);
 assert.ok(Math.abs(a.needs.social-(80-12*rate))<1e-6);
 assert.deepEqual(root.socialGraph,graph);assert.deepEqual(a.skills,skills);
});
