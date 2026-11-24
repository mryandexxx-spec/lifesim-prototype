import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,loadGame,chooseAction,arrive,tick,ACTIONS,evaluateAutonomy} from '../src/simulation.js';
import {showerSequence,showerPrivacyInvariant} from '../src/shower-interaction.js';
import {toiletSequence,toiletPrivacyInvariant} from '../src/toilet-interaction.js';

function begin(id,need,value,automatic=false){
  const s=newGame();s.needs[need]=value;
  assert.ok(chooseAction(s,id,automatic));arrive(s);return s;
}
function finishAt(s,duration){
  tick(s,duration-.5);assert.ok(s.action,'still using just before completion');
  tick(s,.5);assert.equal(s.action,null);
}
for(const [id,need,short,long,seq,invariant] of [
  ['shower','hygiene',16,32,showerSequence,showerPrivacyInvariant],
  ['toilet','bladder',18,26,toiletSequence,toiletPrivacyInvariant]
]){
  test(id+' manual >=95 at arrival, full phase cycle, save roundtrip',()=>{
    for(const value of [95,100]){
      const s=begin(id,need,value);tick(s,short/2);
      assert.ok(s.action);const restored=loadGame(JSON.parse(JSON.stringify(s)));
      assert.equal(restored.action.elapsed,short/2);finishAt(restored,short/2);
      assert.ok(restored.needs[need]>=95&&restored.needs[need]<=100);
      for(let t=0;t<=short;t+=.125)assert.ok(invariant(seq(t,short)));
    }
    finishAt(begin(id,need,94.9),long);
    const queued=newGame();queued.needs[need]=100;assert.ok(chooseAction(queued,id));
    queued.needs[need]=94.9;arrive(queued);finishAt(queued,long);
    const legacy=begin(id,need,70);tick(legacy,3);
    finishAt(loadGame(JSON.parse(JSON.stringify(legacy))),long-3);
  });
  test(id+' autonomous timing unchanged',()=>{
    const s=newGame();s.minutes=s.autonomy.nextAt+1;s.autonomy.enabled=true;s.needs[need]=100;
    assert.ok(chooseAction(s,id,true));arrive(s);finishAt(s,long);
  });
}
test('manual full energy sleep lasts 30 game minutes, no energy decay while sleeping',()=>{
  const s=begin('bed','energy',100);
  tick(s,10);assert.equal(s.action.elapsed,10);assert.equal(s.needs.energy,100);
  const restored=loadGame(JSON.parse(JSON.stringify(s)));tick(restored,19.5);
  assert.equal(restored.action.elapsed,29.5);assert.equal(restored.needs.energy,100);
  tick(restored,.5);assert.equal(restored.action,null);assert.equal(restored.needs.energy,100);
});
test('manual leisure at 100% plays its normal author duration',()=>{
  for(const id of ['sofa','tv'])finishAt(begin(id,'fun',100),ACTIONS[id].duration);
});
test('full needs do not create autonomous care loops',()=>{
  const s=newGame();s.minutes=720;for(const key of Object.keys(s.needs))s.needs[key]=100;
  assert.equal(evaluateAutonomy(s).selected,null);
});

test('manual leisure policy survives reload and preserves legacy/automatic early exit',()=>{
  for(const id of ['tv','sofa']){
    const fresh=begin(id,'fun',100);tick(fresh,1);
    const restored=loadGame(JSON.parse(JSON.stringify(fresh)));
    finishAt(restored,ACTIONS[id].duration-1);
    for(const automatic of [false,true]){
      const legacy=newGame();legacy.needs.fun=100;
      legacy.action={id,phase:'using',elapsed:1,automatic};
      tick(legacy,1);assert.equal(legacy.action,null);
    }
  }
});
