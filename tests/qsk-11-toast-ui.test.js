import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createToastUI} from '../src/qsk-11-toast-ui.js';

function fixture(){
  const classes=new Set(),cleared=[],timers=[],opened=[],checked=[];
  const element={
    children:[],
    classList:{
      add:name=>classes.add(name),
      remove:name=>classes.delete(name),
      toggle:(name,yes)=>yes?classes.add(name):classes.delete(name),
      contains:name=>classes.has(name)
    },
    replaceChildren(...nodes){this.children=nodes;},
    append(node){this.children.push(node);}
  };
  const document={
    createTextNode:textContent=>({type:'text',textContent}),
    createElement:tag=>{
      const attrs={},events={};
      return {tag,attrs,events,setAttribute:(name,value)=>{attrs[name]=value;},
        addEventListener:(name,callback)=>{events[name]=callback;}};
    }
  };
  const pending=new Set(['alex','mira']);
  const notify=createToastUI({
    element,document,
    incidentPending:id=>{checked.push(id);return pending.has(id);},
    openIncident:id=>{opened.push(id);},
    clearTimer:id=>cleared.push(id),
    scheduleTimer:(callback,ms)=>{timers.push({callback,ms});return timers.length;}
  });
  return {element,classes,cleared,timers,opened,checked,pending,notify};
}

test('QSK-11/B plain notices preserve original text-only toast, class and 2600 ms timeout',()=>{
  const ui=fixture();
  ui.notify('<b>Привет</b>');
  assert.deepEqual(ui.element.children,[{type:'text',textContent:'<b>Привет</b>'}]);
  assert.equal(ui.classes.has('toast-actionable'),false);
  assert.equal(ui.classes.has('show'),true);
  assert.equal(ui.timers[0].ms,2600);
  assert.deepEqual(ui.checked,[]);
  ui.timers[0].callback();
  assert.equal(ui.classes.has('show'),false);
});

test('QSK-11/B existing incident CTA uses same Russian label, callback and 8000 ms timeout',()=>{
  const ui=fixture();
  ui.notify('Рабочая ситуация',{incidentResidentId:'mira'});
  assert.equal(ui.classes.has('toast-actionable'),true);
  assert.equal(ui.timers[0].ms,8000);
  assert.equal(ui.element.children.length,2);
  const button=ui.element.children[1];
  assert.equal(button.tag,'button');
  assert.equal(button.type,'button');
  assert.equal(button.className,'toast-incident-cta');
  assert.equal(button.textContent,'Решить');
  assert.equal(button.attrs['aria-label'],'Решить рабочую ситуацию: Мира');
  button.events.click();
  assert.deepEqual(ui.opened,['mira']);
  ui.notify('Работа',{incidentResidentId:'alex'});
  assert.equal(ui.element.children[1].attrs['aria-label'],'Решить рабочую ситуацию: Алекс');
  ui.element.children[1].events.click();
  assert.deepEqual(ui.opened,['mira','alex']);
});

test('QSK-11/B pending work remains game-owned; previous timeout and CTA are replaced',()=>{
  const ui=fixture();
  ui.notify('Сначала',{incidentResidentId:'mira'});
  ui.pending.delete('mira');
  ui.notify('Потом',{incidentResidentId:'mira'});
  assert.equal(ui.element.children.length,1,'no stale actionable button');
  assert.equal(ui.classes.has('toast-actionable'),true,'match legacy incident flag even if no pending incident');
  assert.deepEqual(ui.cleared,[undefined,1]);
  assert.equal(ui.timers[1].ms,8000);
  ui.notify('Обычный');
  assert.equal(ui.classes.has('toast-actionable'),false);
  assert.deepEqual(ui.cleared,[undefined,1,2]);
  assert.equal(ui.timers[2].ms,2600);
});

test('QSK-11/B live adapter is DOM-only and is explicitly packaged for Safari Pages',()=>{
  const source=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const adapter=readFileSync(new URL('../src/qsk-11-toast-ui.js',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(source,/import \{createToastUI\} from '\.\/qsk-11-toast-ui\.js'/);
  assert.match(source,/const toast=createToastUI\(\{/);
  assert.match(source,/incidentPending:id=>pendingWorkIncident\(game,id\)/);
  assert.match(source,/openIncident:id=>openWorkIncident\(id\)/);
  assert.doesNotMatch(source,/function toast\(message/);
  assert.doesNotMatch(adapter,/\b(?:localStorage|sessionStorage|writeV1Save|save\(|tickHousehold|enqueueAction|import\s)/);
  assert.match(pages,/node --check src\/qsk-11-toast-ui\.js/);
  assert.match(pages,/cp src\/qsk-11-toast-ui\.js site\/src\//);
  assert.match(html,/src\/game\.js\?v=[^\"]+-qsk-11b(?:-[^\"]+)?\"/);
});
