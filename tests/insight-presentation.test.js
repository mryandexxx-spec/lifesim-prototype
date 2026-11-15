import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,getActor} from '../src/household.js';
import {refreshMind,rememberAction} from '../src/psychology.js';
import {getPerspective} from '../src/social-perspective.js';
import {residentMoodInsight,socialReactionInsight,insightLayerPolicy}
  from '../src/insight-presentation.js';
const clone=x=>JSON.parse(JSON.stringify(x));
test('a resident insight describes actual deficit, never numeric relations',()=>{
 const g=newHousehold();const a=getActor(g,'alex');
 a.needs.hunger=12;a.needs.social=30;refreshMind(a);
 const before=clone(g);
 const v=residentMoodInsight(a,{residentName:'Алекс',
   partnerName:'Мира',relationLabel:'Знакомые',perspective:getPerspective(g,'alex')});
 assert.equal(v.needs[0].title,'Сытость — критично');
 assert.equal(v.needs[1].title,'Общение — низко');
 assert.match(v.summary,/голоден/i);
 assert.equal(v.relation.status,'Знакомые');
 assert.match(v.relation.recent,/Пока нет/);
 assert.ok(!JSON.stringify(v).includes('50/100'));
 assert.deepEqual(g,before,'an explanation must not mutate household state');
});
test('selected resident is independent, no private pair feelings inferred',()=>{
 const g=newHousehold();
 getActor(g,'alex').needs.hunger=4;
 getActor(g,'mira').needs.hunger=90;
 refreshMind(getActor(g,'alex'));refreshMind(getActor(g,'mira'));
 const a=residentMoodInsight(getActor(g,'alex'),{residentName:'Алекс'});
 const m=residentMoodInsight(getActor(g,'mira'),{residentName:'Мира'});
 assert.match(a.summary,/голоден/i);
 assert.ok(!m.needs.some(i=>i.title.startsWith('Сытость')));
 assert.equal(m.relation,null);
});
test('canonical emotional memory is quoted as reason without replaying social result',()=>{
 const g=newHousehold();const a=getActor(g,'alex');
 rememberAction(a,'sofa');
 const v=residentMoodInsight(a,{residentName:'Алекс'});
 assert.equal(v.feeling?.detail,'Причина: Удалось отдохнуть');
 assert.ok(['Увлечён','Вдохновлён'].includes(v.feeling?.title));
});
test('unknown or incomplete reactions do not create claimed outcomes',()=>{
 assert.equal(socialReactionInsight({outcome:'warm'},()=> 'Мира'),null);
 assert.equal(socialReactionInsight({outcome:'winner',responderId:'mira'},()=> 'Мира'),null);
 assert.equal(socialReactionInsight(null,()=> 'Мира'),null);
 const v=socialReactionInsight({outcome:'refused',responderId:'new-resident'},()=> 'Ника');
 assert.equal(v.title,'Ника · Отказ');
 assert.match(v.description,/завершённое взаимодействие/);
 assert.ok(!v.description.includes('дружба'));
});
test('a required reply outranks reaction toast and optional insight',()=>{
 assert.deepEqual(insightLayerPolicy({required:true,optionalOpen:false,feedbackActive:true}),
   {allowOptional:false,showFeedback:false});
 assert.equal(insightLayerPolicy({optionalOpen:true,feedbackActive:true}).showFeedback,false);
 assert.equal(insightLayerPolicy({optionalOpen:false,feedbackActive:true}).showFeedback,true);
});
