import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createTimeUI} from '../src/qsk-11-time-ui.js';
import {createHouseholdSpeedController} from '../src/sleep-acceleration.js';
function fixture(callbacks={}){
  const elements=new Map(),calls=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{textContent:'',attrs:{},listeners:[],
      setAttribute(k,v){this.attrs[k]=v;},
      addEventListener(type,fn){assert.equal(type,'click');this.listeners.push(fn);},
      click(){for(const fn of this.listeners)fn();}
    });
    return elements.get(id);
  };
  const ui=createTimeUI({element,onPause:()=>calls.push('pause'),onSpeed:()=>calls.push('speed'),onAutonomy:()=>calls.push('auto'),...callbacks});
  return {element,ui,calls};
}
test('F pause preserves exact hold priority, icon and accessible text',()=>{
  const {element,ui}=fixture();
  const baseline={blocked:false,paused:false,furnishMode:false,buildMode:false,outdoorMode:false};
  for(const [flags,icon,label] of [
    [{},'Ⅱ','Пауза'],[{paused:true},'▶','Продолжить'],
    [{furnishMode:true},'▶','Обстановка: игровое время остановлено'],
    [{buildMode:true,furnishMode:true},'▶','Строительство: игровое время остановлено'],
    [{outdoorMode:true,buildMode:true},'▶','Участок: игровое время остановлено'],
    [{blocked:true,outdoorMode:true},'▶','Выбери реплику: игровое время остановлено']
  ]){
    ui.renderPause({...baseline,...flags});
    assert.equal(element('pause-icon').textContent,icon);
    assert.equal(element('pause-btn').attrs['aria-label'],label);
  }
});
test('F speed and autonomy reflect caller-owned values without firing commands',()=>{
  const {element,ui,calls}=fixture();
  for(const speed of [1,3,1]){ui.renderSpeed(speed);assert.equal(element('speed-btn').textContent,speed+'×');}
  for(const enabled of [true,false,true]){
    ui.renderAutonomy(enabled);
    assert.equal(element('auto-btn').attrs['aria-pressed'],String(enabled));
    assert.equal(element('auto-state').textContent,enabled?'ВКЛ':'ВЫКЛ');
    assert.equal(element('auto-btn').attrs['aria-label'],enabled?'Автономность включена. Нажмите, чтобы отключить':'Автономность выключена. Нажмите, чтобы включить');
  }
  assert.deepEqual(calls,[]);
});
test('F binds each click once and forwards only to its original caller',()=>{
  const {element,calls}=fixture();
  for(const id of ['pause-btn','speed-btn','auto-btn']){
    assert.equal(element(id).listeners.length,1);element(id).click();
  }
  assert.deepEqual(calls,['pause','speed','auto']);
});
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const gameSource=read('../src/game.js');
test('F actual game callbacks keep editor/decision guards and original mutations',()=>{
  const start=gameSource.indexOf('const timeUI=createTimeUI(');
  const end=gameSource.indexOf('// W4-B: no second wallet',start);
  assert.ok(start>=0&&end>start);
  const els=new Map(),calls=[];
  const $=id=>{if(!els.has(id))els.set(id,{textContent:'',attrs:{},click(){this.fn();},setAttribute(k,v){this.attrs[k]=v;},addEventListener(type,fn){this.fn=fn;}});return els.get(id);};
  const state={paused:false,speed:1,autonomy:{enabled:false}};
  const ctx={createTimeUI,householdSpeed:createHouseholdSpeedController(),$,game:state,furnishMode:false,buildMode:false,outdoorMode:false,blocked:false,interview:false,
    dialogueNeedsDecision:()=>ctx.blocked,careerPhone:{interviewNeedsDecision:()=>ctx.interview},
    setHouseholdAutonomy:(g,v)=>{g.autonomy.enabled=v;calls.push('set');return v;},
    restartAutonomyWait:()=>calls.push('restart'),save:v=>calls.push(['save',v]),toast:v=>calls.push(v)};
  runInNewContext(gameSource.slice(start,end),ctx);
  for(const key of ['furnishMode','buildMode','outdoorMode']){
    ctx[key]=true;for(const id of ['pause-btn','speed-btn','auto-btn'])$(id).click();ctx[key]=false;
    assert.deepEqual(calls,[]);assert.equal(state.paused,false);assert.equal(state.speed,1);assert.equal(state.autonomy.enabled,false);
  }
  ctx.blocked=true;$('pause-btn').click();ctx.blocked=false;
  ctx.interview=true;$('pause-btn').click();ctx.interview=false;assert.deepEqual(calls,[]);
  $('pause-btn').click();assert.equal(state.paused,true);assert.equal($('pause-icon').textContent,'▶');
  $('speed-btn').click();assert.equal(state.speed,3);assert.equal($('speed-btn').textContent,'3×');
  $('auto-btn').click();assert.equal(state.autonomy.enabled,true);assert.equal(state.event,'Свободное время');
  assert.deepEqual(calls.slice(-4),['set','restart',['save',true],'Автономность включена. Жители скоро решат, чем заняться.']);
  $('auto-btn').click();assert.equal(state.autonomy.enabled,false);
});
test('F Pages and cache marker include the standalone UI',()=>{
  const pages=read('../.github/workflows/pages.yml');
  assert.ok(pages.includes('node --check src/qsk-11-time-ui.js'));
  assert.ok(pages.includes('cp src/qsk-11-time-ui.js site/src/'));
  assert.match(read('../index.html'),/src\/game\.js\?v=[^"]+-qsk-11f(?:-[^"]+)?"/);
  assert.doesNotMatch(read('../src/qsk-11-time-ui.js'),/localStorage|sessionStorage|playcanvas|simulation\.js|household\.js/);
});
