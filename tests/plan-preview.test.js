import test from 'node:test';
import assert from 'node:assert/strict';
import {planPreview,planTaskIcon} from '../src/plan-preview.js';
const name=t=>t?.label||'Действие';
const queue=[{seq:11,type:'object',label:'Поесть'},{
  seq:12,type:'conversation',label:'Разговор о планах'},{
  seq:13,type:'shared',label:'Совместный досуг'},{
  seq:14,type:'object',label:'Спать'}];
test('live plan renders current work and first three FIFO tasks without mutating queue',()=>{
  const before=JSON.stringify(queue);
  const result=planPreview({residentName:'Алекс',activeLabel:'Отдых',
    pending:queue,taskName:name});
  assert.equal(result.heading,'Сейчас · Отдых');
  assert.deepEqual(result.upcoming.map(x=>x.seq),[11,12,13]);
  assert.equal(result.more,1);
  assert.equal(result.total,4);
  assert.match(result.accessible,/Алекс.*Поесть.*ещё 1/);
  assert.equal(JSON.stringify(queue),before);
});
test('preview displays manual pause without overwriting current task',()=>{
  const result=planPreview({paused:true,activeLabel:'Разговор',pending:queue,taskName:name});
  assert.equal(result.heading,'⏸ Пауза · Разговор');
  assert.equal(result.upcoming.length,3);
});
test('mandatory choice is distinct from manual pause and never removes work',()=>{
  const result=planPreview({paused:true,needsReply:true,activeLabel:'Беседа',pending:queue,taskName:name});
  assert.equal(result.heading,'⏸ Ждёт твоего ответа');
  assert.deepEqual(result.upcoming.map(x=>x.seq),[11,12,13]);
});
test('waiting queue is not mislabeled as in-progress work',()=>{
  assert.equal(planPreview({pending:queue,taskName:name}).heading,'Ожидает начала действия');
});
test('empty or damaged queue is safe and accessible',()=>{
  const v=planPreview({residentName:'Новый житель',pending:null});
  assert.equal(v.heading,'Свободное время');
  assert.equal(v.more,0);
  assert.deepEqual(v.upcoming,[]);
  assert.match(v.accessible,/Нет запланированных действий/);
});
test('icons are semantic, not per-name or per-person hardcodes',()=>{
  assert.equal(planTaskIcon('conversation'),'☏');
  assert.equal(planTaskIcon('shared'),'♫');
  assert.equal(planTaskIcon('object'),'⌂');
  assert.equal(planTaskIcon('branch'),'♡');
  assert.equal(planTaskIcon('unknown'),'•');
});
