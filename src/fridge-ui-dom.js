/** FRIDGE-UX-R2: DOM-only presenter for the existing context sheet.
 * Real actions go through the original buttons and canonical queue/purchase handlers.
 * Tab/selection state is transient and never written into lifesim.room01.v1.
 */
import {fridgeTab} from './fridge-ui.js';

export function createFridgeR2UI({document,readModel,readName,onAction}){
  const get=id=>document.getElementById(id);
  const sheet=get('action-sheet'),panel=get('fridge-r2');
  let tab='eat',recipeId='',readyId='',stapleId='vegetables';
  const text=(node,value)=>{node.textContent=value;return node;};
  const element=(tag,className,value)=>{
    const node=document.createElement(tag);node.className=className;
    if(value!==undefined)node.textContent=value;
    return node;
  };
  function card({id,label,subtitle,mark,action,active=false,disabled=false,readonly=false}){
    const node=element(readonly?'div':'button','fridge-r2-card');
    if(!readonly){
      node.type='button';node.dataset.fridgeAction=action;
      if(id)node.dataset.id=id;
      node.disabled=disabled;
      if(active)node.setAttribute('aria-pressed','true');
    }
    const copy=element('span','fridge-r2-copy');
    copy.append(element('strong','',label));
    if(subtitle)copy.append(element('small','',subtitle));
    const badge=element('span','fridge-r2-mark',mark||'');
    node.append(copy,badge);
    return node;
  }
  function fill(id,items){
    get(id).replaceChildren(...items);
  }
  function render(){
    if(panel.hidden)return;
    const model=readModel();
    if(!model.recipes.some(item=>item.id===recipeId&&item.available))
      recipeId=model.recipes.find(item=>item.available)?.id||'';
    if(!model.ready.some(item=>item.id===readyId))
      readyId=model.ready[0]?.id||'';
    if(!model.staples.some(item=>item.id===stapleId))
      stapleId=model.staples[0]?.id||'vegetables';
    text(get('fridge-r2-summary'),
      'Для: '+readName()+' · Готовых порций '+model.stored+
      ' · Продукты '+(model.pantry.vegetables+model.pantry.grains+model.pantry.dairy)+
      ' · Семья '+model.credits+' кр.');
    for(const id of ['eat','stock','buy']){
      get('fridge-r2-tab-'+id).setAttribute('aria-selected',String(tab===id));
      get('fridge-r2-tab-'+id).tabIndex=tab===id?0:-1;
      get('fridge-r2-'+id).hidden=tab!==id;
    }
    fill('fridge-r2-meal-list',model.meals.length?
      model.meals.map(meal=>card({
        id:meal.recipeId,label:meal.label,action:'eat',
        subtitle:meal.portions+' порц.'+
          (meal.quality==='mixed'?' · разное качество':
            meal.quality==='normal'?'':' · качество: '+meal.quality),
        mark:'Поесть ↗'
      })):[element('p','fridge-r2-empty',
        'Готовых порций пока нет. Можно приготовить блюдо или перейти в «Купить».')]);
    fill('fridge-r2-recipe-list',model.recipes.map(recipe=>card({
      id:recipe.id,label:recipe.label,action:'select-recipe',
      subtitle:recipe.available?recipe.portions+' порц. · ингредиенты уже в запасе':recipe.reason,
      mark:recipe.available?(recipe.id===recipeId?'●':'○'):'🔒',
      active:recipe.id===recipeId,disabled:!recipe.available
    })));
    get('fridge-r2-cook-button').disabled=!recipeId;
    const pantryRows=model.staples.map(item=>card({
      label:item.label,subtitle:'Запас продуктов',mark:item.current+'/'+item.max,readonly:true
    }));
    const mealRows=model.meals.length?model.meals.map(item=>card({
      label:item.label,subtitle:item.quality==='normal'?'Готовое блюдо':
        'Качество: '+item.quality,mark:item.portions+' порц.',readonly:true
    })):[element('p','fridge-r2-empty','Готовых порций нет')];
    fill('fridge-r2-stock-list',[
      ...mealRows,...pantryRows,
      card({label:'Садовые травы',subtitle:'Для рецептов',
        mark:model.pantry.herbs+'/'+model.pantry.herbsMax,readonly:true}),
      card({label:'Грязные тарелки',subtitle:'Для уборки у мойки',
        mark:String(model.dirtyDishes),readonly:true})
    ]);
    text(get('fridge-r2-capacity'),
      'В холодильнике свободно '+model.remaining+' из '+model.capacity+
      ' мест'+(model.reserved?' · ожидают доставку: '+model.reserved:''));
    fill('fridge-r2-ready-list',model.ready.map(item=>card({
      id:item.id,label:item.label,action:'select-ready',
      subtitle:item.available?'Покупка в холодильник':item.reason,
      mark:item.price+' кр.'+(item.id===readyId?' · ●':''),
      active:item.id===readyId,disabled:!item.available
    })));
    const selectedReady=model.ready.find(item=>item.id===readyId);
    const buyReady=get('fridge-r2-ready-button');
    buyReady.disabled=!selectedReady?.available;
    buyReady.textContent=selectedReady?.available?
      'Купить порцию · '+selectedReady.price+' кр.':selectedReady?.reason||'Недоступно';
    fill('fridge-r2-staple-list',model.staples.map(item=>card({
      id:item.id,label:item.label,action:'select-staple',
      subtitle:item.available?item.current+'/'+item.max+' · пополнить на +5':
        item.current+'/'+item.max+' · '+item.reason,
      mark:item.id===stapleId?'●':'○',active:item.id===stapleId,
      disabled:!item.available
    })));
    const selectedStaple=model.staples.find(item=>item.id===stapleId);
    const buyStaples=get('fridge-r2-staple-button');
    buyStaples.disabled=!selectedStaple?.available;
    buyStaples.textContent=selectedStaple?.available?
      'Купить +5 · '+selectedStaple.price+' кр.':selectedStaple?.reason||'Недоступно';
  }
  const show=(visible,{reset=false}={})=>{
    panel.hidden=!visible;
    sheet.dataset.fridgeR2=visible?'true':'false';
    if(visible&&reset){tab='eat';recipeId='';readyId='';stapleId='vegetables';}
  };
  panel.addEventListener('click',event=>{
    const tabButton=event.target.closest('[data-fridge-tab]');
    if(tabButton&&panel.contains(tabButton)){
      tab=fridgeTab(tabButton.dataset.fridgeTab);
      render();return;
    }
    const button=event.target.closest('[data-fridge-action]');
    if(!button||!panel.contains(button)||button.disabled)return;
    const kind=button.dataset.fridgeAction,id=button.dataset.id||'';
    if(kind==='select-recipe')recipeId=id;
    else if(kind==='select-ready')readyId=id;
    else if(kind==='select-staple')stapleId=id;
    else onAction(kind,kind==='cook'?recipeId:
      kind==='buy-ready'?readyId:kind==='buy-staples'?stapleId:id);
    render();
  });
  panel.addEventListener('keydown',event=>{
    const button=event.target.closest('[data-fridge-tab]');
    if(!button||!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
    event.preventDefault();
    const tabs=['eat','stock','buy'],i=tabs.indexOf(tab);
    const next=event.key==='Home'?0:event.key==='End'?2:
      (i+(event.key==='ArrowRight'?1:2))%3;
    tab=tabs[next];render();get('fridge-r2-tab-'+tab).focus();
  });
  return {show,render};
}
