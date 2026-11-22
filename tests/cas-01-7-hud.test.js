import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,SAVE_KEY} from '../src/simulation.js';
import {newHousehold,loadHousehold,getActor,selectResident} from '../src/household.js';
import {acceptCareerOffer} from '../src/career-job-board.js';
import {residentRoster,residentScenePose,validHudSelection,effectiveHudSelection,residentDisplayName} from '../src/resident-hud.js';
import {enqueueAction} from '../src/action-queue.js';
import {queueAddressedSocial} from '../src/resident-social-runtime.js';
const cp=x=>JSON.parse(JSON.stringify(x));
function fixture(remote=false){
 const r=newHousehold();
 const make=(id,firstName)=>({id,identity:{firstName,lastName:'Тест',lifeStage:'adult'},actor:newGame()});
 r.population={schema:1,nextResidentSerial:5,
  residentsById:{resident_3:make('resident_3','Вера'),resident_4:make('resident_4','Игорь')},
  linksByResident:{alex:{familyId:'family_1',dwellingId:'dwelling_1'},mira:{familyId:'family_1',dwellingId:'dwelling_1'},
   resident_3:{familyId:'family_2',dwellingId:'dwelling_1'},resident_4:{familyId:'family_3',dwellingId:remote?'dwelling_2':'dwelling_1'}},
  kinship:[]};
 return loadHousehold(cp(r));
}
test('CAS-01.7 legacy root-v1 two residents, unknown ID cannot masquerade as Alex',()=>{
 const root=loadHousehold(cp(newHousehold()));
 assert.equal(SAVE_KEY,'lifesim.room01.v1');
 assert.deepEqual(residentRoster(root,'alex').map(x=>x.id),['alex','mira']);
 assert.equal(validHudSelection(root,'resident_3'),false);
 assert.equal(residentDisplayName(root,'resident_3'),null);
 assert.equal(effectiveHudSelection(root,'ghost'),'alex');
 assert.equal(residentScenePose(root,'ghost'),null);
 assert.equal(selectResident(root,'ghost'),false);
});
test('CAS-01.7 four selected residents keep unique IDs and needs',()=>{
 const r=fixture(),a=getActor(r,'resident_3');a.needs.hunger=12;a.needs.energy=88;
 const rows=residentRoster(r,'resident_3');
 assert.deepEqual(rows.map(x=>x.name),['Алекс','Мира','Вера','Игорь']);
 assert.equal(rows.filter(x=>x.selected).length,1);
 assert.equal(rows[2].priorityNeed,'hunger');assert.equal(rows[2].priorityValue,12);
 assert.equal(rows[2].id,'resident_3');
 assert.equal(rows[0].needs.hunger,r.needs.hunger);
});
test('CAS-01.7 remote resident is persisted but unselectable and invisible',()=>{
 const r=fixture(true);
 assert.deepEqual(residentRoster(r,'resident_4').map(x=>x.id),['alex','mira','resident_3']);
 assert.equal(effectiveHudSelection(r,'resident_4'),'alex');
 assert.equal(residentScenePose(r,'resident_4'),null);
 assert.equal(queueAddressedSocial(r,'resident_3','resident_4'),null);
});
test('CAS-01.7 career and FIFO projection is read-only, independent and leaves one wallet',()=>{
 const r=fixture(),offer=acceptCareerOffer(r,'resident_3','editorial');
 assert.equal(offer.ok,true,offer.reason);r.careerSystem=offer.careerSystem;
 assert.ok(enqueueAction(r.actionQueues,'resident_3',{type:'move',x:0,z:0}));
 const before=JSON.stringify(r),balance=r.shop.credits;
 const rows=residentRoster(r,'resident_3');
 assert.ok(rows[2].career);assert.equal(rows[2].queued,1);
 assert.equal(rows[3].career,null);assert.equal(rows[3].queued,0);
 assert.equal(JSON.stringify(r),before);assert.equal(r.shop.credits,balance);
});
test('CAS-01.7 scene stand-in disappears at work without moving or writing actor',()=>{
 const r=fixture(),actor=getActor(r,'resident_3');
 assert.deepEqual(residentScenePose(r,'resident_3'),actor.position);
 const offer=acceptCareerOffer(r,'resident_3','editorial');
 assert.equal(offer.ok,true);r.careerSystem=offer.careerSystem;
 r.careerSystem.byResident.resident_3.currentShift={phase:'working'};
 assert.equal(residentScenePose(r,'resident_3'),null);
 assert.equal(residentRoster(r,'resident_3')[2].away,true);
 assert.equal(cp(r).population.residentsById.resident_3.identity.firstName,'Вера');
});
