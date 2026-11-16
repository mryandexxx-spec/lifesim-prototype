import test from 'node:test';
import assert from 'node:assert/strict';
import {createObjectRegistry} from '../src/object-definition-registry.js';
import {calculateObjectEffectChanges,proposeObjectEffectDeltas} from '../src/object-effect-engine.js';
import {legacyObjectRegistry} from '../src/object-legacy-adapter.js';
import {newHousehold,tickHousehold,loadHousehold} from '../src/household.js';

function registry(){
  return createObjectRegistry({
    stats:[{id:'needs.energy',min:0,max:100},{id:'needs.fun',min:0,max:100}],
    triggers:[{id:'item.use.tick'},{id:'item.use.complete'}],
    categories:[{id:'room.living',label:'Гостиная',facet:'room'},
      {id:'function.relax',label:'Отдых',facet:'function'}],
    attributes:[{id:'quality.comfort',min:0,max:5,label:'Комфорт'}],
    items:[
      {id:'sofa.alpha',name:'Первый диван',prefabId:'sofa',rendererKey:'sofa',
        categoryIds:['room.living','function.relax'],capabilities:['relax'],
        ratings:{'quality.comfort':3},
        effects:[{id:'recovery',statId:'needs.energy',trigger:'item.use.tick',
          actionId:'sofa',mode:'perMinute',amount:0.2,group:'rest',stacking:'highest'}]},
      {id:'sofa.beta',name:'Второй диван',prefabId:'sofa',rendererKey:'sofa',
        categoryIds:['room.living','function.relax'],capabilities:['relax'],
        ratings:{'quality.comfort':5},
        effects:[{id:'recovery',statId:'needs.energy',trigger:'item.use.tick',
          actionId:'sofa',mode:'perMinute',amount:0.4,group:'rest',stacking:'highest'}]}
    ]
  });
}
const receipt=(instanceId,delta,stacking='sum',eventId=null,group='rest')=>({
  instanceId,itemId:'sofa.alpha',effectId:'recovery',statId:'needs.energy',
  stacking,group,delta,eventId
});
test('F4b5: unique and highest are stable under reversal, rotation and duplicates',()=>{
  const r=registry(),a=receipt('sofa-a',-3,'unique'),b=receipt('sofa-b',4,'unique');
  const c=receipt('sofa-c',2,'unique');
  const first=calculateObjectEffectChanges(r,[b,c,a,a],{'needs.energy':50});
  for(const permutation of [[a,b,c],[c,b,a],[a,c,b,a]]){
    assert.deepEqual(calculateObjectEffectChanges(r,permutation,{'needs.energy':50}),first);
  }
  assert.equal(first[0].delta,-3);
  const one=receipt('sofa-b',-4,'highest'),two=receipt('sofa-a',4,'highest');
  assert.deepEqual(calculateObjectEffectChanges(r,[one,two],{'needs.energy':50}),
    calculateObjectEffectChanges(r,[two,one],{'needs.energy':50}));
  assert.equal(calculateObjectEffectChanges(r,[two,one],{'needs.energy':50})[0].delta,4);
});
test('F4b5: delimiter-shaped IDs cannot collide or cancel distinct receipts',()=>{
  const r=registry();
  const a={...receipt('x|y',3),'effectId':'z',eventId:'e'};
  const b={...receipt('x',5),effectId:'y|z',eventId:'e'};
  const result=calculateObjectEffectChanges(r,[a,b,a],{'needs.energy':50});
  assert.equal(result[0].delta,8);
  const differentGroup={...receipt('x|y',7),effectId:'z',eventId:'e',group:'another'};
  assert.equal(calculateObjectEffectChanges(r,[a,differentGroup],{'needs.energy':50})[0].delta,10);
});
test('F4b5: same source repeated no double reward, new receipt same source remains distinct',()=>{
  const r=registry();
  const a=receipt('sofa-1',2,'sum','event-1');
  const b=receipt('sofa-1',3,'sum','event-2');
  const values={'needs.energy':98};
  assert.deepEqual(calculateObjectEffectChanges(r,[a,a,b],values),
    [{statId:'needs.energy',delta:5,next:100}]);
  assert.equal(calculateObjectEffectChanges(r,[a,a,a],values)[0].delta,2);
});
test('F4b5: multiple independent groups, capabilities, quality and bounds are data',()=>{
  const r=registry();
  assert.equal(r.items['sofa.beta'].ratings['quality.comfort'],5);
  assert.equal(r.items['sofa.alpha'].capabilities[0],'relax');
  assert.equal(r.items['sofa.beta'].categoryIds.length,2);
  const alpha=proposeObjectEffectDeltas(r,{itemId:'sofa.alpha',location:'home',
    active:true,instanceId:'chair-1',trigger:'item.use.tick',actionId:'sofa',minutes:10});
  const beta=proposeObjectEffectDeltas(r,{itemId:'sofa.beta',location:'home',
    active:true,instanceId:'chair-2',trigger:'item.use.tick',actionId:'sofa',minutes:10});
  const combined=calculateObjectEffectChanges(r,[...beta,...alpha],{'needs.energy':99});
  assert.equal(combined[0].delta,4);
  assert.equal(combined[0].next,100);
  assert.ok(Object.isFrozen(r.items['sofa.beta'].ratings));
});
test('F4b5: malformed sources and oversized batches fail closed without throwing',()=>{
  const r=registry(),good=receipt('ok',2);
  const cases=[
    {...good,instanceId:''},{...good,effectId:null},
    {...good,statId:'needs.madeup'},{...good,eventId:4},
    {...good,delta:Infinity},{...good,delta:1e7},{...good,stacking:'multiply'},
    {...good,group:''}
  ];
  assert.deepEqual(calculateObjectEffectChanges(r,cases,{'needs.energy':50}),[]);
  assert.deepEqual(calculateObjectEffectChanges(r,Array(4097).fill(good),{'needs.energy':50}),[]);
});
test('F4b5: real comfort sofa grant is exactly the same for 1x10 and 10x1 ticks',()=>{
  function home(){
    const h=newHousehold(),sofa=h.world.furniture.instances.find(x=>x.prefabId==='sofa');
    sofa.itemDefinitionId='sofa.comfort';
    h.action={id:'sofa',phase:'using',elapsed:0,targetInstanceId:sofa.instanceId,automatic:false};
    h.needs.energy=50;h.needs.fun=40;
    return h;
  }
  const bulk=home(),steps=home();
  tickHousehold(bulk,10);
  for(let i=0;i<10;i++)tickHousehold(steps,1);
  assert.equal(bulk.needs.energy,steps.needs.energy);
  assert.equal(bulk.needs.energy,52);
  const saved=loadHousehold(JSON.parse(JSON.stringify(steps)));
  assert.equal(saved.world.furniture.instances.find(x=>x.prefabId==='sofa').itemDefinitionId,'sofa.comfort');
  tickHousehold(saved,1);
  assert.equal(saved.needs.energy,52.2);
  assert.equal(legacyObjectRegistry().items['legacy.sofa'].effects.length,0);
});
