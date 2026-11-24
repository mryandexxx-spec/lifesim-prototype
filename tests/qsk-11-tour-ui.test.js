import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTourUI} from '../src/qsk-11-tour-ui.js';
import {UI_TOUR_STEPS} from '../src/ui-onboarding.js';

function fixture(){
  const elements=new Map(),events=new Map(),calls=[];
  let required=false;
  const element=id=>{
    if(!elements.has(id))elements.set(id,{
      hidden:true,textContent:'',listeners:new Map(),
      addEventListener(type,fn){this.listeners.set(type,fn);},
      focus(options){calls.push(['focus',id,options]);},
      contains(target){return target===this||target?.parent===this;},
      click(){this.listeners.get('click')();}
    });
    return elements.get(id);
  };
  const document={addEventListener(type,fn,capture){events.set(type,{fn,capture});}};
  const ui=createTourUI({element,document,requiredDialogue:()=>required,
    rememberDismissal:()=>calls.push(['remember']),onReplay:()=>calls.push(['replay'])});
  return {element,events,calls,ui,required:value=>{required=value;}};
}
test('QSK-11/E walkthrough renders original steps, progress and final close',()=>{
  const {element,calls,ui}=fixture();
  assert.equal(ui.openTour(),true);
  assert.equal(element('tour-panel').hidden,false);
  for(let i=0;i<3;i++){
    assert.equal(element('tour-progress').textContent,(i+1)+' из 3');
    assert.equal(element('tour-title').textContent,UI_TOUR_STEPS[i].title);
    assert.equal(element('tour-body').textContent,UI_TOUR_STEPS[i].body);
    assert.equal(element('tour-tip').textContent,UI_TOUR_STEPS[i].hint);
    assert.equal(element('tour-next').textContent,i===2?'Играть':'Дальше');
    element('tour-next').click();
  }
  assert.equal(element('tour-panel').hidden,true);
  assert.deepEqual(calls,[['focus','tour-panel',{preventScroll:true}],['remember'],['focus','view-toggle',{preventScroll:true}]]);
  ui.closeTour();assert.equal(calls.length,3);
});
test('QSK-11/E replay resets and keeps caller-owned panel closing before dialogue gate',()=>{
  const {element,calls,ui,required}=fixture();
  ui.openTour();element('tour-next').click();
  ui.closeTour({remember:false});
  assert.equal(calls.filter(c=>c[0]==='remember').length,0);
  required(true);element('tour-replay').click();
  assert.equal(element('tour-panel').hidden,true);
  assert.equal(ui.openTour(),false);
  required(false);element('tour-replay').click();
  assert.equal(element('tour-progress').textContent,'1 из 3');
  assert.deepEqual(calls.slice(-2),[['replay'],['focus','tour-panel',{preventScroll:true}]]);
});
test('QSK-11/E capture Escape respects required dialogue and restores focus',()=>{
  const {element,events,calls,ui,required}=fixture();
  let prevented=0;
  const event={key:'Escape',preventDefault(){prevented++;}};
  ui.openTour();required(true);
  assert.equal(events.get('keydown').capture,true);
  events.get('keydown').fn(event);
  assert.equal(prevented,0);assert.equal(element('tour-panel').hidden,false);
  required(false);events.get('keydown').fn(event);
  assert.equal(prevented,1);assert.equal(element('tour-panel').hidden,true);
  assert.deepEqual(calls.slice(-2),[['remember'],['focus','view-toggle',{preventScroll:true}]]);
});
test('QSK-11/E outside pointer dismisses without stealing focus, inner/replay pointer stays open',()=>{
  const {element,events,calls,ui}=fixture();
  ui.openTour();
  assert.equal(events.get('pointerdown').capture,true);
  for(const id of ['tour-panel','tour-replay']){
    events.get('pointerdown').fn({target:{parent:element(id)}});
    assert.equal(element('tour-panel').hidden,false);
  }
  events.get('pointerdown').fn({target:{}});
  assert.equal(element('tour-panel').hidden,true);
  assert.deepEqual(calls,[['focus','tour-panel',{preventScroll:true}],['remember']]);
});
test('QSK-11/E skip and close both remember and restore focus',()=>{
  for(const id of ['tour-close','tour-skip']){
    const {element,calls,ui}=fixture();
    ui.openTour();element(id).click();
    assert.equal(element('tour-panel').hidden,true);
    assert.deepEqual(calls.slice(-2),[['remember'],['focus','view-toggle',{preventScroll:true}]]);
  }
});
test('QSK-11/E Pages includes adapter and game retains UI preference and boot gate',()=>{
  const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
  const game=read('../src/game.js'),adapter=read('../src/qsk-11-tour-ui.js'),pages=read('../.github/workflows/pages.yml');
  assert.ok(game.includes("import {createTourUI} from './qsk-11-tour-ui.js'"));
  assert.match(game,/shouldShowTour\(seen\)&&!dialogueNeedsDecision\(game\)/);
  assert.match(game,/localStorage\.setItem\(UI_TOUR_STORAGE_KEY,'done'\)/);
  assert.doesNotMatch(adapter,/localStorage|sessionStorage|playcanvas|simulation\.js|household\.js/);
  assert.ok(pages.includes('node --check src/qsk-11-tour-ui.js'));
  assert.ok(pages.includes('cp src/qsk-11-tour-ui.js site/src/'));
  assert.match(read('../index.html'),/src\/game\.js\?v=[^"]+-qsk-11e(?:-[^"]+)?"/);
});
