import test from 'node:test';
import assert from 'node:assert/strict';
import {phoneWorkLanding} from '../src/ux06-phone-state.js';

test('UX06: employed status and action follow canonical active shift only',()=>{
 const contract={currentShift:{phase:'working'}};
 const input={residentName:'Алекс',contract,statusLabel:'На работе',
   shiftLabel:'Завтра, 09:00'};
 const active=phoneWorkLanding(input);
 assert.equal(active.kind,'employed');
 assert.equal(active.headline,'На рабочей смене');
 assert.equal(active.action,'map');
 assert.match(active.description,/На работе/);
 const urgent=phoneWorkLanding({...input,pendingIncident:true});
 assert.equal(urgent.action,'incident');
 assert.match(urgent.headline,/решение/);
 assert.equal(phoneWorkLanding({...input,canDepart:true,pendingIncident:true}).action,
   'incident','Incident always wins over departure');
 assert.equal(phoneWorkLanding({...input,contract:{currentShift:{phase:'pending'}},
   canDepart:true}).action,'depart');
 assert.equal(contract.currentShift.phase,'working','Read-only snapshot');
 assert.ok(Object.isFrozen(urgent));
});

test('UX06: unemployed, applying and active interviews have distinct landing',()=>{
 const looking=phoneWorkLanding({residentName:'Мира'});
 assert.equal(looking.kind,'looking');assert.equal(looking.action,'vacancies');
 for(const [phase,headline] of [['waiting_reply','Отклик отправлен'],
   ['interview_invited','Назначено собеседование'],
   ['interview_active','Собеседование идёт'],
   ['waiting_decision','Ожидается ответ'],
   ['offer_ready','Получено предложение'],['rejected','Получен отказ']]){
   const view=phoneWorkLanding({residentName:'Мира',recruitment:{phase}});
   assert.equal(view.kind,'recruiting');assert.equal(view.action,'application');
   assert.equal(view.headline,headline);
 }
});
