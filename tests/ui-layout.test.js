import test from 'node:test';
import assert from 'node:assert/strict';
import {contextualPlacement,viewMenuPlacement} from '../src/ui-layout.js';
test('context opens to side of targeted character on wide screens',()=>{
  const p=contextualPlacement({anchorX:400,anchorY:360,viewportWidth:1200,viewportHeight:780,
    panelWidth:340,panelHeight:265,topInset:86,bottomInset:140});
  assert.equal(p.side,'right');
  assert.equal(p.x,414);
  assert.ok(p.y>=86);
});
test('the left side is used when a target is near the right edge',()=>{
  const p=contextualPlacement({anchorX:1050,anchorY:500,viewportWidth:1200,viewportHeight:780,
    panelWidth:340,panelHeight:265});
  assert.equal(p.side,'left');
  assert.ok(p.x+340<1050);
});
test('on an iPhone the panel stays within visible safe play area',()=>{
  const p=contextualPlacement({anchorX:335,anchorY:770,viewportWidth:390,viewportHeight:844,
    panelWidth:352,panelHeight:340,topInset:112,bottomInset:228});
  assert.equal(p.side,'center');
  assert.ok(p.x>=12&&p.x+352<=378);
  assert.ok(p.y>=112&&p.y+340<=616);
});
test('small landscape window stays finite and entirely within viewport',()=>{
  const p=contextualPlacement({anchorX:800,anchorY:10,viewportWidth:844,viewportHeight:390,
    panelWidth:340,panelHeight:420,topInset:58,bottomInset:90});
  assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
  assert.ok(p.y>=58);
  assert.ok(p.maxHeight>80);
  assert.ok(p.y+p.maxHeight<=390);
});
test('clamped positioning is robust to missing and NaN coordinates',()=>{
  const p=contextualPlacement({anchorX:NaN,viewportWidth:390,viewportHeight:844,
    panelWidth:500,panelHeight:500});
  assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
  assert.ok(p.maxHeight>0);
});
test('view submenu stays near toggle and on-screen',()=>{
  const p=viewMenuPlacement({buttonLeft:324,buttonTop:420,viewportWidth:390,viewportHeight:844});
  assert.ok(p.x>=12&&p.x+226<=378);
  assert.ok(p.y>=12&&p.y+120<=832);
});
