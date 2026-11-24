import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SAVE_KEY,newGame} from '../src/simulation.js';
import {newHousehold,loadHousehold} from '../src/household.js';
import {MAX_V1_BACKUP_BYTES,backupSummary,validateV1BackupText,exportV1BackupText,commitV1Backup} from '../src/qsk-09-backup.js';

function storage(seed=null){
  let bytes=seed,writes=0;
  return {getItem:k=>{assert.equal(k,SAVE_KEY);return bytes;},
    setItem:(k,value)=>{assert.equal(k,SAVE_KEY);writes++;bytes=value;},
    bytes:()=>bytes,writes:()=>writes};
}
const json=v=>JSON.stringify(v);

test('QSK-09 file: legacy single-resident v1 saves verbatim without altering source',()=>{
  const old=newGame();old.minutes=800;old.needs.energy=19;
  const previous=json(old),source=storage(previous);
  const file=exportV1BackupText(source,SAVE_KEY);
  assert.equal(file.ok,true);
  assert.equal(file.text,previous);
  assert.equal(file.summary.residents,1);
  assert.equal(source.writes(),0);
  const destination=storage(json(newHousehold()));
  assert.equal(commitV1Backup(destination,SAVE_KEY,file).ok,true);
  assert.equal(loadHousehold(JSON.parse(destination.bytes())).minutes,800);
  assert.equal(destination.writes(),1);
});

test('QSK-09 file: current wallet, two residents, queues remain byte-equivalent',()=>{
  const h=newHousehold();h.shop.credits=213;h.minutes=3777;h.otherSim.needs.energy=31;
  const original=json(h),source=storage(original);
  const file=exportV1BackupText(source,SAVE_KEY);
  assert.equal(file.ok,true);
  const dest=storage(json(newHousehold()));
  assert.equal(commitV1Backup(dest,SAVE_KEY,file).ok,true);
  assert.deepEqual(JSON.parse(dest.bytes()),JSON.parse(original));
  assert.equal(file.summary.residents,2);
  assert.equal(source.writes(),0);
});

test('QSK-09 file: corrupt, future/CAS and invalid domains reject with no writes',()=>{
  const previous=json(newHousehold()),dest=storage(previous);
  const base=newHousehold();
  const invalid=['{','','{}',json({...base,version:2}),
    json({...base,otherSim:{version:1}}),
    json({...base,shop:{schema:1,credits:-1,nextId:1}}),
    json({...base,population:{schema:99}}),
    json({...base,casSchema:2}),
    json({...base,world:{furniture:null}}),
    json({...base,actionQueues:null}),
    json({...base,calendar:{schema:99}})];
  for(const file of invalid){
    const validated=validateV1BackupText(file);
    assert.equal(validated.ok,false,file.slice(0,90));
    assert.equal(commitV1Backup(dest,SAVE_KEY,validated).ok,false);
    assert.equal(dest.bytes(),previous);
  }
  assert.equal(dest.writes(),0);
});

test('QSK-09 file: size, denied access, quota never erase current bytes',()=>{
  const old=json(newHousehold()),dest=storage(old);
  assert.equal(validateV1BackupText(' '.repeat(MAX_V1_BACKUP_BYTES+1)).reason,'size');
  const valid=validateV1BackupText(old);assert.equal(valid.ok,true);
  dest.setItem=()=>{throw Object.assign(new Error('quota'),{name:'QuotaExceededError'})};
  assert.deepEqual(commitV1Backup(dest,SAVE_KEY,valid),{ok:false,reason:'quota'});
  assert.equal(dest.bytes(),old);
  dest.getItem=()=>{throw new Error('SecurityError')};
  assert.equal(exportV1BackupText(dest,SAVE_KEY).reason,'unavailable');
});

test('QSK-09 file: Safari markup, guarded confirmation and Pages module packaging',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const game=await readFile(new URL('../src/game.js',import.meta.url),'utf8');
  const pages=await readFile(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  for(const id of ['backup-export-btn','backup-import-btn','backup-file','backup-review','backup-current','backup-incoming','backup-apply','backup-cancel'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok(game.includes('validateV1BackupText(text)'));
  assert.ok(game.includes('commitV1Backup(localStorage,SAVE_KEY,pendingBackup)'));
  assert.ok(pages.includes('cp src/qsk-09-backup.js site/src/'));
  assert.ok(pages.includes('node --check src/qsk-09-backup.js'));
});

test('QSK-09 backup preview: current root v1 population residentsById counts 3–4 residents',()=>{
  const household=newHousehold();
  household.population={schema:1,residentsById:{resident_3:{},resident_4:{}},
    linksByResident:{},kinship:[],nextResidentSerial:5};
  assert.equal(backupSummary(household).residents,4);
  delete household.population.residentsById.resident_4;
  assert.equal(backupSummary(household).residents,3);
});

test('QSK-09 import: confirmed restore suppresses old in-memory pagehide and autosave writes',async()=>{
  const game=await readFile(new URL('../src/game.js',import.meta.url),'utf8');
  assert.ok(game.includes('let restoreReloadPending=false;'));
  assert.ok(game.includes('const canWriteGameSave=()=>bootReadyToSave&&!saveStorageLocked&&!restoreReloadPending;'));
  assert.ok(game.includes('window.addEventListener(\'pagehide\', () => save(true))'));
  assert.ok(game.includes('if (document.hidden) save(true)'));
  const commit=game.indexOf('commitV1Backup(localStorage,SAVE_KEY,pendingBackup)');
  const lock=game.indexOf('restoreReloadPending=true;',commit);
  const reload=game.indexOf('window.location.reload();',lock);
  assert.ok(commit>=0&&lock>commit&&reload>lock,
    'after a successful import suppress every old-family write before reload');
});
