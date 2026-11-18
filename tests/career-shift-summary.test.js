import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {arriveCareerPortal,progressCareerWork} from '../src/career-work.js';
import {shiftSummaryForEvent,createShiftSummaryQueue,
  createCareerShiftSummaryUI} from '../src/career-shift-summary-ui.js';

const fresh=()=>newHousehold('2026-11-16');
const hire=(root,id,career)=>{
  root.careerSystem=hireCareer(root.careerSystem,id,career,root.minutes);
};
const settleDay=(root)=>{
  tickHousehold(root,60);
  for(const id of ['alex','mira'])
    if(root.careerSystem.byResident[id]&&root.careerSystem.byResident[id].currentShift)
      assert.equal(arriveCareerPortal(root,id,root.minutes),true);
  return tickHousehold(root,480).filter(event=>event.type==='salary');
};

test('shift results use real salary/performance receipts without changing wallet or save',()=>{
  const root=fresh();hire(root,'alex','editorial');
  const before=root.shop.credits,events=settleDay(root);
  assert.equal(events.length,1);
  const snapshot=JSON.stringify(root);
  const result=shiftSummaryForEvent(root,events[0]);
  assert.equal(result.name,'Алекс');
  assert.equal(result.salary,112);
  assert.equal(result.missed,false);
  assert.equal(result.duration,'8 ч');
  assert.match(result.period,/09:00–17:00/);
  assert.ok(Number.isInteger(result.performance));
  assert.ok(result.key.includes(root.careerSystem.byResident.alex.lastShift.id));
  assert.equal(root.shop.credits,before+112);
  assert.equal(JSON.stringify(root),snapshot,'presentation must not change canonical state');
  assert.equal(loadHousehold(JSON.parse(snapshot)).shop.credits,before+112);
});

test('two simultaneous completions queue once per resident and shift',()=>{
  const root=fresh();hire(root,'alex','editorial');hire(root,'mira','business-center');
  const events=settleDay(root);
  assert.equal(events.length,2);
  const queue=createShiftSummaryQueue();
  const summaries=events.map(event=>shiftSummaryForEvent(root,event));
  assert.equal(queue.add(summaries[0]),true);
  assert.equal(queue.add(summaries[0]),false);
  assert.equal(queue.add(summaries[1]),true);
  assert.equal(queue.count(),2);
  assert.equal(queue.take().residentId,'alex');
  assert.equal(queue.take().residentId,'mira');
  assert.equal(queue.take(),null);
  assert.equal(queue.add(summaries[0]),false,'no second display in same session');
  queue.clear();
  assert.equal(queue.add(summaries[0]),true,'reset starts a new session');
});

test('automatic missed shift shows zero income but never creates a salary receipt',()=>{
  const root=fresh();hire(root,'alex','editorial');
  const start=root.shop.credits;
  const events=progressCareerWork(root,480,1020);
  const summary=shiftSummaryForEvent(root,events.find(event=>event.type==='missed'));
  assert.equal(summary?.missed,true);
  assert.equal(summary.salary,0);
  assert.equal(root.shop.credits,start);
  assert.equal(root.careerSystem.settlementIds.length,0);
  assert.equal(shiftSummaryForEvent(root,{residentId:'alex',type:'salary'}),null);
  assert.equal(shiftSummaryForEvent(root,{residentId:'unknown',type:'missed'}),null);
});

test('touch modal defers behind blocking overlay, queues two results and restores focus',()=>{
  class Element {
    constructor(tag){
      this.tag=tag;this.hidden=false;this.children=[];this.listeners={};this.attributes={};
      this.textContent='';this.isConnected=true;
    }
    setAttribute(name,val){this.attributes[name]=val;}
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(...nodes){this.children=[...nodes];}
    addEventListener(event,fn){this.listeners[event]=fn;}
    focus(){globalThis.document.activeElement=this;}
    click(){this.listeners.click?.();}
  }
  const old=globalThis.document;
  const doc={activeElement:new Element('trigger'),handlers:{},
    createElement:tag=>new Element(tag),
    addEventListener(name,fn){this.handlers[name]=fn;}};
  globalThis.document=doc;
  try{
    const root=fresh();hire(root,'alex','editorial');hire(root,'mira','business-center');
    const events=settleDay(root);const originalWallet=root.shop.credits;
    const host=new Element('host');let blocking=true;
    const ui=createCareerShiftSummaryUI({host,getRoot:()=>root,shouldDefer:()=>blocking});
    assert.equal(ui.enqueue(events),2);
    assert.equal(ui.isOpen(),false,'mandatory choice takes precedence');
    blocking=false;
    assert.equal(ui.flush(),true);assert.equal(ui.isOpen(),true);
    const overlay=host.children[0],card=overlay.children[1];
    assert.equal(card.attributes['aria-modal'],'true');
    const [,title,subtitle,money,,,,done]=card.children;
    assert.equal(title.textContent,'Смена завершена');
    assert.match(subtitle.textContent,/Алекс/);
    assert.equal(money.textContent,'+112 кр.');
    assert.equal(doc.activeElement,done);
    let prevented=false;
    doc.handlers.keydown({key:'Tab',preventDefault(){prevented=true;}});
    assert.equal(prevented,true);assert.equal(doc.activeElement,done);
    done.click();
    assert.equal(ui.isOpen(),true,'second resident shows directly after first');
    assert.match(subtitle.textContent,/Мира/);
    assert.equal(money.textContent,'+144 кр.');
    done.click();
    assert.equal(ui.isOpen(),false);
    assert.equal(doc.activeElement.tag,'trigger','focus returns after dismissal');
    assert.equal(root.shop.credits,originalWallet);
  }finally{globalThis.document=old;}
});
