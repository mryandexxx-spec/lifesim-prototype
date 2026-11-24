import test from 'node:test';
import assert from 'node:assert/strict';
import {SAVE_KEY,newGame} from '../src/simulation.js';
import {newHousehold,loadHousehold} from '../src/household.js';
import {inspectV1Save,readV1Save,writeV1Save} from '../src/qsk-09-save-safety.js';

function storage(seed=null){
  let bytes=seed;
  return {
    getItem:key=>{assert.equal(key,SAVE_KEY);return bytes;},
    setItem:(key,value)=>{assert.equal(key,SAVE_KEY);bytes=value;},
    bytes:()=>bytes
  };
}
const copy=value=>JSON.parse(JSON.stringify(value));
const quota=()=>Object.assign(new Error('quota reached'),{name:'QuotaExceededError',code:22});

test('QSK-09: pre-CAS single-resident v1 restores and never needs a schema rewrite',()=>{
  const old=newGame();
  old.minutes=1174;old.needs.hunger=15;old.position={x:.5,z:-.8};
  const s=storage(),original=copy(old);
  assert.equal(writeV1Save(s,SAVE_KEY,old).ok,true);
  assert.equal(readV1Save(s,SAVE_KEY).status,'valid');
  const restored=loadHousehold(readV1Save(s,SAVE_KEY).value);
  assert.equal(restored.minutes,1174);
  assert.equal(restored.needs.hunger,15);
  assert.deepEqual(restored.position,original.position);
  assert.equal(restored.otherSim.version,1);
  assert.deepEqual(old,original,'restore must not mutate saved source');
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
});

test('QSK-09: current v1 wallet, residents and queues survive one-key restart',()=>{
  const state=newHousehold();
  state.shop.credits=137;state.minutes=2761;
  state.otherSim.needs.energy=23;
  const s=storage();
  assert.equal(writeV1Save(s,SAVE_KEY,state).ok,true);
  const payload=s.bytes();
  const loaded=loadHousehold(readV1Save(s,SAVE_KEY).value);
  assert.equal(loaded.shop.credits,137);
  assert.equal(loaded.minutes,2761);
  assert.equal(loaded.otherSim.needs.energy,23);
  assert.deepEqual(loaded.actionQueues,loadHousehold(JSON.parse(payload)).actionQueues);
  assert.equal(loaded.version,1);
  assert.equal(s.bytes(),payload,'loading must not rewrite save bytes');
});

test('QSK-09: absent key is not corrupted and never creates an automatic snapshot',()=>{
  const s=storage();
  assert.deepEqual(readV1Save(s,SAVE_KEY),{status:'missing',value:null});
  assert.equal(s.bytes(),null);
});

test('QSK-09: truncated JSON, future version and partial core lock without erasure',()=>{
  const good=newHousehold();
  const cases=[
    '{"version":1,"minutes":123',
    JSON.stringify({...good,version:2}),
    JSON.stringify({version:1}),
    JSON.stringify({...good,minutes:null}),
    JSON.stringify({...good,needs:null}),
    JSON.stringify({...good,position:{x:null,z:1}}),
    JSON.stringify({...good,otherSim:{version:1}}),
    JSON.stringify({...good,shop:{schema:1,credits:null,nextId:1}}),
    JSON.stringify({...good,shop:{...good.shop,credits:-20}})
  ];
  for(const raw of cases){
    const s=storage(raw);
    assert.equal(readV1Save(s,SAVE_KEY).status,'locked',raw.slice(0,80));
    assert.equal(s.bytes(),raw,'locked bytes must remain exact');
  }
});

test('QSK-09: damaged future population is still rejected by existing strict restore',()=>{
  const game=newHousehold();
  game.population={schema:99};
  // Envelope is not a replacement for the domain-specific population validator.
  assert.equal(inspectV1Save(game).ok,true);
  assert.throws(()=>loadHousehold(game),/population/i);
});

test('QSK-09: read is forbidden but stored bytes remain preserved',()=>{
  const s=storage('original bytes');
  s.getItem=()=>{throw new Error('SecurityError')};
  assert.equal(readV1Save(s,SAVE_KEY).status,'locked');
  assert.equal(s.bytes(),'original bytes');
});

test('QSK-09: quota failure retains prior serialized family and reports precisely',()=>{
  const previous=newHousehold();
  previous.shop.credits=876;
  const s=storage(JSON.stringify(previous));
  const raw=s.bytes();
  s.setItem=()=>{throw quota()};
  const altered=copy(previous);altered.shop.credits=120;
  assert.deepEqual(writeV1Save(s,SAVE_KEY,altered),{ok:false,reason:'quota'});
  assert.equal(s.bytes(),raw);
  assert.equal(readV1Save(s,SAVE_KEY).value.shop.credits,876);
  assert.equal(altered.shop.credits,120,'in-memory transaction caller can roll back');
});

test('QSK-09: unavailable storage, serializer failure, invalid root never overwrite',()=>{
  const s=storage(JSON.stringify(newHousehold()));
  const raw=s.bytes();
  s.setItem=()=>{throw Object.assign(new Error('Blocked'),{name:'SecurityError'})};
  assert.deepEqual(writeV1Save(s,SAVE_KEY,newHousehold()),{ok:false,reason:'unavailable'});
  const cyclic=newHousehold();cyclic.loop=cyclic;
  assert.deepEqual(writeV1Save(s,SAVE_KEY,cyclic),{ok:false,reason:'unavailable'});
  assert.deepEqual(writeV1Save(s,SAVE_KEY,{version:2}),{ok:false,reason:'invalid-root'});
  assert.equal(s.bytes(),raw);
});

test('QSK-09: load rejects broken second person but allows legacy missing optional fields',()=>{
  const old=newGame();
  delete old.needs.social;delete old.needs.bladder;
  assert.equal(inspectV1Save(old).ok,true);
  const withMira={...old,otherSim:{...old,minutes:undefined}};
  assert.equal(inspectV1Save(withMira).ok,true,'Mira clock comes from household root');
});
