/** Q5: accessible DOM career graph. No canvas, touch handlers or save changes. */
import {careerMapView} from './career-map.js';

function el(tag,klass,text){
  const x=document.createElement(tag);
  if(klass)x.className=klass;
  if(text!==undefined)x.textContent=text;
  return x;
}
function btn(label,callback,klass=''){
  const x=el('button','career-map-button '+klass,label);
  x.type='button';
  x.addEventListener('click',callback);
  return x;
}
const NAMES={alex:'Алекс',mira:'Мира'};

/** Returns the DOM subtree, or null if there is no active job contract. */
export function renderCareerMap({root,residentId,onBack,onChooseTrack}){
  const map=careerMapView(root,residentId);
  if(!map)return null;
  const shell=el('section','career-map');
  shell.setAttribute('aria-label','Карта профессии '+map.careerTitle);
  const back=btn('‹ Моя работа',onBack,'career-map-back');
  shell.append(back);
  const title=el('h2','career-map-title','Карта: '+map.careerTitle);
  title.id='career-map-title';title.tabIndex=-1;
  shell.append(title);
  shell.append(el('p','career-map-caption',
    NAMES[residentId]+' · '+map.currentLevel+' из 8 · пять общих ступеней и две специализации'));
  const legend=el('p','career-map-legend',
    '✓ Пройдено · ● Сейчас · ◉ Доступно · 🔒 Закрыто');
  shell.append(legend);
  const graph=el('div','career-map-graph');
  graph.setAttribute('role','group');
  graph.setAttribute('aria-label','Карьерные ступени и две ветки');
  const shared=el('ol','career-map-common');
  shared.setAttribute('aria-label','Общие ступени 1–5');
  const inspector=el('section','career-map-inspector');
  inspector.id='career-map-detail';inspector.setAttribute('aria-label','Подробности должности');
  inspector.setAttribute('role','region');
  const buttons=new Map();
  let currentSelected=null;
  const symbol={passed:'✓',current:'●',available:'◉',locked:'🔒'};
  function show(node,focus=false){
    currentSelected=node.id;
    for(const [id,button] of buttons){
      button.setAttribute('aria-pressed',String(id===node.id));
      button.classList.toggle('career-map-node-selected',id===node.id);
    }
    inspector.replaceChildren();
    const h=el('h3','career-map-inspector-heading',
      'Уровень '+node.level+' · '+node.title);
    h.tabIndex=-1;
    inspector.append(h);
    inspector.append(el('p','career-map-inspector-status',
      node.statusLabel+(node.alternative?' · альтернативная ветка':'')+
      (node.branchTitle?' · '+node.branchTitle:'')));
    inspector.append(el('p','career-map-pay',
      'Ставка: '+node.hourlyCredits+' кр./час'));
    inspector.append(el('h4','career-map-small-heading','Требования для должности'));
    inspector.append(el('p','career-map-scope',node.requirementScope));
    if(!node.requirements.length){
      inspector.append(el('p','career-map-scope',
        'Начальная должность. Дополнительных условий повышения нет.'));
    }else{
      const list=el('ul','career-map-requirements');
      for(const item of node.requirements){
        const row=el('li','career-map-requirement');
        const status=item.met===true?'✓ ':item.met===false?'○ ':'— ';
        const value=item.current===null||item.current===undefined?'—':item.current;
        row.append(el('strong',null,status+item.label));
        row.append(el('span',null,'Значение '+value+' / '+item.target));
        if(item.scope==='rank-bound')row.append(el('small',null,
          'Засчитывается только при работе на соответствующей ступени'));
        list.append(row);
      }
      inspector.append(list);
    }
    if(node.canChoose){
      const choose=btn('Выбрать направление «'+node.branchTitle+'»',()=>{
        onChooseTrack(node.branchId);
      },'career-map-choose');
      inspector.append(choose);
    }else if(node.alternative){
      inspector.append(el('p','career-map-scope',
        'Альтернативная ветка остаётся видимой. Перевод доступен по правилам карьеры.'));
    }
    inspector.append(el('h4','career-map-small-heading','Достижения профессии'));
    inspector.append(el('p','career-map-scope',
      'Награды учитываются в профессии, но не заменяют требования повышения.'));
    const goals=el('ul','career-map-achievements');
    for(const g of map.goals){
      goals.append(el('li',null,
        (g.done?'✓ Получено: ':'○ В процессе: ')+g.title+
        ' · '+g.shifts+'/'+g.requiredShifts+' смен'+
        (g.skill?' · навык '+g.currentSkill+'/'+g.skillLevel:'')+
        ' · ситуация '+(g.sceneMet?'есть':'не выполнена')));
    }
    if(!map.goals.length)goals.append(el('li',null,'Нет профессиональных достижений'));
    inspector.append(goals);
    inspector.append(btn('↑ Вернуться к схеме',()=>{
      buttons.get(currentSelected)?.focus({preventScroll:false});
    },'career-map-back-to-graph'));
    if(focus){
      h.focus({preventScroll:true});
      h.scrollIntoView({block:'start',behavior:'instant'});
    }
  }
  function makeNode(node){
    const li=el('li','career-map-item');
    const button=btn('',()=>show(node,true),'career-map-node career-map-'+node.status);
    button.dataset.nodeId=node.id;
    button.dataset.status=node.status;
    if(node.status==='current'){
      button.dataset.current='true';
      button.setAttribute('aria-current','step');
    }
    button.setAttribute('aria-label','Уровень '+node.level+': '+node.title+
      '. '+node.statusLabel+(node.alternative?'. Альтернативный путь':'')+
      '. '+node.hourlyCredits+' кредитов в час');
    button.setAttribute('aria-controls','career-map-detail');
    const row=el('span','career-map-node-main');
    row.append(el('span','career-map-node-symbol',symbol[node.status]));
    row.append(el('span','career-map-node-name',node.level+'. '+node.title));
    button.append(row,el('small','career-map-node-pay',node.hourlyCredits+' кр./ч'));
    li.append(button);
    buttons.set(node.id,button);
    return li;
  }
  for(const node of map.common)shared.append(makeNode(node));
  graph.append(shared);
  const fork=el('div','career-map-fork');
  fork.setAttribute('aria-label','Две специализации');
  for(const track of map.tracks){
    const area=el('section','career-map-track'+
      (track.selected?' career-map-track-selected':''));
    area.setAttribute('aria-label','Специализация '+track.title);
    area.append(el('h3','career-map-track-title',
      (track.selected?'✓ ':'')+track.title));
    const description=el('p','career-map-track-description',track.description);
    area.append(description);
    const roles=el('ol','career-map-track-roles');
    roles.start=6;
    for(const node of track.nodes)roles.append(makeNode(node));
    area.append(roles);
    fork.append(area);
  }
  graph.append(fork);
  shell.append(btn('Показать мою должность',()=>{
    const active=[...buttons.values()].find(b=>b.dataset.current==='true');
    active?.focus({preventScroll:false});
    active?.scrollIntoView({block:'center',behavior:'instant'});
  },'career-map-jump'));
  shell.append(graph,inspector);
  const initial=map.all.find(n=>n.status==='current')||map.common[0];
  show(initial);
  return shell;
}
