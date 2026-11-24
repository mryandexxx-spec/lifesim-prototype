import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHomeMenu} from '../src/qsk-11-home-menu.js';

function fixture(){
  const nodes=new Map(), frames=[], log=[];
  function element(id){
    if(!nodes.has(id)){
      const handlers=new Map(),attrs=new Map();
      nodes.set(id,{hidden:true,addEventListener:(name,fn)=>handlers.set(name,fn),
        setAttribute:(key,value)=>attrs.set(key,value),getAttribute:key=>attrs.get(key),
        focus:options=>log.push(['focus',id,options]),
        click:()=>{log.push(['click',id]);handlers.get('click')?.();}});
    }
    return nodes.get(id);
  }
  let allowed=true,required=false,keydown;
  const document={addEventListener:(type,fn,capture)=>{
    assert.equal(type,'keydown');assert.equal(capture,true);keydown=fn;
  }};
  const menu=createHomeMenu({element,document,requestFrame:fn=>frames.push(fn),
    canOpen:()=>allowed,requiredDialogue:()=>required,onOpen:()=>log.push(['open'])});
  const escape=(key='Escape')=>{let prevented=false;keydown({key,preventDefault:()=>{prevented=true;}});return prevented;};
  return {element,menu,frames,log,escape,allow:value=>{allowed=value;},require:value=>{required=value;}};
}

test('home toggle preserves hidden state, aria, callback and deferred focus',()=>{
  const f=fixture();f.element('home-open').click();
  assert.equal(f.element('home-panel').hidden,false);
  assert.equal(f.element('home-open').getAttribute('aria-expanded'),'true');
  assert.deepEqual(f.log,[['click','home-open'],['open']]);
  assert.equal(f.frames.length,1);f.frames.shift()();
  assert.deepEqual(f.log.at(-1),['focus','home-furnish',{preventScroll:true}]);
  f.element('home-open').click();
  assert.equal(f.element('home-panel').hidden,true);
  assert.equal(f.element('home-open').getAttribute('aria-expanded'),'false');
});

test('mode/dialogue guard blocks opening but not programmatic closing',()=>{
  const f=fixture();f.allow(false);f.menu.setOpen(true);
  assert.equal(f.element('home-panel').hidden,true);assert.equal(f.frames.length,0);
  f.allow(true);f.menu.setOpen(true);f.allow(false);f.menu.setOpen(false);
  assert.equal(f.element('home-panel').hidden,true);
});

test('close button and Escape restore focus, required dialogue wins',()=>{
  const f=fixture();f.menu.setOpen(true);f.require(true);
  assert.equal(f.escape(),false);assert.equal(f.element('home-panel').hidden,false);
  f.require(false);assert.equal(f.escape('Enter'),false);assert.equal(f.escape(),true);
  assert.equal(f.element('home-panel').hidden,true);
  assert.deepEqual(f.log.at(-1),['focus','home-open',{preventScroll:true}]);
  assert.equal(f.escape(),false);
  f.menu.setOpen(true);f.element('home-close').click();
  assert.deepEqual(f.log.at(-1),['focus','home-open',{preventScroll:true}]);
});

test('legacy editor buttons close first and delegate once to existing commands',()=>{
  for(const [entry,target] of [['home-furnish','furnish-toggle'],['home-build','build-toggle']]){
    const f=fixture();f.menu.setOpen(true);
    f.element(target).addEventListener('click',()=>assert.equal(f.element('home-panel').hidden,true));
    f.element(entry).click();
    assert.deepEqual(f.log.filter(x=>x[0]==='click'),[['click',entry],['click',target]]);
  }
});

test('adapter remains UI-only; game owns guards, parcel capture and release packaging',()=>{
  const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
  const game=read('../src/game.js'),adapter=read('../src/qsk-11-home-menu.js'),pages=read('../.github/workflows/pages.yml');
  assert.ok(game.includes("import {createHomeMenu} from './qsk-11-home-menu.js'"));
  assert.ok(game.includes('const setHomeOpen=homeMenu.setOpen'));
  assert.ok(game.includes("canOpen:()=>!(dialogueNeedsDecision(game)||furnishMode||buildMode||outdoorMode)"));
  assert.ok(game.includes("const entrySections={'home-build':'house','home-furnish':'furniture','home-outdoors':'yard','home-pool':'pool'}"));
  assert.ok(game.includes("if(section){event.stopPropagation();openParcel(section);}"));
  assert.doesNotMatch(adapter,/\b(?:localStorage|sessionStorage|writeV1Save|tickHousehold|openParcel|playcanvas)\b/);
  assert.ok(pages.includes('node --check src/qsk-11-home-menu.js'));
  assert.ok(pages.includes('cp src/qsk-11-home-menu.js site/src/'));
  assert.match(read('../index.html'),/src\/game\.js\?v=[^"]+-qsk-11d"/);
});
