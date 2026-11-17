import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isEditableGestureTarget,preventNativeGameGesture,installMobileGesturePolicy} from '../src/mobile-gesture-policy.js';

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
