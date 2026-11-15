/** Safari/VoiceOver-friendly focus containment for mandatory player choices.
 * Pure DOM controller; game pause, save, social rewards remain elsewhere.
 */
export function createRequiredChoiceFocus({root,panel,backdrop,doc,restoreFallback}){
  let active=false,previousFocus=null;
  const priorInert=new Map();
  const focusable=()=>Array.from(panel.querySelectorAll(
    'button:not([disabled]):not([hidden]),a[href],[tabindex]:not([tabindex="-1"])'
  )).filter(el=>!el.hidden&&el.getAttribute?.('aria-hidden')!=='true'&&
    !el.closest?.('[hidden]'));
  const focus=(el)=>{try{el?.focus?.({preventScroll:true});}catch{el?.focus?.();}};
  function activate(required){
    if(Boolean(required)===active)return;
    active=Boolean(required);
    if(active){
      previousFocus=doc.activeElement;
      for(const el of Array.from(root.children)){
        if(el===panel||el===backdrop)continue;
        priorInert.set(el,Boolean(el.inert));
        el.inert=true;
      }
      focus(panel);
    }else{
      for(const [el,was] of priorInert)el.inert=was;
      priorInert.clear();
      const available=previousFocus&&previousFocus.isConnected!==false&&
        !previousFocus.hidden&&!previousFocus.closest?.('[hidden]');
      const candidate=available?previousFocus:restoreFallback;
      previousFocus=null;
      focus(candidate);
    }
  }
  function focusChoice(index=-1){
    if(!active)return;
    const choices=focusable();
    if(choices.length)focus(choices[Math.max(0,Math.min(index,choices.length-1))]);
    else focus(panel);
  }
  function onKeydown(event){
    if(!active)return;
    if(event.key==='Escape'){
      event.preventDefault();
      event.stopImmediatePropagation?.();
      return;
    }
    if(event.key!=='Tab')return;
    const choices=focusable();
    event.preventDefault();
    if(!choices.length){focus(panel);return;}
    const current=choices.indexOf(doc.activeElement);
    const index=current<0?(event.shiftKey?choices.length-1:0):
      (current+(event.shiftKey?-1:1)+choices.length)%choices.length;
    focus(choices[index]);
  }
  function onFocus(event){
    if(!active)return;
    if(event.target===panel||panel.contains(event.target))return;
    focusChoice(0);
  }
  doc.addEventListener('keydown',onKeydown,true);
  doc.addEventListener('focusin',onFocus,true);
  return {
    activate,focusChoice,
    get active(){return active;},
    dispose(){
      activate(false);
      doc.removeEventListener('keydown',onKeydown,true);
      doc.removeEventListener('focusin',onFocus,true);
    }
  };
}
