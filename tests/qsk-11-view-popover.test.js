import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {viewMenuPlacement} from '../src/ui-layout.js';
import {createViewPopover} from '../src/qsk-11-view-popover.js';

function fixture(){
  const events={},frames=[],positions=[],focuses=[],attrs={};
  let disabled=false,dialogue=false,opened=0;
  const nodes=new Map();
  const element=id=>{
    if(!nodes.has(id)){
      const node={
        id,hidden:true,offsetWidth:200,offsetHeight:140,
        events:{},attrs:{},getBoundingClientRect:()=>({left:80,top:110}),
        style:{setProperty:(key,value)=>positions.push({key,value})},
        addEventListener(type,handler){this.events[type]=handler;},
        setAttribute(key,value){this.attrs[key]=value;attrs[id+':'+key]=value;},
        contains(target){return target===this||target?.inside===this.id;},
        focus(options){focuses.push({id,options});}
      };
      nodes.set(id,node);
    }
    return nodes.get(id);
  };
  const canvas={clientWidth:390,clientHeight:844,
    getBoundingClientRect:()=>({left:10,top:20})};
  const document={addEventListener:(type,callback,capture)=>{
    assert.equal(capture,true);
    events[type]=callback;
  }};
  const window={addEventListener:(type,callback)=>{events[type]=callback;}};
  const popover=createViewPopover({
    element,canvas,document,window,
    canOpen:()=>!disabled&&!dialogue,
    requiredDialogue:()=>dialogue,
    onOpen:()=>opened++,
    requestFrame:callback=>frames.push(callback)
  });
  return {element,canvas,document,popover,frames,events,positions,focuses,attrs,
    disable(value){disabled=value;},dialogue(value){dialogue=value;},
    opened:()=>opened};
}

test('QSK-11/C trigger, focus and viewport position preserve existing UI behavior',()=>{
  const ui=fixture(),toggle=ui.element('view-toggle'),panel=ui.element('view-panel');
  assert.equal(ui.popover.isOpen(),false);
  toggle.events.click();
  assert.equal(ui.popover.isOpen(),true);
  assert.equal(panel.hidden,false);
  assert.equal(ui.attrs['view-toggle:aria-expanded'],'true');
  assert.equal(ui.opened(),1);
  assert.equal(ui.frames.length,1);
  ui.frames.shift()();
  assert.deepEqual(ui.focuses,[{id:'view-panel',options:{preventScroll:true}}]);
  const expected=viewMenuPlacement({
    buttonLeft:70,buttonTop:90,viewportWidth:390,viewportHeight:844,
    menuWidth:200,menuHeight:140
  });
  assert.deepEqual(ui.positions.slice(-2),[
    {key:'--view-x',value:expected.x+'px'},
    {key:'--view-y',value:expected.y+'px'}
  ]);
  ui.events.resize();
  assert.equal(ui.positions.length,4);
  ui.popover.setOpen(false,{restoreFocus:true});
  assert.equal(panel.hidden,true);
  assert.equal(ui.attrs['view-toggle:aria-expanded'],'false');
  assert.deepEqual(ui.focuses.at(-1),{id:'view-toggle',options:{preventScroll:true}});
  const before=ui.positions.length;
  ui.events.resize();
  assert.equal(ui.positions.length,before,'no placement when hidden');
});

test('QSK-11/C outside pointer closes but inside panel/trigger preserves menu',()=>{
  const ui=fixture(),panel=ui.element('view-panel'),toggle=ui.element('view-toggle');
  ui.popover.setOpen(true);
  ui.events.pointerdown({target:panel});
  assert.equal(ui.popover.isOpen(),true);
  ui.events.pointerdown({target:toggle});
  assert.equal(ui.popover.isOpen(),true);
  ui.events.pointerdown({target:{}});
  assert.equal(ui.popover.isOpen(),false);
  assert.equal(ui.focuses.length,0,'outside touch never steals focus');
});

test('QSK-11/C Escape and required-dialogue gate follow live game state',()=>{
  const ui=fixture();
  ui.disable(true);
  ui.element('view-toggle').events.click();
  assert.equal(ui.popover.isOpen(),false,'no open during editor');
  ui.disable(false);
  ui.popover.setOpen(true);
  ui.dialogue(true);
  let prevented=0;
  ui.events.keydown({key:'Escape',preventDefault:()=>prevented++});
  assert.equal(ui.popover.isOpen(),true,'dialogue blocks escape');
  assert.equal(prevented,0);
  ui.dialogue(false);
  ui.events.keydown({key:'Enter',preventDefault:()=>prevented++});
  assert.equal(ui.popover.isOpen(),true);
  ui.events.keydown({key:'Escape',preventDefault:()=>prevented++});
  assert.equal(prevented,1);
  assert.equal(ui.popover.isOpen(),false);
  assert.equal(ui.focuses.at(-1).id,'view-toggle');
  ui.dialogue(true);
  ui.popover.setOpen(true);
  assert.equal(ui.popover.isOpen(),false,'required dialogue blocks opening');
});

test('QSK-11/C adapter is UI-only, wired to original game callbacks and shipped in Pages',()=>{
  const source=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const adapter=readFileSync(new URL('../src/qsk-11-view-popover.js',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(source,/import \{createViewPopover\} from '\.\/qsk-11-view-popover\.js'/);
  assert.match(source,/const viewPopover=createViewPopover\(\{/);
  assert.match(source,/const setViewOpen=viewPopover\.setOpen/);
  assert.match(source,/viewPopover\.isOpen\(\)/);
  assert.match(source,/requiredDialogue:\(\)=>dialogueNeedsDecision\(game\)/);
  assert.match(source,/setHomeOpen\(false\);calendarUI\.close\(\);closeCalendarAnchorPanel\(\)/);
  assert.doesNotMatch(adapter,/\b(?:localStorage|sessionStorage|writeV1Save|save\(|tickHousehold|enqueueAction|playcanvas)/);
  assert.match(pages,/node --check src\/qsk-11-view-popover\.js/);
  assert.match(pages,/cp src\/qsk-11-view-popover\.js site\/src\//);
  assert.match(html,/src\/game\.js\?v=[^"]+-qsk-11c"/);
});
