import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequiredChoiceFocus} from '../src/required-choice-focus.js';
const fixture=()=>{
  const listeners=new Map();
  const doc={
    activeElement:null,
    addEventListener:(n,fn)=>listeners.set(n,fn),
    removeEventListener:n=>listeners.delete(n)
  };
  const element=(name)=>({name,inert:false,isConnected:true,hidden:false,attributes:{},
    focus(){doc.activeElement=this;},
    getAttribute(k){return this.attributes[k]??null;},
    closest:()=>null
  });
  const hud=element('hud'),canvas=element('world'),background=element('outside');
  hud.inert=true;
  const backdrop=element('backdrop');
  const panel=element('dialogue');
  const opts=[element('choice1'),element('choice2'),element('finish')];
  panel.querySelectorAll=()=>opts;
  panel.contains=e=>opts.includes(e);
  const root={children:[canvas,hud,panel,backdrop]};
  doc.activeElement=background;
  const guard=createRequiredChoiceFocus({root,panel,backdrop,doc,
    restoreFallback:background});
  return {guard,doc,listeners,hud,canvas,backdrop,panel,opts,background};
};
test('required modal inerts other app-shell siblings and keeps dialog interactive',()=>{
 const f=fixture(); f.guard.activate(true);
 assert.equal(f.canvas.inert,true);
 assert.equal(f.hud.inert,true);
 assert.equal(f.panel.inert,false);
 assert.equal(f.backdrop.inert,false);
 f.guard.dispose();
});
test('restoring modal keeps pre-existing inert states and previous focus',()=>{
 const f=fixture();f.guard.activate(true);f.guard.focusChoice();
 assert.equal(f.doc.activeElement,f.opts[0]);
 f.guard.activate(false);
 assert.equal(f.hud.inert,true);
 assert.equal(f.canvas.inert,false);
 assert.equal(f.doc.activeElement,f.background);
});
test('Tab is trapped within choices and wraps with Shift+Tab',()=>{
 const f=fixture();f.guard.activate(true);f.guard.focusChoice(2);
 let blocked=0;
 f.listeners.get('keydown')({key:'Tab',shiftKey:false,preventDefault(){blocked++;}});
 assert.equal(f.doc.activeElement,f.opts[0]);
 f.listeners.get('keydown')({key:'Tab',shiftKey:true,preventDefault(){blocked++;}});
 assert.equal(f.doc.activeElement,f.opts[2]);
 assert.equal(blocked,2);
});
test('Escape cannot close or skip required dialogue',()=>{
 const f=fixture();f.guard.activate(true);let blocked=0;
 f.listeners.get('keydown')({key:'Escape',preventDefault(){blocked++;},
   stopImmediatePropagation(){blocked++;}});
 assert.equal(blocked,2);
 assert.equal(f.guard.active,true);
});
test('external focus is returned to required choice',()=>{
 const f=fixture();f.guard.activate(true);f.doc.activeElement=f.canvas;
 f.listeners.get('focusin')({target:f.canvas});
 assert.equal(f.doc.activeElement,f.opts[0]);
});
test('controller ignores focus and keyboard after choice is completed',()=>{
 const f=fixture();f.guard.activate(true);f.guard.activate(false);
 let cancelled=false;
 f.listeners.get('keydown')({key:'Escape',preventDefault(){cancelled=true;}});
 assert.equal(cancelled,false);
 f.guard.dispose();
 assert.equal(f.listeners.has('keydown'),false);
});
