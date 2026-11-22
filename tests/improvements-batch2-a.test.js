import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {workPresenceView} from '../src/work-presence-ui.js';

const phases=['pending','departing','working','returning','waiting',null];
test('work-presence: visibility and selection policy does not leak off-lot residents',()=>{
  for(const phase of phases){
    const v=workPresenceView(phase,'Работа · до 16:00');
    assert.equal(v.hitTestable,phase===null||phase==='pending',String(phase));
    assert.equal(v.overlayVisible,!['working','returning','waiting'].includes(phase),String(phase));
    assert.equal(v.statusOverride,['departing','working','returning','waiting'].includes(phase)
      ?'Работа · до 16:00':null,String(phase));
    assert.equal(v.idleLabel,phase==='pending'?'Работа · до 16:00':null);
  }
});
test('work-presence: unknown label cannot override correct home status',()=>{
  const v=workPresenceView('working',null);
  assert.equal(v.hitTestable,false);
  assert.equal(v.overlayVisible,false);
  assert.equal(v.statusOverride,null);
  assert.equal(v.idleLabel,null);
});
test('work-presence: 3D picking and transient HUD both consult the policy',()=>{
  const code=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  assert.match(code,/workPresenceView\(residentWorkPhase\(game,id\)\)\.hitTestable/);
  assert.match(code,/workPresenceView\(residentWorkPhase\(game,game\.selectedSim\)\)\.overlayVisible/);
  assert.match(code,/workPresenceView\(residentWorkPhase\(game,id\)\)\.overlayVisible/);
});
test('work-presence: top plan prioritizes career phase over idle and stale actor event',()=>{
  const code=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  assert.match(code,/const workView=workPresenceView\(residentWorkPhase\(game,residentId\),residentWorkStatus\(game,residentId\)\?\.label\)/);
  assert.match(code,/activeLabel:workView\.statusOverride\|\|active/);
  assert.match(code,/idleLabel:workView\.idleLabel\|\|/);
});
