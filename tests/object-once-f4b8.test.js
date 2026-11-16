import test from 'node:test';
import assert from 'node:assert/strict';
import {createObjectRegistry} from '../src/object-definition-registry.js';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {ACTIONS} from '../src/simulation.js';
import {captureObjectUse,settleObjectUseStep} from '../src/object-use-runtime.js';
import {newObjectOnceLedger,restoreObjectOnceLedger,stageObjectOnceEffects,
  OBJECT_ONCE_LEDGER_LIMIT} from '../src/object-once-ledger.js';
import {readFileSync} from 'node:fs';

const receipt=(eventId,instanceId='home-sofa-1',effectId='once')=>({
  instanceId,itemId:'test.sofa',effectId,eventId,statId:'needs.hygiene',
  group:'hygiene',stacking:'sum',delta:5
});
function registry(){
  return createObjectRegistry({stats:[
    {id:'needs.hygiene',min:0,max:100},{id:'needs.fun',min:0,max:100}
  ],triggers:[{id:'item.use.tick'},{id:'item.use.complete'}],
  items:[{id:'sofa.comfort',prefabId:'sofa',name:'Synthetic test sofa',effects:[
    {id:'once',trigger:'item.use.complete',mode:'once',actionId:'sofa',
      statId:'needs.hygiene',amount:5},
    {id:'tick',trigger:'item.use.tick',mode:'perMinute',actionId:'sofa',
      statId:'needs.hygiene',amount:1}
  ]}]});
}
function completed(actor,sofa){
  sofa.itemDefinitionId='sofa.comfort';
  actor.action={id:'sofa',phase:'using',elapsed:ACTIONS.sofa.duration-1,
    automatic:false,targetInstanceId:sofa.instanceId};
  actor.needs.hygiene=40;
  const before=captureObjectUse(actor);
  actor.minutes+=1;
  actor.action=null;
  actor.event=ACTIONS.sofa.label+' — готово';
  return before;
}
test('F4b8: old root v1 and both residents migrate with empty independent ledgers',()=>{
  const raw=JSON.parse(JSON.stringify(newHousehold()));
  delete raw.objectOnceLedger;delete raw.otherSim.objectOnceLedger;
  const result=loadHousehold(raw);
  assert.deepEqual(result.objectOnceLedger,newObjectOnceLedger());
  assert.deepEqual(result.otherSim.objectOnceLedger,newObjectOnceLedger());
  assert.equal(result.version,1);
});
test('F4b8: canonical completion awards once, never on duplicated settlement, and survives v1 reload',()=>{
  const h=newHousehold(),sofa=h.world.furniture.instances.find(x=>x.prefabId==='sofa');
  const before=completed(h,sofa),initial=h.needs.hygiene;
  const result=settleObjectUseStep({registry:registry(),world:h.world,actor:h,before});
  assert.equal(result.length,1);
  assert.equal(h.needs.hygiene,initial+6);
  assert.equal(h.objectOnceLedger.entries.length,1);
  assert.deepEqual(settleObjectUseStep({registry:registry(),world:h.world,actor:h,before}),[
    {statId:'needs.hygiene',delta:1,next:initial+7}
  ],'the per-minute rate remains independent of the spent once receipt');
  assert.equal(h.objectOnceLedger.entries.length,1);
  const restored=loadHousehold(JSON.parse(JSON.stringify(h)));
  assert.equal(restored.objectOnceLedger.entries.length,1);
  restored.minutes=h.minutes;restored.event=ACTIONS.sofa.label+' — готово';
  const replay=settleObjectUseStep({registry:registry(),world:restored.world,actor:restored,before});
  assert.equal(replay.length,1);
  assert.equal(replay[0].delta,1,'only time rate remains; once component is not replayed');
  assert.equal(restored.objectOnceLedger.entries.length,1);
});
test('F4b8: no once award on pause, canceled action, walking, storage or invalid target',()=>{
  const h=newHousehold(),sofa=h.world.furniture.instances.find(x=>x.prefabId==='sofa');
  const before=completed(h,sofa);const ctx={registry:registry(),world:h.world,actor:h,before};
  h.paused=true;
  assert.deepEqual(settleObjectUseStep(ctx),[]);
  h.paused=false;h.event='Отменено';
  assert.deepEqual(settleObjectUseStep(ctx),[]);
  sofa.location='storage';h.event=ACTIONS.sofa.label+' — готово';
  assert.deepEqual(settleObjectUseStep(ctx),[]);
  assert.equal(h.objectOnceLedger.entries.length,0);
});
test('F4b8: same receipt is idempotent, different events/items/effects and residents distinct',()=>{
  const zero=newObjectOnceLedger(),a=receipt('abc|def'),b=receipt('abc','def|ghi');
  const first=stageObjectOnceEffects(zero,[a,a,b]);
  assert.equal(first.contributions.length,2);
  assert.equal(first.ledger.entries.length,2);
  assert.equal(stageObjectOnceEffects(first.ledger,[a]).contributions.length,0);
  assert.equal(stageObjectOnceEffects(first.ledger,[receipt('new')]).contributions.length,1);
  assert.equal(stageObjectOnceEffects(zero,[a]).contributions.length,1,
    'independent resident can earn the same event for their own use');
  assert.equal(stageObjectOnceEffects(first.ledger,[{...a,effectId:'different'}]).contributions.length,1);
  assert.equal(stageObjectOnceEffects(first.ledger,[{...a,itemId:'different.sku'}]).contributions.length,1);
});
test('F4b8: malformed ledger fails closed; valid per-minute effects can still work',()=>{
  for(const input of [null,{},[],{schema:1,blocked:false,entries:[{eventId:'x'}]},
    {schema:1,blocked:true,entries:[]},
    {schema:1,blocked:false,entries:[receipt('x'),receipt('x')]}]){
    const ledger=restoreObjectOnceLedger(input);
    assert.equal(ledger.blocked,true);
    assert.equal(stageObjectOnceEffects(ledger,[receipt('fresh')]).contributions.length,0);
    assert.equal(stageObjectOnceEffects(ledger,[{...receipt('rate'),eventId:null}]).contributions.length,1);
  }
});
test('F4b8: at ledger cap fail closed to new once receipts; never evict paid history',()=>{
  const entries=Array.from({length:OBJECT_ONCE_LEDGER_LIMIT},(_,i)=>receipt('event-'+i));
  const full=restoreObjectOnceLedger({schema:1,blocked:false,entries});
  assert.equal(full.blocked,false);
  const pending=stageObjectOnceEffects(full,[receipt('new'),receipt('event-0')]);
  assert.equal(pending.contributions.length,0);
  assert.equal(pending.ledger.entries.length,OBJECT_ONCE_LEDGER_LIMIT);
  assert.equal(restoreObjectOnceLedger({...full,entries:[...entries,receipt('overflow')]}).blocked,true);
});
test('F4b8: actual two-resident runtime and comfort continuous effects do not need receipts',()=>{
  const h=newHousehold(),sofa=h.world.furniture.instances.find(x=>x.prefabId==='sofa');
  sofa.itemDefinitionId='sofa.comfort';
  h.action={id:'sofa',phase:'using',elapsed:0,targetInstanceId:sofa.instanceId,automatic:false};
  h.otherSim.action=null;
  h.needs.energy=50;
  const ledger=h.objectOnceLedger;
  tickHousehold(h,5);
  assert.equal(h.needs.energy,51);
  assert.strictEqual(h.objectOnceLedger,ledger,'continuous effects never copy persistent receipts per frame');
  assert.equal(h.objectOnceLedger.entries.length,0);
  assert.equal(h.otherSim.objectOnceLedger.entries.length,0);
  assert.equal(h.version,1);
});
test('F4b8: Safari Pages packages persistent receipt module and H1/R5c remain wired',()=>{
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  const household=readFileSync(new URL('../src/household.js',import.meta.url),'utf8');
  assert.match(pages,/node --check src\/object-once-ledger\.js/);
  assert.match(pages,/cp src\/object-once-ledger\.js site\/src\//);
  assert.match(household,/settleObjectUseStep\(/);
  assert.match(household,/tickSocial\(root,minutes\)/);
  assert.match(household,/advanceReading\(root,'alex'/);
});
