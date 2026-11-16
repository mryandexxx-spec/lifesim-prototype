import test from 'node:test';
import assert from 'node:assert/strict';
import {createFurnitureHoldGesture,FURNITURE_HOLD_MS,FURNITURE_HOLD_SLOP_PX}
  from '../src/furniture-hold.js';
const p=(id,x=101,y=201)=>({id,x,y});

test('500ms minimum stationary hold; ordinary tap only selects, never grabs',()=>{
  const g=createFurnitureHoldGesture();
  assert.equal(FURNITURE_HOLD_MS,500);
  assert.equal(FURNITURE_HOLD_SLOP_PX,10);
  assert.equal(g.begin(p(3),'home-bed-1',1000),true);
  assert.equal(g.activate(1499),null);
  assert.equal(g.pending,true);
  assert.deepEqual(g.end(p(3)),{kind:'tap',instanceId:'home-bed-1'});
  assert.equal(g.active,false);
  assert.equal(g.activate(1600),null);
});
test('stationary hold activates one pointer only, then arbitrary dragging is allowed',()=>{
  const g=createFurnitureHoldGesture();
  assert.equal(g.begin(p(7),'home-tv-1',0),true);
  assert.equal(g.move(p(7,105,202)),'pending');
  const active=g.activate(500);
  assert.deepEqual(active,{pointerId:7,id:7,instanceId:'home-tv-1',x:105,y:202});
  assert.equal(g.pending,false);assert.equal(g.active,true);
  assert.equal(g.activate(501),null);
  assert.equal(g.move(p(7,600,500)),'drag');
  assert.deepEqual(g.end(p(7,600,500)),{kind:'drop',instanceId:'home-tv-1'});
  assert.equal(g.active,false);
});
test('ten accumulated CSS pixels disqualifies pickup permanently, even after 5 seconds',()=>{
  const g=createFurnitureHoldGesture();g.begin(p(1),'home-sofa-1',5);
  assert.equal(g.move(p(1,107,201)),'pending');
  assert.equal(g.move(p(1,107,207)),'camera');
  assert.equal(g.activate(5005),null);
  assert.equal(g.end(p(1,107,207)),null);
});
test('small movement inside 500ms still selects, never commits scene translation',()=>{
  const g=createFurnitureHoldGesture();g.begin(p(1),'home-plant-1',0);
  assert.equal(g.move(p(1,102,204)),'pending');
  assert.deepEqual(g.end(p(1,102,204)),{kind:'tap',instanceId:'home-plant-1'});
});
test('second finger cancellation resets waiting or active hold',()=>{
  const g=createFurnitureHoldGesture();g.begin(p(1),'home-table-1',0);
  assert.equal(g.cancel(),true);
  assert.equal(g.activate(600),null);
  g.begin(p(1),'home-table-1',0);
  assert.ok(g.activate(500));
  assert.equal(g.cancel(),true);
  assert.equal(g.end(p(1)),null);
  assert.equal(g.cancel(),false);
});
test('unknown pointer cannot activate, end or corrupt existing hold',()=>{
  const g=createFurnitureHoldGesture();g.begin(p(33),'home-bed-1',12);
  assert.equal(g.move(p(4,300,600)),'ignored');
  assert.equal(g.end(p(4)),null);
  assert.equal(g.pending,true);
  assert.ok(g.activate(512));
});
test('bad pointers, empty furniture id and timestamps never initiate pickup',()=>{
  const g=createFurnitureHoldGesture();
  assert.equal(g.begin({id:1,x:NaN,y:0},'home-bed-1',0),false);
  assert.equal(g.begin(p(1),'',0),false);
  assert.equal(g.begin(p(1),'home-bed-1',Infinity),false);
  assert.equal(g.active,false);
  assert.equal(g.pending,false);
});
test('multiple short movements cannot rotate an inert pending item into active',()=>{
  const g=createFurnitureHoldGesture();g.begin(p(3),'home-shower-1',0);
  for(let i=1;i<=9;i++)assert.equal(g.move(p(3,101+i,201)),'pending');
  assert.ok(g.activate(500));
  assert.equal(g.end(p(3,110,201)).kind,'drop');
});
