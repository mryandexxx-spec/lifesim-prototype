import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ACTIONS,arrive} from '../src/simulation.js';
import {newHousehold,loadHousehold,nearestAvailableDiningTable,chooseResidentAction,tickHousehold} from '../src/household.js';
import {newActionQueues,enqueueAction,restoreActionQueues,pendingActions,sanitizeQueueCommand} from '../src/action-queue.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {diningSeatApproach} from '../src/dining.js';

const pair=(id,x)=>[
  {instanceId:'shop-diningtable-'+id,prefabId:'diningtable',itemDefinitionId:'diningtable.farm',
    x,z:0,yaw:0,location:'home'},
  {instanceId:'shop-chair-'+id,prefabId:'chair',itemDefinitionId:'chair.loft',
    x,z:2.25,yaw:0,location:'home'}
];
function home(){
  const h=newHousehold();h.autonomy.enabled=false;h.otherSim.autonomy.enabled=false;
  h.world.furniture.instances.push(...pair('901',8),...pair('902',11));
  return h;
}
test('F4F.2: quick snack restores much less hunger than the unchanged table meal',()=>{
  assert.equal(ACTIONS.fridge.label,'Быстро перекусить');
  assert.equal(ACTIONS.dining.label,'Пообедать за столом');
  assert.equal(ACTIONS.dining.benefitPerMinute,1.00);
  const quick=ACTIONS.fridge.duration*ACTIONS.fridge.benefitPerMinute;
  const full=ACTIONS.dining.duration*ACTIONS.dining.benefitPerMinute;
  assert.ok(quick>0&&quick<full*.65);
  const h=newHousehold();h.needs.hunger=10;h.autonomy.enabled=false;
  assert.ok(chooseResidentAction(h,'fridge',false,'alex'));
  arrive(h);const before=h.needs.hunger;
  tickHousehold(h,ACTIONS.fridge.duration);
  assert.ok(h.needs.hunger>before&&h.needs.hunger<before+quick+1);
});
test('F4F.2: refrigerator meal selects nearest valid table, skipping missing chairs',()=>{
  const h=home();h.position={x:10.8,z:2.6};
  assert.equal(nearestAvailableDiningTable(h,'alex')?.instanceId,'shop-diningtable-902');
  h.position={x:7.8,z:2.6};
  assert.equal(nearestAvailableDiningTable(h,'alex')?.instanceId,'shop-diningtable-901');
  h.world.furniture.instances.find(x=>x.instanceId==='shop-chair-901').location='storage';
  assert.equal(nearestAvailableDiningTable(h,'alex')?.instanceId,'shop-diningtable-902');
  h.world.furniture.instances.find(x=>x.instanceId==='shop-chair-902').location='storage';
  assert.equal(nearestAvailableDiningTable(h,'alex'),null);
});
test('F4F.2: queue persists auto-table intent and begins standard saved dining action',()=>{
  const request={type:'object',actionId:'dining',autoTable:true};
  assert.deepEqual(sanitizeQueueCommand('alex',request,['alex','mira']),request);
  assert.equal(sanitizeQueueCommand('alex',{...request,actionId:'fridge'},['alex','mira']),null);
  assert.equal(sanitizeQueueCommand('alex',{...request,targetInstanceId:'shop-diningtable-901'},['alex','mira']),null);
  const q=newActionQueues(['alex','mira']);
  assert.ok(enqueueAction(q,'alex',request));
  const restored=restoreActionQueues(structuredClone(q),['alex','mira']);
  assert.equal(pendingActions(restored,'alex')[0].autoTable,true);
  const h=home();h.actionQueues=restored;h.position={x:11,z:2.7};
  const chosen=nearestAvailableDiningTable(h,'alex');
  assert.equal(chosen.instanceId,'shop-diningtable-902');
  assert.ok(chooseResidentAction(h,'dining',false,'alex',chosen.instanceId));
  assert.equal(h.action.diningStage,'toFridge');
  h.position={...furnitureActionApproach(h.world,'fridge')};
  arrive(h);h.action.diningStage='taking';tickHousehold(h,6);
  assert.equal(h.action.diningStage,'toSeat');
  h.position={...diningSeatApproach(h.world,h.action.targetInstanceId,h.action.diningSeatInstanceId)};
  arrive(h);h.action.diningStage='eating';tickHousehold(h,2);
  assert.equal(loadHousehold(structuredClone(h)).action?.targetInstanceId,chosen.instanceId);
});
test('F4F.2: Safari refrigerator sheet exposes both options and delayed routing',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  assert.match(html,/id="fridge-lunch-button" hidden/);
  assert.match(game,/fridge-lunch-button'\)\.hidden=id!=='fridge'/);
  assert.match(game,/fridge-prepared-select/);
  assert.match(game,/scheduleCommand\(\{type:'object',actionId:'dining',autoTable:true,recipeId\}\)/);
  assert.match(game,/nearestAvailableDiningTable\(game,residentId\)/);
  assert.match(html,/F4F\.2/);
});
