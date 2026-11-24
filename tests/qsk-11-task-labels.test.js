import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,getActor} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {labelQueuedTask,labelActiveTask} from '../src/qsk-11-task-labels.js';

// These labels adapt canonical state; they never create or persist their own queue.
test('QSK-11 queued labels retain all command families and fallback behavior',()=>{
  const game=newHousehold();
  const checks=[
    [null,'Неизвестное действие'],
    [{type:'move'},'Идти в указанное место'],
    [{type:'outdoor'},'Отдохнуть на садовой скамейке'],
    [{type:'grill',recipeId:'nonexistent'},'Гриль: готовка'],
    [{type:'garden',actionId:'water'},'Полить грядку'],
    [{type:'garden',actionId:'inspect'},'Осмотреть растение'],
    [{type:'garden',actionId:'harvest'},'Собрать садовые травы'],
    [{type:'garden',actionId:'replant'},'Посадить травы заново'],
    [{type:'garden',actionId:'other'},'Полюбоваться садом'],
    [{type:'pool',actionId:'jump'},'Прыгнуть и поплавать'],
    [{type:'pool',actionId:'other'},'Плавать'],
    [{type:'object',tvTalk:true},'Поговорить с телевизором'],
    [{type:'object',mirrorPractice:true},'Репетировать речь'],
    [{type:'object',actionId:'missing'},'Предмет'],
    [{type:'activity',inventoryItemId:'book_1'},'Читать подаренную книгу'],
    [{type:'activity',activityId:'missing'},'Хобби'],
    [{type:'social',actionId:'missing'},'Общение'],
    [{type:'conversation',topicId:'missing'},'Беседа: Разговор'],
    [{type:'branch',actionId:'missing'},'Общение'],
    [{type:'shared',choiceId:'missing'},'Совместный досуг'],
    [{type:'shared',residentId:'alex',mode:'gift',choiceId:'missing'},'Подарить: предмет'],
    [{type:'unsupported'},'Действие']
  ];
  const before=JSON.stringify(game);
  for(const [task,expected] of checks)
    assert.equal(labelQueuedTask(game,task),expected,JSON.stringify(task));
  assert.equal(JSON.stringify(game),before);
  assert.equal(game.version,1);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
});

test('QSK-11 active labels use real resident action and shared social state without writes',()=>{
  const game=newHousehold();
  assert.equal(labelActiveTask(game,'alex'),null);
  assert.equal(labelActiveTask(game,'mira'),null);
  const alex=getActor(game,'alex');
  const mira=getActor(game,'mira');
  alex.action={id:'music',activityId:'missing'};
  mira.action={id:'unknown'};
  const before=JSON.stringify(game);
  assert.equal(labelActiveTask(game,'alex'),'Слушать музыку');
  assert.equal(labelActiveTask(game,'mira'),'Занятие');
  assert.equal(JSON.stringify(game),before);
  game.socialAction={initiator:'alex',partner:'mira',kind:'missing',conversation:{}};
  assert.match(labelActiveTask(game,'alex'),/^Беседа с /);
  game.socialAction={initiator:'alex',partner:'mira',kind:'missing',branchAction:{id:'missing'}};
  assert.equal(labelActiveTask(game,'mira'),'Общение');
  game.socialAction={initiator:'alex',partner:'mira',kind:'missing',shared:{choiceId:'tv'}};
  assert.equal(labelActiveTask(game,'alex'),'Смотрит телевизор вместе');
  game.socialAction={initiator:'alex',partner:'mira',kind:'missing',shared:{mode:'gift'}};
  assert.equal(labelActiveTask(game,'mira'),'Вручает или принимает подарок');
  game.socialAction={initiator:'alex',partner:'mira',kind:'missing'};
  assert.equal(labelActiveTask(game,'alex'),'Общается');
  assert.equal(game.version,1);
});

test('QSK-11 game delegates legacy plan functions and Pages packages the helper',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(game,/const taskLabel=task=>labelQueuedTask\(game,task\)/);
  assert.match(game,/const activeTaskLabel=id=>labelActiveTask\(game,id\)/);
  assert.match(pages,/cp src\/qsk-11-task-labels\.js site\/src\//);
});
