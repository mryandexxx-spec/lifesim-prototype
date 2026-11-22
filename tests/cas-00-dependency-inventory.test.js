import test from 'node:test';
import assert from 'node:assert/strict';
import {auditResidentCoupling} from '../scripts/cas-00-dependency-inventory.mjs';

test('CAS-00.2 scans the complete checked-in src tree without writing game state',()=>{
  const inventory=auditResidentCoupling();
  assert.equal(inventory.schema,1);
  assert.ok(inventory.filesScanned>=200,'audit must cover all checked-in src ES modules');
  assert.equal(inventory.filesScanned,inventory.files.length);
  assert.ok(inventory.totalLines>10000,'unexpectedly truncated source tree');
  assert.ok(inventory.filesFlagged>10,'known two-person coupling must be found');
  assert.equal(new Set(inventory.files.map(row=>row.path)).size,inventory.filesScanned);
  assert.ok(inventory.files.every(row=>row.path.startsWith('src/')&&
    Number.isSafeInteger(row.lines)&&row.lines>0));
});

test('CAS-00.2 discovers documented critical two-person hotspots without calling them all defects',()=>{
  const inventory=auditResidentCoupling();
  const byName=Object.fromEntries(inventory.files.map(row=>[row.path,row]));
  for(const path of ['src/household.js','src/game.js','src/relationships.js',
    'src/career-state.js','src/phone-calls.js','src/pool-swim-runtime.js',
    'src/finance-ledger.js','src/tv-together.js','src/gifts-leisure.js',
    'src/calendar-ui.js']){
    assert.ok(byName[path]?.flagged,'missing audited hotspot: '+path);
  }
  assert.ok(byName['src/household.js'].counts.otherSim>0);
  assert.ok(byName['src/game.js'].counts.householdIds>0);
  assert.ok(byName['src/career-state.js'].counts.careerIds>0);
  assert.ok(byName['src/relationships.js'].counts.binaryPartner>0);
  assert.ok(byName['src/finance-ledger.js'].counts.literalAlex>0);
  assert.ok(byName['src/action-queue.js'],'generic FIFO core must also be scanned');
  assert.equal(byName['src/action-queue.js'].counts.literalAlex,0,
    'generic FIFO must not acquire a hard-coded Alex actor');
});

test('CAS-00.2 lexical totals are deterministic and never interpreted as 4-person readiness',()=>{
  const first=auditResidentCoupling(),second=auditResidentCoupling();
  assert.deepEqual(first,second);
  const keys=Object.keys(first.totals);
  for(const key of keys)
    assert.equal(first.totals[key],first.files.reduce((sum,row)=>sum+row.counts[key],0));
  assert.equal(first.kind,'lexical-candidates-not-proven-defects');
  console.log('CAS-00.2 lexical inventory:',JSON.stringify({
    scanned:first.filesScanned,flagged:first.filesFlagged,totals:first.totals
  }));
});
