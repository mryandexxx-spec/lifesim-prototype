import test from 'node:test';
import assert from 'node:assert/strict';
import {createObjectRegistry} from '../src/object-definition-registry.js';
import {newHousehold,tickHousehold} from '../src/household.js';
import {legacyObjectRegistry} from '../src/object-legacy-adapter.js';
import {captureObjectUse,settleObjectUseStep} from '../src/object-use-runtime.js';
import {ACTIONS} from '../src/simulation.js';

function scenario(){
  const root=newHousehold();
  const sofa=root.world.furniture.instances.find(x=>x.prefabId==='sofa');
  root.action={id:'sofa',phase:'using',elapsed:0,automatic:false,targetInstanceId:sofa.instanceId};
  root.otherSim.action=null;
  root.autonomy.enabled=false;
  return {root,sofa};
}
function synthetic(){
  return createObjectRegistry({
    stats:[{id:'needs.hygiene',min:0,max:100},{id:'needs.fun',min:0,max:100}],
    triggers:[{id:'item.use.tick'},{id:'item.use.complete'}],
    items:[{id:'test.sofa',prefabId:'sofa',name:'Test sofa',effects:[
      {id:'secondary',trigger:'item.use.tick',statId:'needs.hygiene',actionId:'sofa',mode:'perMinute',amount:2},
      {id:'forbidden-double',trigger:'item.use.tick',statId:'needs.fun',actionId:'sofa',mode:'perMinute',amount:90},
      {id:'completion',trigger:'item.use.complete',statId:'needs.hygiene',actionId:'sofa',mode:'once',amount:4}
    ]}]
  });
}
test('F4b3: legacy registry does not award a second need bonus',()=>{
  const {root}=scenario();
  const before=root.needs.fun;
  tickHousehold(root,1);
  assert.ok(root.needs.fun>before);
  assert.deepEqual(legacyObjectRegistry().items['legacy.sofa'].effects,[]);
});
test('F4b3: verified active time yields only secondary metrics and never base-action duplicates',()=>{
  const {root,sofa}=scenario();sofa.itemDefinitionId='test.sofa';
  const before=captureObjectUse(root);
  const hygiene=root.needs.hygiene,fun=root.needs.fun;
  root.minutes+=2;root.action.elapsed+=2;
  const rows=settleObjectUseStep({registry:synthetic(),world:root.world,actor:root,before});
  assert.equal(rows.length,1);assert.equal(rows[0].statId,'needs.hygiene');
  assert.equal(root.needs.hygiene,hygiene+4);
  assert.equal(root.needs.fun,fun);
  assert.deepEqual(settleObjectUseStep({registry:synthetic(),world:root.world,actor:root,before:null}),[]);
});
test('F4b3: walking, paused, warehouse, wrong target and cancel are not receipts',()=>{
  const {root,sofa}=scenario();sofa.itemDefinitionId='test.sofa';
  root.action.phase='walking';assert.equal(captureObjectUse(root),null);
  root.action.phase='using';root.paused=true;assert.equal(captureObjectUse(root),null);
  root.paused=false;
  const before=captureObjectUse(root);
  root.minutes+=1;root.action.elapsed+=1;
  sofa.location='storage';
  assert.deepEqual(settleObjectUseStep({registry:synthetic(),world:root.world,actor:root,before}),[]);
  sofa.location='home';root.action.targetInstanceId='home-tv-1';
  assert.deepEqual(settleObjectUseStep({registry:synthetic(),world:root.world,actor:root,before}),[]);
  root.action=null;root.event='Прервано';
  assert.deepEqual(settleObjectUseStep({registry:synthetic(),world:root.world,actor:root,before}),[]);
});
test('F4b3: completion receipt only for canonically completed action',()=>{
  const {root,sofa}=scenario();sofa.itemDefinitionId='test.sofa';
  root.action.elapsed=ACTIONS.sofa.duration-1;
  const before=captureObjectUse(root),hygiene=root.needs.hygiene;
  root.minutes+=1;root.action=null;root.event=ACTIONS.sofa.label+' — готово';
  const rows=settleObjectUseStep({registry:synthetic(),world:root.world,actor:root,before});
  assert.equal(rows.length,1);
  assert.equal(root.needs.hygiene,hygiene+6);
});
test('F4b3: both residents use real existing shop objects without changing root v1 schema',()=>{
  const root=newHousehold(),original=JSON.stringify(root.world.furniture.instances);
  root.action={id:'sofa',phase:'using',elapsed:0,automatic:false,targetInstanceId:'home-sofa-1'};
  root.otherSim.action={id:'bed',phase:'using',elapsed:0,automatic:false,targetInstanceId:'home-bed-1'};
  tickHousehold(root,1);
  assert.equal(root.version,1);assert.equal(root.otherSim.version,1);
  assert.equal(JSON.stringify(root.world.furniture.instances),original);
  assert.ok(root.action.elapsed>0);
  assert.ok(root.otherSim.action.elapsed>0);
});
