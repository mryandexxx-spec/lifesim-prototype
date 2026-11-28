/** CAS-only personality draft. No game mutation, DOM globals or storage on import. */
import {listTraits,getTrait,traitsConflict,validateSelection,createProfile,PROFILE_RULES} from './trait-catalog.js';

const partialRules={min:0,max:PROFILE_RULES.maxTraits};
export function traitDraftOptions(selection=[]){
  if(!validateSelection(selection,partialRules).valid)throw new RangeError('Invalid trait draft');
  return listTraits().map(trait=>{
    const selected=selection.includes(trait.id),conflicts=selection.filter(id=>traitsConflict(id,trait.id));
    const reason=selected?null:conflicts.length?'Несовместимо: '+conflicts.map(id=>getTrait(id).label).join(', '):
      selection.length>=PROFILE_RULES.maxTraits?'Сначала снимите одну черту':null;
    return {id:trait.id,label:trait.label,description:trait.description,selected,enabled:!reason,reason};
  });
}
export function toggleTraitDraft(selection,id){
  const option=traitDraftOptions(selection).find(x=>x.id===id);
  if(!option?.enabled)return [...selection];
  const next=option.selected?selection.filter(x=>x!==id):[...selection,id];
  return validateSelection(next,partialRules).valid?next:[...selection];
}

/** Parent CAS owns screen, preferences, confirmation and admission; this widget
 * only submits a fresh validated draft. Existing character profile is read-only
 * elsewhere; never mount this picker for wardrobe mode.
 */
export function mountTraitPicker(host,{initial=[],preferences={likes:[],dislikes:[]},onConfirm}={}){
  if(!host?.ownerDocument||typeof onConfirm!=='function')throw new TypeError('CAS trait picker requires host and confirmation callback');
  let selected=[...initial];
  traitDraftOptions(selected);
  const doc=host.ownerDocument,root=doc.createElement('section');
  root.className='cas-trait-picker';root.setAttribute('aria-label','Выбор характера');
  const style=doc.createElement('style');style.textContent=`
.cas-trait-picker{box-sizing:border-box;display:flex;flex-direction:column;gap:8px;min-height:0;height:100%;padding:12px;color:var(--cas-text,#e6edf2);background:var(--cas-surface,#17232e);font:inherit}
.cas-trait-picker *{box-sizing:border-box}
.cas-trait-picker h2,.cas-trait-picker p{margin:0}
.cas-trait-picker h2{font-size:19px}
.cas-trait-picker .trait-note{font-size:13px;color:var(--cas-muted,#bdcad3)}
.cas-trait-picker .trait-list{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;touch-action:pan-y;display:flex;flex-direction:column;gap:6px;padding:2px 3px 4px 0}
.cas-trait-picker button{font:inherit;text-align:left;min-height:44px;touch-action:manipulation;border:1px solid #516575;border-radius:10px;padding:9px 10px;background:#243745;color:inherit}
.cas-trait-picker .trait-choice{flex:none;display:flex;flex-direction:column;gap:3px}
.cas-trait-picker .trait-choice strong{font-size:14px}
.cas-trait-picker .trait-choice small{font-size:12px;line-height:1.35}
.cas-trait-picker .trait-choice[aria-pressed=true]{border:2px solid #74d4bd;background:#284d48}
.cas-trait-picker button:disabled{opacity:.68}
.cas-trait-picker .trait-reason{color:#f3c9a0}
.cas-trait-picker .trait-confirm{flex:none;text-align:center;background:#b9e8d7;color:#142c28;font-weight:700}
.cas-trait-picker button:focus-visible{outline:2px solid #fff;outline-offset:1px}
`;
  const heading=doc.createElement('h2');heading.textContent='Характер';
  const note=doc.createElement('p');note.className='trait-note';note.textContent='Выберите 2 обязательные и 1 необязательную черту. Нажмите повторно, чтобы снять выбор.';
  const status=doc.createElement('p');status.className='trait-note';status.setAttribute('role','status');
  const list=doc.createElement('div');list.className='trait-list';list.setAttribute('aria-label','Доступные черты');
  const confirm=doc.createElement('button');confirm.type='button';confirm.className='trait-confirm';confirm.textContent='Подтвердить характер';
  const controls=new Map();
  for(const trait of listTraits()){
    const button=doc.createElement('button');button.type='button';button.className='trait-choice';button.dataset.trait=trait.id;
    const label=doc.createElement('strong');label.textContent=trait.label;
    const detail=doc.createElement('small');detail.textContent=trait.description;
    const reason=doc.createElement('small');reason.className='trait-reason';reason.hidden=true;
    button.append(label,detail,reason);list.append(button);controls.set(trait.id,{button,reason});
    button.addEventListener('click',()=>{selected=toggleTraitDraft(selected,trait.id);refresh();});
  }
  function refresh(){
    status.textContent='Выбрано '+selected.length+' из 3 · '+(selected.length<2?'нужно ещё '+(2-selected.length):'можно продолжить');
    for(const option of traitDraftOptions(selected)){
      const {button,reason}=controls.get(option.id);
      button.disabled=!option.enabled;button.setAttribute('aria-pressed',String(option.selected));
      reason.hidden=!option.reason;reason.textContent=option.reason||'';
    }
    confirm.disabled=!validateSelection(selected).valid;
  }
  confirm.addEventListener('click',()=>{
    if(validateSelection(selected).valid)onConfirm(createProfile(selected,preferences));
  });
  root.append(style,heading,note,status,list,confirm);host.replaceChildren(root);refresh();
  return Object.freeze({selection:()=>[...selected],destroy:()=>{root.remove();}});
}
