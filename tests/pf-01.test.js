import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {syncResidentPickerWorkStatus} from '../src/resident-hud.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const game=read('src/game.js');
test('PF-01: pool preview keeps exact cell bounds, fixed four strips, resets for ground and invalid input',()=>{
 const node=()=>({enabled:false,render:{},setPosition(...v){this.pos=v;},setLocalScale(...v){this.scale=v;}});
 const outdoorPaintGhost=node(),poolOutline=node(),poolEdges=Array.from({length:4},node);
 const poolMarks={paint:{fill:'blue',edge:'cyan'},erase:{fill:'orange',edge:'cream'}};
 let mode=true,tool='paint';
 const context={outdoorPaintGhost,poolOutline,poolEdges,poolMarks,outdoorPaintMaterial:'ground',
   outdoorCellAt:x=>x??null,OUTDOOR_GRID_WIDTH:64,poolMode:()=>mode,poolTool:()=>tool};
 const source=game.slice(game.indexOf('  const paintGhostFrom='),game.indexOf('  const previewOutdoorSelection='));
 const paint=vm.runInNewContext(source+';paintGhostFrom',context);
 paint({x:65},{x:195});
 assert.equal(poolOutline.enabled,true);
 assert.deepEqual(outdoorPaintGhost.scale,[1.5,.025,1.5]);
 assert.deepEqual(outdoorPaintGhost.pos,[-7.75,-.465,-10.75]);
 assert.equal(outdoorPaintGhost.render.material,'blue');
 assert.equal(poolEdges.length,4);
 assert.ok(poolEdges.every(e=>e.render.material==='cyan'&&e.scale[0]>0&&e.scale[2]>0));
 tool='erase';paint({x:195},{x:65});assert.equal(outdoorPaintGhost.render.material,'orange');
 assert.ok(poolEdges.every(e=>e.render.material==='cream'));
 paint({x:65},{x:65});assert.ok(poolEdges.every(e=>e.scale[0]>0&&e.scale[2]>0));
 mode=false;paint({x:65},{x:65});assert.equal(poolOutline.enabled,false);
 assert.equal(outdoorPaintGhost.render.material,'ground');
 paint({},{});assert.equal(outdoorPaintGhost.enabled,false);
 assert.match(game,/outdoorPending=null;outdoorPaintGhost\.enabled=false;poolOutline\.enabled=false/);
});
test('PF-01: career HUD keeps canonical label and selected resident, hides absent contract',()=>{
 const workHud={hidden:true,textContent:''};let id='alex';
 const gameState={careerSystem:{byResident:{alex:{},mira:{}}}};
 const labels={alex:{label:'Ожидает: 2026-11-25 22:00–06:00'},mira:{label:'На работе · до 18:00'}};
 const source=game.slice(game.indexOf('function updateCareerHud(){'),game.indexOf('const residentSwitch='));
 // Execute the real PF-08 picker synchronizer, not a no-op mock.
 const button=()=>({dataset:{},attrs:{},getAttribute(key){return this.attrs[key]??null;},setAttribute(key,value){this.attrs[key]=value;}});
 const buttons={'pick-alex':button(),'pick-mira':button()};
 gameState.careerSystem.byResident.mira.currentShift={phase:'working'};
 const update=vm.runInNewContext(source+';updateCareerHud',{workHud,game:gameState,activeHudResident:()=>id,residentWorkStatus:(_,who)=>labels[who],syncResidentPickerWorkStatus,$:key=>buttons[key]});
 update();assert.equal(workHud.textContent,labels.alex.label);assert.equal(workHud.hidden,false);
 assert.equal(buttons['pick-mira'].dataset.away,'true');
 assert.match(buttons['pick-mira'].getAttribute('aria-label'),/на работе/);
 // Mira returns while Alex is still selected.
 gameState.careerSystem.byResident.mira.currentShift=null;
 update();assert.equal(workHud.textContent,labels.alex.label);
 assert.equal(buttons['pick-mira'].dataset.away,'false');
 assert.equal(buttons['pick-mira'].getAttribute('aria-label'),'Выбрать Мира');
 id='mira';update();assert.equal(workHud.textContent,labels.mira.label);
 gameState.careerSystem.byResident.mira.currentShift={incident:{choiceId:null}};
 update();assert.match(workHud.textContent,/Рабочая ситуация/);
 id='resident_4';update();assert.equal(workHud.hidden,true);assert.equal(workHud.textContent,'');
 assert.match(game,/\$\('dashboard'\)\.append\(workHud\)/);
 assert.match(read('styles.css'),/#dashboard \.career-work-hud\{[^}]*grid-column:1\/-1;[^}]*white-space:normal/);
});
