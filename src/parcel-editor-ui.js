// Presentation only. Existing game editors own validation, persistence and money.
export const PARCEL_SECTIONS=Object.freeze({house:'Дом',furniture:'Мебель',yard:'Двор',pool:'Бассейн'});
export const areaBuildTool=type=>['room','wall','floor','remove-floor','roof-add'].includes(type);
export function parcelCamera(view,plan){
  return {...view,yaw:plan?0:38,pitch:plan?89.9:52};
}
export function balanceQuote(credits,cost){
  if(!Number.isSafeInteger(cost))return 'Баланс '+credits+' кр.';
  return (cost<0?'Возврат '+(-cost):cost?'Стоимость '+cost:'Стоимость 0')+
    ' кр. · остаток '+(credits-cost)+' кр.';
}
export function outdoorSectionFor(item){
  if(['light','furniture'].includes(item.category))return 'objects';
  return item.category==='garden'?'garden':'plants';
}
export function installParcelTray(onAction){
  const root=document.getElementById('parcel-editor'),bar=document.getElementById('parcel-bar');
  const title=root.querySelector('h2'),status=root.querySelector('output');
  const balance=root.querySelector('.parcel-wallet'),choices=root.querySelector('.parcel-choices');
  const actions=root.querySelector('.parcel-actions'),tabs=root.querySelector('nav');
  const make=({id,label,detail,primary,disabled})=>{
    const button=document.createElement('button');
    button.type='button';button.dataset.parcelAction=id;button.textContent=label;
    if(detail){const small=document.createElement('small');small.textContent=detail;button.append(small);}
    if(primary)button.classList.add('primary');
    button.disabled=!!disabled;
    return button;
  };
  tabs.replaceChildren(...Object.entries(PARCEL_SECTIONS).map(([id,label])=>make({id:'section:'+id,label})));
  const handle=e=>{
    const button=e.target.closest('[data-parcel-action]');
    if(button&&!button.disabled)onAction(button.dataset.parcelAction);
  };
  root.addEventListener('click',handle);bar.addEventListener('click',handle);
  // Reuse the real catalog, warehouse and parameter widgets, including their
  // handlers and current filter state. Restore each element before hiding.
  const slot=root.querySelector('.parcel-native');
  const homes=new Map();
  function showNodes(nodes){
    for(const [node,marker] of homes)if(!nodes.includes(node)){
      marker.replaceWith(node);homes.delete(node);
    }
    for(const node of nodes)if(!homes.has(node)){
      const marker=document.createComment(node.id);
      node.before(marker);homes.set(node,marker);slot.append(node);
    }
    slot.hidden=!nodes.length;
  }
  return {
    hide(){showNodes([]);root.hidden=bar.hidden=true;},
    render(model){
      root.hidden=bar.hidden=false;
      title.textContent=model.title;balance.textContent=model.wallet;
      status.textContent=model.hint||'';status.hidden=!model.hint;
      status.dataset.invalid=String(!!model.invalid);
      choices.replaceChildren(...model.choices.map(make));choices.hidden=!model.choices.length;
      actions.replaceChildren(...model.actions.map(make));actions.hidden=!model.actions.length;
      tabs.hidden=!model.tabs;
      for(const b of tabs.children)b.setAttribute('aria-pressed',String(b.dataset.parcelAction==='section:'+model.section));
      bar.querySelector('[data-parcel-action="view"]').textContent=model.plan?'Наклон':'План';
      for(const a of ['undo','redo'])bar.querySelector('[data-parcel-action="'+a+'"]').disabled=!model[a];
      root.dataset.stage=model.stage;showNodes(model.nodes||[]);
    }
  };
}
