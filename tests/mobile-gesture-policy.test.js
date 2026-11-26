import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isEditableGestureTarget,preventNativeGameGesture,installMobileGesturePolicy,installWorldClickOwnership} from '../src/mobile-gesture-policy.js';

const node=(editable=false)=>({closest:()=>editable?{}:null,isContentEditable:false});
const event=(target=node(),cancelable=true)=>{
  let prevented=false;
  return {target,cancelable,preventDefault:()=>{prevented=true;},
    get prevented(){return prevented;}};
};
function mockTarget(){
  const listeners=new Map();
  return {
    addEventListener(type,fn,options){listeners.set(type,{fn,options});},
    removeEventListener(type,fn){if(listeners.get(type)?.fn===fn)listeners.delete(type);},
    dispatch(type,e){listeners.get(type)?.fn(e);},
    has:type=>listeners.has(type),
    keys:()=>[...listeners.keys()]
  };
}
test('text, search, date and contenteditable controls are exempt from native gesture suppression',()=>{
  assert.equal(isEditableGestureTarget(node(true)),true);
  assert.equal(isEditableGestureTarget({nodeType:3,parentElement:node(true)}),true);
  assert.equal(isEditableGestureTarget({isContentEditable:true}),true);
  assert.equal(isEditableGestureTarget(node(false)),false);
  const editableEvent=event(node(true));
  assert.equal(preventNativeGameGesture(editableEvent),false);
  assert.equal(editableEvent.prevented,false);
});
test('game labels/callouts are suppressed but noncancelable events remain untouched',()=>{
  const game=event();
  assert.equal(preventNativeGameGesture(game),true);
  assert.equal(game.prevented,true);
  const noncancelable=event(node(),false);
  assert.equal(preventNativeGameGesture(noncancelable),false);
  assert.equal(noncancelable.prevented,false);
});
test('only callout/select/drag and canvas Safari pinch events are guarded; all handlers clean up',()=>{
  const root=mockTarget(),canvas=mockTarget();
  const uninstall=installMobileGesturePolicy(root,canvas);
  assert.deepEqual(root.keys().sort(),['contextmenu','dragstart','selectstart']);
  assert.deepEqual(canvas.keys().sort(),['gesturechange','gesturestart']);
  const context=event();root.dispatch('contextmenu',context);
  assert.equal(context.prevented,true);
  const form=event(node(true));root.dispatch('selectstart',form);
  assert.equal(form.prevented,false);
  const pinch=event();canvas.dispatch('gesturestart',pinch);
  assert.equal(pinch.prevented,true);
  const noncancelable=event(node(),false);canvas.dispatch('gesturechange',noncancelable);
  assert.equal(noncancelable.prevented,false);
  uninstall();
  assert.deepEqual(root.keys(),[]);
  assert.deepEqual(canvas.keys(),[]);
});
test('CSS keeps page double-tap disabled only within the app, 3D gestures and editing remain',()=>{
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(css,/\.app-shell\s*\{[^}]*touch-action:manipulation/);
  assert.match(css,/#game-canvas\s*\{[^}]*touch-action:none/);
  assert.match(css,/\.app-shell input,[\s\S]*touch-action:auto/);
  assert.match(css,/-webkit-touch-callout:default/);
  assert.match(html,/initial-scale=1,viewport-fit=cover/);
  assert.doesNotMatch(html,/user-scalable=no|maximum-scale=1/);
});

function ownershipFixture(){
  const host=mockTarget(),doc=mockTarget(),canvas={},button={},outside={};
  doc.defaultView=host;
  const root={ownerDocument:doc,contains:t=>t===canvas||t===button};
  const uninstall=installWorldClickOwnership(root,canvas);
  const pointer=(target=canvas,id=1,extra={})=>({target,pointerId:id,isTrusted:true,isPrimary:true,button:0,...extra});
  const fireClick=(target=button,extra={})=>{
    const e={...event(target),isTrusted:true,detail:1,stopped:false,...extra};
    e.stopImmediatePropagation=()=>{e.stopped=true;};
    host.dispatch('click',e);return e;
  };
  const world=(id=1)=>{host.dispatch('pointerdown',pointer(canvas,id));host.dispatch('pointerup',pointer(canvas,id));};
  return {host,doc,canvas,button,outside,pointer,fireClick,world,uninstall};
}
test('world pointerup cannot activate a newly opened DOM action: mouse and touch compatibility clicks',()=>{
  const f=ownershipFixture();
  for(const pointerType of ['touch','mouse','pen',undefined]){
    f.world();
    const click=f.fireClick(f.button,{pointerType});
    assert.equal(click.prevented,true);assert.equal(click.stopped,true);
  }
  f.uninstall();
  assert.deepEqual(f.host.keys(),[]);assert.deepEqual(f.doc.keys(),[]);
});
test('independent UI tap always works even if the previous world click never arrived',()=>{
  const f=ownershipFixture();
  f.world();
  f.host.dispatch('pointerdown',f.pointer(f.button,2));
  f.host.dispatch('pointerup',f.pointer(f.button,2));
  assert.equal(f.fireClick().stopped,false);
  f.world();
  assert.equal(f.fireClick().stopped,true);
  assert.equal(f.fireClick().stopped,false,'claim is one-shot');
});
test('keyboard, programmatic click, cancel, blur, hidden tab and unrelated pointer are not swallowed',()=>{
  const f=ownershipFixture();
  f.world();
  assert.equal(f.fireClick(f.button,{detail:0}).stopped,false);
  assert.equal(f.fireClick(f.button,{isTrusted:false}).stopped,false);
  assert.equal(f.fireClick().stopped,true);
  f.host.dispatch('pointerdown',f.pointer(f.canvas));
  f.host.dispatch('pointerup',f.pointer(f.canvas,2,{isPrimary:false}));
  assert.equal(f.fireClick().stopped,false);
  f.host.dispatch('pointercancel',f.pointer(f.canvas));
  assert.equal(f.fireClick().stopped,false);
  f.world();f.host.dispatch('blur',{});assert.equal(f.fireClick().stopped,false);
  f.world();f.doc.hidden=true;f.doc.dispatch('visibilitychange',{});assert.equal(f.fireClick().stopped,false);
  f.world();assert.equal(f.fireClick(f.outside).stopped,false);
});
test('a secondary contact does not transfer primary world ownership',()=>{
  const f=ownershipFixture();
  f.host.dispatch('pointerdown',f.pointer(f.canvas));
  f.host.dispatch('pointerdown',f.pointer(f.button,2,{isPrimary:false}));
  f.host.dispatch('pointerup',f.pointer(f.canvas));
  assert.equal(f.fireClick().stopped,true);
});
